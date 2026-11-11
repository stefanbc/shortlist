import type { ParseKeys } from 'i18next'
import {
  KeyRound,
  Mail,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
  Users as UsersIcon,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
import { LoadMore } from '@/components/ui/LoadMore'
import { usePaging } from '@/components/ui/usePaging'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useSession, type Profile } from '@/stores/session'
import { Page, PageHeader } from '@/components/layout/Page'
import {
  BLANK_USER_FORM,
  isPlaceholderEmail,
  useCreateUser,
  useJurorEventNames,
  useProfiles,
  useSetUserActive,
  useSetUserEmail,
  useSetUserRole,
  userActionErrorCode,
  userActionErrorMessage,
  userFieldErrorMessage,
  validateEmailForm,
  validateUserForm,
  type UserFormErrors,
  type UserFormValue,
} from './api'
import { JurorLinkDialog } from './JurorLinkDialog'
import { cn } from '@/lib/cn'

function CreateUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange(open: boolean): void
}) {
  const { t } = useTranslation()
  const createUser = useCreateUser()
  const [form, setForm] = useState<UserFormValue>(BLANK_USER_FORM)
  const [errors, setErrors] = useState<UserFormErrors>({})

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(BLANK_USER_FORM)
      setErrors({})
    }
    onOpenChange(next)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = validateUserForm(form)
    if ('errors' in result) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    try {
      await createUser.mutateAsync(result.data)
      toast.success(t('users.created'))
      handleOpenChange(false)
    } catch (error) {
      toast.error(userActionErrorMessage(t, await userActionErrorCode(error)))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={t('users.createDialogTitle')}
        description={t('users.createDialogDescription')}
      >
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <Field
            id="new-user-name"
            label={t('users.nameLabel')}
            error={userFieldErrorMessage(t, errors.displayName)}
          >
            <Input
              id="new-user-name"
              value={form.displayName}
              aria-describedby={describedBy('new-user-name', { error: errors.displayName })}
              aria-invalid={Boolean(errors.displayName)}
              onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
            />
          </Field>

          <Field
            id="new-user-email"
            label={t('users.emailLabel')}
            optional
            error={userFieldErrorMessage(t, errors.email)}
          >
            <Input
              id="new-user-email"
              type="email"
              value={form.email}
              aria-describedby={describedBy('new-user-email', { error: errors.email })}
              aria-invalid={Boolean(errors.email)}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            />
          </Field>

          <Field id="new-user-role" label={t('users.roleLabel')}>
            <Select
              id="new-user-role"
              value={form.role}
              onValueChange={(role) =>
                setForm((prev) => ({ ...prev, role: role as UserFormValue['role'] }))
              }
            >
              <option value="juror">{t('users.roleJuror')}</option>
              <option value="admin">{t('users.roleAdmin')}</option>
            </Select>
          </Field>

          <DialogFooter>
            <Button type="submit" loading={createUser.isPending}>
              {t('users.addUser')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EmailDialog({
  open,
  onOpenChange,
  user,
}: {
  open: boolean
  onOpenChange(open: boolean): void
  user: Profile | null
}) {
  const { t } = useTranslation()
  const setUserEmail = useSetUserEmail()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()

  function handleOpenChange(next: boolean) {
    if (!next) {
      setEmail('')
      setError(undefined)
    }
    onOpenChange(next)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    const result = validateEmailForm(email)
    if ('error' in result) {
      setError(userFieldErrorMessage(t, result.error))
      return
    }
    setError(undefined)
    try {
      await setUserEmail.mutateAsync({ userId: user.id, email: result.data })
      toast.success(t('users.emailSaved'))
      handleOpenChange(false)
    } catch (err) {
      toast.error(userActionErrorMessage(t, await userActionErrorCode(err)))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        title={isPlaceholderEmail(user?.email ?? null) ? t('users.addEmail') : t('users.editEmail')}
        description={t('users.emailDialogDescription')}
      >
        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <Field id="user-email" label={t('users.emailLabel')} error={error}>
            <Input
              id="user-email"
              type="email"
              value={email}
              aria-describedby={describedBy('user-email', { error })}
              aria-invalid={Boolean(error)}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="submit" loading={setUserEmail.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UserRow({
  user,
  isSelf,
  eventNames,
  onChangeRole,
  onRequestActive,
  onEditEmail,
  onOpenLink,
}: {
  user: Profile
  isSelf: boolean
  eventNames: string[]
  onChangeRole(user: Profile, role: 'admin' | 'juror'): void
  onRequestActive(user: Profile, next: boolean): void
  onEditEmail(user: Profile): void
  onOpenLink(user: Profile): void
}) {
  const { t } = useTranslation()
  const placeholderEmail = isPlaceholderEmail(user.email)

  return (
    <div
      className={cn(
        'grid gap-x-6 gap-y-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center',
        !user.active && 'bg-canvas',
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('font-semibold break-words', !user.active && 'text-ink-muted')}>
            {user.displayName}
          </span>
          {isSelf && <Badge tone="accent">{t('users.you')}</Badge>}
          {!user.active && <Badge tone="danger">{t('users.statusInactive')}</Badge>}
        </div>
        <div className="flex items-center gap-1 text-sm text-ink-muted">
          <Mail aria-hidden className="size-3.5 shrink-0" />
          {placeholderEmail ? (
            <span className="text-ink-faint">{t('users.noEmail')}</span>
          ) : (
            <span className="min-w-0 truncate">{user.email}</span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9"
            aria-label={`${placeholderEmail ? t('users.addEmail') : t('users.editEmail')}: ${user.displayName}`}
            onClick={() => onEditEmail(user)}
          >
            <Pencil aria-hidden className="size-3.5" />
          </Button>
        </div>
      </div>

      <p className="min-w-0 text-sm text-ink-muted">
        {user.role === 'juror' ? (
          <>
            <span className="text-ink-faint">{t('users.eventsJudgedLabel')}: </span>
            <span className="break-words">
              {eventNames.length > 0 ? eventNames.join(', ') : t('users.eventsJudgedNone')}
            </span>
          </>
        ) : (
          t('users.adminAccess')
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Select
          aria-label={`${t('users.roleLabel')}: ${user.displayName}`}
          value={user.role}
          disabled={isSelf}
          className="w-32"
          onValueChange={(role) => onChangeRole(user, role as 'admin' | 'juror')}
        >
          <option value="juror">{t('users.roleJuror')}</option>
          <option value="admin">{t('users.roleAdmin')}</option>
        </Select>

        {user.role === 'juror' && (
          <Button variant="secondary" size="sm" className="h-11" onClick={() => onOpenLink(user)}>
            <KeyRound aria-hidden />
            {t('users.loginLink')}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-11"
          disabled={isSelf}
          aria-label={`${user.active ? t('users.deactivate') : t('users.activate')}: ${user.displayName}`}
          onClick={() => onRequestActive(user, !user.active)}
        >
          {user.active ? <UserX aria-hidden /> : <UserCheck aria-hidden />}
          {user.active ? t('users.deactivate') : t('users.activate')}
        </Button>
      </div>
    </div>
  )
}

type UserFilter = 'all' | 'admin' | 'juror' | 'inactive'

const FILTERS: Record<UserFilter, (user: Profile) => boolean> = {
  all: () => true,
  admin: (user) => user.role === 'admin',
  juror: (user) => user.role === 'juror',
  inactive: (user) => !user.active,
}

const FILTER_LABELS: Record<UserFilter, ParseKeys> = {
  all: 'users.filterAll',
  admin: 'users.filterAdmins',
  juror: 'users.filterJurors',
  inactive: 'users.filterInactive',
}

type PendingAction =
  | { kind: 'active'; user: Profile; next: boolean }
  | { kind: 'role'; user: Profile; role: 'admin' | 'juror' }

export function UsersPage() {
  const { t } = useTranslation()
  const paging = usePaging()
  const me = useSession((s) => s.profile)
  const { data: profiles, isLoading } = useProfiles()
  const { data: eventNamesByJuror } = useJurorEventNames()
  const setUserRole = useSetUserRole()
  const setUserActive = useSetUserActive()

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<UserFilter>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [emailUser, setEmailUser] = useState<Profile | null>(null)
  const [linkUser, setLinkUser] = useState<Profile | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const allUsers = profiles ?? []
  const normalizedSearch = search.trim().toLowerCase()
  const filteredUsers = allUsers.filter((user) => {
    if (!FILTERS[filter](user)) return false
    if (!normalizedSearch) return true
    const haystack = `${user.displayName} ${user.email ?? ''}`.toLowerCase()
    return haystack.includes(normalizedSearch)
  })
  const users = paging.of(filteredUsers)

  function handleChangeRole(user: Profile, role: 'admin' | 'juror') {
    if (role === user.role) return
    setPending({ kind: 'role', user, role })
  }

  async function confirmPending() {
    if (!pending) return
    try {
      if (pending.kind === 'active') {
        await setUserActive.mutateAsync({ userId: pending.user.id, active: pending.next })
      } else {
        await setUserRole.mutateAsync({ userId: pending.user.id, role: pending.role })
      }
    } catch (error) {
      toast.error(userActionErrorMessage(t, await userActionErrorCode(error)))
      throw error
    }
  }

  const dialogContent =
    pending?.kind === 'active'
      ? pending.next
        ? {
            title: t('users.confirmActivateTitle'),
            description: t('users.confirmActivateBody', { name: pending.user.displayName }),
            tone: 'default' as const,
          }
        : {
            title: t('users.confirmDeactivateTitle'),
            description: t('users.confirmDeactivateBody', { name: pending.user.displayName }),
            tone: 'danger' as const,
          }
      : pending?.kind === 'role'
        ? {
            title: t('users.confirmRoleChangeTitle', {
              role: t(pending.role === 'admin' ? 'users.roleAdmin' : 'users.roleJuror'),
            }),
            description: t('users.confirmRoleChangeBody', { name: pending.user.displayName }),
            tone: 'danger' as const,
          }
        : null

  return (
    <Page>
      <PageHeader
        title={t('users.title')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            {t('users.addUser')}
          </Button>
        }
      />

      <h2 className="sr-only">{t('users.title')}</h2>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="group"
            aria-label={t('users.roleFilterLabel')}
            className="flex flex-wrap gap-1 rounded-control bg-sunken p-1"
          >
            {(Object.keys(FILTERS) as UserFilter[]).map((key) => {
              const count = allUsers.filter(FILTERS[key]).length
              if (key === 'inactive' && count === 0) return null
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    'flex h-9 items-center rounded-[0.25rem] px-3 text-sm font-medium whitespace-nowrap text-ink-muted transition-colors duration-(--duration-fast) hover:text-ink',
                    filter === key &&
                      'bg-surface font-semibold text-ink ring-1 ring-line-strong dark:bg-raised',
                  )}
                >
                  {`${t(FILTER_LABELS[key])} (${count})`}
                </button>
              )
            })}
          </div>
          <Input
            aria-label={t('users.searchLabel')}
            placeholder={t('users.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 lg:max-w-xs"
          />
        </div>

          {isLoading && <Skeleton className="h-64 w-full" />}

          {!isLoading && allUsers.length === 0 && (
            <EmptyState
              icon={UsersIcon}
              title={t('users.emptyTitle')}
              description={t('users.emptyDescription')}
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden />
                  {t('users.addUser')}
                </Button>
              }
            />
          )}

          {!isLoading && allUsers.length > 0 && filteredUsers.length === 0 && (
            <EmptyState icon={Search} title={t('users.emptyFilteredTitle')} />
          )}

          {!isLoading && filteredUsers.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
              {users.visible.map((user) => (
                <li key={user.id}>
                  <UserRow
                    user={user}
                    isSelf={user.id === me?.id}
                    eventNames={eventNamesByJuror?.[user.id] ?? []}
                    onChangeRole={handleChangeRole}
                    onRequestActive={(target, next) => setPending({ kind: 'active', user: target, next })}
                    onEditEmail={setEmailUser}
                    onOpenLink={setLinkUser}
                  />
                </li>
              ))}
            </ul>
          )}
          <LoadMore remaining={isLoading ? 0 : users.remaining} onLoadMore={users.loadMore} />
      </div>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EmailDialog
        open={emailUser !== null}
        onOpenChange={(open) => !open && setEmailUser(null)}
        user={emailUser}
      />
      <JurorLinkDialog
        open={linkUser !== null}
        onOpenChange={(open) => !open && setLinkUser(null)}
        juror={linkUser}
      />

      {dialogContent && (
        <ConfirmDialog
          open={pending !== null}
          onOpenChange={(open) => !open && setPending(null)}
          title={dialogContent.title}
          description={dialogContent.description}
          confirmLabel={t('common.confirm')}
          tone={dialogContent.tone}
          onConfirm={confirmPending}
        />
      )}
    </Page>
  )
}
