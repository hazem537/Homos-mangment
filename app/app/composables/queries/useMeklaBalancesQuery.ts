import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from './queryKeys'
import { useActiveSeasonQuery } from './useLookupQueries'

export type MeklaBalance =
  Database['public']['Functions']['mekla_balances']['Returns'][number]

/** List grain: mekla × product (status rows summed). */
export type MeklaListRow = Omit<MeklaBalance, 'status_id' | 'status_name'> & {
  status_id: string | null
  status_name: string | null
}

export function aggregateMeklaBalances(rows: MeklaBalance[]): MeklaListRow[] {
  const map = new Map<string, MeklaListRow>()
  for (const r of rows) {
    const key = `${r.mekla_id}:${r.product_id || ''}`
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
    const byMekla = a.mekla_name.localeCompare(b.mekla_name, 'ar')
    if (byMekla !== 0) return byMekla
    return (a.product_name || '').localeCompare(b.product_name || '', 'ar')
  })
}

export function useMeklaBalancesQuery() {
  const client = useSupabaseClient<Database>()
  const seasonQuery = useActiveSeasonQuery()

  const seasonId = computed(() => seasonQuery.data.value?.id ?? null)

  const query = useQuery({
    queryKey: computed(() => queryKeys.meklaBalances(seasonId.value)),
    enabled: computed(() => !seasonQuery.isPending.value),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MeklaBalance[]> => {
      const { data, error } = await client.rpc('mekla_balances', {
        p_season_id: seasonId.value
      })
      if (error) throw error
      return data ?? []
    }
  })

  const listRows = computed(() =>
    aggregateMeklaBalances(query.data.value ?? [])
  )

  return {
    ...query,
    listRows,
    seasonQuery,
    seasonId
  }
}
