// Imports a parsed workbook (ParsedEvent from src/features/import/parseWorkbook.ts plus an
// event name) as a new, locked event: one juror user per parsed juror (placeholder email),
// then the import_event RPC (service role only) with juror keys mapped to user ids.
import { z } from 'npm:zod@4'
import {
  corsHeaders,
  createUserWithRole,
  errorResponse,
  HttpError,
  issuesOf,
  json,
  placeholderEmail,
  readJson,
  requirePermissions,
  serviceClient,
} from '../_shared/admin.ts'

// Mirrors ParsedEvent; unknown keys (sheet, expectedFinals) are dropped by z.object.
const scoreValue = z
  .number()
  .min(1)
  .max(5)
  .refine(
    (value) => Math.abs(value * 2 - Math.round(value * 2)) < 1e-9,
    'Score must be a multiple of 0.5',
  )

const importPayloadSchema = z.object({
  eventName: z.string().trim().min(1).max(120),
  themes: z.array(z.string().trim().min(1).max(120)).max(50),
  criteria: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(300),
        weight: z.number().gt(0).max(1000),
        position: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(50),
  jurors: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        displayName: z.string().trim().min(1).max(120),
      }),
    )
    .max(100),
  teams: z
    .array(
      z.object({
        pitchOrder: z.number().int().min(1),
        name: z.string().trim().min(1).max(120),
        projectName: z.string().max(300).nullable(),
        theme: z.string().max(120).nullable(),
        // Rendered as a link in the admin UI: http/https only.
        repoUrl: z
          .url({ protocol: /^https?$/ })
          .max(2000)
          .nullable(),
        description: z.string().max(5000).nullable(),
        noShow: z.boolean(),
        scores: z
          .array(
            z.object({
              criterionPosition: z.number().int().min(1),
              jurorKey: z.string().min(1).max(200),
              value: scoreValue,
            }),
          )
          .max(5000),
      }),
    )
    .min(1)
    .max(500),
})

type ImportPayload = z.infer<typeof importPayloadSchema>

const service = serviceClient()

async function deleteUsers(ids: string[]): Promise<void> {
  for (const id of ids) {
    const { error } = await service.auth.admin.deleteUser(id)
    if (error) console.error(`cleanup: could not delete imported juror ${id}: ${error.message}`)
  }
}

async function importEvent(payload: ImportPayload): Promise<string> {
  const keys = new Set(payload.jurors.map((juror) => juror.key))
  if (keys.size !== payload.jurors.length)
    throw new HttpError(400, 'invalid_request', [
      { path: 'jurors', message: 'Duplicate juror key' },
    ])

  const created: { key: string; id: string }[] = []
  try {
    for (const juror of payload.jurors) {
      const id = await createUserWithRole(service, {
        email: placeholderEmail(),
        displayName: juror.displayName,
        role: 'juror',
      })
      created.push({ key: juror.key, id })
    }

    const { data: eventId, error } = await service.rpc('import_event', {
      p: {
        eventName: payload.eventName,
        themes: payload.themes,
        criteria: payload.criteria,
        jurors: created,
        teams: payload.teams,
      },
    })
    if (error) {
      // 22023: the payload did not line up (unknown theme, score for an unknown criterion/juror).
      if (error.code === '22023') throw new HttpError(400, 'invalid_import', error.message)
      throw new Error(`import_event failed: ${error.message}`)
    }
    return eventId as string
  } catch (error) {
    // The RPC is one transaction; undo the users created for this import too.
    await deleteUsers(created.map((juror) => juror.id))
    throw error
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    await requirePermissions(req, ['users.manage', 'events.manage'])
    const parsed = importPayloadSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new HttpError(400, 'invalid_request', issuesOf(parsed.error))
    return json({ eventId: await importEvent(parsed.data) }, 200, cors)
  } catch (error) {
    return errorResponse(error, cors)
  }
})
