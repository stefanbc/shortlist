import { ExternalLink, FileUp, Pencil, Plus, Search, Trash2, UserX, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { Page, PageHeader } from '@/components/layout/Page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { LoadMore } from '@/components/ui/LoadMore'
import { usePaging } from '@/components/ui/usePaging'
import { Select } from '@/components/ui/Select'
import { Sheet, SheetContent } from '@/components/ui/Sheet'
import { Skeleton } from '@/components/ui/Skeleton'
import { SortableList } from '@/components/ui/SortableList'
import type { Id } from '@/domain/types'
import { nextPosition, useThemes } from '@/features/criteria/api'
import { useEvent } from '@/features/events/api'
import {
  BLANK_TEAM_FORM,
  toTeamFormValue,
  useDeleteTeam,
  useReorderTeams,
  useSaveTeam,
  useSetNoShow,
  useTeams,
  type TeamWithProject,
} from './api'
import { cn } from '@/lib/cn'
import { RegistrationImportDialog } from './RegistrationImportDialog'
import { TeamForm } from './TeamForm'
import { safeRepoHref } from '@/domain/repoUrl'

/** An in-flight action that needs the organizer to confirm before it's sent: deleting a
 * team, or flipping its no-show flag. Neither optimistically changes anything beforehand,
 * so every dialog close (confirm or cancel) can simply clear it -- there's no local state
 * to revert either way (contrast `criteria`'s weight edits, which do). */
type PendingAction =
  | { kind: 'delete'; team: TeamWithProject }
  | { kind: 'noShow'; team: TeamWithProject; next: boolean }

function TeamRow({
  team,
  themeName,
  onEdit,
  onRequestDelete,
  onRequestNoShow,
}: {
  team: TeamWithProject
  themeName: string | null
  onEdit(team: TeamWithProject): void
  onRequestDelete(team: TeamWithProject): void
  onRequestNoShow(team: TeamWithProject, next: boolean): void
}) {
  const { t } = useTranslation()
  // Only a checked address is linked, never the stored value as it is.
  const repoHref = safeRepoHref(team.project.repoUrl)

  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="numeral w-7 shrink-0 pt-0.5 text-right text-2xl leading-none text-ink-faint">
        {team.pitchOrder}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn('font-semibold break-words', team.noShow && 'text-ink-muted line-through')}
          >
            {team.name}
          </span>
          {team.noShow && <Badge tone="danger">{t('teams.noShowBadge')}</Badge>}
        </div>
        {team.members.length > 0 && (
          <p className="text-sm break-words text-ink-muted">{team.members.join(', ')}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {team.project.name ? (
            <span className="break-words text-ink">{team.project.name}</span>
          ) : (
            <span className="text-ink-faint">{t('teams.noProject')}</span>
          )}
          {themeName && <Badge tone="accent">{themeName}</Badge>}
          {repoHref && (
            <a
              href={repoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-accent-ink underline underline-offset-2"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              {t('teams.viewRepo')}
            </a>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11"
          aria-label={`${team.noShow ? t('teams.clearNoShow') : t('teams.markNoShow')}: ${team.name}`}
          onClick={() => onRequestNoShow(team, !team.noShow)}
        >
          <UserX aria-hidden />
          <span className="hidden md:inline">
            {team.noShow ? t('teams.clearNoShow') : t('teams.markNoShow')}
          </span>
        </Button>
        <div className="flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${t('teams.editTeam')}: ${team.name}`}
            onClick={() => onEdit(team)}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${t('teams.deleteTeam')}: ${team.name}`}
            onClick={() => onRequestDelete(team)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TeamsPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { t } = useTranslation()
  const paging = usePaging()
  const id = eventId as Id

  const { data: event, isLoading: eventLoading } = useEvent(id)
  const { data: teams, isLoading: teamsLoading } = useTeams(id)
  const { data: themes } = useThemes(id)
  const saveTeam = useSaveTeam()
  const deleteTeam = useDeleteTeam()
  const reorderTeams = useReorderTeams(id)
  const setNoShow = useSetNoShow()

  const [search, setSearch] = useState('')
  const [themeFilter, setThemeFilter] = useState('all')
  const [editingTeam, setEditingTeam] = useState<TeamWithProject | 'new' | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  if (eventLoading || !event) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-9 w-56" />} />
        <Skeleton className="h-64 w-full" />
      </Page>
    )
  }

  const allTeams = teams ?? []
  const allThemes = themes ?? []
  const themesById = new Map(allThemes.map((theme) => [theme.id, theme.name]))

  const normalizedSearch = search.trim().toLowerCase()
  const hasFilters = normalizedSearch !== '' || themeFilter !== 'all'
  const filteredTeams = allTeams.filter((team) => {
    if (themeFilter !== 'all' && team.project.themeId !== themeFilter) return false
    if (!normalizedSearch) return true
    const haystack = [team.name, ...team.members, team.project.name ?? ''].join(' ').toLowerCase()
    return haystack.includes(normalizedSearch)
  })
  const paged = paging.of(filteredTeams)

  function requestDelete(team: TeamWithProject) {
    setPending({ kind: 'delete', team })
  }

  function requestNoShow(team: TeamWithProject, next: boolean) {
    setPending({ kind: 'noShow', team, next })
  }

  async function confirmPending() {
    if (!pending) return
    if (pending.kind === 'delete') {
      try {
        await deleteTeam.mutateAsync({ id: pending.team.id, eventId: id })
      } catch (error) {
        toast.error(t('teams.deleteError'))
        throw error
      }
    } else {
      try {
        await setNoShow.mutateAsync({ teamId: pending.team.id, noShow: pending.next })
      } catch (error) {
        toast.error(t('teams.noShowError'))
        throw error
      }
    }
  }

  function handleDialogOpenChange(open: boolean) {
    if (!open) setPending(null)
  }

  async function handleFormSubmit(data: Parameters<typeof saveTeam.mutateAsync>[0]) {
    try {
      await saveTeam.mutateAsync(data)
      toast.success(t('teams.saved'))
      setEditingTeam(null)
    } catch {
      toast.error(t('teams.saveError'))
    }
  }

  const sheetOpen = editingTeam !== null
  const pitchOrder =
    editingTeam === 'new'
      ? nextPosition(allTeams.map((team) => ({ position: team.pitchOrder })))
      : (editingTeam?.pitchOrder ?? 1)

  const dialogContent =
    pending?.kind === 'delete'
      ? {
          title: t('teams.confirmDeleteTitle'),
          description: t('teams.confirmDeleteBody', { name: pending.team.name }),
          confirmLabel: t('common.delete'),
          tone: 'danger' as const,
        }
      : pending?.kind === 'noShow'
        ? {
            title: pending.next
              ? t('teams.confirmNoShowTitle')
              : t('teams.confirmClearNoShowTitle'),
            description: pending.next
              ? t('teams.confirmNoShowBody', { name: pending.team.name })
              : t('teams.confirmClearNoShowBody', { name: pending.team.name }),
            confirmLabel: t('common.confirm'),
            tone: pending.next ? ('danger' as const) : ('default' as const),
          }
        : null

  return (
    <Page>
      <PageHeader
        title={t('events.teams')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileUp aria-hidden />
              {t('teams.registrations.open')}
            </Button>
            <Button
              onClick={() => {
                setEditingTeam('new')
              }}
            >
              <Plus aria-hidden />
              {t('teams.addTeam')}
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="sr-only">
          <CardTitle>{t('events.teams')}</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label={t('teams.searchLabel')}
              placeholder={t('teams.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 shrink-0 sm:flex-1"
            />
            <Select
              aria-label={t('teams.themeFilterLabel')}
              value={themeFilter}
              onValueChange={setThemeFilter}
              className="sm:w-56"
            >
              <option value="all">{t('teams.themeFilterAll')}</option>
              {allThemes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </Select>
          </div>

          {teamsLoading && <Skeleton className="h-40 w-full" />}

          {!teamsLoading && allTeams.length === 0 && (
            <EmptyState
              icon={Users}
              title={t('teams.emptyTitle')}
              description={t('teams.emptyDescription')}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setImportOpen(true)}>
                    <FileUp aria-hidden />
                    {t('teams.registrations.open')}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditingTeam('new')}>
                    <Plus aria-hidden />
                    {t('teams.addTeam')}
                  </Button>
                </div>
              }
            />
          )}

          {!teamsLoading && allTeams.length > 0 && filteredTeams.length === 0 && (
            <EmptyState icon={Search} title={t('teams.emptyFilteredTitle')} />
          )}

          {!teamsLoading && filteredTeams.length > 0 && !hasFilters && (
            <SortableList
              items={paged.visible}
              // Rows not opened up yet keep their place after the ones just reordered.
              onReorder={(orderedIds) =>
                reorderTeams.mutate([...orderedIds, ...paged.hidden.map((team) => team.id)])
              }
              renderItem={(team) => (
                <TeamRow
                  team={team}
                  themeName={
                    team.project.themeId ? (themesById.get(team.project.themeId) ?? null) : null
                  }
                  onEdit={setEditingTeam}
                  onRequestDelete={requestDelete}
                  onRequestNoShow={requestNoShow}
                />
              )}
            />
          )}

          {!teamsLoading && filteredTeams.length > 0 && hasFilters && (
            <>
              <ul className="flex flex-col gap-2">
                {paged.visible.map((team) => (
                  <li key={team.id} className="rounded-control bg-surface px-3 ring-1 ring-line">
                    <TeamRow
                      team={team}
                      themeName={
                        team.project.themeId ? (themesById.get(team.project.themeId) ?? null) : null
                      }
                      onEdit={setEditingTeam}
                      onRequestDelete={requestDelete}
                      onRequestNoShow={requestNoShow}
                    />
                  </li>
                ))}
              </ul>
              <p className="px-2 text-sm text-ink-faint">{t('teams.reorderHint')}</p>
            </>
          )}
          <LoadMore remaining={teamsLoading ? 0 : paged.remaining} onLoadMore={paged.loadMore} />
        </CardBody>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && setEditingTeam(null)}>
        <SheetContent
          title={editingTeam === 'new' ? t('teams.sheetCreateTitle') : t('teams.sheetEditTitle')}
        >
          <TeamForm
            key={editingTeam === 'new' ? 'new' : (editingTeam?.id ?? 'none')}
            idPrefix="team"
            initialValue={
              editingTeam === 'new' || !editingTeam ? BLANK_TEAM_FORM : toTeamFormValue(editingTeam)
            }
            pitchOrder={pitchOrder}
            themes={allThemes}
            submitLabel={t('common.save')}
            pending={saveTeam.isPending}
            onSubmit={(data) =>
              handleFormSubmit({
                ...data,
                id: editingTeam === 'new' ? undefined : editingTeam?.id,
                eventId: id,
              })
            }
          />
        </SheetContent>
      </Sheet>

      {dialogContent && (
        <ConfirmDialog
          open={pending !== null}
          onOpenChange={handleDialogOpenChange}
          title={dialogContent.title}
          description={dialogContent.description}
          confirmLabel={dialogContent.confirmLabel}
          tone={dialogContent.tone}
          onConfirm={confirmPending}
        />
      )}
      <RegistrationImportDialog
        eventId={id}
        existingTeamNames={allTeams.map((team) => team.name)}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
    </Page>
  )
}
