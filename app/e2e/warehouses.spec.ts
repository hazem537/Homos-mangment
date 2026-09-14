import { test, expect } from '@playwright/test'
import { fillControl, gotoReady, uniqueLabel } from './helpers/auth'
import { cleanupCreatedRow, deleteByFilter, idFromInsertResponse, resolveAccessToken } from './helpers/cleanup'

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

      await fillControl(dialog.getByPlaceholder(/شونة/), name)
      await fillControl(dialog.getByRole('textbox', { name: /ملاحظات/ }), 'ملاحظة شونة e2e')

      const saveResponse = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/warehouses') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      const balancesReload = page.waitForResponse(
        (r) =>
          r.url().includes('/rpc/warehouse_balances')
          && r.request().method() === 'POST'
          && r.ok(),
        { timeout: 20_000 }
      )
      await dialog.getByRole('button', { name: 'حفظ' }).click()
      createResponse = await saveResponse
      expect(createResponse.ok(), `warehouse insert failed: ${createResponse.status()}`).toBeTruthy()
      createdId = await idFromInsertResponse(createResponse)

      await expect(dialog).toBeHidden({ timeout: 20_000 })
      await balancesReload

      // Cell also shows notes under the name — don't use exact:true on full cell text
      const row = page.getByRole('row').filter({ hasText: name })
      await expect(row).toBeVisible({ timeout: 20_000 })

      await fillControl(page.getByPlaceholder('بحث بالاسم...'), name)
      await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible({
        timeout: 10_000
      })
    } finally {
      await cleanupCreatedRow(request, 'warehouses', {
        id: createdId,
        name,
        page,
        createResponse
      })
    }
  })

  test('warehouse detail shows عام section and can add ربع', async ({ page, request }) => {
    const warehouseName = uniqueLabel('شونة-e2e')
    const sectionName = uniqueLabel('ربع-e2e')
    let warehouseId: string | null = null
    let warehouseResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined
    let sectionId: string | null = null

    try {
      await gotoReady(page, '/warehouses', 'الشون')
      await page.getByRole('button', { name: 'إضافة شونة' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await fillControl(dialog.getByPlaceholder(/شونة/), warehouseName)

      const saveResponse = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/warehouses') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      const balancesReload = page.waitForResponse(
        (r) =>
          r.url().includes('/rpc/warehouse_balances')
          && r.request().method() === 'POST'
          && r.ok(),
        { timeout: 20_000 }
      )
      await dialog.getByRole('button', { name: 'حفظ' }).click()
      warehouseResponse = await saveResponse
      expect(warehouseResponse.ok()).toBeTruthy()
      warehouseId = await idFromInsertResponse(warehouseResponse)
      await expect(dialog).toBeHidden({ timeout: 20_000 })
      await balancesReload

      const row = page.getByRole('row').filter({ hasText: warehouseName })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await row.getByRole('link', { name: warehouseName }).click()

      await expect(page.getByRole('heading', { name: warehouseName })).toBeVisible({
        timeout: 20_000
      })
      await expect(page.getByRole('heading', { name: 'عام' })).toBeVisible({
        timeout: 20_000
      })

      await page.getByRole('button', { name: 'إضافة ربع' }).click()
      const sectionDialog = page.getByRole('dialog')
      await expect(sectionDialog).toBeVisible()
      await fillControl(sectionDialog.getByPlaceholder(/ربع/), sectionName)

      const sectionSave = page.waitForResponse(
        (r) =>
          r.url().includes('/rest/v1/warehouse_sections')
          && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      const sectionBalances = page.waitForResponse(
        (r) =>
          r.url().includes('/rpc/section_balances')
          && r.request().method() === 'POST'
          && r.ok(),
        { timeout: 20_000 }
      )
      await sectionDialog.getByRole('button', { name: 'حفظ' }).click()
      const sectionRes = await sectionSave
      expect(sectionRes.ok()).toBeTruthy()
      sectionId = await idFromInsertResponse(sectionRes)
      await expect(sectionDialog).toBeHidden({ timeout: 20_000 })
      await sectionBalances

      await expect(page.getByRole('heading', { name: sectionName })).toBeVisible({
        timeout: 20_000
      })
      await expect(page.getByText('الوارد إلى الربع').first()).toBeVisible()
      await expect(page.getByText('المنصرف من الربع').first()).toBeVisible()
    } finally {
      const token = await resolveAccessToken({
        page,
        createResponse: warehouseResponse
      }).catch(() => null)

      if (token && sectionId) {
        await deleteByFilter(
          request,
          'warehouse_sections',
          `id=eq.${sectionId}`,
          token
        ).catch(() => undefined)
      }
      if (token && warehouseId) {
        await deleteByFilter(
          request,
          'warehouse_sections',
          `warehouse_id=eq.${warehouseId}`,
          token
        ).catch(() => undefined)
      }

      await cleanupCreatedRow(request, 'warehouses', {
        id: warehouseId,
        name: warehouseName,
        page,
        createResponse: warehouseResponse
      }).catch(() => undefined)
    }
  })
})
