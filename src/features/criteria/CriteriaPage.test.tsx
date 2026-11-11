import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  const { rerender } = render(<RouterProvider router={router} />)
  // Re-renders the same tree so a test can simulate a query refetch (new mocked hook
  // data) landing on an already-mounted page, without remounting it.
  return { rerender: () => rerender(<RouterProvider router={router} />) }
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

  it('confirming a weight edit when open saves the new value, keeps it displayed, and stays correct after a refetch', async () => {
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

    const { rerender: rerenderPage } = renderPage(OPEN_EVENT)

    const weightInput = await screen.findByLabelText<HTMLInputElement>(
      'Weight: Originalitate și Utilitate',
    )
    fireEvent.change(weightInput, { target: { value: '95' } })
    fireEvent.blur(weightInput)

    await screen.findByRole('alertdialog')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() =>
      expect(saveCriterion).toHaveBeenCalledWith({
        id: 'c1',
        eventId: 'ev-1',
        name: 'Originalitate și Utilitate',
        weight: 95,
        position: 1,
      }),
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    // The field must show the confirmed value, not snap back to the pre-edit one.
    expect(weightInput.value).toBe('95')

    // Simulate the refetch that follows the mutation's query invalidation: the server
    // now reports weight 95 too. The field must stay correct, not just "not reverted".
    vi.mocked(useCriteria).mockReturnValue({
      data: [{ ...CRITERIA[0], weight: 95 }, CRITERIA[1]],
      isLoading: false,
    } as never)
    rerenderPage()

    expect(weightInput.value).toBe('95')
  })

  it('adds a new criterion at a unique, last position after a middle one was deleted', async () => {
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

    // Simulates the list after its middle item (originally position 2) was deleted:
    // positions 1 and 3 remain, with a gap at 2.
    const criteriaAfterDelete: Criterion[] = [
      { id: 'c1', name: 'Originalitate și Utilitate', weight: 90, position: 1 },
      { id: 'c3', name: 'Calitatea soluției propuse', weight: 300, position: 3 },
    ]
    renderPage(SETUP_EVENT, criteriaAfterDelete)

    const nameInputs = await screen.findAllByLabelText('Name')
    await user.type(nameInputs[nameInputs.length - 1], 'New criterion')
    await user.type(screen.getByLabelText('Weight'), '50')
    await user.click(screen.getByRole('button', { name: 'Add criterion' }))

    expect(saveCriterion).toHaveBeenCalledWith({
      eventId: 'ev-1',
      name: 'New criterion',
      weight: 50,
      position: 4,
    })
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

  it('shows the share-of-total bar on phones, not only from a desktop breakpoint up', async () => {
    vi.mocked(useSaveCriterion).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useDeleteCriterion).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    } as never)

    renderPage(SETUP_EVENT)

    const percent = await screen.findByText('17%')
    const bar = percent.closest('div')
    expect(bar).not.toBeNull()
    // A bare `hidden` utility (without a responsive variant switching it back on)
    // hides the element on every breakpoint, phones included.
    expect(bar?.className ?? '').not.toMatch(/\bhidden\b/)
  })
})
