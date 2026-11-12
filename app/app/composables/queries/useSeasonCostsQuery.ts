import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from './queryKeys'
import { useActiveSeasonQuery } from './useLookupQueries'

export type SeasonCost = Database['public']['Tables']['season_costs']['Row']

export function useSeasonCostsQuery() {
  const client = useSupabaseClient<Database>()
  const seasonQuery = useActiveSeasonQuery()

  const seasonId = computed(() => seasonQuery.data.value?.id ?? null)

  const query = useQuery({
    queryKey: computed(() => queryKeys.seasonCosts(seasonId.value)),
    enabled: computed(() => !seasonQuery.isPending.value && !!seasonId.value),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SeasonCost[]> => {
      if (!seasonId.value) return []
      const { data, error } = await client
        .from('season_costs')
        .select('*')
        .eq('season_id', seasonId.value)
        .order('cost_date', { ascending: true })
        .order('created_at', { ascending: true })
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
