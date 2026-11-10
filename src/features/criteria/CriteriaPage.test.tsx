import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventRow } from '@/features/events/api'
import { useEvent } from '@/features/events/api'
import type { Criterion } from '@/domain/types'
import {
  useCriteria,
  useDeleteCriterion,
  useDeleteTheme,
  useReorderCriteria,
  useReorderThemes,
  useSaveCriterion,
  useSaveTheme,
  useThemes,
} from './api'
import { CriteriaPage } from './CriteriaPage'

vi.mock('@/features/events/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/events/api')>()
  return { ...actual, useEvent: vi.fn() }
})

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useCriteria: vi.fn(),
    useSaveCriterion: vi.fn(),
    useDeleteCriterion: vi.fn(),
    useReorderCriteria: vi.fn(),
    useThemes: vi.fn(),
    useSaveTheme: vi.fn(),
    useDeleteTheme: vi.fn(),
    useReorderThemes: vi.fn(),
  }
})

// Astra Hack's own two biggest criteria, weights summing to 530 so the share-of-total
// math matches the spec exactly: 90 / 530 ≈ 17%.
const CRITERIA: Criterion[] = [
  { id: 'c1', name: 'Originalitate și Utilitate', weight: 90, position: 1 },
  { id: 'c2', name: 'Procent implementare', weight: 440, position: 2 },
]

const SETUP_EVENT: EventRow = {
  id: 'ev-1',
  name: 'Astra Hack',
  startsAt: '2099-01-01T09:00:00.000Z',
  endsAt: '2099-01-01T18:00:00.000Z',
  statusOverride: 'auto',
  lockedAt: null,
  pitchMinutes: 7,
  nowPitchingTeamId: null,
  nowPitchingSince: null,
}

const OPEN_EVENT: EventRow = { ...SETUP_EVENT, statusOverride: 'open' }

function renderPage(event: EventRow, criteria: Criterion[] = CRITERIA) {
  vi.mocked(useEvent).mockReturnValue({ data: event, isLoading: false } as never)
  vi.mocked(useCriteria).mockReturnValue({ data: criteria, isLoading: false } as never)
  vi.mocked(useThemes).mockReturnValue({ data: [], isLoading: false } as never)
  vi.mocked(useSaveTheme).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  vi.mocked(useDeleteTheme).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
  vi.mocked(useReorderThemes).mockReturnValue({ mutate: vi.fn() } as never)
  vi.mocked(useReorderCriteria).mockReturnValue({ mutate: vi.fn() } as never)

  const router = createMemoryRouter(
    [{ path: '/admin/events/:eventId/criteria', element: <CriteriaPage /> }],
    { initialEntries: [`/admin/events/${event.id}/criteria`] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('CriteriaPage', () => {
  it('weight edit in setup saves without confirm', async () => {
    const saveCriterion = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSaveCriterion).mockReturnValue({
      mutateAsync: saveCriterion,
      isPending: false,
    } as never)
    vi.mocked(useDeleteCriterion).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderPage(SETUP_EVENT)

    const weightInput = await screen.findByLabelText('Weight: Originalitate și Utilitate')
    fireEvent.change(weightInput, { target: { value: '95' } })
    fireEvent.blur(weightInput)

    expect(saveCriterion).toHaveBeenCalledWith({
      id: 'c1',
      eventId: 'ev-1',
      name: 'Originalitate și Utilitate',
      weight: 95,
      position: 1,
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('weight edit when open requires confirm and cancel reverts the field', async () => {
    const user = userEvent.setup()
    const saveCriterion = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSaveCriterion).mockReturnValue({
      mutateAsync: saveCriterion,
      isPending: false,
    } as never)
    vi.mocked(useDeleteCriterion).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderPage(OPEN_EVENT)

    const weightInput = await screen.findByLabelText<HTMLInputElement>(
      'Weight: Originalitate și Utilitate',
    )
    fireEvent.change(weightInput, { target: { value: '95' } })
    fireEvent.blur(weightInput)

    const dialog = await screen.findByRole('alertdialog')
    expect(saveCriterion).not.toHaveBeenCalled()
    expect(dialog).toHaveTextContent('Scores will be recalculated.')

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(saveCriterion).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(weightInput.value).toBe('90')
  })

  it('weight 0 shows an error and does not save', async () => {
    const saveCriterion = vi.fn()
    vi.mocked(useSaveCriterion).mockReturnValue({
      mutateAsync: saveCriterion,
      isPending: false,
    } as never)
    vi.mocked(useDeleteCriterion).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderPage(SETUP_EVENT)

    const weightInput = await screen.findByLabelText('Weight: Originalitate și Utilitate')
    fireEvent.change(weightInput, { target: { value: '0' } })
    fireEvent.blur(weightInput)

    expect(await screen.findByText('Weight must be greater than 0.')).toBeInTheDocument()
    expect(saveCriterion).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('share bar shows 90/530 ≈ 17%', async () => {
    vi.mocked(useSaveCriterion).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteCriterion).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderPage(SETUP_EVENT)

    expect(await screen.findByText('17%')).toBeInTheDocument()
  })
})
