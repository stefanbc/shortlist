import { expect, test } from '@playwright/test'
import { serviceClient } from '../tests/integration/helpers'
import { loginAsAdmin, openJurorLink, setLang } from './helpers'
import { readSeed, resetScores } from './seed'

const seed = readSeed()
const beta = seed.teams.find((t) => t.name === 'Team Beta')!

test('weight change while the event is open asks for confirmation, and the ranking changes', async ({
  page,
}) => {
  // Independent of whatever juror-scoring.spec.ts has tapped: put both teams' scores back
  // to the seeded baseline (Team Beta leads) before reading "before".
  await resetScores(serviceClient(), seed)

  await loginAsAdmin(page, seed)
  const ranking = page.getByRole('list', { name: 'Live ranking' })
  await expect(ranking.getByRole('listitem').first()).toContainText('Team Beta')

  await page.goto(`/admin/events/${seed.event.id}/criteria`)
  await page.getByLabel('Weight: Impact').fill('500')
  await page.getByLabel('Weight: Impact').blur()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Recalculate scores?')
  await dialog.getByRole('button', { name: 'Confirm' }).click()
  await expect(dialog).toBeHidden()

  await page.goto('/admin')
  // Impact's weight swing (10 -> 500) is large enough to flip the order: Team Alpha scores
  // high on Impact and low elsewhere, Team Beta the opposite (see e2e/seed.ts).
  await expect(ranking.getByRole('listitem').first()).toContainText('Team Alpha')
})

test('setting who is pitching prompts an already-open juror to switch', async ({ page, browser }) => {
  await loginAsAdmin(page, seed)

  const jurorContext = await browser.newContext()
  try {
    const jurorPage = await jurorContext.newPage()
    await openJurorLink(jurorPage, seed.jurors[0].linkPath)
    await expect(jurorPage.getByRole('list', { name: 'Your teams' })).toBeVisible()

    await page.getByLabel('Team on stage').selectOption({ label: 'Team Beta' })
    await expect(page.getByLabel('Team on stage')).toHaveValue(beta.id)

    const dialog = jurorPage.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Team Beta is now pitching')
    await dialog.getByRole('button', { name: 'Switch' }).click()

    await expect(jurorPage).toHaveURL(new RegExp(`/score/${seed.event.id}/${beta.id}$`))
  } finally {
    await jurorContext.close()
  }
})

for (const lang of ['en', 'ro'] as const) {
  test(`no horizontal scroll at 360px on the admin dashboard (${lang})`, async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      // loginAsAdmin's locators are English text, so sign in before switching language
      // (login itself isn't part of what this test checks) and reload to pick it up.
      await loginAsAdmin(page, seed)
      await setLang(page, lang)
      await page.reload()
      await page.setViewportSize({ width: 360, height: 800 })
      // Let the resize's reflow (and any in-flight layout animation) settle before measuring.
      await page.waitForTimeout(300)
      const fits = await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      )
      expect(fits).toBe(true)
    } finally {
      await context.close()
    }
  })
}
