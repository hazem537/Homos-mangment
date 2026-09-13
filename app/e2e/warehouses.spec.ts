import { test, expect } from '@playwright/test'
import { fillControl, gotoReady, uniqueLabel } from './helpers/auth'
import { cleanupCreatedRow, idFromInsertResponse } from './helpers/cleanup'

test.describe('warehouses', () => {
  test('opens warehouses page', async ({ page }) => {
    await gotoReady(page, '/warehouses', 'الشون')
    await expect(page.getByRole('button', { name: 'إضافة شونة' })).toBeVisible()
  })

  test('creates a warehouse and shows it in the list', async ({ page, request }) => {
    const name = uniqueLabel('شونة-e2e')
    let createdId: string | null = null
    let createResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined

    try {
      await gotoReady(page, '/warehouses', 'الشون')

      await page.getByRole('button', { name: 'إضافة شونة' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      await fillControl(dialog.getByRole('textbox', { name: /الاسم/ }), name)
      await fillControl(dialog.getByRole('textbox', { name: /ملاحظات/ }), 'ملاحظة شونة e2e')

      const saveResponse = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/warehouses') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await dialog.getByRole('button', { name: 'حفظ' }).click()
      createResponse = await saveResponse
      expect(createResponse.ok(), `warehouse insert failed: ${createResponse.status()}`).toBeTruthy()
      createdId = await idFromInsertResponse(createResponse)

      await expect(dialog).toBeHidden({ timeout: 20_000 })
      await page.getByPlaceholder('بحث بالاسم...').fill(name)
      await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 20_000 })
    } finally {
      await cleanupCreatedRow(request, 'warehouses', {
        id: createdId,
        name,
        page,
        createResponse
      })
    }
  })
})
