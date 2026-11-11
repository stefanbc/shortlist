import { KeyRound, Mail, Pencil, Plus, Search, UserX, Users as UsersIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
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
              onChange={(e) =>
                setForm((prev) => ({ ...prev, role: e.target.value as UserFormValue['role'] }))
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
    <div className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{user.displayName}</span>
            {isSelf && <Badge tone="accent">{t('users.you')}</Badge>}
            {!user.active && <Badge tone="danger">{t('users.statusInactive')}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            <Mail aria-hidden className="size-3.5 shrink-0" />
            {placeholderEmail ? (
              <span className="text-ink-faint italic">{t('users.noEmail')}</span>
            ) : (
              <span className="truncate">{user.email}</span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`${placeholderEmail ? t('users.addEmail') : t('users.editEmail')}: ${user.displayName}`}
              onClick={() => onEditEmail(user)}
            >
              <Pencil aria-hidden className="size-3.5" />
            </Button>
          </div>
          {user.role === 'juror' && (
            <p className="mt-1.5 text-sm text-ink-faint">
              {t('users.eventsJudgedLabel')}:{' '}
              {eventNames.length > 0 ? eventNames.join(', ') : t('users.eventsJudgedNone')}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Select
            aria-label={`${t('users.roleLabel')}: ${user.displayName}`}
            value={user.role}
            disabled={isSelf}
            className="w-32"
            onChange={(e) => onChangeRole(user, e.target.value as 'admin' | 'juror')}
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
            variant="secondary"
            size="sm"
            className="h-11"
            disabled={isSelf}
            aria-label={`${user.active ? t('users.deactivate') : t('users.activate')}: ${user.displayName}`}
            onClick={() => onRequestActive(user, !user.active)}
          >
            <UserX aria-hidden />
            {user.active ? t('users.deactivate') : t('users.activate')}
          </Button>
        </div>
      </div>
    </div>
  )
}

type PendingAction =
  | { kind: 'active'; user: Profile; next: boolean }
  | { kind: 'role'; user: Profile; role: 'admin' | 'juror' }

export function UsersPage() {
  const { t } = useTranslation()
  const me = useSession((s) => s.profile)
  const { data: profiles, isLoading } = useProfiles()
  const { data: eventNamesByJuror } = useJurorEventNames()
  const setUserRole = useSetUserRole()
  const setUserActive = useSetUserActive()

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'juror'>('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [emailUser, setEmailUser] = useState<Profile | null>(null)
  const [linkUser, setLinkUser] = useState<Profile | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const allUsers = profiles ?? []
  const normalizedSearch = search.trim().toLowerCase()
  const filteredUsers = allUsers.filter((user) => {
    if (roleFilter !== 'all' && user.role !== roleFilter) return false
    if (!normalizedSearch) return true
    const haystack = `${user.displayName} ${user.email ?? ''}`.toLowerCase()
    return haystack.includes(normalizedSearch)
  })

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

      <Card>
        <CardHeader className="sr-only">
          <CardTitle>{t('users.title')}</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              aria-label={t('users.searchLabel')}
              placeholder={t('users.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 shrink-0 sm:flex-1"
            />
            <Select
              aria-label={t('users.roleFilterLabel')}
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
              className="sm:w-48"
            >
              <option value="all">{t('users.roleFilterAll')}</option>
              <option value="admin">{t('users.roleAdmin')}</option>
              <option value="juror">{t('users.roleJuror')}</option>
            </Select>
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
            <ul className="flex flex-col divide-y divide-line">
              {filteredUsers.map((user) => (
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
        </CardBody>
      </Card>

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
