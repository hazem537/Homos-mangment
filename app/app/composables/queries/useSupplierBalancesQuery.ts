import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from './queryKeys'
import { useActiveSeasonQuery } from './useLookupQueries'

export type SupplierBalance = Database['public']['Functions']['supplier_balances']['Returns'][number]

export function useSupplierBalancesQuery() {
  const client = useSupabaseClient<Database>()
  const seasonQuery = useActiveSeasonQuery()

  const seasonId = computed(() => seasonQuery.data.value?.id ?? null)

  const query = useQuery({
    queryKey: computed(() => queryKeys.supplierBalances(seasonId.value)),
    enabled: computed(() => !seasonQuery.isPending.value),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SupplierBalance[]> => {
      const { data, error } = await client.rpc('supplier_balances', {
        p_season_id: seasonId.value
      })
      if (error) throw error
      return data ?? []
    }
  })

  return {
    ...query,
    seasonQuery,
    seasonId
  }
}
