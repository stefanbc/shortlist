import { describe, expect, it } from 'vitest'
import {
  criterionInputSchema,
  eventInputSchema,
  scoreValueSchema,
  teamInputSchema,
  themeInputSchema,
  userInputSchema,
} from './schemas'

describe('scoreValueSchema', () => {
  it('accepts 4.5', () => {
    expect(scoreValueSchema.safeParse(4.5).success).toBe(true)
  })

  it('rejects 3.25 (not a multiple of 0.5)', () => {
    expect(scoreValueSchema.safeParse(3.25).success).toBe(false)
  })

  it('rejects 5.5 (above the 1-5 range)', () => {
    expect(scoreValueSchema.safeParse(5.5).success).toBe(false)
  })

  it('accepts the 1 and 5 boundaries', () => {
    expect(scoreValueSchema.safeParse(1).success).toBe(true)
    expect(scoreValueSchema.safeParse(5).success).toBe(true)
  })

  it('rejects below 1 and above 5', () => {
    expect(scoreValueSchema.safeParse(0.5).success).toBe(false)
    expect(scoreValueSchema.safeParse(5.5).success).toBe(false)
  })
})

describe('criterionInputSchema', () => {
  it('accepts a valid criterion', () => {
    const result = criterionInputSchema.safeParse({ name: 'Originality', weight: 90, position: 1 })
    expect(result.success).toBe(true)
  })

  it('trims the name and enforces 1-300 chars', () => {
    const result = criterionInputSchema.safeParse({
      name: '  Originality  ',
      weight: 1,
      position: 1,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe('Originality')

    expect(criterionInputSchema.safeParse({ name: '   ', weight: 1, position: 1 }).success).toBe(
      false,
    )
    expect(
      criterionInputSchema.safeParse({ name: 'a'.repeat(301), weight: 1, position: 1 }).success,
    ).toBe(false)
  })

  it('rejects weight 0, -1, empty string, and non-numeric string', () => {
    expect(criterionInputSchema.safeParse({ name: 'A', weight: 0, position: 1 }).success).toBe(
      false,
    )
    expect(criterionInputSchema.safeParse({ name: 'A', weight: -1, position: 1 }).success).toBe(
      false,
    )
    expect(criterionInputSchema.safeParse({ name: 'A', weight: '', position: 1 }).success).toBe(
      false,
    )
    expect(criterionInputSchema.safeParse({ name: 'A', weight: 'abc', position: 1 }).success).toBe(
      false,
    )
  })

  it('rejects weight above 1000', () => {
    expect(criterionInputSchema.safeParse({ name: 'A', weight: 1001, position: 1 }).success).toBe(
      false,
    )
    expect(criterionInputSchema.safeParse({ name: 'A', weight: 1000, position: 1 }).success).toBe(
      true,
    )
  })

  it('requires position to be an integer >= 1', () => {
    expect(criterionInputSchema.safeParse({ name: 'A', weight: 1, position: 0 }).success).toBe(
      false,
    )
    expect(criterionInputSchema.safeParse({ name: 'A', weight: 1, position: 1.5 }).success).toBe(
      false,
    )
    expect(criterionInputSchema.safeParse({ name: 'A', weight: 1, position: 1 }).success).toBe(true)
  })
})

describe('themeInputSchema', () => {
  it('accepts a valid theme name', () => {
    expect(themeInputSchema.safeParse({ name: 'Artificial Intelligence' }).success).toBe(true)
  })

  it('rejects an empty or too-long name', () => {
    expect(themeInputSchema.safeParse({ name: '' }).success).toBe(false)
    expect(themeInputSchema.safeParse({ name: 'a'.repeat(121) }).success).toBe(false)
  })
})

describe('eventInputSchema', () => {
  const base = {
    name: 'Astra Hack',
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-01-02T00:00:00.000Z',
  }

  it('accepts a valid event and defaults pitchMinutes to 7', () => {
    const result = eventInputSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.pitchMinutes).toBe(7)
  })

  it('rejects endsAt before startsAt', () => {
    const result = eventInputSchema.safeParse({
      ...base,
      startsAt: '2026-01-02T00:00:00.000Z',
      endsAt: '2026-01-01T00:00:00.000Z',
    })
    expect(result.success).toBe(false)
  })

  it('rejects endsAt equal to startsAt', () => {
    const result = eventInputSchema.safeParse({ ...base, endsAt: base.startsAt })
    expect(result.success).toBe(false)
  })

  it('rejects pitchMinutes outside 1-60', () => {
    expect(eventInputSchema.safeParse({ ...base, pitchMinutes: 0 }).success).toBe(false)
    expect(eventInputSchema.safeParse({ ...base, pitchMinutes: 61 }).success).toBe(false)
    expect(eventInputSchema.safeParse({ ...base, pitchMinutes: 60 }).success).toBe(true)
  })

  it('enforces name length 1-120', () => {
    expect(eventInputSchema.safeParse({ ...base, name: '' }).success).toBe(false)
    expect(eventInputSchema.safeParse({ ...base, name: 'a'.repeat(121) }).success).toBe(false)
  })
})

describe('teamInputSchema', () => {
  const base = {
    name: 'Team Rocket',
    members: ['Jessie', 'James'],
    pitchOrder: 1,
    project: {
      name: 'Pokedex',
      description: 'A pokedex app',
      themeId: '123e4567-e89b-12d3-a456-426614174000',
      repoUrl: 'https://github.com/example/pokedex',
    },
  }

  it('accepts a valid team', () => {
    expect(teamInputSchema.safeParse(base).success).toBe(true)
  })

  it('accepts null project fields', () => {
    const result = teamInputSchema.safeParse({
      ...base,
      project: { name: null, description: null, themeId: null, repoUrl: null },
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid themeId', () => {
    const result = teamInputSchema.safeParse({
      ...base,
      project: { ...base.project, themeId: 'not-a-uuid' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a non-URL repoUrl', () => {
    const result = teamInputSchema.safeParse({
      ...base,
      project: { ...base.project, repoUrl: 'not-a-url' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a javascript: repoUrl (XSS vector)', () => {
    const result = teamInputSchema.safeParse({
      ...base,
      project: { ...base.project, repoUrl: 'javascript:alert(1)' },
    })
    expect(result.success).toBe(false)
  })

  it('rejects a data: repoUrl (XSS vector)', () => {
    const result = teamInputSchema.safeParse({
      ...base,
      project: { ...base.project, repoUrl: 'data:text/html,x' },
    })
    expect(result.success).toBe(false)
  })

  it('accepts an https repoUrl', () => {
    const result = teamInputSchema.safeParse({
      ...base,
      project: { ...base.project, repoUrl: 'https://github.com/x/y' },
    })
    expect(result.success).toBe(true)
  })

  it('accepts an http repoUrl', () => {
    const result = teamInputSchema.safeParse({
      ...base,
      project: { ...base.project, repoUrl: 'http://github.com/x/y' },
    })
    expect(result.success).toBe(true)
  })

  it('rejects a description over 5000 chars', () => {
    const result = teamInputSchema.safeParse({
      ...base,
      project: { ...base.project, description: 'a'.repeat(5001) },
    })
    expect(result.success).toBe(false)
  })

  it('requires pitchOrder to be an integer >= 1', () => {
    expect(teamInputSchema.safeParse({ ...base, pitchOrder: 0 }).success).toBe(false)
  })

  it('enforces name length 1-120', () => {
    expect(teamInputSchema.safeParse({ ...base, name: '' }).success).toBe(false)
    expect(teamInputSchema.safeParse({ ...base, name: 'a'.repeat(121) }).success).toBe(false)
  })
})

describe('userInputSchema', () => {
  it('accepts a valid admin user without email', () => {
    expect(userInputSchema.safeParse({ displayName: 'Ada Lovelace', role: 'admin' }).success).toBe(
      true,
    )
  })

  it('accepts a valid juror with email', () => {
    expect(
      userInputSchema.safeParse({
        displayName: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'juror',
      }).success,
    ).toBe(true)
  })

  it('rejects an invalid email', () => {
    expect(
      userInputSchema.safeParse({ displayName: 'Ada', email: 'not-an-email', role: 'juror' })
        .success,
    ).toBe(false)
  })

  it('rejects an invalid role', () => {
    expect(userInputSchema.safeParse({ displayName: 'Ada', role: 'superadmin' }).success).toBe(
      false,
    )
  })

  it('enforces displayName length 1-120', () => {
    expect(userInputSchema.safeParse({ displayName: '', role: 'admin' }).success).toBe(false)
    expect(userInputSchema.safeParse({ displayName: 'a'.repeat(121), role: 'admin' }).success).toBe(
      false,
    )
  })
})
