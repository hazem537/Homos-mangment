import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { accountTypeLabel } from '~/utils/accountType'
import { queryKeys } from '~/composables/queries/queryKeys'
import {
  useAccountTypesQuery,
  useActiveProductsQuery,
  useActiveSeasonQuery,
  useActiveSuppliersQuery
} from '~/composables/queries/useLookupQueries'
import { emptyDashboardMetrics } from '../utils/dashboardMetrics'
import { buildFlowBars, buildPlaceBars } from '../utils/dashboardColors'
import { fetchDashboardMetrics } from '../utils/fetchDashboardMetrics'

export function useDashboardStats() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()

  const selectedProductId = ref('')
  const selectedAccountTypeId = ref('all')
  const selectedSupplierId = ref('all')
  const filtersReady = ref(false)

  const seasonQuery = useActiveSeasonQuery()
  const productsQuery = useActiveProductsQuery()
  const accountTypesQuery = useAccountTypesQuery()
  const suppliersQuery = useActiveSuppliersQuery()

  const season = computed(() => seasonQuery.data.value ?? null)
  const products = computed(() => productsQuery.data.value ?? [])
  const accountTypes = computed(() => accountTypesQuery.data.value ?? [])
  const suppliers = computed(() => suppliersQuery.data.value ?? [])

  const lookupsLoading = computed(() =>
    seasonQuery.isPending.value
    || productsQuery.isPending.value
    || accountTypesQuery.isPending.value
    || suppliersQuery.isPending.value
  )

  const lookupsError = computed(() =>
    seasonQuery.error.value
    || productsQuery.error.value
    || accountTypesQuery.error.value
    || suppliersQuery.error.value
  )

  const productOptions = computed(() =>
    products.value.map(p => ({ label: p.name, value: p.id }))
  )

  const accountTypeOptions = computed(() => [
    { label: 'كل الأنواع', value: 'all' },
    ...accountTypes.value.map(t => ({
      label: accountTypeLabel(t.name),
      value: t.id
    }))
  ])

  const suppliersForType = computed(() => {
    if (selectedAccountTypeId.value === 'all') return suppliers.value
    return suppliers.value.filter(s => s.account_type_id === selectedAccountTypeId.value)
  })

  const supplierOptions = computed(() => [
    { label: 'كل الموردين', value: 'all' },
    ...suppliersForType.value.map(s => ({
      label: s.product_name ? `${s.name} — ${s.product_name}` : s.name,
      value: s.id
    }))
  ])

  const defaultProductId = () => {
    const named = products.value.find(p => p.name === 'حمص خام')
    return named?.id || products.value[0]?.id || ''
  }

  const syncSupplierWithType = () => {
    if (selectedSupplierId.value === 'all') return
    const ok = suppliersForType.value.some(s => s.id === selectedSupplierId.value)
    if (!ok) selectedSupplierId.value = 'all'
  }

  const syncFiltersFromLookups = () => {
    if (
      !selectedProductId.value
      || !products.value.some(p => p.id === selectedProductId.value)
    ) {
      selectedProductId.value = defaultProductId()
    }
    if (
      selectedAccountTypeId.value !== 'all'
      && !accountTypes.value.some(t => t.id === selectedAccountTypeId.value)
    ) {
      selectedAccountTypeId.value = 'all'
    }
    syncSupplierWithType()
  }

  watch(
    [products, accountTypes, suppliers],
    () => {
      if (lookupsLoading.value) return
      syncFiltersFromLookups()
      filtersReady.value = true
    },
    { immediate: true }
  )

  watch(selectedAccountTypeId, () => {
    if (!filtersReady.value) return
    syncSupplierWithType()
  })

  watch(lookupsError, (err) => {
    if (!err) return
    toast.add({
      title: 'تعذر تحميل لوحة التحكم',
      description: (err as Error).message,
      color: 'error'
    })
  })

  const metricsEnabled = computed(() =>
    filtersReady.value
    && Boolean(season.value?.id)
    && Boolean(selectedProductId.value)
    && !lookupsLoading.value
  )

  const metricsQueryKey = computed(() =>
    queryKeys.dashboardMetrics(
      season.value?.id || '',
      selectedProductId.value,
      selectedAccountTypeId.value,
      selectedSupplierId.value
    )
  )

  const metricsQuery = useQuery({
    queryKey: metricsQueryKey,
    enabled: metricsEnabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const seasonId = season.value?.id
      if (!seasonId || !selectedProductId.value) return emptyDashboardMetrics()

      return fetchDashboardMetrics(client, {
        seasonId,
        productId: selectedProductId.value,
        accountTypeId: selectedAccountTypeId.value,
        supplierId: selectedSupplierId.value
      })
    }
  })

  watch(
    () => metricsQuery.error.value,
    (err) => {
      if (!err) return
      toast.add({
        title: 'تعذر تحميل لوحة التحكم',
        description: (err as Error).message,
        color: 'error'
      })
    }
  )

  const metrics = computed(() => metricsQuery.data.value ?? emptyDashboardMetrics())

  /** First paint — no metrics yet (skeleton). */
  const initialLoading = computed(() =>
    lookupsLoading.value
    || (
      metricsEnabled.value
      && metricsQuery.isLoading.value
      && !metricsQuery.isPlaceholderData.value
      && !metricsQuery.data.value
    )
  )

  /** Filter/refetch in progress while previous data stays visible. */
  const isRefreshing = computed(() =>
    !initialLoading.value
    && (
      (metricsEnabled.value && metricsQuery.isFetching.value)
      || (lookupsLoading.value && filtersReady.value)
    )
  )

  /** Backward-compatible alias used by older callers. */
  const loading = computed(() => initialLoading.value)

  const filtersReadyUi = computed(() => filtersReady.value && !lookupsLoading.value)

  const hasActiveFilters = computed(() =>
    selectedAccountTypeId.value !== 'all'
    || selectedSupplierId.value !== 'all'
    || (
      Boolean(selectedProductId.value)
      && selectedProductId.value !== defaultProductId()
    )
  )

  const resetFilters = () => {
    selectedAccountTypeId.value = 'all'
    selectedSupplierId.value = 'all'
    selectedProductId.value = defaultProductId()
  }

  const purchasedKg = computed(() => metrics.value.purchasedKg)
  const deliveredKg = computed(() => metrics.value.deliveredKg)
  const remainingKg = computed(() => metrics.value.remainingKg)
  const warehouseKg = computed(() => metrics.value.warehouseKg)
  const meklaKg = computed(() => metrics.value.meklaKg)
  const storeKg = computed(() => metrics.value.storeKg)
  const soldKg = computed(() => metrics.value.soldKg)

  const placeBars = computed(() =>
    buildPlaceBars(buildFlowBars(metrics.value))
  )

  const load = async () => {
    await Promise.all([
      seasonQuery.refetch(),
      productsQuery.refetch(),
      accountTypesQuery.refetch(),
      suppliersQuery.refetch(),
      metricsEnabled.value ? metricsQuery.refetch() : Promise.resolve()
    ])
  }

  return {
    loading,
    initialLoading,
    isRefreshing,
    filtersReadyUi,
    hasActiveFilters,
    resetFilters,
    season,
    productOptions,
    accountTypeOptions,
    supplierOptions,
    selectedProductId,
    selectedAccountTypeId,
    selectedSupplierId,
    purchasedKg,
    deliveredKg,
    remainingKg,
    warehouseKg,
    meklaKg,
    storeKg,
    soldKg,
    placeBars,
    load
  }
}
