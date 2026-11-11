import * as Popover from '@radix-ui/react-popover'
import { Download, FileSpreadsheet, FileText, LoaderCircle, Table } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import type { Id } from '@/domain/types'
import { useThemes } from '@/features/criteria/api'
import { useEvent } from '@/features/events/api'
import { useEventResults } from '@/features/reports/useEventResults'
import { useProfiles } from '@/features/users/api'
import { cn } from '@/lib/cn'
import { resolveLang, usePreferences } from '@/stores/preferences'
import { buildScoresCsv } from './csv'
import { buildExportData } from './types'

type ExportFormat = 'csv' | 'xlsx' | 'pdf'

// Combining diacritical marks (U+0300-U+036F), stripped after NFKD-normalizing a name
// -- built from character codes rather than a literal regex so the source file itself
// has no raw combining characters in it.
const DIACRITIC_MARKS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
)

/** ASCII-only, hyphenated form of the event name for filenames -- diacritics are
 * stripped rather than kept, since filenames travel through email/Slack/zip tools that
 * don't always round-trip Unicode cleanly. */
function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(DIACRITIC_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'event'
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export interface ExportMenuProps {
  eventId: Id
  className?: string
}

/** Lets the organizer download the event's results as CSV, an Excel workbook (mirroring
 * the source sheet, with live formulas), or a PDF report. The Excel and PDF builders
 * (exceljs, @react-pdf/renderer) are dynamically imported on first use so they never
 * weigh down the app's main bundle -- most sessions never export anything. */
export function ExportMenu({ eventId, className }: ExportMenuProps) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const lang = resolveLang(usePreferences((s) => s.lang))

  const { data: event } = useEvent(eventId)
  const { data: themes } = useThemes(eventId)
  const { data: allProfiles } = useProfiles()
  const results = useEventResults(eventId)

  const ready = Boolean(event) && Boolean(themes) && Boolean(allProfiles) && !results.isLoading

  async function handleExport(format: ExportFormat) {
    if (!event || !themes || !allProfiles || busy) return
    setBusy(format)
    try {
      const data = buildExportData({
        eventName: event.name,
        themes,
        results,
        allProfiles,
        formerJurorLabel: t('reports.formerJuror'),
      })
      const slug = slugify(event.name)

      if (format === 'csv') {
        const csv = buildScoresCsv(data)
        downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `shortlist-${slug}-scores.csv`)
      } else if (format === 'xlsx') {
        const { buildWorkbook } = await import('./workbook')
        const blob = await buildWorkbook(data)
        downloadBlob(blob, `shortlist-${slug}-results.xlsx`)
      } else {
        const [{ pdf }, { ResultsPdf }] = await Promise.all([
          import('@react-pdf/renderer'),
          import('./ResultsPdf'),
        ])
        const blob = await pdf(<ResultsPdf data={data} lang={lang} />).toBlob()
        downloadBlob(blob, `shortlist-${slug}-results.pdf`)
      }
    } catch (error) {
      console.error(`Failed to build the ${format} export`, error)
      toast.error(t('export.error'))
    } finally {
      setBusy(null)
    }
  }

  const items: { format: ExportFormat; label: string; icon: typeof Table }[] = [
    { format: 'csv', label: t('export.csv'), icon: Table },
    { format: 'xlsx', label: t('export.excel'), icon: FileSpreadsheet },
    { format: 'pdf', label: t('export.pdf'), icon: FileText },
  ]

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="secondary" disabled={!ready} className={className}>
          <Download aria-hidden />
          {t('export.open')}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-50 flex w-64 flex-col gap-1 rounded-card bg-surface p-2 text-ink shadow-pop ring-1 ring-line outline-none',
            'data-[state=open]:animate-pop-in data-[state=closed]:animate-pop-out',
          )}
        >
          {items.map(({ format, label, icon: Icon }) => (
            <button
              key={format}
              type="button"
              disabled={busy !== null}
              onClick={() => void handleExport(format)}
              className={cn(
                'flex min-h-11 w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm font-medium',
                'transition-colors duration-(--duration-fast) hover:bg-sunken disabled:opacity-60',
              )}
            >
              {busy === format ? (
                <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin" />
              ) : (
                <Icon aria-hidden className="size-4 shrink-0" />
              )}
              {label}
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
