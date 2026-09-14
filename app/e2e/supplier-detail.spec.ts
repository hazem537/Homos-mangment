import { test, expect, type Locator, type Page } from '@playwright/test'
import { fillControl, gotoReady, uniqueLabel } from './helpers/auth'
import {
  cleanupCreatedRow,
  deleteByFilter,
  idFromInsertResponse,
  resolveAccessToken
} from './helpers/cleanup'

/** Match formatNumber/fr-FR display (thin spaces → one or more spaces). */
function formattedNumberRe(n: number) {
  const [intPart, dec = '00'] = n.toFixed(2).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\\s+')
  return new RegExp(`${grouped},${dec}`)
}

async function expectStatCard(page: Page, title: string, value: number) {
  const card = page.locator('.min-w-28, .min-w-32, .min-w-36').filter({
    has: page.getByText(title, { exact: true })
  }).first()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText(formattedNumberRe(value))
}

async function expectToast(page: Page, title: string) {
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 15_000 })
}

function panel(page: Page, title: string) {
  return page.locator('section').filter({
    has: page.getByText(title, { exact: true })
  }).first()
}

/** Inline create/edit row — `has` locator must be page-scoped (relative to each tr). */
function inlineRow(page: Page, panelLoc: Locator, placeholder: string) {
  return panelLoc.locator('tbody tr').filter({
    has: page.getByPlaceholder(placeholder, { exact: true })
  }).first()
}

async function fillPlaceholder(root: Locator, placeholder: string, value: string) {
  const input = root.getByPlaceholder(placeholder, { exact: true })
  await expect(input).toBeVisible({ timeout: 15_000 })
  await fillControl(input, value)
}

async function clickInlineSave(row: Locator) {
  await row.locator('td').last().locator('button').first().click()
}

async function openSupplierDetail(page: Page, supplierName: string) {
  await gotoReady(page, '/suppliers', 'الموردون')
  await fillControl(page.getByPlaceholder('بحث بالاسم...'), supplierName)
  const link = page.getByRole('link').filter({ hasText: supplierName }).first()
  await expect(link).toBeVisible({ timeout: 20_000 })
  await link.click()
  await expect(page.getByRole('heading', { name: supplierName })).toBeVisible({
    timeout: 30_000
  })
  await expect(page.getByText('جاري التحميل...')).toHaveCount(0, { timeout: 30_000 })
}

test.describe('supplier detail ledger', () => {
  test('create purchase, transfer, delivery — validations and calculations', async ({
    page,
    request
  }) => {
    const supplierName = uniqueLabel('مورد-كشف-e2e')
    const warehouseName = uniqueLabel('شونة-كشف-e2e')
    const purchaseNotes = uniqueLabel('ledger-purchase-e2e')

    // Read active season ardab factor from dashboard
    await gotoReady(page, '/', 'لوحة التحكم')
    const factorLabel = page.getByText(/معامل الأردب/)
    await expect(factorLabel).toBeVisible({ timeout: 20_000 })
    const factorRaw = await factorLabel.textContent()
    const ardabFactor = Number(factorRaw?.match(/(\d+(?:\.\d+)?)/)?.[1] || 170)
    expect(ardabFactor).toBeGreaterThan(0)

    const purchaseKg = ardabFactor * 10
    const pricePerArdab = 500
    const expectedArdab = 10
    const expectedPurchaseTotal = expectedArdab * pricePerArdab

    const transferOver = expectedPurchaseTotal + 1000
    const transferOk = 2000
    const expectedDueAfterTransfer = expectedPurchaseTotal - transferOk

    const deliveryOverKg = purchaseKg + 100
    const deliveryKg = purchaseKg / 2
    const expectedNolon = Number(((deliveryKg / 1000) * 400).toFixed(2))
    const nathriyat = 100
    const expectedCostAfterDelivery =
      expectedPurchaseTotal + expectedNolon + nathriyat
    const expectedAvgAfterDelivery = Number(
      (expectedCostAfterDelivery / expectedArdab).toFixed(2)
    )

    let supplierId: string | null = null
    let warehouseId: string | null = null
    let supplierResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined
    let warehouseResponse: Awaited<ReturnType<typeof page.waitForResponse>> | undefined

    try {
      // --- warehouse (needed for delivery) ---
      await gotoReady(page, '/warehouses', 'الشون')
      await page.getByRole('button', { name: 'إضافة شونة' }).click()
      const whDialog = page.getByRole('dialog')
      await expect(whDialog).toBeVisible()
      await fillControl(whDialog.getByPlaceholder(/شونة/), warehouseName)
      const whSave = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/warehouses') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      const whBalances = page.waitForResponse(
        (r) =>
          r.url().includes('/rpc/warehouse_balances')
          && r.request().method() === 'POST'
          && r.ok(),
        { timeout: 20_000 }
      )
      await whDialog.getByRole('button', { name: 'حفظ' }).click()
      warehouseResponse = await whSave
      expect(warehouseResponse.ok()).toBeTruthy()
      warehouseId = await idFromInsertResponse(warehouseResponse)
      await expect(whDialog).toBeHidden({ timeout: 20_000 })
      await whBalances

      // --- supplier ---
      await gotoReady(page, '/suppliers', 'الموردون')
      await page.getByRole('button', { name: 'إضافة مورد' }).click()
      const supplierDialog = page.getByRole('dialog')
      await expect(supplierDialog).toBeVisible()
      await fillControl(supplierDialog.getByPlaceholder(/شركة|أحمد|استثمار/), supplierName)
      await fillControl(
        supplierDialog.getByRole('textbox', { name: /ملاحظات/ }),
        purchaseNotes
      )
      const supplierSave = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/suppliers') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await supplierDialog.getByRole('button', { name: 'حفظ' }).click()
      supplierResponse = await supplierSave
      expect(supplierResponse.ok()).toBeTruthy()
      supplierId = await idFromInsertResponse(supplierResponse)
      await expect(supplierDialog).toBeHidden({ timeout: 20_000 })

      await openSupplierDetail(page, supplierName)

      // ========== Purchase ==========
      const purchases = panel(page, 'المشتريات')
      await expect(purchases.getByRole('button', { name: 'إضافة شراء' })).toBeEnabled({
        timeout: 15_000
      })
      await purchases.getByRole('button', { name: 'إضافة شراء' }).click()
      await expect(purchases.getByPlaceholder('كجم', { exact: true })).toBeVisible({
        timeout: 15_000
      })
      const purchaseRow = inlineRow(page, purchases, 'كجم')
      await fillPlaceholder(purchaseRow, 'كجم', String(purchaseKg))
      await fillPlaceholder(purchaseRow, 'سعر', String(pricePerArdab))

      const purchaseInsert = page.waitForResponse(
        (r) => r.url().includes('/rest/v1/purchases') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await clickInlineSave(purchaseRow)
      const purchaseRes = await purchaseInsert
      expect(purchaseRes.ok(), `purchase insert failed: ${purchaseRes.status()}`).toBeTruthy()

      await expectStatCard(page, 'كجم', purchaseKg)
      await expectStatCard(page, 'أردب', expectedArdab)
      await expectStatCard(page, 'التكلفة', expectedPurchaseTotal)
      await expectStatCard(page, 'متوسط الأردب', pricePerArdab)
      await expectStatCard(page, 'آخر سعر', pricePerArdab)
      await expectStatCard(page, 'مستحق المورد', expectedPurchaseTotal)

      // ========== Transfer validation: over due ==========
      const transfers = panel(page, 'التحويلات')
      await transfers.getByRole('button', { name: 'إضافة تحويل' }).click()
      await expect(transfers.getByPlaceholder('مبلغ', { exact: true })).toBeVisible({
        timeout: 15_000
      })
      const transferRow = inlineRow(page, transfers, 'مبلغ')
      await fillPlaceholder(transferRow, 'مبلغ', String(transferOver))
      await clickInlineSave(transferRow)
      await expectToast(page, 'المبلغ أكبر من المستحق')

      // ========== Transfer OK ==========
      await fillPlaceholder(transferRow, 'مبلغ', String(transferOk))
      const transferInsert = page.waitForResponse(
        (r) =>
          r.url().includes('/rest/v1/cash_transfers') && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await clickInlineSave(transferRow)
      const transferRes = await transferInsert
      expect(transferRes.ok(), `transfer insert failed: ${transferRes.status()}`).toBeTruthy()

      await expectStatCard(page, 'إجمالي المدفوع', transferOk)
      await expectStatCard(page, 'مستحق المورد', expectedDueAfterTransfer)

      // ========== Delivery validation: over remaining kg ==========
      const deliveries = panel(page, 'التسليمات')
      await expect(deliveries.getByRole('button', { name: 'إضافة تسليم' })).toBeEnabled({
        timeout: 15_000
      })
      await deliveries.getByRole('button', { name: 'إضافة تسليم' }).click()
      await expect(deliveries.getByPlaceholder('كجم', { exact: true })).toBeVisible({
        timeout: 15_000
      })
      const deliveryRow = inlineRow(page, deliveries, 'كجم')
      await fillPlaceholder(deliveryRow, 'كجم', String(deliveryOverKg))
      await clickInlineSave(deliveryRow)
      await expectToast(page, 'الكمية أكبر من المطلوب استلامه')

      // ========== Delivery validation: paid nolon > nolon total ==========
      await fillPlaceholder(deliveryRow, 'كجم', String(deliveryKg))
      await expect
        .poll(async () => deliveryRow.getByPlaceholder(`×400`).inputValue().catch(() => ''), {
          timeout: 5_000
        })
        .not.toBe('')
      await fillPlaceholder(deliveryRow, '0', String(nathriyat))
      await fillPlaceholder(deliveryRow, 'نولون', String(expectedNolon + 50))
      await fillPlaceholder(deliveryRow, 'نثريات', '0')
      await clickInlineSave(deliveryRow)
      await expectToast(page, 'مدفوع النولون أكبر من الإجمالي')

      // ========== Delivery OK ==========
      await fillPlaceholder(deliveryRow, 'نولون', '100')
      await fillPlaceholder(deliveryRow, 'نثريات', '50')

      await expect(deliveryRow).toContainText(formattedNumberRe(purchaseKg))

      const deliveryInsert = page.waitForResponse(
        (r) =>
          r.url().includes('/rest/v1/warehouse_deliveries')
          && r.request().method() === 'POST',
        { timeout: 20_000 }
      )
      await clickInlineSave(deliveryRow)
      const deliveryRes = await deliveryInsert
      expect(deliveryRes.ok(), `delivery insert failed: ${deliveryRes.status()}`).toBeTruthy()

      await expect(deliveries).toContainText(formattedNumberRe(purchaseKg - deliveryKg))

      await expectStatCard(page, 'التكلفة', expectedCostAfterDelivery)
      await expectStatCard(page, 'متوسط الأردب', expectedAvgAfterDelivery)

      const costNeeded = Number(
        (expectedNolon - 100 + nathriyat - 50).toFixed(2)
      )
      const deliveryDataRow = deliveries.locator('tbody tr').filter({
        has: page.getByText(formattedNumberRe(deliveryKg))
      }).first()
      await expect(deliveryDataRow).toContainText(formattedNumberRe(costNeeded))
      await expect(deliveryDataRow).toContainText('عام')

      // Section balance on warehouse detail
      await gotoReady(page, '/warehouses', 'الشون')
      await fillControl(page.getByPlaceholder('بحث بالاسم...'), warehouseName)
      await page.getByRole('link', { name: warehouseName }).click()
      await expect(page.getByRole('heading', { name: warehouseName })).toBeVisible({
        timeout: 20_000
      })
      await expect(page.getByRole('heading', { name: 'عام' })).toBeVisible({
        timeout: 20_000
      })
      await expect(page.getByText('الوارد إلى الربع').first()).toBeVisible()
      await expect(page.getByText('المنصرف من الربع').first()).toBeVisible()
      await expect(page.getByText(formattedNumberRe(deliveryKg)).first()).toBeVisible({
        timeout: 15_000
      })
    } finally {
      const token = await resolveAccessToken({
        page,
        createResponse: supplierResponse || warehouseResponse
      }).catch(() => null)

      if (token && supplierId) {
        await deleteByFilter(
          request,
          'warehouse_deliveries',
          `supplier_id=eq.${supplierId}`,
          token
        ).catch(() => undefined)
        await deleteByFilter(
          request,
          'cash_transfers',
          `supplier_id=eq.${supplierId}`,
          token
        ).catch(() => undefined)
        await deleteByFilter(
          request,
          'purchases',
          `supplier_id=eq.${supplierId}`,
          token
        ).catch(() => undefined)
      }

      await cleanupCreatedRow(request, 'suppliers', {
        id: supplierId,
        name: supplierName,
        page,
        createResponse: supplierResponse
      }).catch(() => undefined)

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

  test('old purchases and deliveries routes redirect to suppliers', async ({ page }) => {
    await page.goto('/purchases')
    await page.waitForURL(/\/suppliers/, { timeout: 20_000 })
    await page.goto('/cash-transfers')
    await page.waitForURL(/\/suppliers/, { timeout: 20_000 })
    await page.goto('/deliveries')
    await page.waitForURL(/\/suppliers/, { timeout: 20_000 })
    await gotoReady(page, '/suppliers', 'الموردون')
  })
})
