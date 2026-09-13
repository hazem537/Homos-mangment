import { test, expect } from '@playwright/test'
import { fillControl, gotoReady } from './helpers/auth'
import { cleanupCreatedRow, idFromInsertResponse } from './helpers/cleanup'

test.describe('seasons', () => {
  test('opens seasons page', async ({ page }) => {
    await gotoReady(page, '/settings/seasons', 'المواسم ومعامل الأردب')
    await expect(page.getByRole('button', { name: 'إضافة موسم' })).toBeVisible()
  })

  test('creates a season without activating it', async ({ page, request }) => {
    const year = 2100 + Math.floor(Math.random() * 800)
    const name = `موسم اختبار ${year}`
    let createdId: string | null = null
    let createResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined

    try {
      await gotoReady(page, '/settings/seasons', 'المواسم ومعامل الأردب')

      await page.getByRole('button', { name: 'إضافة موسم' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await fillControl(dialog.getByRole('textbox', { name: /الاسم/ }), name)
      await fillControl(dialog.getByRole('textbox', { name: /السنة/ }), String(year))
      await fillControl(dialog.getByRole('textbox', { name: /معامل الأردب/ }), '170')

      const saveResponse = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/seasons') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await dialog.getByRole('button', { name: 'حفظ' }).click()
      createResponse = await saveResponse
      expect(createResponse.ok(), `season insert failed: ${createResponse.status()}`).toBeTruthy()
      createdId = await idFromInsertResponse(createResponse)

      await expect(dialog).toBeHidden({ timeout: 20_000 })
      await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(String(year), { exact: true })).toBeVisible()
    } finally {
      await cleanupCreatedRow(request, 'seasons', {
        id: createdId,
        name,
        page,
        createResponse
      })
    }
  })
})
