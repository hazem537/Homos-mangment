import type { Database } from '~/types/database.types'
import { useArdab } from '~/composables/useArdab'
import { accountTypeLabel } from '~/utils/accountType'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type LocationKindFilter = 'all' | 'warehouse' | 'store' | 'mekla'

export type LocationStatsRow = {
  kind: 'warehouse' | 'store' | 'mekla'
  kind_label: string
  id: string
  name: string
  product_id: string | null
  product_name: string | null
  status_id: string | null
  status_name: string | null
  account_type_id: string | null
  account_type_name: string | null
  kg_total: number
  ardab_total: number
  detail_path: string
}

export type LocationStatsDisplayRow = LocationStatsRow & {
  waste_kg: number
  waste_ardab: number
  net_kg: number
  net_ardab: number
  waste_applied: boolean
}

export type LocationKindTotals = {
  kind: LocationStatsRow['kind']
  label: string
  kg_total: number
  ardab_total: number
  waste_kg: number
  net_kg: number
  net_ardab: number
  locations_count: number
  waste_enabled: boolean
}

function round2(n: number) {
  return Number(n.toFixed(2))
}

function round4(n: number) {
  return Number(n.toFixed(4))
}

function kindLabel(kind: LocationStatsRow['kind']) {
  if (kind === 'warehouse') return 'شونة'
  if (kind === 'store') return 'مخزن'
  return 'مقلى'
}

function clampRatio(n: number) {
  if (!(n > 0)) return 0
  if (n > 100) return 100
  return n
}

export function useLocationStats() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const route = useRoute()
  const router = useRouter()
  const { kgToArdab } = useArdab()

  const loading = ref(true)
  const season = ref<{ id: string, name: string, ardab_factor: number } | null>(null)
  const products = ref<{ id: string, name: string }[]>([])
  const accountTypes = ref<{ id: string, name: string }[]>([])
  const rows = ref<LocationStatsRow[]>([])
  const sales = ref<{ quantity_kg: number, product_id: string | null, from_kind: string }[]>([])

  const cookieOpts = { maxAge: 60 * 60 * 24 * 365 }

  // Cookies often store booleans as strings — keep real boolean refs for USwitch
  const warehouseWasteCookie = useCookie<string>('homos-loc-stats-wh-waste', {
    default: () => '0',
    ...cookieOpts
  })
  const warehouseWasteRatio = useCookie<string>('homos-loc-stats-wh-ratio', {
    default: () => '0',
    ...cookieOpts
  })
  const meklaWasteCookie = useCookie<string>('homos-loc-stats-mekla-waste', {
    default: () => '0',
    ...cookieOpts
  })
  const meklaWasteRatio = useCookie<string>('homos-loc-stats-mekla-ratio', {
    default: () => '0',
    ...cookieOpts
  })

  const readEnabled = (raw: string | null | undefined) =>
    raw === '1' || raw === 'true'

  const warehouseWasteEnabled = ref(readEnabled(warehouseWasteCookie.value))
  const meklaWasteEnabled = ref(readEnabled(meklaWasteCookie.value))

  watch(warehouseWasteEnabled, (v) => {
    warehouseWasteCookie.value = v ? '1' : '0'
  })
  watch(meklaWasteEnabled, (v) => {
    meklaWasteCookie.value = v ? '1' : '0'
  })

  const queryProductId = () => {
    const q = route.query.product
    return typeof q === 'string' && q.trim() ? q.trim() : ''
  }

  const queryKind = () => {
    const q = route.query.kind
    if (q === 'warehouse' || q === 'store' || q === 'mekla') return q
    return 'all' as LocationKindFilter
  }

  const queryAccountTypeId = () => {
    const q = route.query.type
    return typeof q === 'string' && q.trim() ? q.trim() : 'all'
  }

  const selectedProductId = ref(queryProductId() || '')
  const selectedKind = ref<LocationKindFilter>(queryKind())
  const selectedAccountTypeId = ref(queryAccountTypeId())

  const defaultProductId = () => {
    const named = products.value.find(p => p.name === 'حمص خام')
    return named?.id || products.value[0]?.id || ''
  }

  const resolveProductId = (preferred?: string) => {
    const fromQuery = preferred || queryProductId()
    if (fromQuery === 'all') return 'all'
    if (fromQuery && products.value.some(p => p.id === fromQuery)) return fromQuery
    return defaultProductId() || 'all'
  }

  const productOptions = computed(() => {
    const map = new Map<string, string>()
    for (const p of products.value) map.set(p.id, p.name)
    for (const row of rows.value) {
      if (row.product_id && row.product_name) {
        map.set(row.product_id, row.product_name)
      }
    }
    return [
      { label: 'كل الأصناف', value: 'all' },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ar'))
        .map(([value, label]) => ({ label, value }))
    ]
  })

  const kindOptions: { label: string, value: LocationKindFilter }[] = [
    { label: 'الكل', value: 'all' },
    { label: 'الشون', value: 'warehouse' },
    { label: 'المخازن', value: 'store' },
    { label: 'المقالي', value: 'mekla' }
  ]

  const accountTypeOptions = computed(() => [
    { label: 'كل الأنواع', value: 'all' },
    ...accountTypes.value.map(t => ({
      label: accountTypeLabel(t.name),
      value: t.id
    }))
  ])

  const matchesAccountType = (row: Pick<LocationStatsRow, 'kind' | 'account_type_id'>) => {
    if (selectedAccountTypeId.value === 'all') return true
    // نوع الحساب على الشون فقط — المخازن/المقالي بدون نوع تمرّ دائماً
    if (row.kind !== 'warehouse') return true
    return row.account_type_id === selectedAccountTypeId.value
  }

  const warehouseRatioValue = computed(() =>
    clampRatio(parseDecimal(warehouseWasteRatio.value || '0'))
  )
  const meklaRatioValue = computed(() =>
    clampRatio(parseDecimal(meklaWasteRatio.value || '0'))
  )

  const applyWaste = (row: LocationStatsRow): LocationStatsDisplayRow => {
    let ratio = 0
    let enabled = false
    if (row.kind === 'warehouse') {
      enabled = warehouseWasteEnabled.value === true
      ratio = warehouseRatioValue.value
    } else if (row.kind === 'mekla') {
      enabled = meklaWasteEnabled.value === true
      ratio = meklaRatioValue.value
    }

    const waste_applied = enabled && ratio > 0
    const waste_kg = waste_applied ? round2(row.kg_total * (ratio / 100)) : 0
    const net_kg = round2(row.kg_total - waste_kg)
    const factor = Number(season.value?.ardab_factor) || 170

    return {
      ...row,
      waste_kg,
      waste_ardab: round4(kgToArdab(waste_kg, factor)),
      net_kg,
      net_ardab: round4(kgToArdab(net_kg, factor)),
      waste_applied
    }
  }

  const displayRows = computed(() => rows.value.map(applyWaste))

  const filteredRows = computed(() => {
    let list = displayRows.value
    if (selectedKind.value !== 'all') {
      list = list.filter(r => r.kind === selectedKind.value)
    }
    if (selectedProductId.value !== 'all') {
      list = list.filter(r => r.product_id === selectedProductId.value)
    }
    list = list.filter(matchesAccountType)
    return list
  })

  const kindTotals = computed<LocationKindTotals[]>(() => {
    const kinds: LocationStatsRow['kind'][] = ['warehouse', 'store', 'mekla']
    const labels = { warehouse: 'الشون', store: 'المخازن', mekla: 'المقالي' } as const
    const productFilter = selectedProductId.value

    return kinds.map((kind) => {
      const kindRows = displayRows.value.filter((r) => {
        if (r.kind !== kind) return false
        if (productFilter !== 'all' && r.product_id !== productFilter) return false
        if (!matchesAccountType(r)) return false
        return true
      })
      const ids = new Set(kindRows.map(r => r.id))
      const waste_enabled
        = kind === 'warehouse'
          ? warehouseWasteEnabled.value === true
          : kind === 'mekla'
            ? meklaWasteEnabled.value === true
            : false
      return {
        kind,
        label: labels[kind],
        kg_total: round2(kindRows.reduce((s, r) => s + r.kg_total, 0)),
        ardab_total: round4(kindRows.reduce((s, r) => s + r.ardab_total, 0)),
        waste_kg: round2(kindRows.reduce((s, r) => s + r.waste_kg, 0)),
        net_kg: round2(kindRows.reduce((s, r) => s + r.net_kg, 0)),
        net_ardab: round4(kindRows.reduce((s, r) => s + r.net_ardab, 0)),
        locations_count: ids.size,
        waste_enabled
      }
    })
  })

  const filteredSoldKg = computed(() => {
    let list = sales.value
    if (selectedKind.value === 'warehouse') return 0
    if (selectedKind.value === 'store' || selectedKind.value === 'mekla') {
      list = list.filter(r => r.from_kind === selectedKind.value)
    } else {
      list = list.filter(r => r.from_kind === 'store' || r.from_kind === 'mekla')
    }
    if (selectedProductId.value !== 'all') {
      list = list.filter(r => r.product_id === selectedProductId.value)
    }
    return round2(list.reduce((s, r) => s + r.quantity_kg, 0))
  })

  const showWasteColumns = computed(() =>
    (warehouseWasteEnabled.value || meklaWasteEnabled.value)
    && selectedKind.value !== 'store'
  )

  /** Selection filter only — independent from waste toggles */
  const selectKind = (kind: LocationStatsRow['kind']) => {
    selectedKind.value = selectedKind.value === kind ? 'all' : kind
  }

  const isKindDimmed = (kind: LocationStatsRow['kind']) =>
    selectedKind.value !== 'all' && selectedKind.value !== kind

  const totals = computed(() => {
    const list = filteredRows.value
    const ids = new Set(list.map(r => `${r.kind}:${r.id}`))
    return {
      kg_total: round2(list.reduce((s, r) => s + r.kg_total, 0)),
      ardab_total: round4(list.reduce((s, r) => s + r.ardab_total, 0)),
      waste_kg: round2(list.reduce((s, r) => s + r.waste_kg, 0)),
      net_kg: round2(list.reduce((s, r) => s + r.net_kg, 0)),
      net_ardab: round4(list.reduce((s, r) => s + r.net_ardab, 0)),
      locations_count: ids.size,
      sold_kg: filteredSoldKg.value
    }
  })

  const setWarehouseWasteRatio = (raw: string) => {
    warehouseWasteRatio.value = normalizeDecimalInput(raw)
  }

  const setMeklaWasteRatio = (raw: string) => {
    meklaWasteRatio.value = normalizeDecimalInput(raw)
  }

  const syncQuery = () => {
    const product
      = selectedProductId.value && selectedProductId.value !== 'all'
        ? selectedProductId.value
        : undefined
    const kind = selectedKind.value !== 'all' ? selectedKind.value : undefined
    const type
      = selectedAccountTypeId.value && selectedAccountTypeId.value !== 'all'
        ? selectedAccountTypeId.value
        : undefined
    router.replace({
      query: {
        ...route.query,
        product,
        kind,
        type
      }
    })
  }

  watch(selectedProductId, syncQuery)
  watch(selectedKind, syncQuery)
  watch(selectedAccountTypeId, syncQuery)

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, productsRes, typesRes] = await Promise.all([
        client
          .from('seasons')
          .select('id, name, ardab_factor')
          .eq('is_active', true)
          .maybeSingle(),
        client.from('products').select('id, name').eq('is_active', true).order('name'),
        client.from('account_types').select('id, name').order('name')
      ])
      if (seasonRes.error) throw seasonRes.error
      if (productsRes.error) throw productsRes.error
      if (typesRes.error) throw typesRes.error

      season.value = seasonRes.data
      products.value = productsRes.data ?? []
      accountTypes.value = typesRes.data ?? []
      selectedProductId.value = resolveProductId(selectedProductId.value)
      if (
        selectedAccountTypeId.value !== 'all'
        && !accountTypes.value.some(t => t.id === selectedAccountTypeId.value)
      ) {
        selectedAccountTypeId.value = 'all'
      }

      if (!seasonRes.data?.id) {
        rows.value = []
        sales.value = []
        return
      }

      const factor = Number(seasonRes.data.ardab_factor) || 170
      const seasonId = seasonRes.data.id

      const [whRes, storeRes, meklaRes, salesRes] = await Promise.all([
        client.rpc('warehouse_balances', { p_season_id: seasonId }),
        client.rpc('store_balances', { p_season_id: seasonId }),
        client.rpc('mekla_balances', { p_season_id: seasonId }),
        client
          .from('stock_movements')
          .select('quantity_kg, product_id, from_kind')
          .eq('season_id', seasonId)
          .eq('to_kind', 'sale')
          .eq('is_cancelled', false)
      ])

      if (whRes.error) throw whRes.error
      if (storeRes.error) throw storeRes.error
      if (meklaRes.error) throw meklaRes.error
      if (salesRes.error) throw salesRes.error

      const next: LocationStatsRow[] = []

      for (const w of whRes.data ?? []) {
        const kg = Number(w.kg_total) || 0
        if (Math.abs(kg) < 0.00005 && !w.product_id) continue
        next.push({
          kind: 'warehouse',
          kind_label: kindLabel('warehouse'),
          id: w.warehouse_id,
          name: w.warehouse_name,
          product_id: w.product_id,
          product_name: w.product_name,
          status_id: w.status_id,
          status_name: w.status_name,
          account_type_id: w.account_type_id || null,
          account_type_name: w.account_type_name || null,
          kg_total: round2(kg),
          ardab_total: round4(Number(w.ardab_total) || kgToArdab(kg, factor)),
          detail_path: w.product_id
            ? `/warehouses/${w.warehouse_id}?product=${w.product_id}`
            : `/warehouses/${w.warehouse_id}`
        })
      }

      for (const s of storeRes.data ?? []) {
        const kg = Number(s.kg_total) || 0
        if (Math.abs(kg) < 0.00005 && !s.product_id) continue
        next.push({
          kind: 'store',
          kind_label: kindLabel('store'),
          id: s.store_id,
          name: s.store_name,
          product_id: s.product_id,
          product_name: s.product_name,
          status_id: s.status_id,
          status_name: s.status_name,
          account_type_id: null,
          account_type_name: null,
          kg_total: round2(kg),
          ardab_total: round4(kgToArdab(kg, factor)),
          detail_path: s.product_id
            ? `/stores/${s.store_id}?product=${s.product_id}`
            : `/stores/${s.store_id}`
        })
      }

      for (const m of meklaRes.data ?? []) {
        const kg = Number(m.kg_total) || 0
        if (Math.abs(kg) < 0.00005 && !m.product_id) continue
        next.push({
          kind: 'mekla',
          kind_label: kindLabel('mekla'),
          id: m.mekla_id,
          name: m.mekla_name,
          product_id: m.product_id,
          product_name: m.product_name,
          status_id: m.status_id,
          status_name: m.status_name,
          account_type_id: null,
          account_type_name: null,
          kg_total: round2(kg),
          ardab_total: round4(kgToArdab(kg, factor)),
          detail_path: m.product_id
            ? `/meklas/${m.mekla_id}?product=${m.product_id}`
            : `/meklas/${m.mekla_id}`
        })
      }

      next.sort((a, b) => {
        const byKind = a.kind.localeCompare(b.kind)
        if (byKind !== 0) return byKind
        const byName = a.name.localeCompare(b.name, 'ar')
        if (byName !== 0) return byName
        return (a.product_name || '').localeCompare(b.product_name || '', 'ar')
      })

      rows.value = next
      sales.value = (salesRes.data ?? []).map(r => ({
        quantity_kg: Number(r.quantity_kg) || 0,
        product_id: r.product_id,
        from_kind: r.from_kind
      }))

      selectedProductId.value = resolveProductId(selectedProductId.value)
    } catch (e: any) {
      toast.add({
        title: 'تعذر تحميل الإحصائيات',
        description: e.message,
        color: 'error'
      })
      rows.value = []
      sales.value = []
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    selectedProductId.value = queryProductId() || ''
    selectedKind.value = queryKind()
    selectedAccountTypeId.value = queryAccountTypeId()
    load()
  })

  return {
    loading,
    season,
    rows,
    filteredRows,
    kindTotals,
    totals,
    showWasteColumns,
    productOptions,
    kindOptions,
    accountTypeOptions,
    selectedProductId,
    selectedKind,
    selectedAccountTypeId,
    selectKind,
    isKindDimmed,
    warehouseWasteEnabled,
    warehouseWasteRatio,
    meklaWasteEnabled,
    meklaWasteRatio,
    setWarehouseWasteRatio,
    setMeklaWasteRatio,
    load
  }
}
