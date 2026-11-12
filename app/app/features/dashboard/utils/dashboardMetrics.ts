export type DashboardMetrics = {
  purchasedKg: number
  deliveredKg: number
  remainingKg: number
  warehouseKg: number
  meklaKg: number
  storeKg: number
  soldKg: number
}

export function emptyDashboardMetrics(): DashboardMetrics {
  return {
    purchasedKg: 0,
    deliveredKg: 0,
    remainingKg: 0,
    warehouseKg: 0,
    meklaKg: 0,
    storeKg: 0,
    soldKg: 0
  }
}

export function mapDashboardRpcRow(row: {
  purchased_kg: number | string | null
  delivered_kg: number | string | null
  remaining_kg: number | string | null
  warehouse_kg: number | string | null
  store_kg: number | string | null
  mekla_kg: number | string | null
  sold_kg: number | string | null
} | null | undefined): DashboardMetrics {
  if (!row) return emptyDashboardMetrics()
  return {
    purchasedKg: Number(row.purchased_kg) || 0,
    deliveredKg: Number(row.delivered_kg) || 0,
    remainingKg: Number(row.remaining_kg) || 0,
    warehouseKg: Number(row.warehouse_kg) || 0,
    storeKg: Number(row.store_kg) || 0,
    meklaKg: Number(row.mekla_kg) || 0,
    soldKg: Number(row.sold_kg) || 0
  }
}
