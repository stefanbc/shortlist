import { FunctionsHttpError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { importErrorCode } from './api'

describe('importErrorCode', () => {
  it('reads a known code from a FunctionsHttpError body', async () => {
    const error = new FunctionsHttpError({ json: () => Promise.resolve({ error: 'invalid_import' }) })
    expect(await importErrorCode(error)).toBe('invalid_import')
  })

  it('falls back to unknown for an unrecognized code', async () => {
    const error = new FunctionsHttpError({ json: () => Promise.resolve({ error: 'teapot' }) })
    expect(await importErrorCode(error)).toBe('unknown')
  })

  it('falls back to unknown for a non-FunctionsHttpError', async () => {
    expect(await importErrorCode(new Error('network down'))).toBe('unknown')
  })
})
