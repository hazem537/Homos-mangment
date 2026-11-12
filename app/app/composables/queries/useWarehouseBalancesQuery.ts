import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from './queryKeys'
import { useActiveSeasonQuery } from './useLookupQueries'

export type WarehouseBalance =
  Database['public']['Functions']['warehouse_balances']['Returns'][number]

/** List grain: warehouse × product (status rows summed). */
export type WarehouseListRow = Omit<WarehouseBalance, 'status_id' | 'status_name'> & {
  status_id: string | null
  status_name: string | null
}

export function aggregateWarehouseBalances(
  rows: WarehouseBalance[]
): WarehouseListRow[] {
  const map = new Map<string, WarehouseListRow>()
  for (const r of rows) {
    const key = `${r.warehouse_id}:${r.product_id || ''}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        ...r,
        status_id: null,
        status_name: null,
        kg_total: Number(r.kg_total) || 0,
        ardab_total: Number(r.ardab_total) || 0
      })
      continue
    }
    existing.kg_total = Number(
      (Number(existing.kg_total) + (Number(r.kg_total) || 0)).toFixed(3)
    )
    existing.ardab_total = Number(
      (Number(existing.ardab_total) + (Number(r.ardab_total) || 0)).toFixed(4)
    )
  }

  return [...map.values()].sort((a, b) => {
    const byWh = a.warehouse_name.localeCompare(b.warehouse_name, 'ar')
    if (byWh !== 0) return byWh
    const byType = (a.account_type_name || '').localeCompare(b.account_type_name || '', 'ar')
    if (byType !== 0) return byType
    return (a.product_name || '').localeCompare(b.product_name || '', 'ar')
  })
}

export function useWarehouseBalancesQuery() {
  const client = useSupabaseClient<Database>()
  const seasonQuery = useActiveSeasonQuery()

  const seasonId = computed(() => seasonQuery.data.value?.id ?? null)

  const query = useQuery({
    queryKey: computed(() => queryKeys.warehouseBalances(seasonId.value)),
    enabled: computed(() => !seasonQuery.isPending.value),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<WarehouseBalance[]> => {
      const { data, error } = await client.rpc('warehouse_balances', {
        p_season_id: seasonId.value
      })
      if (error) throw error
      return data ?? []
    }
  })

  const listRows = computed(() =>
    aggregateWarehouseBalances(query.data.value ?? [])
  )

  return {
    ...query,
    listRows,
    seasonQuery,
    seasonId
  }
}
