// Personal juror login links. The admin issues/revokes a link token per juror; opening the
// link redeems the token for a one-time magic-link hash the client exchanges for a session
// (supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })).
//
// The raw token is a bearer credential: only its sha256 is stored, it is never logged,
// and unknown and revoked tokens get the same `invalid_token` answer.
import { z } from 'npm:zod@4'
import {
  corsHeaders,
  errorResponse,
  HttpError,
  issuesOf,
  json,
  readJson,
  requirePermissions,
  serviceClient,
} from '../_shared/admin.ts'

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('issue'), jurorId: z.uuid() }),
  z.object({ action: z.literal('revoke'), jurorId: z.uuid() }),
  z.object({ action: z.literal('redeem'), token: z.string().min(1).max(256) }),
])

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const service = serviceClient()

/** Links are only for juror accounts: a leaked admin link would be an admin session. */
async function requireJuror(jurorId: string): Promise<void> {
  const { data, error } = await service
    .from('profiles')
    .select('role')
    .eq('id', jurorId)
    .maybeSingle()
  if (error) throw new Error(`profile lookup failed: ${error.message}`)
  if (!data || data.role !== 'juror') throw new HttpError(404, 'not_found')
}

async function revokeActiveTokens(jurorId: string): Promise<void> {
  const { error } = await service
    .from('juror_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('juror_id', jurorId)
    .is('revoked_at', null)
  if (error) throw new Error(`token revoke failed: ${error.message}`)
}

async function issue(jurorId: string): Promise<{ token: string }> {
  await requireJuror(jurorId)
  await revokeActiveTokens(jurorId)
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const { error } = await service
    .from('juror_tokens')
    .insert({ juror_id: jurorId, token_hash: await sha256Hex(token) })
  if (error) throw new Error(`token insert failed: ${error.message}`)
  return { token }
}

async function redeem(token: string): Promise<{ tokenHash: string }> {
  const { data: row, error } = await service
    .from('juror_tokens')
    .select('juror_id, revoked_at')
    .eq('token_hash', await sha256Hex(token))
    .maybeSingle()
  if (error) throw new Error(`token lookup failed: ${error.message}`)
  if (!row || row.revoked_at !== null) throw new HttpError(400, 'invalid_token')

  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('role, active')
    .eq('id', row.juror_id)
    .maybeSingle()
  if (profileError) throw new Error(`profile lookup failed: ${profileError.message}`)
  if (!profile || profile.role !== 'juror') throw new HttpError(400, 'invalid_token')
  if (!profile.active) throw new HttpError(400, 'inactive')

  const { data: user, error: userError } = await service.auth.admin.getUserById(row.juror_id)
  if (userError || !user.user?.email) throw new Error('juror auth user or email missing')

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email: user.user.email,
  })
  if (linkError) throw new Error(`generateLink failed: ${linkError.message}`)
  return { tokenHash: link.properties.hashed_token }
}

Deno.serve(async (req) => {
  // Redemption is unauthenticated and may come from any origin; admin actions answer only
  // the app origin. A preflight cannot see the action, so it is answered permissively.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req, true) })

  let cors = corsHeaders(req)
  try {
    const raw = await readJson(req)
    if ((raw as { action?: unknown } | null)?.action === 'redeem') cors = corsHeaders(req, true)
    const parsed = requestSchema.safeParse(raw)
    if (!parsed.success) throw new HttpError(400, 'invalid_request', issuesOf(parsed.error))
    const body = parsed.data

    if (body.action === 'redeem') return json(await redeem(body.token), 200, cors)

    await requirePermissions(req, ['users.manage'])
    if (body.action === 'issue') return json(await issue(body.jurorId), 200, cors)
    await requireJuror(body.jurorId)
    await revokeActiveTokens(body.jurorId)
    return json({ ok: true }, 200, cors)
  } catch (error) {
    return errorResponse(error, cors)
  }
})
