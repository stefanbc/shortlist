import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog } from './ConfirmDialog'

function Harness({ onConfirm }: { onConfirm: () => void | Promise<void> }) {
  const [open, setOpen] = useState(true)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Change weights?"
      description="Rankings will be recalculated."
      confirmLabel="Change weights"
      tone="danger"
      onConfirm={onConfirm}
    />
  )
}

describe('ConfirmDialog', () => {
  it('calls onConfirm only on confirm click', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const { unmount } = render(<Harness onConfirm={onConfirm} />)

    expect(
      screen.getByRole('alertdialog', { name: 'Change weights?' }),
    ).toHaveAccessibleDescription('Rankings will be recalculated.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    unmount()

    render(<Harness onConfirm={onConfirm} />)
    await user.keyboard('{Escape}')
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('confirms once and closes after onConfirm settles', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    render(<Harness onConfirm={onConfirm} />)

    const confirm = screen.getByRole('button', { name: 'Change weights' })
    await user.click(confirm)
    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await act(async () => resolve())
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })
})
