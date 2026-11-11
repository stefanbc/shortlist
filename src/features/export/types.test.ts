import { describe, expect, it } from 'vitest'
import type { EventResults } from '@/features/reports/useEventResults'
import type { Profile } from '@/stores/session'
import { buildExportData } from './types'

function profile(id: string, displayName: string): Profile {
  return { id, displayName, email: null, role: 'juror', active: true }
}

function baseResults(overrides: Partial<EventResults> = {}): EventResults {
  return {
    ranked: [],
    criteria: [],
    teams: [],
    jurors: [],
    scores: [],
    criterionStats: [],
    jurorStats: [],
    isLoading: false,
    ...overrides,
  }
}

describe('buildExportData', () => {
  it('lists currently-assigned jurors before any former juror', () => {
    const data = buildExportData({
      eventName: 'Astra Hack',
      themes: [{ id: 'th1', name: 'Theme Gamma', position: 1 }],
      results: baseResults({
        jurors: [profile('j1', 'Ana Pop')],
        scores: [{ teamId: 't1', criterionId: 'c1', jurorId: 'j2', value: 4 }],
      }),
      allProfiles: [profile('j1', 'Ana Pop'), profile('j2', 'Ion Marin')],
      formerJurorLabel: 'Former juror',
    })

    expect(data.jurors.map((j) => j.id)).toEqual(['j1', 'j2'])
    expect(data.jurors.find((j) => j.id === 'j2')?.displayName).toBe('Ion Marin')
    expect(data.themeNames).toEqual({ th1: 'Theme Gamma' })
    expect(data.themes).toEqual(['Theme Gamma'])
  })

  it('falls back to the former-juror label when even the profile is gone', () => {
    const data = buildExportData({
      eventName: 'Astra Hack',
      themes: [],
      results: baseResults({
        jurors: [],
        scores: [{ teamId: 't1', criterionId: 'c1', jurorId: 'deleted-juror', value: 4 }],
      }),
      allProfiles: [],
      formerJurorLabel: 'Former juror',
    })

    expect(data.jurors).toEqual([
      { id: 'deleted-juror', displayName: 'Former juror', email: null, role: 'juror', active: false },
    ])
  })

  it('does not duplicate a juror who is both assigned and has scored', () => {
    const data = buildExportData({
      eventName: 'Astra Hack',
      themes: [],
      results: baseResults({
        jurors: [profile('j1', 'Ana Pop')],
        scores: [{ teamId: 't1', criterionId: 'c1', jurorId: 'j1', value: 4 }],
      }),
      allProfiles: [profile('j1', 'Ana Pop')],
      formerJurorLabel: 'Former juror',
    })

    expect(data.jurors).toHaveLength(1)
  })
})
