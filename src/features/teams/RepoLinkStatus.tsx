import { CircleAlert, CircleCheck, CircleHelp, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseRepoUrl } from '@/domain/repoUrl'
import { checkRepo, type RepoStatus } from './repoCheck'

/** Wait this long after the last keystroke before asking GitHub. */
const DEBOUNCE_MS = 700

/** Under the repository field: whether GitHub has a public repository at that address,
 * checked as the organizer types. Advice only: a private repository can still be saved
 * (teams often open theirs up on the day), but the organizer knows jurors can't see it. */
export function RepoLinkStatus({ value }: { value: string }) {
  const { t } = useTranslation()
  const parsed = parseRepoUrl(value)
  const slug = parsed.ok ? `${parsed.owner}/${parsed.repo}` : null
  // The answer is kept with the address it is about, so a stale one is never shown.
  const [result, setResult] = useState<{ slug: string; status: RepoStatus } | null>(null)

  useEffect(() => {
    if (!slug) return
    const [owner, repo] = slug.split('/')
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void checkRepo(owner, repo, controller.signal).then((status) => {
        if (!controller.signal.aborted) setResult({ slug, status })
      })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [slug])

  if (!slug) return null
  const status = result?.slug === slug ? result.status : 'checking'

  return (
    <p role="status" className="flex items-start gap-2 text-sm">
      {status === 'checking' && (
        <>
          <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-ink-faint" />
          <span className="text-ink-muted">{t('teams.repoCheck.checking')}</span>
        </>
      )}
      {status === 'public' && (
        <>
          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
          <span className="text-success">{t('teams.repoCheck.public', { repo: slug })}</span>
        </>
      )}
      {status === 'missing' && (
        <>
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span className="text-warning">{t('teams.repoCheck.missing', { repo: slug })}</span>
        </>
      )}
      {status === 'unknown' && (
        <>
          <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          <span className="text-ink-muted">{t('teams.repoCheck.unknown')}</span>
        </>
      )}
    </p>
  )
}
