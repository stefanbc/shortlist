import { Plus, Tag, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SortableList } from '@/components/ui/SortableList'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { themeInputSchema } from '@/domain/schemas'
import type { Id } from '@/domain/types'
import {
  nextPosition,
  useDeleteTheme,
  useReorderThemes,
  useSaveTheme,
  useThemes,
  type Theme,
} from './api'

/** A single theme's name, saved on blur. Renaming never needs the recalculation
 * confirmation — themes carry no weight (Ruling R6). */
function ThemeRow({
  theme,
  eventId,
  onDelete,
}: {
  theme: Theme
  eventId: Id
  onDelete(theme: Theme): void
}) {
  const { t } = useTranslation()
  const saveTheme = useSaveTheme()
  const [name, setName] = useState(theme.name)

  async function commit() {
    const result = themeInputSchema.safeParse({ name })
    if (!result.success) {
      setName(theme.name)
      return
    }
    if (result.data.name === theme.name) return
    try {
      await saveTheme.mutateAsync({ id: theme.id, eventId, name: result.data.name })
    } catch {
      setName(theme.name)
      toast.error(t('criteria.themeSaveError'))
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={t('criteria.themeNameLabel')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        className="h-10 flex-1"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`${t('criteria.deleteTheme')}: ${theme.name}`}
        onClick={() => onDelete(theme)}
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  )
}

function AddThemeForm({ eventId, nextPosition }: { eventId: Id; nextPosition: number }) {
  const { t } = useTranslation()
  const saveTheme = useSaveTheme()
  const [name, setName] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = themeInputSchema.safeParse({ name })
    if (!result.success) return
    try {
      await saveTheme.mutateAsync({ eventId, name: result.data.name, position: nextPosition })
      setName('')
    } catch {
      toast.error(t('criteria.themeSaveError'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <Input
        aria-label={t('criteria.themeNameLabel')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-10 flex-1"
      />
      <Button type="submit" variant="secondary" size="sm" loading={saveTheme.isPending}>
        <Plus aria-hidden />
        {t('criteria.addTheme')}
      </Button>
    </form>
  )
}

export function ThemesPanel({ eventId }: { eventId: Id }) {
  const { t } = useTranslation()
  const { data: themes, isLoading } = useThemes(eventId)
  const deleteTheme = useDeleteTheme()
  const reorderThemes = useReorderThemes(eventId)

  async function handleDelete(theme: Theme) {
    try {
      await deleteTheme.mutateAsync({ id: theme.id, eventId })
    } catch {
      toast.error(t('criteria.themeDeleteError'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('criteria.themesHeading')}</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{t('criteria.themesDescription')}</p>

        {isLoading && <Skeleton className="h-24 w-full" />}

        {!isLoading && themes && themes.length === 0 && (
          <EmptyState icon={Tag} title={t('criteria.themesEmpty')} />
        )}

        {!isLoading && themes && themes.length > 0 && (
          <SortableList
            items={themes}
            onReorder={(orderedIds) => reorderThemes.mutate(orderedIds)}
            renderItem={(theme) => (
              <ThemeRow theme={theme} eventId={eventId} onDelete={handleDelete} />
            )}
          />
        )}

        <AddThemeForm eventId={eventId} nextPosition={nextPosition(themes ?? [])} />
      </CardBody>
    </Card>
  )
}
