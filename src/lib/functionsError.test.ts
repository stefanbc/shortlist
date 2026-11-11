import { FunctionsHttpError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { readFunctionsErrorCode } from './functionsError'

/** A FunctionsHttpError whose context exposes `.json()`, matching the shape
 * supabase-js gives a non-2xx edge function response. */
function httpError(body: unknown) {
  return new FunctionsHttpError({ json: () => Promise.resolve(body) })
}

describe('readFunctionsErrorCode', () => {
  it('reads a code that is in the valid list', async () => {
    const code = await readFunctionsErrorCode(httpError({ error: 'invalid_token' }), [
      'invalid_token',
      'inactive',
    ])
    expect(code).toBe('invalid_token')
  })

  it('falls back to unknown for a code outside the valid list', async () => {
    const code = await readFunctionsErrorCode(httpError({ error: 'teapot' }), [
      'invalid_token',
      'inactive',
    ])
    expect(code).toBe('unknown')
  })

  it('falls back to unknown when the body is not JSON', async () => {
    const error = new FunctionsHttpError({ json: () => Promise.reject(new Error('not json')) })
    expect(await readFunctionsErrorCode(error, ['invalid_token'])).toBe('unknown')
  })

  it('falls back to unknown for an error that is not a FunctionsHttpError', async () => {
    expect(await readFunctionsErrorCode(new Error('network down'), ['invalid_token'])).toBe('unknown')
  })
})
