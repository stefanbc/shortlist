import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeleteTheme, useReorderThemes, useSaveTheme, useThemes, type Theme } from './api'
import { ThemesPanel } from './ThemesPanel'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return {
    ...actual,
    useThemes: vi.fn(),
    useSaveTheme: vi.fn(),
    useDeleteTheme: vi.fn(),
    useReorderThemes: vi.fn(),
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ThemesPanel', () => {
  it('adds a new theme at a unique, last position after a middle one was deleted', async () => {
    const user = userEvent.setup()
    // Simulates the list after its middle item (originally position 2) was deleted:
    // positions 1 and 3 remain, with a gap at 2.
    const themesAfterDelete: Theme[] = [
      { id: 't1', name: 'Artificial Intelligence', position: 1 },
      { id: 't3', name: 'Sustainability', position: 3 },
    ]
    vi.mocked(useThemes).mockReturnValue({ data: themesAfterDelete, isLoading: false } as never)
    const saveTheme = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useSaveTheme).mockReturnValue({ mutateAsync: saveTheme, isPending: false } as never)
    vi.mocked(useDeleteTheme).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    vi.mocked(useReorderThemes).mockReturnValue({ mutate: vi.fn() } as never)

    render(<ThemesPanel eventId="ev-1" />)

    const nameInputs = screen.getAllByLabelText('Theme name')
    await user.type(nameInputs[nameInputs.length - 1], 'Robotics')
    await user.click(screen.getByRole('button', { name: 'Add theme' }))

    expect(saveTheme).toHaveBeenCalledWith({ eventId: 'ev-1', name: 'Robotics', position: 4 })
  })
})
