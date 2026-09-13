import { test as setup, expect } from '@playwright/test'
import { loginAsE2eUser, requireE2ePassword } from './helpers/auth'

const authFile = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  requireE2ePassword()
  await loginAsE2eUser(page)
  await expect(page.getByRole('heading', { name: 'لوحة التحكم' })).toBeVisible({ timeout: 30_000 })
  await page.context().storageState({ path: authFile })
})
