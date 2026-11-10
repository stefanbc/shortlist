import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SortableList } from './SortableList'

describe('SortableList', () => {
  it('gives the drag handle a touch target of at least 44x44px', () => {
    render(
      <SortableList
        items={[{ id: 'a' }, { id: 'b' }]}
        renderItem={(item) => <span>{item.id}</span>}
        onReorder={() => {}}
      />,
    )

    const handles = screen.getAllByRole('button', { name: 'Drag to reorder' })
    expect(handles).toHaveLength(2)
    for (const handle of handles) {
      expect(handle.className).toMatch(/\bh-11\b/)
      expect(handle.className).toMatch(/\bw-11\b/)
    }
  })
})
