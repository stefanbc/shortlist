import { FunctionsHttpError } from '@supabase/supabase-js'

/**
 * Reads the machine-readable `{error: code}` body a Supabase edge function returns on a
 * non-2xx response. Returns `'unknown'` for anything else -- a different error shape
 * (e.g. a network failure), a body that isn't JSON, or a code outside `validCodes` --
 * so callers never trust the server for more than the specific codes they expect.
 */
export async function readFunctionsErrorCode<Code extends string>(
  error: unknown,
  validCodes: readonly Code[],
): Promise<Code | 'unknown'> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string }
      if (body.error && (validCodes as readonly string[]).includes(body.error)) {
        return body.error as Code
      }
    } catch {
      // Body wasn't JSON -- fall through to the generic reason.
    }
  }
  return 'unknown'
}
