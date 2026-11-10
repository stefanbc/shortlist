import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

interface LocalEnv {
  url: string
  anonKey: string
  serviceRoleKey: string
}

let cachedEnv: LocalEnv | null = null

/**
 * Connection details for the local stack: SUPABASE_URL / SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY from the environment, else `supabase status -o env`.
 */
export function localEnv(): LocalEnv {
  if (cachedEnv) return cachedEnv
  let status: Record<string, string> = {}
  if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    const output = execSync('supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    status = Object.fromEntries(
      output
        .split('\n')
        .map((line) => /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim()))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => [match[1], match[2]]),
    )
  }
  cachedEnv = {
    url: process.env.SUPABASE_URL ?? status.API_URL,
    anonKey: process.env.SUPABASE_ANON_KEY ?? status.ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY,
  }
  return cachedEnv
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } }

export function serviceClient(): SupabaseClient {
  const { url, serviceRoleKey } = localEnv()
  return createClient(url, serviceRoleKey, noSession)
}

export function anonClient(): SupabaseClient {
  const { url, anonKey } = localEnv()
  return createClient(url, anonKey, noSession)
}

export interface TestUser {
  id: string
  email: string
  accessToken: string
}

/** Creates a confirmed user with a password (role via app metadata) and signs them in. */
export async function createSignedInUser(
  role: 'admin' | 'juror',
  displayName = `Test ${role}`,
): Promise<TestUser> {
  const email = `${role}-${randomUUID()}@test.shortlist.invalid`
  const password = `pw-${randomUUID()}`
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: { role },
  })
  if (error) throw error
  // GoTrue stores app metadata after the insert the profile trigger sees, so set the role.
  const { error: profileError } = await serviceClient()
    .from('profiles')
    .update({ role })
    .eq('id', data.user.id)
  if (profileError) throw profileError
  const client = anonClient()
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) throw signInError
  return { id: data.user.id, email, accessToken: session.session.access_token }
}

export interface FunctionResponse<T = Record<string, unknown>> {
  status: number
  body: T
}

/** POSTs JSON to a served edge function, as the given user (or with just the anon key). */
export async function callFunction<T = Record<string, unknown>>(
  name: string,
  body: unknown,
  accessToken?: string,
): Promise<FunctionResponse<T>> {
  const { url, anonKey } = localEnv()
  const response = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${accessToken ?? anonKey}`,
    },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { raw: text }
  }
  return { status: response.status, body: parsed as T }
}
