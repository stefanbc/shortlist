import * as RadixSelect from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { controlClasses } from './fieldStyles'

/** Radix reserves the empty string for "nothing chosen", but lists here do offer an
 * empty choice ("No theme", "Choose a juror"), so '' travels through under this name. */
const EMPTY = '__empty__'

type OptionProps = { value?: string; disabled?: boolean; children?: ReactNode }

type SelectProps = {
  value: string
  onValueChange(value: string): void
  /** `<option value="…">Label</option>` elements, as for a native select. */
  children: ReactNode
  id?: string
  disabled?: boolean
  /** Sizes and places the trigger (width, flex). */
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/** A dropdown list: styled like the other controls, with a keyboard-friendly popup that
 * behaves the same in every browser. Written like a native select so call sites stay
 * plain: a `value`, `<option>` children and `onValueChange`. */
export function Select({
  value,
  onValueChange,
  children,
  id,
  disabled,
  className,
  ...aria
}: SelectProps) {
  const options = Children.toArray(children).filter(
    (child): child is ReactElement<OptionProps> => isValidElement(child) && child.type === 'option',
  )

  return (
    <RadixSelect.Root
      value={value === '' ? EMPTY : value}
      onValueChange={(next) => onValueChange(next === EMPTY ? '' : next)}
      disabled={disabled}
    >
      <RadixSelect.Trigger
        id={id}
        {...aria}
        className={cn(
          controlClasses,
          'flex h-11 items-center justify-between gap-2 text-left',
          'data-[placeholder]:text-ink-faint data-[state=open]:ring-2 data-[state=open]:ring-ring',
          className,
        )}
      >
        <span className="min-w-0 truncate">
          <RadixSelect.Value />
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-faint" />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>

      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-[70] max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-card border border-line bg-surface text-ink shadow-pop',
            'data-[state=open]:animate-fade-in',
          )}
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((option) => {
              const optionValue = option.props.value ?? ''
              return (
                <RadixSelect.Item
                  key={optionValue}
                  value={optionValue === '' ? EMPTY : optionValue}
                  disabled={option.props.disabled}
                  className={cn(
                    'relative flex min-h-10 cursor-pointer items-center rounded-[0.25rem] py-2 pr-9 pl-3 text-[0.95rem] outline-none select-none',
                    'data-[highlighted]:bg-raised data-[state=checked]:font-semibold',
                    'data-[disabled]:pointer-events-none data-[disabled]:text-ink-faint',
                    optionValue === '' && 'text-ink-muted',
                  )}
                >
                  <RadixSelect.ItemText>{option.props.children}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="absolute right-3">
                    <Check aria-hidden className="size-4" />
                  </RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              )
            })}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
