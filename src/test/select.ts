import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** Opens one of the app's dropdowns (see components/ui/Select) and picks the option
 * with this visible label, the way a person does. */
export async function chooseOption(user: UserEvent, trigger: HTMLElement, label: string | RegExp) {
  await user.click(trigger)
  await user.click(await screen.findByRole('option', { name: label }))
}
