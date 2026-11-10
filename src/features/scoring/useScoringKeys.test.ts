import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScoringKeys } from './useScoringKeys'

function setup(enabled = true) {
  const handlers = {
    onSet: vi.fn(),
    onHalf: vi.fn(),
    onClear: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
  }
  renderHook(() => useScoringKeys({ ...handlers, enabled }))
  return handlers
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useScoringKeys', () => {
  it('maps 1–5 to onSet with the number', async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.keyboard('15')
    expect(h.onSet.mock.calls).toEqual([[1], [5]])
  })

  it('ignores digits outside 1–5', async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.keyboard('069')
    expect(h.onSet).not.toHaveBeenCalled()
  })

  it('maps . and , to onHalf, Backspace to onClear, arrows and Enter to moves', async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.keyboard('.,{Backspace}{ArrowUp}{ArrowDown}{Enter}')
    expect(h.onHalf).toHaveBeenCalledTimes(2)
    expect(h.onClear).toHaveBeenCalledTimes(1)
    expect(h.onPrev).toHaveBeenCalledTimes(1)
    expect(h.onNext).toHaveBeenCalledTimes(2)
  })

  it('leaves typing in a text field alone', async () => {
    const user = userEvent.setup()
    const h = setup()
    const textarea = document.createElement('textarea')
    document.body.append(textarea)
    textarea.focus()
    await user.keyboard('3.{Backspace}{Enter}')
    expect(h.onSet).not.toHaveBeenCalled()
    expect(h.onHalf).not.toHaveBeenCalled()
    expect(h.onClear).not.toHaveBeenCalled()
    expect(h.onNext).not.toHaveBeenCalled()
  })

  it('leaves Enter on a focused button to the button', async () => {
    const user = userEvent.setup()
    const h = setup()
    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    await user.keyboard('{Enter}')
    expect(h.onNext).not.toHaveBeenCalled()
  })

  it('leaves keys alone while a dialog has focus', async () => {
    const user = userEvent.setup()
    const h = setup()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'alertdialog')
    const inside = document.createElement('div')
    inside.tabIndex = -1
    dialog.append(inside)
    document.body.append(dialog)
    inside.focus()
    await user.keyboard('3{ArrowDown}')
    expect(h.onSet).not.toHaveBeenCalled()
    expect(h.onNext).not.toHaveBeenCalled()
  })

  it('ignores shortcuts with modifier keys', async () => {
    const user = userEvent.setup()
    const h = setup()
    await user.keyboard('{Meta>}3{/Meta}{Control>}{Backspace}{/Control}')
    expect(h.onSet).not.toHaveBeenCalled()
    expect(h.onClear).not.toHaveBeenCalled()
  })

  it('does nothing while disabled', async () => {
    const user = userEvent.setup()
    const h = setup(false)
    await user.keyboard('3{ArrowDown}')
    expect(h.onSet).not.toHaveBeenCalled()
    expect(h.onNext).not.toHaveBeenCalled()
  })
})
