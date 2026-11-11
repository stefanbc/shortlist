import { describe, expect, it } from 'vitest'
import en from './en.json'
import ro from './ro.json'

function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  )
}

describe('locales', () => {
  it('en.json and ro.json have identical key sets', () => {
    expect(keyPaths(ro).sort()).toEqual(keyPaths(en).sort())
  })

  it('has no empty translations', () => {
    const values = (obj: unknown): unknown[] =>
      obj !== null && typeof obj === 'object' ? Object.values(obj).flatMap(values) : [obj]
    for (const value of [...values(en), ...values(ro)]) {
      expect(typeof value === 'string' && value.trim().length > 0).toBe(true)
    }
  })
})
