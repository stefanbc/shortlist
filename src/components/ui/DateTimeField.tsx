import { CalendarDays } from 'lucide-react'
import DateTimePicker from 'react-datetime-picker'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

type DateTimeFieldProps = {
  id?: string
  /** What the field is ("Starts"): names each part for assistive technology. */
  label: string
  /** Local date-time in `YYYY-MM-DDTHH:mm` form, or '' when empty. */
  value: string
  onChange(value: string): void
  className?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

function pad(part: number): string {
  return String(part).padStart(2, '0')
}

/** A Date as the local `YYYY-MM-DDTHH:mm` the forms store. */
function toLocalValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalValue(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Date and time, typed part by part or picked from a calendar. The same control in
 * every browser, in the interface's language and date order. Use inside a
 * `<Field labelAs="text">`: the parts are labelled individually. */
export function DateTimeField({ id, label, value, onChange, className, ...aria }: DateTimeFieldProps) {
  const { t, i18n } = useTranslation()
  const part = (name: 'day' | 'month' | 'year' | 'hour' | 'minute') =>
    `${label}: ${t(`common.date.${name}`)}`

  return (
    <div
      role="group"
      aria-describedby={aria['aria-describedby']}
      data-invalid={aria['aria-invalid'] || undefined}
      className={cn('date-time-field', className)}
    >
      <DateTimePicker
        id={id}
        value={fromLocalValue(value)}
        onChange={(next) => onChange(next instanceof Date ? toLocalValue(next) : '')}
        locale={i18n.language}
        // 24-hour time in both languages: no AM/PM picker to fumble, and nothing to misread.
        format={i18n.language.startsWith('ro') ? 'dd.MM.y HH:mm' : 'MM/dd/y HH:mm'}
        disableClock
        clearIcon={null}
        calendarIcon={<CalendarDays aria-hidden className="size-5" />}
        calendarAriaLabel={`${label}: ${t('common.date.openCalendar')}`}
        nativeInputAriaLabel={label}
        dayAriaLabel={part('day')}
        monthAriaLabel={part('month')}
        yearAriaLabel={part('year')}
        hourAriaLabel={part('hour')}
        minuteAriaLabel={part('minute')}
        calendarProps={{ minDetail: 'year', prev2Label: null, next2Label: null }}
      />
    </div>
  )
}
