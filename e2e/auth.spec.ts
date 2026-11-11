import { expect, test } from '@playwright/test'
import { serviceClient } from '../tests/integration/helpers'
import { loginAsAdmin } from './helpers'
import { readSeed } from './seed'

const seed = readSeed()

test('password sign-in lands on the dashboard, and /login then sends the admin back there', async ({
  page,
}) => {
  await loginAsAdmin(page, seed)
  await expect(page.getByRole('list', { name: 'Live ranking' })).toBeVisible()

  await page.goto('/login')
  await expect(page).toHaveURL(/\/admin$/)
})

test('an admin magic link lands on the app root and is routed to the dashboard', async ({
  page,
  baseURL,
}) => {
  // The same link the "Email link" tab sends, minted directly so the test doesn't depend
  // on the mail catcher or the auth email rate limit. Its redirect target is what
  // LoginPage passes as emailRedirectTo: the app root.
  const { data, error } = await serviceClient().auth.admin.generateLink({
    type: 'magiclink',
    email: seed.admin.email,
    options: { redirectTo: `${baseURL}/` },
  })
  expect(error).toBeNull()

  await page.goto(data.properties!.action_link)
  // Auth redirects to `${baseURL}/#access_token=...`; the root must wait for the client to
  // read those tokens rather than bouncing to /login (which would drop them).
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('list', { name: 'Live ranking' })).toBeVisible()
})
