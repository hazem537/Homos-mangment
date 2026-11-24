/** Stable keys for per-user table_view_prefs rows. */
export const TABLE_KEYS = {
  suppliersDetailWorkbook: 'suppliers.detail.workbook',
  suppliersDetailCards: 'suppliers.detail.cards',
  suppliersDetailPurchases: 'suppliers.detail.purchases',
  suppliersDetailTransfers: 'suppliers.detail.transfers',
  suppliersDetailDeliveries: 'suppliers.detail.deliveries',
  warehousesDetailWorkbook: 'warehouses.detail.workbook',
  storesDetailWorkbook: 'stores.detail.workbook',
  meklasDetailWorkbook: 'meklas.detail.workbook'
} as const

export type TableKey = (typeof TABLE_KEYS)[keyof typeof TABLE_KEYS]

/** Per-user + per-supplier workbook styles (`user_id` + this key). */
export function suppliersDetailWorkbookKey(supplierId: string) {
  const id = String(supplierId || '').trim()
  return id
    ? `${TABLE_KEYS.suppliersDetailWorkbook}.${id}`
    : TABLE_KEYS.suppliersDetailWorkbook
}

/** Per-user + per-warehouse workbook styles. */
export function warehousesDetailWorkbookKey(warehouseId: string) {
  const id = String(warehouseId || '').trim()
  return id
    ? `${TABLE_KEYS.warehousesDetailWorkbook}.${id}`
    : TABLE_KEYS.warehousesDetailWorkbook
}

/** Per-user + per-store workbook styles. */
export function storesDetailWorkbookKey(storeId: string) {
  const id = String(storeId || '').trim()
  return id
    ? `${TABLE_KEYS.storesDetailWorkbook}.${id}`
    : TABLE_KEYS.storesDetailWorkbook
}

/** Per-user + per-mekla workbook styles. */
export function meklasDetailWorkbookKey(meklaId: string) {
  const id = String(meklaId || '').trim()
  return id
    ? `${TABLE_KEYS.meklasDetailWorkbook}.${id}`
    : TABLE_KEYS.meklasDetailWorkbook
}
