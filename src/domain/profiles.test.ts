import { describe, expect, it } from 'vitest'
import { toProfile } from './profiles'

describe('toProfile', () => {
  it('maps the snake_case DB row to a camelCase Profile', () => {
    expect(
      toProfile({
        id: 'u1',
        display_name: 'Mirela Pop',
        email: 'mirela@example.com',
        role: 'juror',
        active: true,
      }),
    ).toEqual({
      id: 'u1',
      displayName: 'Mirela Pop',
      email: 'mirela@example.com',
      role: 'juror',
      active: true,
    })
  })

  it('drops a row with an unrecognized role', () => {
    expect(
      toProfile({ id: 'u2', display_name: 'Ghost', email: null, role: 'superadmin', active: true }),
    ).toBeNull()
  })
})
