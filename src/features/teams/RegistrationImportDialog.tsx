import { FileSpreadsheet, Upload } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import type { Id } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useImportRegistrations } from './api'
import {
  parseRegistrations,
  RegistrationFormatError,
  type ParsedRegistration,
  type RegistrationFormatErrorCode,
  type RegistrationIssue,
} from './parseRegistrations'

type RegistrationImportDialogProps = {
  eventId: Id
  existingTeamNames: string[]
  open: boolean
  onOpenChange(open: boolean): void
}

const SKIP_ISSUES: RegistrationIssue[] = ['missingName', 'duplicateInFile', 'alreadyInEvent']

/** Imports the registration form's responses sheet as this event's teams: choose the
 * file, check the preview, import. Nothing is written until the organizer confirms. */
export function RegistrationImportDialog({
  eventId,
  existingTeamNames,
  open,
  onOpenChange,
}: RegistrationImportDialogProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedRegistration[] | null>(null)
  const [errorCode, setErrorCode] = useState<RegistrationFormatErrorCode | null>(null)
  const importRegistrations = useImportRegistrations(eventId)

  const toImport = parsed?.filter((entry) => !entry.skip) ?? []
  const skipped = parsed?.filter((entry) => entry.skip) ?? []
  const newThemes = new Set(toImport.map((entry) => entry.themeName).filter(Boolean)).size

  function reset() {
    setFileName(null)
    setParsed(null)
    setErrorCode(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setParsed(null)
    setErrorCode(null)
    try {
      setParsed(await parseRegistrations(await file.arrayBuffer(), existingTeamNames))
    } catch (error) {
      setErrorCode(error instanceof RegistrationFormatError ? error.code : 'unreadable')
    }
  }

  async function handleImport() {
    try {
      const count = await importRegistrations.mutateAsync(parsed ?? [])
      toast.success(t('teams.registrations.imported', { count }))
      handleOpenChange(false)
    } catch {
      toast.error(t('teams.registrations.importError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={t('teams.registrations.title')}
        description={t('teams.registrations.description')}
        className="sm:w-[min(46rem,calc(100vw-2rem))]"
      >
        <div className="mt-6 flex flex-col gap-5">
          <div>
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void handleFile(event)}
              className="peer sr-only"
            />
            <label
              htmlFor={inputId}
              className="flex min-h-14 cursor-pointer items-center gap-3 rounded-control border border-dashed border-line-strong px-4 py-3 transition-colors duration-(--duration-fast) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:bg-raised"
            >
              {fileName ? (
                <FileSpreadsheet aria-hidden className="size-5 shrink-0 text-ink-muted" />
              ) : (
                <Upload aria-hidden className="size-5 shrink-0 text-ink-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {fileName ?? t('teams.registrations.chooseFile')}
                </span>
                <span className="block text-sm text-ink-muted">
                  {fileName ? t('teams.registrations.chooseAnother') : t('teams.registrations.fileHint')}
                </span>
              </span>
            </label>
          </div>

          {errorCode && (
            <p role="alert" className="rounded-control bg-danger-soft px-3 py-2.5 text-sm text-danger">
              {t(`teams.registrations.errors.${errorCode}`)}
            </p>
          )}

          {!parsed && !errorCode && (
            <p className="text-sm text-ink-muted">{t('teams.registrations.privacy')}</p>
          )}

          {parsed && (
            <>
              <p role="status" className="font-semibold">
                {t('teams.registrations.summary', { count: toImport.length })}
                {skipped.length > 0 && (
                  <span className="font-normal text-ink-muted">
                    {' '}
                    {t('teams.registrations.summarySkipped', { count: skipped.length })}
                  </span>
                )}
                {newThemes > 0 && (
                  <span className="block text-sm font-normal text-ink-muted">
                    {t('teams.registrations.summaryThemes', { count: newThemes })}
                  </span>
                )}
              </p>

              <ol className="max-h-[42svh] divide-y divide-line overflow-y-auto border-y border-line">
                {parsed.map((entry) => (
                  <li
                    key={entry.row}
                    className={cn('flex gap-3 py-2.5', entry.skip && 'text-ink-muted')}
                  >
                    <span className="w-7 shrink-0 pt-0.5 text-right text-sm text-ink-faint tabular-nums">
                      {entry.row}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block font-semibold break-words', entry.skip && 'line-through')}>
                        {entry.name || t('teams.registrations.unnamed')}
                      </span>
                      <span className="block text-sm break-words text-ink-muted">
                        {[
                          entry.projectName,
                          entry.themeName,
                          t('teams.registrations.memberCount', { count: entry.members.length }),
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                      {entry.issues.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {entry.issues.map((issue) => (
                            <Badge
                              key={issue}
                              tone={SKIP_ISSUES.includes(issue) ? 'neutral' : 'warning'}
                              className="h-auto min-h-6 py-0.5 whitespace-normal"
                            >
                              {t(`teams.registrations.issues.${issue}`)}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={toImport.length === 0}
            loading={importRegistrations.isPending}
            onClick={() => void handleImport()}
          >
            {parsed
              ? t('teams.registrations.confirm', { count: toImport.length })
              : t('teams.registrations.confirmIdle')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
