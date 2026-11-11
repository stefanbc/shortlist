import { Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import type { TeamInput } from '@/domain/schemas'
import type { Theme } from '@/features/criteria/api'
import {
  teamFieldErrorMessage,
  validateTeamForm,
  type TeamFormErrors,
  type TeamFormValue,
} from './api'

type TeamFormProps = {
  /** Prefixes each input's id. Only one TeamForm is ever mounted at a time (the create/edit
   * sheet swaps its contents), so a single constant prefix is enough to avoid collisions. */
  idPrefix: string
  initialValue: TeamFormValue
  /** The pitch order this save will carry: the next free slot for a new team, or the
   * team's current one when editing -- never user-editable here (reordering is drag-only). */
  pitchOrder: number
  themes: Theme[]
  submitLabel: string
  pending: boolean
  onSubmit(data: TeamInput): void | Promise<void>
}

/** Team name, members and project fields, in a Sheet on mobile / side panel on desktop
 * (the Sheet wrapper lives in TeamsPage). */
export function TeamForm({
  idPrefix,
  initialValue,
  pitchOrder,
  themes,
  submitLabel,
  pending,
  onSubmit,
}: TeamFormProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState<TeamFormValue>(initialValue)
  const [memberDraft, setMemberDraft] = useState('')
  const [errors, setErrors] = useState<TeamFormErrors>({})

  function addMember() {
    const trimmed = memberDraft.trim()
    if (!trimmed) return
    setValue((prev) => ({ ...prev, members: [...prev.members, trimmed] }))
    setMemberDraft('')
  }

  function removeMember(index: number) {
    setValue((prev) => ({ ...prev, members: prev.members.filter((_, i) => i !== index) }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = validateTeamForm(value, pitchOrder)
    if ('errors' in result) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    await onSubmit(result.data)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field
        id={`${idPrefix}-name`}
        label={t('teams.nameLabel')}
        error={teamFieldErrorMessage(t, errors.name)}
      >
        <Input
          id={`${idPrefix}-name`}
          value={value.name}
          aria-describedby={describedBy(`${idPrefix}-name`, { error: errors.name })}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setValue((prev) => ({ ...prev, name: e.target.value }))}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{t('teams.membersLabel')}</span>

        {value.members.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {value.members.map((member, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-2 rounded-control bg-raised pl-3.5 ring-1 ring-line"
              >
                <span className="truncate text-sm">{member}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${t('teams.removeMember')}: ${member}`}
                  onClick={() => removeMember(index)}
                >
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <Input
            aria-label={t('teams.memberNameLabel')}
            value={memberDraft}
            onChange={(e) => setMemberDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addMember()
              }
            }}
            className="h-11 flex-1"
          />
          <Button type="button" variant="secondary" onClick={addMember}>
            <Plus aria-hidden />
            {t('teams.addMember')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <h3 className="text-sm font-semibold text-ink">{t('teams.projectHeading')}</h3>

        <Field id={`${idPrefix}-project-name`} label={t('teams.projectNameLabel')} optional>
          <Input
            id={`${idPrefix}-project-name`}
            value={value.projectName}
            onChange={(e) => setValue((prev) => ({ ...prev, projectName: e.target.value }))}
          />
        </Field>

        <Field
          id={`${idPrefix}-project-description`}
          label={t('teams.projectDescriptionLabel')}
          optional
          error={teamFieldErrorMessage(t, errors.description)}
        >
          <Textarea
            id={`${idPrefix}-project-description`}
            value={value.projectDescription}
            aria-describedby={describedBy(`${idPrefix}-project-description`, {
              error: errors.description,
            })}
            aria-invalid={Boolean(errors.description)}
            onChange={(e) => setValue((prev) => ({ ...prev, projectDescription: e.target.value }))}
          />
        </Field>

        <Field id={`${idPrefix}-theme`} label={t('teams.themeLabel')} optional>
          <Select
            id={`${idPrefix}-theme`}
            value={value.themeId}
            onChange={(e) => setValue((prev) => ({ ...prev, themeId: e.target.value }))}
          >
            <option value="">{t('teams.themeNone')}</option>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id={`${idPrefix}-repo-url`}
          label={t('teams.repoUrlLabel')}
          optional
          hint={t('teams.repoUrlHint')}
          error={teamFieldErrorMessage(t, errors.repoUrl)}
        >
          <Input
            id={`${idPrefix}-repo-url`}
            // Not type="url": that triggers the browser's own constraint validation,
            // which silently blocks the submit event entirely for an invalid value --
            // never reaching our own (translated, schema-backed) error message below.
            type="text"
            inputMode="url"
            placeholder="https://github.com/..."
            value={value.repoUrl}
            aria-describedby={describedBy(`${idPrefix}-repo-url`, {
              hint: t('teams.repoUrlHint'),
              error: errors.repoUrl,
            })}
            aria-invalid={Boolean(errors.repoUrl)}
            onChange={(e) => setValue((prev) => ({ ...prev, repoUrl: e.target.value }))}
          />
        </Field>
      </div>

      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  )
}
