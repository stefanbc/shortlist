import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSetEventStatus } from '@/features/events/api'
import { useLateAttempts, type LateAttemptGroup } from '@/features/reports/useEventResults'
import type { TeamWithProject } from '@/features/teams/api'
import type { Profile } from '@/stores/session'
import { LateScoresNotice } from './LateScoresNotice'

vi.mock('@/features/events/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/events/api')>()
  return { ...actual, useSetEventStatus: vi.fn() }
})

vi.mock('@/features/reports/useEventResults', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/reports/useEventResults')>()
  return { ...actual, useLateAttempts: vi.fn() }
})

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const TEAM: TeamWithProject = {
  id: 't1',
  name: 'Team One',
  members: [],
  pitchOrder: 1,
  noShow: false,
  manualTiebreak: null,
  project: { name: null, description: null, themeId: null, repoUrl: null },
}

const JUROR: Profile = { id: 'j1', displayName: 'Ana', email: null, role: 'juror', active: true }

const ATTEMPTS: LateAttemptGroup[] = [{ jurorId: 'j1', teamId: 't1', count: 2 }]

function renderNotice(mutateAsync: ReturnType<typeof vi.fn>) {
  vi.mocked(useLateAttempts).mockReturnValue({ data: ATTEMPTS } as never)
  vi.mocked(useSetEventStatus).mockReturnValue({ mutateAsync } as never)
  return render(<LateScoresNotice eventId="ev-1" teams={[TEAM]} jurors={[JUROR]} />)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('LateScoresNotice', () => {
  it('unlock opens the confirm dialog', async () => {
    const user = userEvent.setup()
    renderNotice(vi.fn().mockResolvedValue(undefined))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Unlock scoring' }))

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })

  it("confirm calls setEventStatus with 'open'", async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    renderNotice(mutateAsync)

    await user.click(screen.getByRole('button', { name: 'Unlock scoring' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Unlock scoring' }))

    expect(mutateAsync).toHaveBeenCalledWith({ eventId: 'ev-1', override: 'open' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('cancel does nothing', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue(undefined)
    renderNotice(mutateAsync)

    await user.click(screen.getByRole('button', { name: 'Unlock scoring' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(mutateAsync).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('a failure shows a toast and keeps the dialog open', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockRejectedValue(new Error('nope'))
    renderNotice(mutateAsync)

    await user.click(screen.getByRole('button', { name: 'Unlock scoring' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Unlock scoring' }))

    expect(mutateAsync).toHaveBeenCalledWith({ eventId: 'ev-1', override: 'open' })
    expect(toast.error).toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })
})
