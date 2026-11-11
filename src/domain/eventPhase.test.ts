import { describe, expect, it } from 'vitest'
import { closedAt, eventPhase, GRACE_MINUTES, type EventTiming } from './eventPhase'

const STARTS_AT = '2026-01-01T00:00:00.000Z'
const ENDS_AT = '2026-01-10T00:00:00.000Z'

function makeTiming(overrides: Partial<EventTiming> = {}): EventTiming {
  return {
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    statusOverride: 'auto',
    lockedAt: null,
    ...overrides,
  }
}

describe('eventPhase', () => {
  it('is setup before the start date', () => {
    const timing = makeTiming()
    expect(eventPhase(timing, new Date('2025-12-31T23:59:59.999Z'))).toBe('setup')
  })

  it('is open between the start and end dates', () => {
    const timing = makeTiming()
    expect(eventPhase(timing, new Date('2026-01-05T00:00:00.000Z'))).toBe('open')
  })

  it('is open at the exact start boundary', () => {
    const timing = makeTiming()
    expect(eventPhase(timing, new Date(STARTS_AT))).toBe('open')
  })

  it('is open at the exact end boundary (now == endsAt)', () => {
    const timing = makeTiming()
    expect(eventPhase(timing, new Date(ENDS_AT))).toBe('open')
  })

  it('is locked after the end date', () => {
    const timing = makeTiming()
    expect(eventPhase(timing, new Date('2026-01-10T00:00:00.001Z'))).toBe('locked')
  })

  it('override "open" takes precedence even before the start date', () => {
    const timing = makeTiming({ statusOverride: 'open' })
    expect(eventPhase(timing, new Date('2025-01-01T00:00:00.000Z'))).toBe('open')
  })

  it('override "open" takes precedence even after the end date', () => {
    const timing = makeTiming({ statusOverride: 'open' })
    expect(eventPhase(timing, new Date('2027-01-01T00:00:00.000Z'))).toBe('open')
  })

  it('override "locked" takes precedence even before the start date', () => {
    const timing = makeTiming({ statusOverride: 'locked' })
    expect(eventPhase(timing, new Date('2025-01-01T00:00:00.000Z'))).toBe('locked')
  })

  it('override "locked" takes precedence even during the open window', () => {
    const timing = makeTiming({ statusOverride: 'locked' })
    expect(eventPhase(timing, new Date('2026-01-05T00:00:00.000Z'))).toBe('locked')
  })
})

describe('closedAt', () => {
  it('returns lockedAt when override is locked', () => {
    const lockedAt = '2026-01-07T12:00:00.000Z'
    const timing = makeTiming({ statusOverride: 'locked', lockedAt })
    expect(closedAt(timing).toISOString()).toBe(lockedAt)
  })

  it('returns endsAt when override is auto', () => {
    const timing = makeTiming()
    expect(closedAt(timing).toISOString()).toBe(ENDS_AT)
  })

  it('returns lockedAt for auto when it is later than endsAt (re-opened, then back to auto)', () => {
    const lockedAt = new Date(new Date(ENDS_AT).getTime() + 60 * 60_000).toISOString()
    const timing = makeTiming({ statusOverride: 'auto', lockedAt })
    expect(closedAt(timing).toISOString()).toBe(lockedAt)
  })

  it('returns endsAt for auto when lockedAt is earlier than endsAt', () => {
    const lockedAt = new Date(new Date(ENDS_AT).getTime() - 60 * 60_000).toISOString()
    const timing = makeTiming({ statusOverride: 'auto', lockedAt })
    expect(closedAt(timing).toISOString()).toBe(ENDS_AT)
  })

  it('returns endsAt when override is open', () => {
    const timing = makeTiming({ statusOverride: 'open' })
    expect(closedAt(timing).toISOString()).toBe(ENDS_AT)
  })

  it('falls back to endsAt when override is locked but lockedAt is null', () => {
    const timing = makeTiming({ statusOverride: 'locked', lockedAt: null })
    expect(closedAt(timing).toISOString()).toBe(ENDS_AT)
  })
})

describe('GRACE_MINUTES', () => {
  it('is 15', () => {
    expect(GRACE_MINUTES).toBe(15)
  })
})
