import { expect, type Page } from '@playwright/test'

const username = process.env.E2E_USERNAME || 'e2e'
const password = process.env.E2E_PASSWORD || ''

export function requireE2ePassword() {
  if (!password) {
    throw new Error('Set E2E_PASSWORD in .env.e2e')
  }
  return { username, password }
}

export async function loginAsE2eUser(page: Page) {
  const creds = requireE2ePassword()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible({ timeout: 30_000 })
  await page.locator('input[autocomplete="username"]').fill(creds.username)
  await page.locator('input[autocomplete="current-password"]').fill(creds.password)
  await page.getByRole('button', { name: 'دخول' }).click()
  await expect(page).toHaveURL('/', { timeout: 30_000 })
}

/** Navigate and wait until the SPA heading is actually rendered. */
export async function gotoReady(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  // Session may have expired — recover once
  if (page.url().includes('/login')) {
    await loginAsE2eUser(page)
    await page.goto(path, { waitUntil: 'domcontentloaded' })
  }
  await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('جاري التحميل...')).toHaveCount(0, { timeout: 30_000 })
}

/** Fill Nuxt UI / Vue inputs reliably (DOM fill alone can miss v-model). */
export async function fillControl(locator: ReturnType<Page['locator']>, value: string) {
  await locator.click()
  await locator.fill('')
  await locator.pressSequentially(value, { delay: 15 })
  await locator.blur()
}

/** Unique Arabic-safe label for CRUD tests (avoids unique-index clashes). */
export function uniqueLabel(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}
