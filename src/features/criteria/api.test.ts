import { describe, expect, it } from 'vitest'
import { nextPosition, toCriterion, toTheme } from './api'

describe('toCriterion', () => {
  it('maps the snake_case DB row to a camelCase Criterion', () => {
    expect(
      toCriterion({ id: 'c1', name: 'Originalitate și Utilitate', weight: 90, position: 2 }),
    ).toEqual({
      id: 'c1',
      name: 'Originalitate și Utilitate',
      weight: 90,
      position: 2,
    })
  })
})

describe('toTheme', () => {
  it('maps the snake_case DB row to a camelCase Theme', () => {
    expect(toTheme({ id: 't1', name: 'Theme Gamma', position: 3 })).toEqual({
      id: 't1',
      name: 'Theme Gamma',
      position: 3,
    })
  })
})

describe('nextPosition', () => {
  it('returns 1 for an empty list', () => {
    expect(nextPosition([])).toBe(1)
  })

  it('returns one past the highest existing position, not the count', () => {
    // A middle item (position 2) has already been deleted -- using the count (2 items
    // -> 3) would collide with the still-existing position-3 item.
    expect(nextPosition([{ position: 1 }, { position: 3 }])).toBe(4)
  })
})
