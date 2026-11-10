import { FunctionsHttpError } from '@supabase/supabase-js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import {
  isPlaceholderEmail,
  toProfile,
  useAssignJuror,
  useCreateUser,
  userActionErrorCode,
  validateEmailForm,
  validateUserForm,
} from './api'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() } },
}))

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

afterEach(() => {
  vi.clearAllMocks()
})

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

describe('isPlaceholderEmail', () => {
  it('recognizes the juror placeholder domain', () => {
    expect(isPlaceholderEmail('juror-abc123@jurors.shortlist.invalid')).toBe(true)
  })

  it('treats a real address as not a placeholder', () => {
    expect(isPlaceholderEmail('mirela@example.com')).toBe(false)
  })

  it('treats null as not a placeholder', () => {
    expect(isPlaceholderEmail(null)).toBe(false)
  })
})

describe('validateUserForm', () => {
  it('accepts a valid form with a blank (optional) email', () => {
    const result = validateUserForm({ displayName: 'Ovidia Ionescu', email: '', role: 'juror' })
    expect(result).toEqual({
      data: { displayName: 'Ovidia Ionescu', email: undefined, role: 'juror' },
    })
  })

  it('rejects a blank display name', () => {
    const result = validateUserForm({ displayName: '  ', email: '', role: 'juror' })
    expect(result).toEqual({ errors: { displayName: 'displayNameRequired' } })
  })

  it('rejects an invalid email', () => {
    const result = validateUserForm({ displayName: 'Ovidia', email: 'not-an-email', role: 'admin' })
    expect(result).toEqual({ errors: { email: 'emailInvalid' } })
  })
})

describe('validateEmailForm', () => {
  it('accepts a valid email', () => {
    expect(validateEmailForm(' mirela@example.com ')).toEqual({ data: 'mirela@example.com' })
  })

  it('rejects an invalid email', () => {
    expect(validateEmailForm('nope')).toEqual({ error: 'emailInvalid' })
  })
})

describe('userActionErrorCode', () => {
  it('reads a known code off the error', () => {
    expect(userActionErrorCode(Object.assign(new Error('email_exists'), { code: 'email_exists' }))).toBe(
      'email_exists',
    )
  })

  it('falls back to unknown for an unrecognized code', () => {
    expect(userActionErrorCode(Object.assign(new Error('x'), { code: 'something_else' }))).toBe('unknown')
  })

  it('falls back to unknown for a plain error with no code', () => {
    expect(userActionErrorCode(new Error('network down'))).toBe('unknown')
  })
})

describe('useAssignJuror', () => {
  it('inserts the (event_id, juror_id) row', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ insert } as never)

    const { result } = renderHook(() => useAssignJuror(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ eventId: 'ev-1', jurorId: 'j-1' })
    })

    expect(supabase.from).toHaveBeenCalledWith('event_jurors')
    expect(insert).toHaveBeenCalledWith({ event_id: 'ev-1', juror_id: 'j-1' })
  })
})

describe('useCreateUser', () => {
  it('calls admin-users with the create action and returns the new id', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { id: 'new-user-1' },
      error: null,
    } as never)

    const { result } = renderHook(() => useCreateUser(), { wrapper })

    let id: string | undefined
    await act(async () => {
      id = await result.current.mutateAsync({ displayName: 'Ovidia', email: undefined, role: 'juror' })
    })

    expect(id).toBe('new-user-1')
    expect(supabase.functions.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'create', displayName: 'Ovidia', email: undefined, role: 'juror' },
    })
  })

  it('surfaces the email_exists code from a non-2xx response', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({ json: () => Promise.resolve({ error: 'email_exists' }) }),
    } as never)

    const { result } = renderHook(() => useCreateUser(), { wrapper })

    await act(async () => {
      await result.current
        .mutateAsync({ displayName: 'Dup', email: 'dup@example.com', role: 'juror' })
        .catch(() => {})
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as { code?: string })?.code).toBe('email_exists')
  })
})
