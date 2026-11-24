import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { accountTypeLabel } from '~/utils/accountType'
import { queryKeys } from '~/composables/queries/queryKeys'
import {
  useAccountTypesQuery,
  useActiveProductsQuery,
  useActiveSeasonQuery
} from '~/composables/queries/useLookupQueries'
import {
  fetchSupplierStats,
  type SupplierDetailRow,
  type SupplierStatsRow
} from '../utils/fetchSupplierStats'

function emptyTotals(): SupplierStatsRow {
  return {
    account_type_id: 'all',
    account_type_name: 'الإجمالي',
    purchased_kg: 0,
    delivered_kg: 0,
    remaining_kg: 0,
    ardab_total: 0,
    ardab_delivered: 0,
    ardab_remaining: 0,
    purchases_total: 0,
    money_paid: 0,
    money_due: 0,
    commission_total: 0,
    warehouse_costs_total: 0,
    avg_price_per_ardab: 0,
    nolon_total: 0,
    nathriyat_total: 0,
    nolon_paid: 0,
    nathriyat_paid: 0,
    nolon_remaining: 0,
    cost_total: 0,
    cost_paid: 0,
    cost_needed: 0
  }
}

function sumRows(
  rows: SupplierStatsRow[],
  opts?: { includeWarehouseCosts?: boolean }
): SupplierStatsRow {
  const t = emptyTotals()
  for (const r of rows) {
    t.purchased_kg += Number(r.purchased_kg) || 0
    t.delivered_kg += Number(r.delivered_kg) || 0
    t.remaining_kg += Number(r.remaining_kg) || 0
    t.ardab_total += Number(r.ardab_total) || 0
    t.ardab_delivered += Number(r.ardab_delivered) || 0
    t.ardab_remaining += Number(r.ardab_remaining) || 0
    t.purchases_total += Number(r.purchases_total) || 0
    t.money_paid += Number(r.money_paid) || 0
    t.money_due += Number(r.money_due) || 0
    t.commission_total += Number(r.commission_total) || 0
    t.warehouse_costs_total += Number(r.warehouse_costs_total) || 0
    t.nolon_total += Number(r.nolon_total) || 0
    t.nathriyat_total += Number(r.nathriyat_total) || 0
    t.nolon_paid += Number(r.nolon_paid) || 0
    t.nathriyat_paid += Number(r.nathriyat_paid) || 0
    t.nolon_remaining += Number(r.nolon_remaining) || 0
    t.cost_total += Number(r.cost_total) || 0
    t.cost_paid += Number(r.cost_paid) || 0
    t.cost_needed += Number(r.cost_needed) || 0
  }
  const warehousePart = opts?.includeWarehouseCosts ? t.warehouse_costs_total : 0
  t.avg_price_per_ardab = t.ardab_total > 0.00005
    ? Number((
      (
        t.purchases_total
        + t.commission_total
        + t.nolon_total
        + t.nathriyat_total
        + warehousePart
      ) / t.ardab_total
    ).toFixed(2))
    : 0
  return t
}

export function useSupplierStats() {
  const client = useSupabaseClient<Database>()
  const route = useRoute()
  const toast = useToast()

  const seasonQuery = useActiveSeasonQuery()
  const productsQuery = useActiveProductsQuery()
  const accountTypesQuery = useAccountTypesQuery()

  const selectedProductId = ref('')
  const selectedAccountTypeId = ref('all')
  const search = ref('')
  const filtersReady = ref(false)

  const season = computed(() => seasonQuery.data.value ?? null)
  const products = computed(() => productsQuery.data.value ?? [])
  const accountTypes = computed(() => accountTypesQuery.data.value ?? [])

  const lookupsLoading = computed(() =>
    seasonQuery.isPending.value
    || productsQuery.isPending.value
    || accountTypesQuery.isPending.value
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

  const queryProductId = () => {
    const q = route.query.product
    return typeof q === 'string' ? q : ''
  }

  const defaultProductId = () => {
    const named = products.value.find(p => p.name === 'حمص خام' || p.name === 'حمص بلدي')
    return named?.id || products.value[0]?.id || ''
  }

  const syncFiltersFromLookups = () => {
    const fromQuery = queryProductId()
    if (
      !selectedProductId.value
      || !products.value.some(p => p.id === selectedProductId.value)
    ) {
      selectedProductId.value
        = (fromQuery && products.value.some(p => p.id === fromQuery) ? fromQuery : '')
        || defaultProductId()
    }
    if (
      selectedAccountTypeId.value !== 'all'
      && !accountTypes.value.some(t => t.id === selectedAccountTypeId.value)
    ) {
      selectedAccountTypeId.value = 'all'
    }
  }

  watch(
    [products, accountTypes, () => seasonQuery.data.value],
    () => {
      if (lookupsLoading.value) return
      syncFiltersFromLookups()
      filtersReady.value = true
    },
    { immediate: true }
  )

  watch(selectedProductId, (id) => {
    if (!filtersReady.value || !id) return
    if (queryProductId() !== id) {
      void navigateTo({
        path: route.path,
        query: { ...route.query, product: id }
      }, { replace: true })
    }
  })

  watch(
    () => route.query.product,
    () => {
      if (!filtersReady.value) return
      const fromQuery = queryProductId()
      if (fromQuery && fromQuery !== selectedProductId.value) {
        selectedProductId.value = fromQuery
      }
    }
  )

  const statsEnabled = computed(() =>
    filtersReady.value
    && Boolean(season.value?.id)
    && Boolean(selectedProductId.value)
    && !lookupsLoading.value
  )

  const statsQuery = useQuery({
    queryKey: computed(() =>
      queryKeys.supplierStats(
        season.value?.id || '',
        selectedProductId.value,
        selectedAccountTypeId.value
      )
    ),
    enabled: statsEnabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const seasonId = season.value?.id
      if (!seasonId || !selectedProductId.value) {
        return { by_type: [] as SupplierStatsRow[], by_supplier: [] as SupplierDetailRow[] }
      }
      return fetchSupplierStats(client, {
        productId: selectedProductId.value,
        seasonId,
        accountTypeId: selectedAccountTypeId.value
      })
    }
  })

  watch(
    () => statsQuery.error.value,
    (err) => {
      if (!err) return
      toast.add({
        title: 'تعذر تحميل الإحصائيات',
        description: (err as Error).message,
        color: 'error'
      })
    }
  )

  const rows = computed(() => statsQuery.data.value?.by_type ?? [])
  const supplierRows = computed(() => statsQuery.data.value?.by_supplier ?? [])

  const filteredSuppliers = computed(() => {
    const q = search.value.trim()
    if (!q) return supplierRows.value
    return supplierRows.value.filter(s =>
      s.supplier_name.includes(q)
      || accountTypeLabel(s.account_type_name).includes(q)
    )
  })

  const totals = computed(() => sumRows(rows.value, { includeWarehouseCosts: true }))

  const supplierTotals = computed(() => sumRows(filteredSuppliers.value))

  const isAllTypesView = computed(() => selectedAccountTypeId.value === 'all')

  const selectedTypeRow = computed(() =>
    rows.value.find(r => r.account_type_id === selectedAccountTypeId.value) ?? null
  )

  const initialLoading = computed(() =>
    lookupsLoading.value
    || (
      statsEnabled.value
      && statsQuery.isLoading.value
      && !statsQuery.isPlaceholderData.value
      && !statsQuery.data.value
    )
  )

  const isRefreshing = computed(() =>
    !initialLoading.value && statsQuery.isFetching.value
  )

  const hasActiveFilters = computed(() =>
    search.value.trim().length > 0
    || selectedAccountTypeId.value !== 'all'
  )

  const resetFilters = () => {
    search.value = ''
    selectedAccountTypeId.value = 'all'
  }

  const openType = (typeId: string) => {
    selectedAccountTypeId.value = typeId
    search.value = ''
  }

  const backToTypes = () => {
    selectedAccountTypeId.value = 'all'
    search.value = ''
  }

  return {
    initialLoading,
    isRefreshing,
    season,
    productOptions,
    accountTypeOptions,
    selectedProductId,
    selectedAccountTypeId,
    search,
    hasActiveFilters,
    resetFilters,
    isAllTypesView,
    selectedTypeRow,
    rows,
    totals,
    supplierRows: filteredSuppliers,
    supplierTotals,
    openType,
    backToTypes
  }
}
