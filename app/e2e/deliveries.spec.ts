import { test, expect } from '@playwright/test'
import { fillControl, gotoReady, uniqueLabel } from './helpers/auth'
import { cleanupCreatedRow, idFromInsertResponse } from './helpers/cleanup'

test.describe('deliveries', () => {
  test('opens deliveries page', async ({ page }) => {
    await gotoReady(page, '/deliveries', 'تسليمات الشون')
    await expect(page.getByRole('button', { name: 'تسجيل تسليم' })).toBeVisible()
  })

  test('creates a delivery and shows it in the list', async ({ page, request }) => {
    const supplierName = uniqueLabel('00-e2e-مورد-تسليم')
    const warehouseName = uniqueLabel('00-e2e-شونة-تسليم')
    const notes = uniqueLabel('delivery-e2e')
    let supplierId: string | null = null
    let warehouseId: string | null = null
    let deliveryId: string | null = null
    let supplierResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined
    let warehouseResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined
    let deliveryResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined

    try {
      await gotoReady(page, '/suppliers', 'الموردون')
      await page.getByRole('button', { name: 'إضافة مورد' }).click()
      const supplierDialog = page.getByRole('dialog')
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

      await gotoReady(page, '/warehouses', 'الشون')
      await page.getByRole('button', { name: 'إضافة شونة' }).click()
      const warehouseDialog = page.getByRole('dialog')
      await fillControl(warehouseDialog.getByRole('textbox', { name: /الاسم/ }), warehouseName)
      const warehouseSave = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/warehouses') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await warehouseDialog.getByRole('button', { name: 'حفظ' }).click()
      warehouseResponse = await warehouseSave
      expect(warehouseResponse.ok()).toBeTruthy()
      warehouseId = await idFromInsertResponse(warehouseResponse)
      await expect(warehouseDialog).toBeHidden({ timeout: 20_000 })

      await gotoReady(page, '/deliveries', 'تسليمات الشون')
      await page.getByRole('button', { name: 'تسجيل تسليم' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const pickOption = async (label: string) => {
        const option = page.getByRole('option', { name: label })
        if (await option.count()) {
          await option.click()
        } else {
          await page.getByText(label, { exact: true }).first().click()
        }
      }

      const selects = dialog.locator('button').filter({ hasText: /.+/ })
      if (await selects.count()) {
        await selects.nth(0).click()
        await pickOption(supplierName)
        await selects.nth(1).click()
        await pickOption(warehouseName)
      }

      await fillControl(dialog.locator('input[placeholder*="170.5"]'), '170')
      await fillControl(dialog.getByRole('textbox', { name: /ملاحظات/ }), notes)
      await expect(dialog.getByText(/الأردب المحسوب/)).toContainText(/[1١]/)

      const deliverySave = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/warehouse_deliveries') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await dialog.getByRole('button', { name: 'حفظ' }).click()
      deliveryResponse = await deliverySave
      expect(deliveryResponse.ok(), `delivery insert failed: ${deliveryResponse.status()}`).toBeTruthy()
      deliveryId = await idFromInsertResponse(deliveryResponse)

      await expect(dialog).toBeHidden({ timeout: 20_000 })
      await page.getByPlaceholder('بحث بالمورد أو الشونة أو السيارة...').fill(notes)
      await expect(page.getByText(supplierName, { exact: true })).toBeVisible({ timeout: 20_000 })
    } finally {
      await cleanupCreatedRow(request, 'warehouse_deliveries', {
        id: deliveryId,
        notes,
        page,
        createResponse: deliveryResponse
      })
      await cleanupCreatedRow(request, 'warehouses', {
        id: warehouseId,
        name: warehouseName,
        page,
        createResponse: warehouseResponse
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
