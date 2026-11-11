import { AlertTriangle, FileSpreadsheet, Info, UploadCloud } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { describedBy } from '@/components/ui/fieldStyles'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { rankTeams, SCORE_EPSILON, type RankedTeam } from '@/domain/scoring'
import type { Criterion, Score, Team } from '@/domain/types'
import { cn } from '@/lib/cn'
import { importErrorCode, importErrorMessage, useImportEvent, workbookErrorMessage } from './api'
import type { ParsedEvent, ParsedTeam, WorkbookFormatErrorCode } from './parseWorkbook'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const DEFAULT_EVENT_NAME = 'Astra Hack'

type ParseStatus = 'idle' | 'parsing' | 'error' | 'ready'

type ParsedResult = {
  event: ParsedEvent
  criteria: Criterion[]
  teams: Team[]
  scores: Score[]
}

function formatFileSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`
}

/** The drop zone: a button (keyboard + click accessible) that also accepts drag & drop,
 * plus a visually hidden file input it proxies clicks to. */
function DropZone({
  status,
  message,
  onFile,
}: {
  status: ParseStatus
  message: string | null
  onFile(file: File): void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setDragActive(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) onFile(dropped)
  }

  return (
    <Card>
      <CardBody>
        <button
          type="button"
          disabled={status === 'parsing'}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            'flex w-full flex-col items-center gap-3 rounded-panel border border-dashed px-6 py-12 text-center',
            'transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-70',
            status === 'error'
              ? 'border-danger/40 bg-danger-soft/40'
              : dragActive
                ? 'border-accent bg-accent-soft/60'
                : 'border-line-strong hover:border-accent/60 hover:bg-sunken/40',
          )}
        >
          <div
            className={cn(
              'grid size-14 place-items-center rounded-card',
              status === 'error' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-accent-ink',
            )}
          >
            <UploadCloud aria-hidden className="size-6" strokeWidth={1.75} />
          </div>
          <div>
            <p className="font-semibold">{t('import.dropTitle')}</p>
            <p className="mt-1 text-sm text-ink-muted">{t('import.dropHint')}</p>
          </div>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          disabled={status === 'parsing'}
          aria-label={t('import.fileInputLabel')}
          className="sr-only"
          onChange={(e) => {
            const selected = e.target.files?.[0]
            // Reset so choosing the same file again (e.g. after fixing it) still fires onChange.
            e.target.value = ''
            if (selected) onFile(selected)
          }}
        />
        {message && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {message}
          </p>
        )}
      </CardBody>
    </Card>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div role="group" aria-label={`${value} ${label}`} className="flex flex-col gap-1 sm:px-5 sm:first:pl-0">
      <span aria-hidden className="numeral text-3xl leading-none">
        {value}
      </span>
      <span aria-hidden className="text-sm text-ink-muted">
        {label}
      </span>
    </div>
  )
}

function matchTone(entry: RankedTeam, parsedTeam: ParsedTeam | undefined, expected: number | null): BadgeTone {
  if (parsedTeam?.noShow || expected === null) return 'neutral'
  return entry.final !== null && Math.abs(entry.final - expected) < SCORE_EPSILON ? 'success' : 'danger'
}

export function ImportPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const importEvent = useImportEvent()

  const [status, setStatus] = useState<ParseStatus>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [result, setResult] = useState<ParsedResult | null>(null)
  const [eventName, setEventName] = useState(DEFAULT_EVENT_NAME)
  const [eventNameError, setEventNameError] = useState<string | null>(null)

  async function handleFile(selected: File) {
    setFile(selected)
    setResult(null)
    setParseError(null)

    if (selected.size > MAX_FILE_BYTES) {
      setStatus('error')
      setParseError(t('import.fileTooLarge'))
      return
    }

    setStatus('parsing')
    let moduleRef: typeof import('./parseWorkbook') | undefined
    try {
      moduleRef = await import('./parseWorkbook')
      const buffer = await selected.arrayBuffer()
      const parsedEvent = await moduleRef.parseWorkbook(buffer)
      const domain = moduleRef.toDomain(parsedEvent)
      setResult({ event: parsedEvent, ...domain })
      setStatus('ready')
    } catch (error) {
      const code: WorkbookFormatErrorCode | 'unknown' =
        moduleRef && error instanceof moduleRef.WorkbookFormatError ? error.code : 'unknown'
      setParseError(workbookErrorMessage(t, code))
      setStatus('error')
    }
  }

  async function handleImport() {
    if (!result) return
    const name = eventName.trim()
    if (!name) {
      setEventNameError(t('import.eventNameRequired'))
      return
    }
    setEventNameError(null)
    try {
      const eventId = await importEvent.mutateAsync({ eventName: name, parsed: result.event })
      toast.success(t('import.success', { name }))
      // The imported event starts Locked with starts/ends dates in the past (see the
      // import_event migration), so the admin dashboard's "active event" pick can't be
      // trusted to land on it once other events exist -- go straight to the event just
      // created instead, the same as the create/copy-event flows on the Events page.
      navigate(`/admin/events/${eventId}/settings`)
    } catch (error) {
      const code = await importErrorCode(error)
      toast.error(importErrorMessage(t, code))
    }
  }

  const ranked = result ? rankTeams(result.teams, result.criteria, result.scores) : []
  const invalidCriteria = result?.criteria.filter((criterion) => criterion.weight <= 0) ?? []
  const noShowTeams = result?.event.teams.filter((team) => team.noShow) ?? []
  const missingProjectTeams =
    result?.event.teams.filter((team) => !team.noShow && !team.projectName) ?? []
  const parsedTeamsBySheet = new Map((result?.event.teams ?? []).map((team) => [team.sheet, team]))

  return (
    <Page>
      <PageHeader title={t('import.title')} description={t('import.intro')} />

      <div className="flex flex-col gap-6">
        <DropZone status={status} message={status === 'error' ? parseError : null} onFile={(f) => void handleFile(f)} />

        {status === 'parsing' && (
          <p className="text-sm text-ink-muted">{t('import.parsing')}</p>
        )}

        {file && status !== 'idle' && status !== 'parsing' && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <FileSpreadsheet aria-hidden className="size-4 shrink-0" />
            <span className="truncate">
              {file.name} · {formatFileSize(file.size)}
            </span>
          </div>
        )}

        {result && (
          <>
            <Card>
              <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-5 sm:gap-0 sm:divide-x sm:divide-line">
                <StatTile label={t('import.countThemes')} value={result.event.themes.length} />
                <StatTile label={t('import.countCriteria')} value={result.criteria.length} />
                <StatTile label={t('import.countTeams')} value={result.teams.length} />
                <StatTile label={t('import.countJurors')} value={result.event.jurors.length} />
                <StatTile label={t('import.countScores')} value={result.scores.length} />
              </CardBody>
            </Card>

            {invalidCriteria.length > 0 && (
              <div className="flex items-start gap-3 rounded-panel bg-danger-soft px-5 py-4 ring-1 ring-danger/25">
                <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
                <div>
                  <p className="font-semibold text-danger">{t('import.weightWarningHeading')}</p>
                  <p className="mt-1 text-sm text-danger">
                    {t('import.weightWarningBody', {
                      count: invalidCriteria.length,
                      criteria: invalidCriteria.map((criterion) => criterion.name).join(', '),
                    })}
                  </p>
                </div>
              </div>
            )}

            {(noShowTeams.length > 0 || missingProjectTeams.length > 0) && (
              <div className="flex flex-col gap-2 rounded-panel bg-warning-soft px-5 py-4 ring-1 ring-warning/25">
                <div className="flex items-center gap-2 font-semibold text-warning">
                  <AlertTriangle aria-hidden className="size-4 shrink-0" />
                  {t('import.warningsHeading')}
                </div>
                {noShowTeams.length > 0 && (
                  <p className="text-sm text-warning">
                    {t('import.warningNoShows', {
                      count: noShowTeams.length,
                      teams: noShowTeams.map((team) => team.name).join(', '),
                    })}
                  </p>
                )}
                {missingProjectTeams.length > 0 && (
                  <p className="text-sm text-warning">
                    {t('import.warningMissingProjects', {
                      count: missingProjectTeams.length,
                      teams: missingProjectTeams.map((team) => team.name).join(', '),
                    })}
                  </p>
                )}
              </div>
            )}

            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Info aria-hidden className="size-4 shrink-0" />
              {t('import.placeholderEmailNote')}
            </p>

            <Card>
              <CardHeader>
                <CardTitle>{t('import.previewHeading')}</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-ink-muted">{t('import.previewHint')}</p>
                <div className="-mx-5 mt-4 overflow-x-auto px-5">
                  <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className="text-left text-ink-muted">
                        <th scope="col" className="px-3 py-2 font-medium">
                          {t('import.rankHeader')}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          {t('import.teamHeader')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          {t('import.computedHeader')}
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          {t('import.expectedHeader')}
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          <span className="sr-only">{t('import.statusHeader')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((entry) => {
                        const parsedTeam = parsedTeamsBySheet.get(entry.teamId)
                        const expected = result.event.expectedFinals[entry.teamId] ?? null
                        const tone = matchTone(entry, parsedTeam, expected)
                        const badgeLabel =
                          tone === 'neutral'
                            ? t('import.noShowBadge')
                            : tone === 'success'
                              ? t('import.matchBadge')
                              : t('import.mismatchBadge')
                        return (
                          <tr key={entry.teamId} className="border-t border-line">
                            <td className="numeral px-3 py-2.5 text-lg">{entry.rank ?? '–'}</td>
                            <td className="px-3 py-2.5 font-semibold">{parsedTeam?.name ?? entry.teamId}</td>
                            <td className="numeral px-3 py-2.5 text-right">
                              {entry.final === null ? '—' : entry.final.toFixed(3)}
                            </td>
                            <td className="numeral px-3 py-2.5 text-right">
                              {expected === null ? '—' : expected.toFixed(3)}
                            </td>
                            <td className="px-3 py-2.5">
                              <Badge tone={tone}>{badgeLabel}</Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <Field
                  id="import-event-name"
                  label={t('import.eventNameLabel')}
                  error={eventNameError}
                  className="sm:max-w-xs"
                >
                  <Input
                    id="import-event-name"
                    value={eventName}
                    aria-describedby={describedBy('import-event-name', { error: eventNameError })}
                    aria-invalid={Boolean(eventNameError)}
                    onChange={(e) => setEventName(e.target.value)}
                  />
                </Field>
                <Button
                  onClick={() => void handleImport()}
                  loading={importEvent.isPending}
                  disabled={invalidCriteria.length > 0}
                >
                  {t('import.importButton')}
                </Button>
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </Page>
  )
}
