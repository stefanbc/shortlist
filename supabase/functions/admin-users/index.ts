// User administration for admins (users.manage): create users, (de)activate them, change
// their email.
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

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    displayName: z.string().trim().min(1).max(120),
    email: z.email().max(320).optional(),
    role: z.enum(['admin', 'juror']),
  }),
  z.object({ action: z.literal('set_active'), userId: z.uuid(), active: z.boolean() }),
  z.object({ action: z.literal('set_email'), userId: z.uuid(), email: z.email().max(320) }),
])

// Effectively permanent; unbanning sets 'none'.
const BAN_DURATION = '876000h'

const service = serviceClient()

function authError(error: { code?: string; status?: number; message: string }): Error {
  if (error.code === 'email_exists') return new HttpError(409, 'email_exists')
  if (error.code === 'user_not_found' || error.status === 404)
    return new HttpError(404, 'not_found')
  return new Error(`auth admin call failed: ${error.message}`)
}

async function updateProfile(userId: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await service.from('profiles').update(fields).eq('id', userId)
  if (error) throw new Error(`profile update failed: ${error.message}`)
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const caller = await requirePermissions(req, ['users.manage'])
    const parsed = requestSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new HttpError(400, 'invalid_request', issuesOf(parsed.error))
    const body = parsed.data

    switch (body.action) {
      case 'create': {
        const id = await createUserWithRole(service, {
          email: body.email ?? placeholderEmail(),
          displayName: body.displayName,
          role: body.role,
        })
        return json({ id }, 200, cors)
      }

      case 'set_active': {
        if (body.userId === caller.id && !body.active)
          throw new HttpError(400, 'cannot_deactivate_self')
        const { error } = await service.auth.admin.updateUserById(body.userId, {
          ban_duration: body.active ? 'none' : BAN_DURATION,
        })
        if (error) throw authError(error)
        await updateProfile(body.userId, { active: body.active })
        return json({ ok: true }, 200, cors)
      }

      case 'set_email': {
        const { error } = await service.auth.admin.updateUserById(body.userId, {
          email: body.email,
          email_confirm: true,
        })
        if (error) throw authError(error)
        await updateProfile(body.userId, { email: body.email })
        return json({ ok: true }, 200, cors)
      }
    }
  } catch (error) {
    return errorResponse(error, cors)
  }
})
