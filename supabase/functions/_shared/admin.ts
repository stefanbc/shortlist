// Shared plumbing for the service-role edge functions: CORS, JSON responses, the
// service client, and caller permission checks (via the database's has_permission).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'

const DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']

function allowedOrigins(): string[] {
  const appUrl = Deno.env.get('APP_URL')
  return appUrl ? [appUrl.replace(/\/$/, ''), ...DEV_ORIGINS] : DEV_ORIGINS
}

/**
 * CORS headers. Admin actions only answer the app's own origin (APP_URL, plus the Vite
 * dev server); `anyOrigin` is for unauthenticated endpoints such as token redemption.
 */
export function corsHeaders(req: Request, anyOrigin = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
  const origin = req.headers.get('Origin')
  if (anyOrigin) {
    headers['Access-Control-Allow-Origin'] = '*'
  } else if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, details?: unknown) {
    super(code)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/** Turns a thrown error into a JSON response; unexpected errors are logged and reported generically. */
export function errorResponse(error: unknown, cors: Record<string, string>): Response {
  if (error instanceof HttpError) {
    const body: Record<string, unknown> = { error: error.code }
    if (error.details !== undefined) body.issues = error.details
    return json(body, error.status, cors)
  }
  console.error(error instanceof Error ? error.message : error)
  return json({ error: 'internal_error' }, 500, cors)
}

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`missing env ${name}`)
  return value
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), noSession)
}

/** Reads the JSON body of a POST, or throws a 400/405 HttpError. */
export async function readJson(req: Request): Promise<unknown> {
  if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed')
  try {
    return await req.json()
  } catch {
    throw new HttpError(400, 'invalid_request')
  }
}

/**
 * Verifies the caller's access token and that their active profile has every listed
 * permission (checked by has_permission as the caller). Returns the caller's auth user.
 */
export async function requirePermissions(req: Request, permissions: string[]): Promise<User> {
  const authorization = req.headers.get('Authorization') ?? ''
  const jwt = /^Bearer (.+)$/i.exec(authorization)?.[1]
  if (!jwt) throw new HttpError(401, 'unauthorized')

  const { data, error } = await serviceClient().auth.getUser(jwt)
  if (error || !data.user) throw new HttpError(401, 'unauthorized')

  const asCaller = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  for (const permission of permissions) {
    const { data: allowed, error: rpcError } = await asCaller.rpc('has_permission', {
      p: permission,
    })
    if (rpcError) throw new Error(`has_permission failed: ${rpcError.message}`)
    if (allowed !== true) throw new HttpError(403, 'forbidden')
  }
  return data.user
}

export type Role = 'admin' | 'juror'

/**
 * Creates a confirmed auth user and returns its id. The role goes in app metadata (only
 * the service role can write it) and is also written to the profile directly: GoTrue's
 * admin createUser inserts the user before it stores app metadata, so the profile trigger
 * sees no role at insert time and falls back to 'juror'.
 */
export async function createUserWithRole(
  service: SupabaseClient,
  user: { email: string; displayName: string; role: Role },
): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email: user.email,
    email_confirm: true,
    user_metadata: { display_name: user.displayName },
    app_metadata: { role: user.role },
  })
  if (error) {
    if (error.code === 'email_exists') throw new HttpError(409, 'email_exists')
    throw new Error(`createUser failed: ${error.message}`)
  }
  const id = data.user.id
  const { error: profileError } = await service
    .from('profiles')
    .update({ role: user.role })
    .eq('id', id)
  if (profileError) {
    await service.auth.admin.deleteUser(id)
    throw new Error(`profile role update failed: ${profileError.message}`)
  }
  return id
}

/** Placeholder address for users without an email (Supabase Auth needs one for magic links). */
export function placeholderEmail(): string {
  return `juror-${crypto.randomUUID()}@jurors.shortlist.invalid`
}

/** Formats Zod issues for a 400 response without echoing input values. */
export function issuesOf(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}
