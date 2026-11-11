/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExcelJS from 'exceljs'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useImportEvent } from './api'
import { ImportPage } from './ImportPage'
import { parseWorkbook } from './parseWorkbook'

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api')>()
  return { ...actual, useImportEvent: vi.fn() }
})

const FIXTURE = path.resolve(import.meta.dirname, '../../../fixtures/astra-hack.xlsx')
const FIXTURE_EXISTS = existsSync(FIXTURE)

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** A minimal, valid single-team, single-criterion, single-juror workbook, shaped like
 * Astra Hack's own sheets (criteria rows from row 2, juror columns from column D, a
 * "Scor" header once the juror columns end). Used by the synthetic tests so they never
 * depend on the private real-data fixture. */
async function buildMinimalWorkbook(weight = 50, includeExpectedFinal = true): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('E1')
  sheet.getCell(1, 1).value = 'Nr.'
  sheet.getCell(1, 2).value = 'Criteriu Jurizare'
  sheet.getCell(1, 3).value = 'Pondere'
  sheet.getCell(1, 4).value = 'Ana Pop'
  sheet.getCell(1, 5).value = 'Scor'
  sheet.getCell(2, 1).value = 1
  sheet.getCell(2, 2).value = 'Impact'
  sheet.getCell(2, 3).value = weight
  sheet.getCell(2, 4).value = 4.5
  if (includeExpectedFinal) sheet.getCell(3, 5).value = 4.5 // cached final: single criterion/juror -> final = score
  sheet.getCell(12, 2).value = 'Echipa:'
  sheet.getCell(13, 2).value = 'Team Rocket'
  const buffer = await workbook.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}

function renderPage() {
  const router = createMemoryRouter(
    [
      { path: '/admin/import', element: <ImportPage /> },
      { path: '/admin/events/:eventId/settings', element: <div>Event settings</div> },
    ],
    { initialEntries: ['/admin/import'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

afterEach(() => {
  vi.clearAllMocks()
})

describe.skipIf(!FIXTURE_EXISTS)('ImportPage (astra-hack.xlsx fixture)', () => {
  it('shows 20 teams and all parity checks green', async () => {
    const user = userEvent.setup()
    vi.mocked(useImportEvent).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    renderPage()

    const file = new File([toArrayBuffer(readFileSync(FIXTURE))], 'astra-hack.xlsx', { type: XLSX_TYPE })
    await user.upload(screen.getByLabelText('Spreadsheet file'), file)

    expect(await screen.findByRole('group', { name: '20 Teams' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '3 Themes' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '9 Criteria' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '7 Jurors' })).toBeInTheDocument()

    // E10 is the one no-show; every other scored team's computed final matches the
    // sheet's own cached result (see parseWorkbook.test.ts's PARITY tests).
    expect(screen.getAllByText('Matches sheet')).toHaveLength(19)
    expect(screen.getByText('No-show')).toBeInTheDocument()
    expect(screen.queryByText("Doesn't match")).not.toBeInTheDocument()
  })
})

describe('ImportPage', () => {
  it('shows the not_xlsx message for a file that is not a valid workbook', async () => {
    const user = userEvent.setup()
    vi.mocked(useImportEvent).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    renderPage()

    // Named .xlsx (so the drop zone's accept filter lets it through, as a real browser
    // picker would for a corrupted or misexported file) but its content isn't a zip at all.
    const file = new File(['this is definitely not an xlsx workbook'], 'notes.xlsx', { type: XLSX_TYPE })
    await user.upload(screen.getByLabelText('Spreadsheet file'), file)

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid \.xlsx workbook/)
  })

  it('import calls import-event with eventName and parsed payload', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue('new-event-id')
    vi.mocked(useImportEvent).mockReturnValue({ mutateAsync, isPending: false } as never)
    renderPage()

    const buffer = await buildMinimalWorkbook()
    const file = new File([buffer], 'mini.xlsx', { type: XLSX_TYPE })
    await user.upload(screen.getByLabelText('Spreadsheet file'), file)

    const expectedParsed = await parseWorkbook(await buildMinimalWorkbook())
    await screen.findByRole('group', { name: '1 Teams' })

    await user.click(screen.getByRole('button', { name: 'Import event' }))

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({ eventName: 'Astra Hack', parsed: expectedParsed }),
    )
  })

  it('navigates to the imported event after a successful import', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue('new-event-id')
    vi.mocked(useImportEvent).mockReturnValue({ mutateAsync, isPending: false } as never)
    const router = renderPage()

    const file = new File([await buildMinimalWorkbook()], 'mini.xlsx', { type: XLSX_TYPE })
    await user.upload(screen.getByLabelText('Spreadsheet file'), file)
    await screen.findByRole('group', { name: '1 Teams' })

    await user.click(screen.getByRole('button', { name: 'Import event' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/events/new-event-id/settings'))
  })

  it('rejects a file larger than 10 MB without parsing it', async () => {
    const user = userEvent.setup()
    vi.mocked(useImportEvent).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    renderPage()

    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'huge.xlsx', { type: XLSX_TYPE })
    await user.upload(screen.getByLabelText('Spreadsheet file'), big)

    expect(await screen.findByRole('alert')).toHaveTextContent(/larger than 10 MB/)
  })

  it('blocks import and explains why when a criterion has an invalid weight', async () => {
    const user = userEvent.setup()
    vi.mocked(useImportEvent).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    renderPage()

    const file = new File([await buildMinimalWorkbook(0)], 'mini.xlsx', { type: XLSX_TYPE })
    await user.upload(screen.getByLabelText('Spreadsheet file'), file)

    const warning = await screen.findByText('Fix the workbook before importing')
    expect(within(warning.closest('div')!).getByText(/invalid weight/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import event' })).toBeDisabled()
  })

  it('shows a distinct badge for a scored team with no cached final in the sheet', async () => {
    const user = userEvent.setup()
    vi.mocked(useImportEvent).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as never)
    renderPage()

    const file = new File([await buildMinimalWorkbook(50, false)], 'mini.xlsx', { type: XLSX_TYPE })
    await user.upload(screen.getByLabelText('Spreadsheet file'), file)

    expect(await screen.findByText('No sheet value')).toBeInTheDocument()
    expect(screen.queryByText('No-show')).not.toBeInTheDocument()
    expect(screen.queryByText('Matches sheet')).not.toBeInTheDocument()
    expect(screen.queryByText("Doesn't match")).not.toBeInTheDocument()
  })

  it('disables the drop zone while the import mutation is pending', () => {
    vi.mocked(useImportEvent).mockReturnValue({
      mutateAsync: vi.fn().mockReturnValue(new Promise(() => {})),
      isPending: true,
    } as never)
    renderPage()

    expect(screen.getByLabelText('Spreadsheet file')).toBeDisabled()
    expect(screen.getByText('Drop the .xlsx file here').closest('button')).toBeDisabled()
  })
})
