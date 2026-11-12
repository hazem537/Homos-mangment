import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from './queryKeys'
import { useActiveSeasonQuery } from './useLookupQueries'
import {
  fetchSupplierDetailBundle,
  type SupplierDetailBundle
} from '~/features/suppliers/utils/supplierDetailBundle'

export function useSupplierDetailQuery(
  supplierId: MaybeRefOrGetter<string>,
  productId: MaybeRefOrGetter<string>
) {
  const client = useSupabaseClient<Database>()
  const seasonQuery = useActiveSeasonQuery()

  const id = computed(() => toValue(supplierId) || '')
  const pid = computed(() => toValue(productId) || '')
  const seasonId = computed(() => seasonQuery.data.value?.id ?? null)

  const query = useQuery({
    queryKey: computed(() =>
      queryKeys.supplierDetail(id.value, pid.value, seasonId.value)
    ),
    enabled: computed(
      () => !!id.value && !!pid.value && !seasonQuery.isPending.value
    ),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<SupplierDetailBundle> =>
      fetchSupplierDetailBundle(client, id.value, pid.value, seasonId.value)
  })

  const isInitialLoading = computed(
    () =>
      !!id.value
      && !!pid.value
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
