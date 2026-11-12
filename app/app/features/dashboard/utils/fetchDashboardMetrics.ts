import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import {
  emptyDashboardMetrics,
  mapDashboardRpcRow,
  type DashboardMetrics
} from './dashboardMetrics'

type Client = SupabaseClient<Database>

/** Fetch dashboard quantity metrics via Supabase RPC (aggregation runs in Postgres). */
export async function fetchDashboardMetrics(
  client: Client,
  params: {
    seasonId: string
    productId: string
    accountTypeId: string
    supplierId: string
  }
): Promise<DashboardMetrics> {
  const { seasonId, productId, accountTypeId, supplierId } = params

  if (!seasonId || !productId) return emptyDashboardMetrics()

  const { data, error } = await client.rpc('dashboard_quantity_flow', {
    p_season_id: seasonId,
    p_product_id: productId,
    p_account_type_id: accountTypeId === 'all' ? null : accountTypeId,
    p_supplier_id: supplierId === 'all' ? null : supplierId
  })

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : data
  return mapDashboardRpcRow(row)
}
