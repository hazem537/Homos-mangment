import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

type Client = SupabaseClient<Database>

export type SupplierStatsRow = {
  account_type_id: string
  account_type_name: string
  purchased_kg: number
  delivered_kg: number
  remaining_kg: number
  ardab_total: number
  ardab_delivered: number
  ardab_remaining: number
  purchases_total: number
  money_paid: number
  money_due: number
  commission_total: number
  warehouse_costs_total: number
  avg_price_per_ardab: number
  nolon_total: number
  nathriyat_total: number
  nolon_paid: number
  nathriyat_paid: number
  nolon_remaining: number
  cost_total: number
  cost_paid: number
  cost_needed: number
}

export type SupplierDetailRow = SupplierStatsRow & {
  supplier_id: string
  supplier_name: string
  product_id: string
}

export type SupplierStatsBundle = {
  by_type: SupplierStatsRow[]
  by_supplier: SupplierDetailRow[]
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function emptyBundle(): SupplierStatsBundle {
  return { by_type: [], by_supplier: [] }
}

function withWarehouseCosts<T extends SupplierStatsRow>(row: T): T {
  return {
    ...row,
    warehouse_costs_total: Number(row.warehouse_costs_total ?? 0)
  }
}

export function mapSupplierStatsBundle(raw: unknown): SupplierStatsBundle {
  if (!raw || typeof raw !== 'object') return emptyBundle()
  const data = raw as Record<string, unknown>
  if (typeof data.error === 'string') throw new Error(data.error)
  return {
    by_type: asArray<SupplierStatsRow>(data.by_type).map(withWarehouseCosts),
    by_supplier: asArray<SupplierDetailRow>(data.by_supplier).map(row =>
      withWarehouseCosts({ ...row, warehouse_costs_total: 0 })
    )
  }
}

export async function fetchSupplierStats(
  client: Client,
  params: {
    productId: string
    seasonId: string
    accountTypeId: string
  }
): Promise<SupplierStatsBundle> {
  const { productId, seasonId, accountTypeId } = params
  if (!productId || !seasonId) return emptyBundle()

  const { data, error } = await client.rpc('supplier_stats_bundle', {
    p_product_id: productId,
    p_season_id: seasonId,
    p_account_type_id: accountTypeId === 'all' ? null : accountTypeId
  })
  if (error) throw error
  return mapSupplierStatsBundle(data)
}
