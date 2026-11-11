// Seeds the local Supabase stack for the Playwright suite: one admin, two jurors, an OPEN
// event (starts_at in the past, ends_at in the future) with 3 criteria and 2 teams, both
// jurors assigned and scored, plus a fresh personal login link per juror.
//
// Run as Playwright's `globalSetup` (see playwright.config.ts) so it executes once before
// the suite. It is idempotent: every run first deletes its own rows (matched by fixed
// seed emails/event name) before recreating them, so re-running the suite against the same
// local stack never collides with a previous run's data.
//
// Writes `e2e/.cache/seed.json` (git-ignored) with every id/token a spec needs; read it
// with `readSeed()`.
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from '../tests/integration/helpers'

const ADMIN_EMAIL = 'e2e-admin@test.shortlist.invalid'
const ADMIN_PASSWORD = 'e2e-Pw-2026-shortlist'
const JUROR_EMAILS = [
  'e2e-juror-1@test.shortlist.invalid',
  'e2e-juror-2@test.shortlist.invalid',
] as const
const EVENT_NAME = 'E2E Seed Event'

const CACHE_DIR = path.resolve(import.meta.dirname, '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'seed.json')

/** Full criterion weights so the event opens with each juror's scores already agreeing:
 * Team Alpha is strong on the low-weight criterion, Team Beta on the two heavy ones, so
 * Beta leads -- until admin-flow.spec.ts raises Impact's weight a lot and the order flips. */
const CRITERIA = [
  { name: 'Impact', weight: 10, position: 1 },
  { name: 'Execution', weight: 100, position: 2 },
  { name: 'Presentation', weight: 100, position: 3 },
] as const

const TEAMS = [
  { name: 'Team Alpha', pitchOrder: 1, scores: [5, 1, 1] },
  { name: 'Team Beta', pitchOrder: 2, scores: [1, 5, 5] },
] as const

export interface SeedJuror {
  id: string
  email: string
  /** Path (not full URL) to the juror's personal link: `/j/<token>`. */
  linkPath: string
}

export interface SeedCriterion {
  id: string
  name: string
  weight: number
  position: number
}

export interface SeedTeam {
  id: string
  name: string
}

export interface SeedData {
  admin: { id: string; email: string; password: string }
  jurors: SeedJuror[]
  event: { id: string; name: string }
  criteria: SeedCriterion[]
  teams: SeedTeam[]
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/** Deletes every row a previous run of this seed created, so re-seeding is safe to repeat
 * against a stack that was never reset. Order matters: the event cascades everything
 * event-scoped (teams, criteria, scores, event_jurors); only then are the auth users
 * removed, which cascades their profiles and juror_tokens. */
async function cleanup(service: SupabaseClient): Promise<void> {
  const { data: events, error: eventsError } = await service
    .from('events')
    .select('id')
    .eq('name', EVENT_NAME)
  if (eventsError) throw new Error(`cleanup: events lookup failed: ${eventsError.message}`)
  if (events && events.length > 0) {
    const { error } = await service.from('events').delete().in('id', events.map((e) => e.id as string))
    if (error) throw new Error(`cleanup: events delete failed: ${error.message}`)
  }

  const { data: profiles, error: profilesError } = await service
    .from('profiles')
    .select('id')
    .in('email', [ADMIN_EMAIL, ...JUROR_EMAILS])
  if (profilesError) throw new Error(`cleanup: profiles lookup failed: ${profilesError.message}`)
  for (const profile of profiles ?? []) {
    const { error } = await service.auth.admin.deleteUser(profile.id as string)
    if (error) throw new Error(`cleanup: deleteUser failed: ${error.message}`)
  }
}

async function createUser(
  service: SupabaseClient,
  email: string,
  displayName: string,
  role: 'admin' | 'juror',
  password?: string,
): Promise<string> {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: { role },
  })
  if (error) throw new Error(`createUser(${email}) failed: ${error.message}`)
  const id = data.user!.id
  // The profile trigger reads app metadata before GoTrue has stored it, so it falls back
  // to 'juror'; set the role on the profile directly too (same as scripts/create-admin.ts).
  const { error: profileError } = await service.from('profiles').update({ role }).eq('id', id)
  if (profileError) throw new Error(`profile role update for ${email} failed: ${profileError.message}`)
  return id
}

/** Issues a fresh personal login token for a juror, written the same way `juror-link`'s
 * `issue` action does (sha256 hash stored, raw token returned) -- without needing the
 * edge function running during seeding. */
async function issueToken(service: SupabaseClient, jurorId: string): Promise<string> {
  const token = base64url(randomBytes(32))
  const { error } = await service
    .from('juror_tokens')
    .insert({ juror_id: jurorId, token_hash: sha256Hex(token) })
  if (error) throw new Error(`juror_tokens insert for ${jurorId} failed: ${error.message}`)
  return token
}

export default async function globalSetup(): Promise<void> {
  const service = serviceClient()
  await cleanup(service)

  const adminId = await createUser(service, ADMIN_EMAIL, 'E2E Admin', 'admin', ADMIN_PASSWORD)
  const jurorIds: string[] = []
  for (const [index, email] of JUROR_EMAILS.entries()) {
    jurorIds.push(await createUser(service, email, `E2E Juror ${index + 1}`, 'juror'))
  }

  const now = Date.now()
  const startsAt = new Date(now - 60 * 60 * 1000).toISOString()
  const endsAt = new Date(now + 6 * 60 * 60 * 1000).toISOString()

  const { data: event, error: eventError } = await service
    .from('events')
    .insert({ name: EVENT_NAME, starts_at: startsAt, ends_at: endsAt, pitch_minutes: 7 })
    .select('id')
    .single()
  if (eventError) throw new Error(`event insert failed: ${eventError.message}`)
  const eventId = event.id as string

  const { data: criteriaRows, error: criteriaError } = await service
    .from('criteria')
    .insert(CRITERIA.map((c) => ({ event_id: eventId, name: c.name, weight: c.weight, position: c.position })))
    .select('id, name, weight, position')
  if (criteriaError) throw new Error(`criteria insert failed: ${criteriaError.message}`)
  const criteria = (criteriaRows ?? []).sort((a, b) => (a.position as number) - (b.position as number))

  const { data: teamRows, error: teamsError } = await service
    .from('teams')
    .insert(TEAMS.map((t) => ({ event_id: eventId, name: t.name, pitch_order: t.pitchOrder })))
    .select('id, name, pitch_order')
  if (teamsError) throw new Error(`teams insert failed: ${teamsError.message}`)
  const teams = (teamRows ?? []).sort((a, b) => (a.pitch_order as number) - (b.pitch_order as number))

  const { error: assignError } = await service
    .from('event_jurors')
    .insert(jurorIds.map((jurorId) => ({ event_id: eventId, juror_id: jurorId })))
  if (assignError) throw new Error(`event_jurors insert failed: ${assignError.message}`)

  const scoreRows = teams.flatMap((team, teamIndex) =>
    jurorIds.flatMap((jurorId) =>
      criteria.map((criterion, criterionIndex) => ({
        event_id: eventId,
        team_id: team.id as string,
        criterion_id: criterion.id as string,
        juror_id: jurorId,
        value: TEAMS[teamIndex].scores[criterionIndex],
        tapped_at: new Date().toISOString(),
      })),
    ),
  )
  const { error: scoresError } = await service.from('scores').insert(scoreRows)
  if (scoresError) throw new Error(`scores insert failed: ${scoresError.message}`)

  const tokens: string[] = []
  for (const jurorId of jurorIds) tokens.push(await issueToken(service, jurorId))

  const data: SeedData = {
    admin: { id: adminId, email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    jurors: jurorIds.map((id, index) => ({
      id,
      email: JUROR_EMAILS[index],
      linkPath: `/j/${tokens[index]}`,
    })),
    event: { id: eventId, name: EVENT_NAME },
    criteria: criteria.map((c) => ({
      id: c.id as string,
      name: c.name as string,
      weight: Number(c.weight),
      position: c.position as number,
    })),
    teams: teams.map((t) => ({ id: t.id as string, name: t.name as string })),
  }

  mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
}

/** Reads the seed data written by the last `globalSetup` run. Specs call this instead of
 * seeding anything themselves. */
export function readSeed(): SeedData {
  return JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as SeedData
}

/** Puts every team/criterion/juror score back to the deterministic starting matrix (the
 * same one `globalSetup` seeds), regardless of what other specs tapped in the meantime.
 * admin-flow.spec.ts's weight-change test calls this first so it doesn't depend on test
 * execution order relative to juror-scoring.spec.ts. */
export async function resetScores(service: SupabaseClient, seed: SeedData): Promise<void> {
  const criteriaByPosition = [...seed.criteria].sort((a, b) => a.position - b.position)
  const rows = seed.teams.flatMap((team) => {
    const matrix = TEAMS.find((t) => t.name === team.name)
    if (!matrix) throw new Error(`resetScores: no seeded score matrix for team ${team.name}`)
    return seed.jurors.flatMap((juror) =>
      criteriaByPosition.map((criterion, index) => ({
        event_id: seed.event.id,
        team_id: team.id,
        criterion_id: criterion.id,
        juror_id: juror.id,
        value: matrix.scores[index],
        tapped_at: new Date().toISOString(),
      })),
    )
  })
  const { error } = await service.from('scores').upsert(rows, { onConflict: 'team_id,criterion_id,juror_id' })
  if (error) throw new Error(`resetScores: upsert failed: ${error.message}`)
}
