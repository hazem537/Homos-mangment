import { test, expect } from '@playwright/test'

const username = process.env.E2E_USERNAME || 'e2e'
const password = process.env.E2E_PASSWORD || ''

test.describe('login', () => {
  test('shows Arabic login screen', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible()
  })

  test('rejects wrong password with Arabic error', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible({ timeout: 30_000 })
    await page.locator('input[autocomplete="username"]').fill(username)
    await page.locator('input[autocomplete="current-password"]').fill('wrong-password-xyz')
    await page.getByRole('button', { name: 'دخول' }).click()
    await expect(page.getByText('بيانات الدخول غير صحيحة')).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('logs in with valid credentials and opens dashboard', async ({ page }) => {
    test.skip(!password, 'Set E2E_PASSWORD in .env.e2e')

    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'دخول' })).toBeVisible({ timeout: 30_000 })
    await page.locator('input[autocomplete="username"]').fill(username)
    await page.locator('input[autocomplete="current-password"]').fill(password)
    await page.getByRole('button', { name: 'دخول' }).click()

    await expect(page).toHaveURL('/', { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'لوحة التحكم' })).toBeVisible({ timeout: 30_000 })
  })
})
