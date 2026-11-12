import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from './queryKeys'
import { useActiveSeasonQuery } from './useLookupQueries'

export type StoreBalance =
  Database['public']['Functions']['store_balances']['Returns'][number]

/** List grain: store × product (status rows summed). */
export type StoreListRow = Omit<StoreBalance, 'status_id' | 'status_name'> & {
  status_id: string | null
  status_name: string | null
}

export function aggregateStoreBalances(rows: StoreBalance[]): StoreListRow[] {
  const map = new Map<string, StoreListRow>()
  for (const r of rows) {
    const key = `${r.store_id}:${r.product_id || ''}`
    const existing = map.get(key)
    if (!existing) {
      map.set(key, {
        ...r,
        status_id: null,
        status_name: null,
        kg_total: Number(r.kg_total) || 0
      })
      continue
    }
    existing.kg_total = Number(
      (Number(existing.kg_total) + (Number(r.kg_total) || 0)).toFixed(3)
    )
  }

  return [...map.values()].sort((a, b) => {
    const byStore = a.store_name.localeCompare(b.store_name, 'ar')
    if (byStore !== 0) return byStore
    return (a.product_name || '').localeCompare(b.product_name || '', 'ar')
  })
}

export function useStoreBalancesQuery() {
  const client = useSupabaseClient<Database>()
  const seasonQuery = useActiveSeasonQuery()

  const seasonId = computed(() => seasonQuery.data.value?.id ?? null)

  const query = useQuery({
    queryKey: computed(() => queryKeys.storeBalances(seasonId.value)),
    enabled: computed(() => !seasonQuery.isPending.value),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<StoreBalance[]> => {
      const { data, error } = await client.rpc('store_balances', {
        p_season_id: seasonId.value
      })
      if (error) throw error
      return data ?? []
    }
  })

  const listRows = computed(() =>
    aggregateStoreBalances(query.data.value ?? [])
  )

  return {
    ...query,
    listRows,
    seasonQuery,
    seasonId
  }
}
