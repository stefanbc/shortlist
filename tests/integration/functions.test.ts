import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Criterion, Score, Team } from '../../src/domain/types'
import { rankTeams } from '../../src/domain/scoring'
import { parseWorkbook, toDomain } from '../../src/features/import/parseWorkbook'
import {
  anonClient,
  callFunction,
  createSignedInUser,
  serviceClient,
  type TestUser,
} from './helpers'

let admin: TestUser

beforeAll(async () => {
  admin = await createSignedInUser('admin')
})

async function createJuror(displayName = 'Link Juror'): Promise<string> {
  const { status, body } = await callFunction<{ id: string }>(
    'admin-users',
    { action: 'create', displayName, role: 'juror' },
    admin.accessToken,
  )
  expect(status).toBe(200)
  return body.id
}

async function issueToken(jurorId: string): Promise<string> {
  const { status, body } = await callFunction<{ token: string }>(
    'juror-link',
    { action: 'issue', jurorId },
    admin.accessToken,
  )
  expect(status).toBe(200)
  return body.token
}

describe('juror-link', () => {
  it('issue then redeem yields a session for the juror', async () => {
    const jurorId = await createJuror()
    const token = await issueToken(jurorId)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes, base64url, unpadded

    const { status, body } = await callFunction<{ tokenHash: string }>('juror-link', {
      action: 'redeem',
      token,
    })
    expect(status).toBe(200)

    const { data, error } = await anonClient().auth.verifyOtp({
      token_hash: body.tokenHash,
      type: 'magiclink',
    })
    expect(error).toBeNull()
    expect(data.session).not.toBeNull()
    expect(data.user?.id).toBe(jurorId)
  })

  it('stores only the sha256 hash of the token', async () => {
    const jurorId = await createJuror()
    const token = await issueToken(jurorId)
    const { data } = await serviceClient()
      .from('juror_tokens')
      .select('token_hash')
      .eq('juror_id', jurorId)
    expect(data).toHaveLength(1)
    expect(data![0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(data![0].token_hash).not.toContain(token)
  })

  it('reissue revokes the old token', async () => {
    const jurorId = await createJuror()
    const oldToken = await issueToken(jurorId)
    const newToken = await issueToken(jurorId)

    const old = await callFunction('juror-link', { action: 'redeem', token: oldToken })
    expect(old).toEqual({ status: 400, body: { error: 'invalid_token' } })

    const fresh = await callFunction('juror-link', { action: 'redeem', token: newToken })
    expect(fresh.status).toBe(200)
  })

  it('revoke invalidates the current token', async () => {
    const jurorId = await createJuror()
    const token = await issueToken(jurorId)
    const revoked = await callFunction(
      'juror-link',
      { action: 'revoke', jurorId },
      admin.accessToken,
    )
    expect(revoked).toEqual({ status: 200, body: { ok: true } })

    const redeem = await callFunction('juror-link', { action: 'redeem', token })
    expect(redeem).toEqual({ status: 400, body: { error: 'invalid_token' } })
  })

  it('unknown token is invalid_token', async () => {
    const redeem = await callFunction('juror-link', { action: 'redeem', token: 'A'.repeat(43) })
    expect(redeem).toEqual({ status: 400, body: { error: 'invalid_token' } })
  })

  // 0004_revoke_on_role_change.sql revokes a juror's tokens the moment their profile goes
  // inactive (any path: this edge function, or a direct `profiles` update -- the trigger
  // fires on the column, not the caller), so a deactivated juror's link stops working via
  // the token-revoked check in `redeem()`, before it would ever reach the inactive-profile
  // check further down. That second check is defence-in-depth for a profile that somehow
  // went inactive without its tokens being revoked (no code path does that today, but
  // `redeem()` doesn't rely on it); this test covers the actual, reachable behavior.
  it('deactivated juror cannot redeem: the link stops working (token already revoked)', async () => {
    const jurorId = await createJuror()
    const token = await issueToken(jurorId)
    const deactivated = await callFunction(
      'admin-users',
      { action: 'set_active', userId: jurorId, active: false },
      admin.accessToken,
    )
    expect(deactivated.status).toBe(200)

    const redeem = await callFunction('juror-link', { action: 'redeem', token })
    expect(redeem).toEqual({ status: 400, body: { error: 'invalid_token' } })
  })

  it('juror caller cannot issue links', async () => {
    const juror = await createSignedInUser('juror')
    const target = await createJuror()
    const { status, body } = await callFunction(
      'juror-link',
      { action: 'issue', jurorId: target },
      juror.accessToken,
    )
    expect(status).toBe(403)
    expect(body).toEqual({ error: 'forbidden' })
  })

  it('anonymous caller cannot issue links', async () => {
    const target = await createJuror()
    const { status } = await callFunction('juror-link', { action: 'issue', jurorId: target })
    expect(status).toBe(401)
  })

  it('cannot issue a link for an admin', async () => {
    const otherAdmin = await createSignedInUser('admin')
    const { status, body } = await callFunction(
      'juror-link',
      { action: 'issue', jurorId: otherAdmin.id },
      admin.accessToken,
    )
    expect(status).toBe(404)
    expect(body).toEqual({ error: 'not_found' })
  })
})

describe('admin-users', () => {
  it('creates a juror with a placeholder email and the juror role', async () => {
    const id = await createJuror('Placeholder Juror')
    const service = serviceClient()
    const { data: user } = await service.auth.admin.getUserById(id)
    expect(user.user?.email).toMatch(/^juror-[0-9a-f-]{36}@jurors\.shortlist\.invalid$/)
    const { data: profile } = await service
      .from('profiles')
      .select('display_name, role, active')
      .eq('id', id)
      .single()
    expect(profile).toEqual({ display_name: 'Placeholder Juror', role: 'juror', active: true })
  })

  it('creates an admin with the given email', async () => {
    const email = `new-admin-${crypto.randomUUID()}@test.shortlist.invalid`
    const { status, body } = await callFunction<{ id: string }>(
      'admin-users',
      { action: 'create', displayName: 'Second Admin', email, role: 'admin' },
      admin.accessToken,
    )
    expect(status).toBe(200)
    const { data: profile } = await serviceClient()
      .from('profiles')
      .select('role, email')
      .eq('id', body.id)
      .single()
    expect(profile).toEqual({ role: 'admin', email })
  })

  it('set_active bans and unbans the auth user', async () => {
    const id = await createJuror()
    const service = serviceClient()

    await callFunction(
      'admin-users',
      { action: 'set_active', userId: id, active: false },
      admin.accessToken,
    )
    let { data } = await service.auth.admin.getUserById(id)
    expect(new Date(data.user!.banned_until!).getTime()).toBeGreaterThan(Date.now())
    let profile = await service.from('profiles').select('active').eq('id', id).single()
    expect(profile.data).toEqual({ active: false })

    await callFunction(
      'admin-users',
      { action: 'set_active', userId: id, active: true },
      admin.accessToken,
    )
    ;({ data } = await service.auth.admin.getUserById(id))
    expect(data.user!.banned_until ?? null).toBeNull()
    profile = await service.from('profiles').select('active').eq('id', id).single()
    expect(profile.data).toEqual({ active: true })
  })

  it('set_email updates the auth user and the profile', async () => {
    const id = await createJuror()
    const email = `juror-real-${crypto.randomUUID()}@test.shortlist.invalid`
    const { status } = await callFunction(
      'admin-users',
      { action: 'set_email', userId: id, email },
      admin.accessToken,
    )
    expect(status).toBe(200)
    const service = serviceClient()
    const { data } = await service.auth.admin.getUserById(id)
    expect(data.user?.email).toBe(email)
    const { data: profile } = await service.from('profiles').select('email').eq('id', id).single()
    expect(profile).toEqual({ email })
  })

  it('juror caller cannot create users', async () => {
    const juror = await createSignedInUser('juror')
    const { status } = await callFunction(
      'admin-users',
      { action: 'create', displayName: 'Sneaky', role: 'admin' },
      juror.accessToken,
    )
    expect(status).toBe(403)
  })

  it('rejects invalid input', async () => {
    const { status, body } = await callFunction(
      'admin-users',
      { action: 'create', displayName: '', role: 'owner' },
      admin.accessToken,
    )
    expect(status).toBe(400)
    expect(body).toMatchObject({ error: 'invalid_request' })
  })
})

// Private fixture (git-ignored, never committed); skipped when absent.
const FIXTURE = path.resolve(import.meta.dirname, '../../fixtures/astra-hack.xlsx')
const FIXTURE_EXISTS = existsSync(FIXTURE)

describe.skipIf(!FIXTURE_EXISTS)('import-event (astra-hack.xlsx fixture)', () => {
  it('import-event on the fixture creates 20 teams, 7 jurors, locked event, and results match expectedFinals', async () => {
    const buffer = readFileSync(FIXTURE)
    const parsed = await parseWorkbook(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    )

    const { status, body } = await callFunction<{ eventId: string }>(
      'import-event',
      { ...parsed, eventName: 'Astra Hack (integration test)' },
      admin.accessToken,
    )
    expect(status).toBe(200)
    const eventId = body.eventId

    const service = serviceClient()
    const { data: event } = await service
      .from('events')
      .select('name, status_override')
      .eq('id', eventId)
      .single()
    expect(event).toEqual({ name: 'Astra Hack (integration test)', status_override: 'locked' })

    const { data: jurorRows } = await service
      .from('event_jurors')
      .select('juror_id, profiles(display_name, role, email)')
      .eq('event_id', eventId)
    expect(jurorRows).toHaveLength(7)
    const jurorProfiles = jurorRows!.map(
      (row) => row.profiles as unknown as { display_name: string; role: string; email: string },
    )
    expect(jurorProfiles.every((p) => p.role === 'juror')).toBe(true)
    expect(jurorProfiles.every((p) => p.email.endsWith('@jurors.shortlist.invalid'))).toBe(true)
    expect(jurorProfiles.map((p) => p.display_name).sort()).toEqual(
      parsed.jurors.map((j) => j.displayName).sort(),
    )

    const { data: teamRows } = await service
      .from('teams')
      .select('id, name, pitch_order, no_show, manual_tiebreak')
      .eq('event_id', eventId)
    expect(teamRows).toHaveLength(20)
    const { data: criterionRows } = await service
      .from('criteria')
      .select('id, name, weight, position')
      .eq('event_id', eventId)
    // The API caps responses at 1000 rows (config.toml max_rows), so page through scores.
    const scoreRows: { team_id: string; criterion_id: string; juror_id: string; value: number }[] =
      []
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await service
        .from('scores')
        .select('team_id, criterion_id, juror_id, value')
        .eq('event_id', eventId)
        .order('id')
        .range(from, from + 999)
      expect(error).toBeNull()
      scoreRows.push(...page!)
      if (page!.length < 1000) break
    }
    expect(scoreRows).toHaveLength(
      parsed.teams.reduce((total, team) => total + team.scores.length, 0),
    )

    // Team ids become sheet names (E<pitch order>) so results line up with expectedFinals.
    const sheetById = new Map(teamRows!.map((row) => [row.id, `E${row.pitch_order}`]))
    const teams: Team[] = teamRows!.map((row) => ({
      id: sheetById.get(row.id)!,
      name: row.name,
      pitchOrder: row.pitch_order,
      noShow: row.no_show,
      manualTiebreak: row.manual_tiebreak,
    }))
    const criteria: Criterion[] = criterionRows!.map((row) => ({
      id: row.id,
      name: row.name,
      weight: Number(row.weight),
      position: row.position,
    }))
    const scores: Score[] = scoreRows.map((row) => ({
      teamId: sheetById.get(row.team_id)!,
      criterionId: row.criterion_id,
      jurorId: row.juror_id,
      value: Number(row.value),
    }))

    const ranked = rankTeams(teams, criteria, scores)
    const scoredSheets = Object.entries(parsed.expectedFinals).filter(([, final]) => final !== null)
    expect(scoredSheets).toHaveLength(19)
    for (const [sheet, expectedFinal] of scoredSheets) {
      expect(ranked.find((r) => r.teamId === sheet)?.final).toBeCloseTo(expectedFinal as number, 9)
    }

    const local = toDomain(parsed)
    expect(ranked.map((r) => r.teamId)).toEqual(
      rankTeams(local.teams, local.criteria, local.scores).map((r) => r.teamId),
    )
    expect(ranked.at(-1)).toMatchObject({ teamId: 'E10', final: 1 })
  })
})
