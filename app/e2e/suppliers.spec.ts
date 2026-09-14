import { test, expect } from '@playwright/test'
import { fillControl, gotoReady, uniqueLabel } from './helpers/auth'
import { cleanupCreatedRow, idFromInsertResponse } from './helpers/cleanup'

test.describe('suppliers', () => {
  test('opens suppliers page', async ({ page }) => {
    await gotoReady(page, '/suppliers', 'الموردون')
    await expect(page.getByRole('button', { name: 'إضافة مورد' })).toBeVisible()
  })

  test('creates a supplier and shows it in the list', async ({ page, request }) => {
    const name = uniqueLabel('مورد-e2e')
    let createdId: string | null = null
    let createResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined

    try {
      await gotoReady(page, '/suppliers', 'الموردون')

      await page.getByRole('button', { name: 'إضافة مورد' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await fillControl(dialog.getByRole('textbox', { name: /الاسم/ }), name)
      await fillControl(dialog.getByRole('textbox', { name: /ملاحظات/ }), 'ملاحظة اختبار e2e')

      const saveResponse = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/suppliers') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await dialog.getByRole('button', { name: 'حفظ' }).click()
      createResponse = await saveResponse
      expect(createResponse.ok(), `supplier insert failed: ${createResponse.status()}`).toBeTruthy()
      createdId = await idFromInsertResponse(createResponse)

      await expect(dialog).toBeHidden({ timeout: 20_000 })
      await fillControl(page.getByPlaceholder('بحث بالاسم...'), name)
      await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible({
        timeout: 20_000
      })
    } finally {
      await cleanupCreatedRow(request, 'suppliers', {
        id: createdId,
        name,
        page,
        createResponse
      })
    }
  })
})
