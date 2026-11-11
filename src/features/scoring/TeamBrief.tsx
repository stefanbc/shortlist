import { ChevronDown, ExternalLink, FolderGit2, Users } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { repoSlug } from '@/domain/repoUrl'
import type { TeamWithProject } from '@/features/teams/api'
import { cn } from '@/lib/cn'

/** Descriptions longer than this start folded, so the panel never buries the scoring. */
const LONG_DESCRIPTION = 320

type TeamBriefProps = {
  team: TeamWithProject
  /** Phones start with the panel closed (one tap away); wide screens show it open. */
  defaultOpen: boolean
  className?: string
}

/** Everything a juror may want to look up about the team while scoring: what the project
 * is, who built it, and the repository, which opens in a new tab. Read-only. */
export function TeamBrief({ team, defaultOpen, className }: TeamBriefProps) {
  const { t } = useTranslation()
  const panelId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const [expanded, setExpanded] = useState(false)

  const { description, repoUrl } = team.project
  const slug = repoSlug(repoUrl)
  const long = (description?.length ?? 0) > LONG_DESCRIPTION
  const empty = !description && !repoUrl && team.members.length === 0

  return (
    <section className={cn('rounded-card border border-line bg-surface', className)}>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-12 w-full items-center gap-2.5 rounded-card px-4 text-left font-semibold -outline-offset-2"
        >
          <span className="flex-1">{t('scoring.brief.heading')}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 text-ink-muted transition-transform duration-(--duration-fast)',
              open && 'rotate-180',
            )}
          />
        </button>
      </h2>

      {open && (
        <div id={panelId} className="flex flex-col gap-4 border-t border-line px-4 py-4">
          {empty && <p className="text-sm text-ink-muted">{t('scoring.brief.empty')}</p>}

          {repoUrl && (
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({
                variant: 'secondary',
                className: 'h-auto min-h-11 justify-start gap-3 py-2 text-left whitespace-normal',
              })}
            >
              <FolderGit2 aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block">{t('scoring.brief.openRepo')}</span>
                {slug && (
                  <span className="block text-sm font-normal break-all text-ink-muted">{slug}</span>
                )}
              </span>
              <ExternalLink aria-hidden className="shrink-0 text-ink-faint" />
            </a>
          )}

          {description && (
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink-muted">
                {t('scoring.brief.description')}
              </h3>
              <p
                className={cn(
                  'text-[0.95rem] leading-relaxed break-words whitespace-pre-line',
                  long && !expanded && 'line-clamp-6',
                )}
              >
                {description}
              </p>
              {long && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                  className="mt-1 rounded-control text-sm font-semibold text-accent-ink underline underline-offset-2"
                >
                  {expanded ? t('scoring.brief.showLess') : t('scoring.brief.showAll')}
                </button>
              )}
            </div>
          )}

          {team.members.length > 0 && (
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
                <Users aria-hidden className="size-4" />
                {t('scoring.brief.members', { count: team.members.length })}
              </h3>
              <ul className="text-[0.95rem]">
                {team.members.map((member, index) => (
                  <li key={`${member}-${index}`} className="break-words">
                    {member}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
