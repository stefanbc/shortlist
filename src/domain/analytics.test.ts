import { describe, expect, it } from 'vitest'
import { criterionStats, jurorStats, OUTLIER_DELTA, TENDENCY_DELTA } from './analytics'
import type { Criterion, Score } from './types'

function criterion(id: string, weight: number, position: number): Criterion {
  return { id, name: id, weight, position }
}

describe('jurorStats', () => {
  it('flags a 5 among 2s as outlier', () => {
    const scores: Score[] = [
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J1', value: 5 },
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J2', value: 2 },
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J3', value: 2 },
    ]

    const stats = jurorStats(scores)
    const j1 = stats.find((s) => s.jurorId === 'J1')

    expect(j1).toBeDefined()
    expect(j1?.outliers).toEqual([{ teamId: 'T1', criterionId: 'C1', value: 5, othersMean: 2 }])
  })

  it('lenient juror bias >= 0.5', () => {
    const scores: Score[] = [
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J1', value: 4 },
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J2', value: 3 },
      { teamId: 'T2', criterionId: 'C1', jurorId: 'J1', value: 4 },
      { teamId: 'T2', criterionId: 'C1', jurorId: 'J2', value: 3 },
    ]

    const stats = jurorStats(scores)
    const j1 = stats.find((s) => s.jurorId === 'J1')

    expect(j1?.bias).toBeCloseTo(1, 9)
    expect(j1?.bias).toBeGreaterThanOrEqual(TENDENCY_DELTA)
    expect(j1?.tendency).toBe('lenient')
  })

  it('harsh juror bias <= -0.5', () => {
    const scores: Score[] = [
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J1', value: 2 },
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J2', value: 3 },
      { teamId: 'T2', criterionId: 'C1', jurorId: 'J1', value: 2 },
      { teamId: 'T2', criterionId: 'C1', jurorId: 'J2', value: 3 },
    ]

    const stats = jurorStats(scores)
    const j1 = stats.find((s) => s.jurorId === 'J1')

    expect(j1?.bias).toBeCloseTo(-1, 9)
    expect(j1?.tendency).toBe('harsh')
  })

  it('single juror cell is not an outlier and does not affect bias', () => {
    const scores: Score[] = [{ teamId: 'T1', criterionId: 'C1', jurorId: 'J1', value: 5 }]

    const stats = jurorStats(scores)
    const j1 = stats.find((s) => s.jurorId === 'J1')

    expect(j1?.outliers).toEqual([])
    expect(j1?.bias).toBe(0)
    expect(j1?.tendency).toBe('neutral')
    expect(j1?.count).toBe(1)
    expect(j1?.mean).toBe(5)
  })

  it('OUTLIER_DELTA is 1.5', () => {
    expect(OUTLIER_DELTA).toBe(1.5)
  })

  it('TENDENCY_DELTA is 0.5', () => {
    expect(TENDENCY_DELTA).toBe(0.5)
  })
})

describe('criterionStats', () => {
  it('ranks a discriminating criterion first (sorted by spread desc, nulls last)', () => {
    const criteria = [criterion('C1', 20, 1), criterion('C2', 20, 2), criterion('C3', 20, 3)]
    const scores: Score[] = [
      // C1: discriminating -- team averages vary a lot (5 vs 1)
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J1', value: 5 },
      { teamId: 'T2', criterionId: 'C1', jurorId: 'J1', value: 1 },
      // C2: uniform -- team averages are the same
      { teamId: 'T1', criterionId: 'C2', jurorId: 'J1', value: 3 },
      { teamId: 'T2', criterionId: 'C2', jurorId: 'J1', value: 3 },
      // C3: no scores at all -> null spread, sorts last
    ]

    const stats = criterionStats(criteria, scores)

    expect(stats.map((s) => s.criterionId)).toEqual(['C1', 'C2', 'C3'])
    expect(stats[2].spread).toBeNull()
    expect(stats[2].mean).toBeNull()
  })

  it('computes mean as the mean of all raw scores on the criterion', () => {
    const criteria = [criterion('C1', 20, 1)]
    const scores: Score[] = [
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J1', value: 2 },
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J2', value: 4 },
    ]

    const stats = criterionStats(criteria, scores)
    expect(stats[0].mean).toBeCloseTo(3, 9)
  })

  it('computes spread as population stdev of per-team averages', () => {
    const criteria = [criterion('C1', 20, 1)]
    const scores: Score[] = [
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J1', value: 1 },
      { teamId: 'T1', criterionId: 'C1', jurorId: 'J2', value: 1 },
      { teamId: 'T2', criterionId: 'C1', jurorId: 'J1', value: 5 },
      { teamId: 'T2', criterionId: 'C1', jurorId: 'J2', value: 5 },
    ]

    // team averages: T1=1, T2=5 -> population stdev = 2
    const stats = criterionStats(criteria, scores)
    expect(stats[0].spread).toBeCloseTo(2, 9)
  })
})
