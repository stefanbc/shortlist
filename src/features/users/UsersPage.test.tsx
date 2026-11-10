import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/stores/session'
import { useSession } from '@/stores/session'
import {
  useCreateUser,
  useJurorEventNames,
  useProfiles,
  useSetUserActive,
  useSetUserRole,
} from './api'
import { UsersPage } from './UsersPage'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useProfiles: vi.fn(),
    useJurorEventNames: vi.fn(),
    useCreateUser: vi.fn(),
    useSetUserRole: vi.fn(),
    useSetUserActive: vi.fn(),
    useSetUserEmail: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useIssueJurorLink: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      reset: vi.fn(),
      data: undefined,
      isPending: false,
      isError: false,
    })),
    useRevokeJurorLink: vi.fn(() => ({ mutateAsync: vi.fn() })),
  }
})

const ME: Profile = { id: 'admin-1', displayName: 'You', email: 'me@example.com', role: 'admin', active: true }

const USERS: Profile[] = [
  ME,
  { id: 'j-1', displayName: 'Mirela Pop', email: 'mirela@example.com', role: 'juror', active: true },
  {
    id: 'j-2',
    displayName: 'Ovidia Ionescu',
    email: 'juror-abc@jurors.shortlist.invalid',
    role: 'juror',
    active: false,
  },
]

function renderPage(users: Profile[] = USERS) {
  useSession.setState({ status: 'signedIn', profile: ME })
  vi.mocked(useProfiles).mockReturnValue({ data: users, isLoading: false } as never)
  vi.mocked(useJurorEventNames).mockReturnValue({
    data: { 'j-1': ['Astra Hack'] },
    isLoading: false,
  } as never)

  const router = createMemoryRouter([{ path: '/admin/users', element: <UsersPage /> }], {
    initialEntries: ['/admin/users'],
  })
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('UsersPage', () => {
  it('shows each user with role, status and events judged', async () => {
    vi.mocked(useCreateUser).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetUserRole).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(useSetUserActive).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    renderPage()

    expect(screen.getByText('Mirela Pop')).toBeInTheDocument()
    expect(screen.getByText(/Astra Hack/)).toBeInTheDocument()
    expect(screen.getByText('Ovidia Ionescu')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('No email')).toBeInTheDocument()
  })

  it('deactivating a user requires confirmation', async () => {
    const user = userEvent.setup()
    vi.mocked(useCreateUser).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetUserRole).mockReturnValue({ mutate: vi.fn() } as never)
    const setActive = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSetUserActive).mockReturnValue({ mutateAsync: setActive, isPending: false } as never)

    renderPage()

    await user.click(screen.getByRole('button', { name: 'Deactivate: Mirela Pop' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(setActive).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(setActive).toHaveBeenCalledWith({ userId: 'j-1', active: false }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cancelling the deactivate confirmation does not change the account', async () => {
    const user = userEvent.setup()
    vi.mocked(useCreateUser).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetUserRole).mockReturnValue({ mutate: vi.fn() } as never)
    const setActive = vi.fn()
    vi.mocked(useSetUserActive).mockReturnValue({ mutateAsync: setActive, isPending: false } as never)

    renderPage()

    await user.click(screen.getByRole('button', { name: 'Deactivate: Mirela Pop' }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(setActive).not.toHaveBeenCalled()
  })

  it("disables changing or deactivating the signed-in admin's own row", async () => {
    vi.mocked(useCreateUser).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useSetUserRole).mockReturnValue({ mutate: vi.fn() } as never)
    vi.mocked(useSetUserActive).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    renderPage()

    expect(screen.getByRole('button', { name: 'Deactivate: You' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Role: You' })).toBeDisabled()
  })

  it('changing a role calls useSetUserRole directly, without a confirmation dialog', async () => {
    const user = userEvent.setup()
    vi.mocked(useCreateUser).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    const mutate = vi.fn()
    vi.mocked(useSetUserRole).mockReturnValue({ mutate } as never)
    vi.mocked(useSetUserActive).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)

    renderPage()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Role: Mirela Pop' }), 'admin')

    expect(mutate).toHaveBeenCalledWith(
      { userId: 'j-1', role: 'admin' },
      expect.objectContaining({ onError: expect.any(Function) }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
