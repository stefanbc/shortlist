import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/stores/session'
import { useIssueJurorLink, useRevokeJurorLink } from './api'
import { JurorLinkDialog } from './JurorLinkDialog'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return { ...actual, useIssueJurorLink: vi.fn(), useRevokeJurorLink: vi.fn() }
})

const JUROR: Profile = {
  id: 'j-1',
  displayName: 'Mirela Pop',
  email: null,
  role: 'juror',
  active: true,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('JurorLinkDialog', () => {
  it('issues a link on open, showing a URL with /j/ and a QR code', async () => {
    const mutate = vi.fn()
    vi.mocked(useIssueJurorLink).mockReturnValue({
      mutate,
      mutateAsync: vi.fn(),
      reset: vi.fn(),
      data: { url: 'https://shortlist.example/j/abc123tok' },
      isPending: false,
      isError: false,
    } as never)
    vi.mocked(useRevokeJurorLink).mockReturnValue({ mutateAsync: vi.fn() } as never)

    render(<JurorLinkDialog open juror={JUROR} onOpenChange={() => {}} />)

    // The dialog issues a fresh link as soon as it opens for a juror.
    expect(mutate).toHaveBeenCalled()

    expect(screen.getByText('https://shortlist.example/j/abc123tok')).toBeInTheDocument()
    const svg = document.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('regenerating asks for confirmation before issuing again', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn()
    const mutateAsync = vi.fn().mockResolvedValue({ url: 'https://shortlist.example/j/new-tok' })
    vi.mocked(useIssueJurorLink).mockReturnValue({
      mutate,
      mutateAsync,
      reset: vi.fn(),
      data: { url: 'https://shortlist.example/j/abc123tok' },
      isPending: false,
      isError: false,
    } as never)
    vi.mocked(useRevokeJurorLink).mockReturnValue({ mutateAsync: vi.fn() } as never)

    render(<JurorLinkDialog open juror={JUROR} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Generate a new link' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cancelling the regenerate confirmation does not issue a new link', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn()
    vi.mocked(useIssueJurorLink).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      reset: vi.fn(),
      data: { url: 'https://shortlist.example/j/abc123tok' },
      isPending: false,
      isError: false,
    } as never)
    vi.mocked(useRevokeJurorLink).mockReturnValue({ mutateAsync: vi.fn() } as never)

    render(<JurorLinkDialog open juror={JUROR} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Generate a new link' }))
    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})
