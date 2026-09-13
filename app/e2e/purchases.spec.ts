import { test, expect } from '@playwright/test'
import { fillControl, gotoReady, uniqueLabel } from './helpers/auth'
import { cleanupCreatedRow, idFromInsertResponse } from './helpers/cleanup'

test.describe('purchases', () => {
  test('opens purchases page', async ({ page }) => {
    await gotoReady(page, '/purchases', 'المشتريات')
    await expect(page.getByRole('button', { name: 'تسجيل شراء' })).toBeVisible()
  })

  test('creates a purchase and shows it in the list', async ({ page, request }) => {
    // Prefix so this supplier sorts first and is auto-selected in the purchase form
    const supplierName = uniqueLabel('00-e2e-مورد')
    const notes = uniqueLabel('purchase-e2e')
    let supplierId: string | null = null
    let purchaseId: string | null = null
    let supplierResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined
    let purchaseResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined

    try {
      await gotoReady(page, '/suppliers', 'الموردون')
      await page.getByRole('button', { name: 'إضافة مورد' }).click()
      const supplierDialog = page.getByRole('dialog')
      await expect(supplierDialog).toBeVisible()
      await fillControl(supplierDialog.getByRole('textbox', { name: /الاسم/ }), supplierName)
      const supplierSave = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/suppliers') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await supplierDialog.getByRole('button', { name: 'حفظ' }).click()
      supplierResponse = await supplierSave
      expect(supplierResponse.ok()).toBeTruthy()
      supplierId = await idFromInsertResponse(supplierResponse)
      await expect(supplierDialog).toBeHidden({ timeout: 20_000 })

      await gotoReady(page, '/purchases', 'المشتريات')
      await page.getByRole('button', { name: 'تسجيل شراء' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const selectTrigger = dialog.locator('button').filter({ hasText: /.+/ }).first()
      if (await selectTrigger.isVisible()) {
        await selectTrigger.click()
        const option = page.getByRole('option', { name: supplierName })
        if (await option.count()) {
          await option.click()
        } else {
          await page.getByText(supplierName, { exact: true }).first().click()
        }
      }

      await fillControl(dialog.locator('input[placeholder*="170.5"]'), '170')
      await fillControl(dialog.locator('input[placeholder*="5250"]'), '100')
      await fillControl(dialog.getByRole('textbox', { name: /ملاحظات/ }), notes)

      // UI formats with ar-EG digits (١ not 1)
      await expect(dialog.getByText(/الأردب المحسوب/)).toContainText(/[1١]/)
      await expect(dialog.getByText(/إجمالي الثمن/)).toContainText(/100|١٠٠/)

      const purchaseSave = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/purchases') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await dialog.getByRole('button', { name: 'حفظ' }).click()
      purchaseResponse = await purchaseSave
      expect(purchaseResponse.ok(), `purchase insert failed: ${purchaseResponse.status()}`).toBeTruthy()
      purchaseId = await idFromInsertResponse(purchaseResponse)

      await expect(dialog).toBeHidden({ timeout: 20_000 })
      await page.getByPlaceholder('بحث بالمورد أو الملاحظات...').fill(notes)
      await expect(page.getByRole('cell', { name: supplierName, exact: true })).toBeVisible({ timeout: 20_000 })
    } finally {
      await cleanupCreatedRow(request, 'purchases', {
        id: purchaseId,
        notes,
        page,
        createResponse: purchaseResponse
      })
      await cleanupCreatedRow(request, 'suppliers', {
        id: supplierId,
        name: supplierName,
        page,
        createResponse: supplierResponse
      })
    }
  })
})
