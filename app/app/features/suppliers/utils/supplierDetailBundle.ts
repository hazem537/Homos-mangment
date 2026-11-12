import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, DeliveryCostKind, TransferKind } from '~/types/database.types'
import type { DeliveryCostPaymentLite } from '~/utils/deliveryCosts'

type Client = SupabaseClient<Database>

export type SupplierDue =
  Database['public']['Functions']['supplier_due']['Returns'][number]

export type SupplierPurchase =
  Database['public']['Views']['purchase_ledger']['Row']

export type SupplierTransfer =
  Database['public']['Tables']['cash_transfers']['Row']

export type SupplierDelivery =
  Database['public']['Tables']['warehouse_deliveries']['Row'] & {
    nolon_paid?: number | null
    nathriyat_paid?: number | null
    kg_before?: number | null
    kg_after?: number | null
    warehouses?: { id: string; name: string } | null
    warehouse_sections?: {
      id: string
      name: string
      warehouse_id: string
    } | null
    stores?: { id: string; name: string } | null
    products?: { id: string; name: string } | null
    stock_statuses?: { id: string; name: string } | null
  }

export type SupplierLite = {
  id: string
  name: string
  notes: string | null
  is_active: boolean
  account_type_id: string
  account_type_name: string
  product_id: string
  product_name: string
}

export type SeasonLite = { id: string; name: string; ardab_factor: number }
export type WarehouseLite = { id: string; name: string; account_type_id: string }
export type StoreLite = { id: string; name: string }
export type ProductLite = { id: string; name: string }
export type StatusLite = {
  id: string
  name: string
  product_id: string
  is_default?: boolean
}
export type WarehouseSectionLite = {
  id: string
  name: string
  warehouse_id: string
}

export type SupplierProductStat = {
  product_id: string
  product_name: string
  purchased_kg: number
  delivered_kg: number
  remaining_kg: number
  purchased_ardab: number
  purchases_total: number
  nolon_total: number
  nathriyat_total: number
  nolon_paid: number
  nathriyat_paid: number
  transfers_total: number
  commission_total: number
  supplier_balance: number
  ardab_total: number
  ardab_delivered: number
  ardab_remaining: number
  avg_price_costed: number
  last_price: number
}

export type SupplierDetailBundle = {
  supplier: SupplierLite | null
  season: SeasonLite | null
  due_by_product: SupplierDue[]
  purchases: SupplierPurchase[]
  transfers: SupplierTransfer[]
  deliveries: SupplierDelivery[]
  payments: DeliveryCostPaymentLite[]
  product_stats: SupplierProductStat[]
  lookups: {
    products: ProductLite[]
    warehouses: WarehouseLite[]
    sections: WarehouseSectionLite[]
    stores: StoreLite[]
    stock_statuses: StatusLite[]
  }
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function emptyBundle(): SupplierDetailBundle {
  return {
    supplier: null,
    season: null,
    due_by_product: [],
    purchases: [],
    transfers: [],
    deliveries: [],
    payments: [],
    product_stats: [],
    lookups: {
      products: [],
      warehouses: [],
      sections: [],
      stores: [],
      stock_statuses: []
    }
  }
}

export function mapSupplierDetailBundle(raw: unknown): SupplierDetailBundle {
  if (!raw || typeof raw !== 'object') return emptyBundle()
  const data = raw as Record<string, unknown>

  if (typeof data.error === 'string') {
    const err = new Error(data.error) as Error & {
      supplierProductId?: string
    }
    if (data.error === 'product_mismatch' && typeof data.supplier_product_id === 'string') {
      err.supplierProductId = data.supplier_product_id
    }
    throw err
  }

  const lookups =
    data.lookups && typeof data.lookups === 'object'
      ? (data.lookups as Record<string, unknown>)
      : {}

  return {
    supplier: (data.supplier as SupplierLite | null) ?? null,
    season: (data.season as SeasonLite | null) ?? null,
    due_by_product: asArray<SupplierDue>(data.due_by_product),
    purchases: asArray<SupplierPurchase>(data.purchases),
    transfers: asArray<SupplierTransfer>(data.transfers).map((t) => ({
      ...t,
      kind: t.kind as TransferKind
    })),
    deliveries: asArray<SupplierDelivery>(data.deliveries),
    payments: asArray<DeliveryCostPaymentLite>(data.payments).map((p) => ({
      ...p,
      kind: p.kind as DeliveryCostKind
    })),
    product_stats: asArray<SupplierProductStat>(data.product_stats),
    lookups: {
      products: asArray<ProductLite>(lookups.products),
      warehouses: asArray<WarehouseLite>(lookups.warehouses),
      sections: asArray<WarehouseSectionLite>(lookups.sections),
      stores: asArray<StoreLite>(lookups.stores),
      stock_statuses: asArray<StatusLite>(lookups.stock_statuses)
    }
  }
}

/** One RPC round-trip for supplier detail page data (one product profile). */
export async function fetchSupplierDetailBundle(
  client: Client,
  supplierId: string,
  productId: string,
  seasonId?: string | null
): Promise<SupplierDetailBundle> {
  if (!supplierId || !productId) return emptyBundle()

  const { data, error } = await client.rpc('supplier_detail_bundle', {
    p_supplier_id: supplierId,
    p_product_id: productId,
    p_season_id: seasonId ?? null
  })

  if (error) throw error
  return mapSupplierDetailBundle(data)
}
