// Small shared bits for the two spec files: setting the UI language the same way the
// preferences menu does, signing in as the seeded admin, and opening a juror's link.
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import type { SeedData } from './seed'

/** Mirrors zustand's persist middleware (`src/stores/preferences.ts`): `{state, version}`,
 * version 0 (the store's default). Set before navigation so the page never starts in the
 * other language and then switches. */
export async function setLang(page: Page, lang: 'ro' | 'en'): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('shortlist.prefs', JSON.stringify({ state: { theme: 'system', lang: value }, version: 0 }))
  }, lang)
}

/** Signs in on /login with the seeded admin's password and waits for the dashboard.
 * Signing in doesn't itself navigate anywhere (the admin is expected to already be headed
 * somewhere, e.g. a bookmark), so this goes to /admin itself once the session is up. */
export async function loginAsAdmin(page: Page, seed: SeedData): Promise<void> {
  await page.goto('/login')
  // getByLabel also matches the tabpanel itself (aria-labelledby points to the same tab
  // trigger text), so scope to the actual form control by role instead.
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(seed.admin.email)
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill(seed.admin.password)
  const signIn = page.getByRole('button', { name: 'Sign in' })
  await signIn.click()
  // The button disables itself (aria-busy) while signInWithPassword is in flight, and
  // re-enables once it settles -- the signal that the session (success or failure) is
  // ready, since the form itself never navigates away on success.
  await expect(signIn).toBeDisabled()
  await expect(signIn).toBeEnabled()
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin$/)
}

/** Opens a juror's personal link and waits for the redeem redirect to land on /score. */
export async function openJurorLink(page: Page, linkPath: string): Promise<void> {
  await page.goto(linkPath)
  await expect(page).toHaveURL(/\/score$/)
}
