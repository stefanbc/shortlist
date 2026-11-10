import { useTranslation } from 'react-i18next'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { Field } from '@/components/ui/Field'
import { describedBy } from '@/components/ui/fieldStyles'
import { Input } from '@/components/ui/Input'
import { eventFieldErrorMessage, type EventFormErrors } from './api'

export type EventFormFieldsValue = {
  name: string
  startsAt: string
  endsAt: string
  pitchMinutes?: string
}

type EventFormFieldsProps<T extends EventFormFieldsValue> = {
  /** Prefixes each input's id so the settings form and the two create dialogs — which can
   * all exist in the DOM at once — never collide. */
  idPrefix: string
  form: T
  errors: EventFormErrors
  setForm(updater: (form: T) => T): void
  /** The copy-from form has no pitch length (`copy_event_setup` doesn't take one). */
  showPitchMinutes?: boolean
}

/** Name/dates(/pitch length) fields shared by the settings form and the blank- and
 * copy-from create-event dialogs. */
export function EventFormFields<T extends EventFormFieldsValue>({
  idPrefix,
  form,
  errors,
  setForm,
  showPitchMinutes = true,
}: EventFormFieldsProps<T>) {
  const { t } = useTranslation()
  const fieldError = (code: typeof errors.name) => eventFieldErrorMessage(t, code)

  return (
    <>
      <Field id={`${idPrefix}-name`} label={t('events.nameLabel')} error={fieldError(errors.name)}>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          aria-describedby={describedBy(`${idPrefix}-name`, { error: errors.name })}
          aria-invalid={Boolean(errors.name)}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${idPrefix}-starts`}
          label={t('events.startsAtLabel')}
          error={fieldError(errors.startsAt)}
        >
          <DateTimeField
            id={`${idPrefix}-starts`}
            value={form.startsAt}
            aria-describedby={describedBy(`${idPrefix}-starts`, { error: errors.startsAt })}
            aria-invalid={Boolean(errors.startsAt)}
            onChange={(value) => setForm((prev) => ({ ...prev, startsAt: value }))}
          />
        </Field>
        <Field id={`${idPrefix}-ends`} label={t('events.endsAtLabel')} error={fieldError(errors.endsAt)}>
          <DateTimeField
            id={`${idPrefix}-ends`}
            value={form.endsAt}
            aria-describedby={describedBy(`${idPrefix}-ends`, { error: errors.endsAt })}
            aria-invalid={Boolean(errors.endsAt)}
            onChange={(value) => setForm((prev) => ({ ...prev, endsAt: value }))}
          />
        </Field>
      </div>

      {showPitchMinutes && (
        <Field
          id={`${idPrefix}-pitch-minutes`}
          label={t('events.pitchMinutesLabel')}
          error={fieldError(errors.pitchMinutes)}
          className="max-w-xs"
        >
          <Input
            id={`${idPrefix}-pitch-minutes`}
            type="number"
            min={1}
            max={60}
            value={form.pitchMinutes ?? ''}
            aria-describedby={describedBy(`${idPrefix}-pitch-minutes`, { error: errors.pitchMinutes })}
            aria-invalid={Boolean(errors.pitchMinutes)}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, pitchMinutes: e.target.value }) as T)
            }
          />
        </Field>
      )}
    </>
  )
}
