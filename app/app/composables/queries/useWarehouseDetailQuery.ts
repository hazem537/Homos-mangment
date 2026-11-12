import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from './queryKeys'
import { useActiveSeasonQuery } from './useLookupQueries'
import {
  fetchWarehouseDetailBundle,
  type WarehouseDetailBundle
} from '~/features/warehouses/utils/warehouseDetailBundle'

export function useWarehouseDetailQuery(
  warehouseId: MaybeRefOrGetter<string>
) {
  const client = useSupabaseClient<Database>()
  const seasonQuery = useActiveSeasonQuery()

  const id = computed(() => toValue(warehouseId) || '')
  const seasonId = computed(() => seasonQuery.data.value?.id ?? null)

  const query = useQuery({
    queryKey: computed(() =>
      queryKeys.warehouseDetail(id.value, seasonId.value)
    ),
    enabled: computed(() => !!id.value && !seasonQuery.isPending.value),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<WarehouseDetailBundle> =>
      fetchWarehouseDetailBundle(client, id.value, seasonId.value)
  })

  const isInitialLoading = computed(
    () =>
      !!id.value
      && (seasonQuery.isPending.value
        || (query.isPending.value && !query.data.value)
        || (query.isFetching.value && !query.data.value))
  )
  const isRefreshing = computed(
    () => query.isFetching.value && !!query.data.value
  )

  return {
    ...query,
    seasonQuery,
    seasonId,
    isInitialLoading,
    isRefreshing
  }
}
