import { expect, test, type Page } from '@playwright/test'
import { loginAsAdmin, openJurorLink, setLang } from './helpers'
import { readSeed } from './seed'

const seed = readSeed()
const alpha = seed.teams.find((t) => t.name === 'Team Alpha')!
const beta = seed.teams.find((t) => t.name === 'Team Beta')!
const criteriaByPosition = [...seed.criteria].sort((a, b) => a.position - b.position)

/** Waits for the given criterion to be the one on screen, then taps its `value` button. */
async function scoreCurrentCriterion(page: Page, criterionName: string, value: number): Promise<void> {
  await expect(page.getByRole('heading', { name: criterionName, exact: true })).toBeVisible()
  await page
    .getByRole('group', { name: `Score for ${criterionName}` })
    .getByRole('button', { name: String(value), exact: true })
    .click()
}

test('juror scores a team via their personal link, and values survive a reload', async ({ page }) => {
  await openJurorLink(page, seed.jurors[0].linkPath)
  await page.goto(`/score/${seed.event.id}/${alpha.id}`)

  for (const criterion of criteriaByPosition) {
    await scoreCurrentCriterion(page, criterion.name, 4)
  }

  await expect(page.getByRole('img', { name: '3 of 3 criteria scored' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('All saved')

  await page.reload()

  await expect(page.getByRole('img', { name: '3 of 3 criteria scored' })).toBeVisible()
  // Only the criterion currently on screen has its score-buttons group in the DOM (the
  // phone layout shows one at a time), so step through them with the card's own nav.
  for (const [index, criterion] of criteriaByPosition.entries()) {
    if (index > 0) await page.getByRole('button', { name: 'Next criterion' }).click()
    await expect(page.getByRole('heading', { name: criterion.name, exact: true })).toBeVisible()
    await expect(
      page.getByRole('group', { name: `Score for ${criterion.name}` }).getByRole('button', {
        name: '4',
        exact: true,
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  }
})

test('offline taps sync once back online, and the admin sees the score', async ({ page, browser }) => {
  await openJurorLink(page, seed.jurors[1].linkPath)
  await page.goto(`/score/${seed.event.id}/${beta.id}`)
  await expect(page.getByRole('heading', { name: 'Impact', exact: true })).toBeVisible()

  await page.context().setOffline(true)
  await page
    .getByRole('group', { name: 'Score for Impact' })
    .getByRole('button', { name: '2.5', exact: true })
    .click()

  await expect(page.getByRole('status')).toContainText('Offline: 1 waiting')

  await page.context().setOffline(false)
  await expect(page.getByRole('status')).toContainText('All saved')

  const adminContext = await browser.newContext()
  try {
    const adminPage = await adminContext.newPage()
    await loginAsAdmin(adminPage, seed)
    await adminPage.goto(`/admin/events/${seed.event.id}/reports/teams/${beta.id}`)
    const impactRow = adminPage.locator('tbody tr').filter({ hasText: 'Impact' })
    await expect(impactRow).toContainText('2.5')
  } finally {
    await adminContext.close()
  }
})

test('juror cannot open /admin', async ({ page }) => {
  await openJurorLink(page, seed.jurors[0].linkPath)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/score$/)
})

for (const lang of ['en', 'ro'] as const) {
  test(`no horizontal scroll at 360px on the scoring page (${lang})`, async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await setLang(page, lang)
      await openJurorLink(page, seed.jurors[0].linkPath)
      await page.goto(`/score/${seed.event.id}/${alpha.id}`)
      await expect(page.getByRole('heading', { name: 'Impact', exact: true })).toBeVisible()
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
