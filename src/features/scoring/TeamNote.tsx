import { ChevronDown, NotebookPen } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Textarea } from '@/components/ui/Textarea'
import type { Id } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useMyNote, useSaveNote } from './api'

/** The juror's private note on a team, collapsed under the card until opened. */
export function TeamNote({ teamId, teamName }: { teamId: Id; teamName: string }) {
  const { t } = useTranslation()
  const note = useMyNote(teamId)
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const hasNote = Boolean(note.data)

  return (
    <div className="rounded-card border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full items-center gap-2.5 rounded-card px-4 text-left text-sm font-medium text-ink-muted hover:text-ink"
      >
        <NotebookPen aria-hidden className="size-4" />
        <span className="flex-1">{t('scoring.note.toggle')}</span>
        {hasNote && !open && <span aria-hidden className="size-1.5 rounded-full bg-accent" />}
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 transition-transform duration-(--duration-fast)',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4">
          {note.isSuccess && <NoteEditor teamId={teamId} teamName={teamName} initial={note.data} />}
        </div>
      )}
    </div>
  )
}

function NoteEditor({
  teamId,
  teamName,
  initial,
}: {
  teamId: Id
  teamName: string
  initial: string
}) {
  const { t } = useTranslation()
  const [body, setBody] = useState(initial)
  const { save, status } = useSaveNote()
  const statusText =
    status === 'saving'
      ? t('scoring.note.saving')
      : status === 'saved'
        ? t('scoring.note.saved')
        : status === 'error'
          ? t('scoring.note.error')
          : null

  return (
    <>
      <Textarea
        aria-label={t('scoring.note.label', { team: teamName })}
        placeholder={t('scoring.note.placeholder')}
        value={body}
        rows={3}
        onChange={(event) => {
          setBody(event.target.value)
          save(teamId, event.target.value)
        }}
      />
      <p
        aria-live="polite"
        className={cn(
          'mt-1.5 min-h-5 text-xs',
          status === 'error' ? 'text-danger' : 'text-ink-faint',
        )}
      >
        {statusText}
      </p>
    </>
  )
}
