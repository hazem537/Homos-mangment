import { useQueryClient } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from '~/composables/queries/queryKeys'
import { useStockLocationDetailQuery } from '~/composables/queries/useStockLocationDetailQuery'
import {
  type LocationMovementLite,
  type StockLocationDetailKind
} from '~/features/stores/utils/stockLocationDetailBundle'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type { StockLocationDetailKind }

export type LocationMovementRow = LocationMovementLite & {
  qty_before: number
  qty_after: number
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function applyRunningBalances(
  incoming: LocationMovementLite[],
  outgoing: LocationMovementLite[]
) {
  type Event = { id: string, date: string, created_at: string, delta: number }

  const events: Event[] = [
    ...incoming.map(r => ({
      id: r.id,
      date: r.date,
      created_at: r.created_at,
      delta: Number(r.quantity_kg)
    })),
    ...outgoing.map(r => ({
      id: r.id,
      date: r.date,
      created_at: r.created_at,
      delta: -Number(r.quantity_kg)
    }))
  ]

  events.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.created_at.localeCompare(b.created_at)
  })

  const balanceById = new Map<string, { qty_before: number, qty_after: number }>()
  let balance = 0
  for (const event of events) {
    const qty_before = Number(balance.toFixed(4))
    const qty_after = Number((balance + event.delta).toFixed(4))
    balanceById.set(event.id, { qty_before, qty_after })
    balance = qty_after
  }

  const withBalance = <T extends { id: string }>(rows: T[]) =>
    rows.map((row) => {
      const bal = balanceById.get(row.id) ?? { qty_before: 0, qty_after: 0 }
      return { ...row, ...bal }
    })

  return {
    incoming: withBalance(incoming) as LocationMovementRow[],
    outgoing: withBalance(outgoing) as LocationMovementRow[]
  }
}

export function useStockLocationDetail(
  kind: StockLocationDetailKind,
  locationId: MaybeRefOrGetter<string>
) {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const route = useRoute()
  const router = useRouter()
  const queryClient = useQueryClient()
  const detailQuery = useStockLocationDetailQuery(kind, locationId)

  const saving = ref(false)
  const stockStatuses = ref<{ id: string, name: string, product_id: string }[]>([])

  type TransferUiKind = 'sale' | 'mekla' | 'store'

  const transferOpen = ref(false)
  const meklas = ref<{ id: string, name: string }[]>([])
  const stores = ref<{ id: string, name: string }[]>([])
  const transferForm = reactive({
    to_kind: 'sale' as TransferUiKind,
    to_id: '' as string,
    status_id: '' as string,
    to_status_id: '' as string,
    quantity_kg: '' as string,
    movement_date: todayIsoDate(),
    notes: ''
  })

  /** Store: sale | mekla. Mekla: sale | store. */
  const transferKindOptions = computed(() =>
    kind === 'store'
      ? [
          { label: 'بيع', value: 'sale' },
          { label: 'مقلى', value: 'mekla' }
        ]
      : [
          { label: 'بيع', value: 'sale' },
          { label: 'مخزن', value: 'store' }
        ]
  )

  const transferToOptions = computed(() => {
    if (transferForm.to_kind === 'mekla') {
      return meklas.value.map(m => ({ label: m.name, value: m.id }))
    }
    if (transferForm.to_kind === 'store') {
      return stores.value.map(s => ({ label: s.name, value: s.id }))
    }
    return []
  })

  const transferToLabel = computed(() =>
    transferForm.to_kind === 'mekla'
      ? 'المقلى'
      : transferForm.to_kind === 'store'
        ? 'المخزن'
        : ''
  )

  const needsTransferDestination = computed(
    () => transferForm.to_kind === 'mekla' || transferForm.to_kind === 'store'
  )

  const listPath = kind === 'store' ? '/stores' : '/meklas'
  const entityLabel = kind === 'store' ? 'المخزن' : 'المقلى'

  const queryProductId = () => {
    const q = route.query.product
    return typeof q === 'string' && q.trim() ? q.trim() : ''
  }

  const selectedProductId = ref(queryProductId() || '')

  const entity = computed(() => detailQuery.data.value?.entity ?? null)
  const activeSeasonName = computed(
    () => detailQuery.data.value?.season?.name
      ?? detailQuery.seasonQuery.data.value?.name
      ?? null
  )
  const activeSeasonId = computed(
    () => detailQuery.seasonId.value
  )
  const productOptions = computed(
    () => detailQuery.data.value?.productOptions ?? []
  )
  const allIncoming = computed(() => detailQuery.data.value?.incoming ?? [])
  const allOutgoing = computed(() => detailQuery.data.value?.outgoing ?? [])

  const loading = computed(() => detailQuery.isInitialLoading.value)
  const isRefreshing = computed(() => detailQuery.isRefreshing.value)

  watch(
    () => detailQuery.error.value,
    (err) => {
      if (!err) return
      toast.add({
        title: `تعذر تحميل ${entityLabel}`,
        description: (err as Error).message,
        color: 'error'
      })
    }
  )

  watch(
    () => detailQuery.data.value,
    (bundle) => {
      if (!bundle) return
      const options = bundle.productOptions
      const qPid = queryProductId()
      if (qPid && options.some(o => o.value === qPid)) {
        selectedProductId.value = qPid
      } else if (
        selectedProductId.value
        && options.some(o => o.value === selectedProductId.value)
      ) {
        // keep
      } else {
        selectedProductId.value = options[0]?.value || ''
      }
    },
    { immediate: true }
  )

  const loadStatusesForProduct = async (productId: string) => {
    if (!productId) {
      stockStatuses.value = []
      return
    }
    const { data, error } = await client
      .from('stock_statuses')
      .select('id, name, product_id')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    stockStatuses.value = data ?? []
  }

  watch(
    () => toValue(locationId),
    () => {
      selectedProductId.value = queryProductId()
      cancelTransfer()
    }
  )

  watch(selectedProductId, async (pid) => {
    const current = queryProductId()
    if ((pid || '') !== (current || '')) {
      router.replace({
        query: {
          ...route.query,
          product: pid || undefined
        }
      })
    }
    try {
      await loadStatusesForProduct(pid)
      if (!stockStatuses.value.some(s => s.id === transferForm.status_id)) {
        transferForm.status_id = stockStatuses.value[0]?.id || ''
      }
      if (!stockStatuses.value.some(s => s.id === transferForm.to_status_id)) {
        transferForm.to_status_id = transferForm.status_id || stockStatuses.value[0]?.id || ''
      }
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الحالات', description: e.message, color: 'error' })
    }
  })

  watch(
    () => selectedProductId.value,
    (pid) => {
      if (pid) void loadStatusesForProduct(pid)
    },
    { immediate: true }
  )

  const invalidateAfterMutation = async (extra?: {
    toKind?: 'sale' | 'mekla' | 'store'
    toId?: string
  }) => {
    const id = toValue(locationId)
    const seasonId = detailQuery.seasonId.value
    const tasks: Promise<unknown>[] = [
      queryClient.invalidateQueries({
        queryKey: queryKeys.stockLocationDetail(kind, id, seasonId)
      }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    ]
    if (kind === 'store') {
      tasks.push(
        queryClient.invalidateQueries({
          queryKey: queryKeys.storeBalances(seasonId)
        })
      )
    } else {
      tasks.push(
        queryClient.invalidateQueries({
          queryKey: queryKeys.meklaBalances(seasonId)
        })
      )
    }
    if (extra?.toKind === 'mekla' && extra.toId) {
      tasks.push(
        queryClient.invalidateQueries({
          queryKey: queryKeys.stockLocationDetail('mekla', extra.toId, seasonId)
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.meklaBalances(seasonId)
        })
      )
    }
    if (extra?.toKind === 'store' && extra.toId) {
      tasks.push(
        queryClient.invalidateQueries({
          queryKey: queryKeys.stockLocationDetail('store', extra.toId, seasonId)
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.storeBalances(seasonId)
        })
      )
    }
    await Promise.all(tasks)
  }

  const loadTransferDestinations = async () => {
    if (kind === 'store') {
      const { data, error } = await client
        .from('meklas')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      meklas.value = data ?? []
      stores.value = []
      return
    }
    const { data, error } = await client
      .from('stores')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    stores.value = data ?? []
    meklas.value = []
  }

  const onTransferKindChange = (next: TransferUiKind) => {
    transferForm.to_kind = next
    if (next === 'mekla') {
      transferForm.to_id = meklas.value[0]?.id || ''
    } else if (next === 'store') {
      transferForm.to_id = stores.value[0]?.id || ''
    } else {
      transferForm.to_id = ''
    }
  }

  const filteredIncomingBase = computed(() => {
    const pid = selectedProductId.value
    if (!pid) return allIncoming.value
    return allIncoming.value.filter(r => r.product_id === pid)
  })

  const filteredOutgoingBase = computed(() => {
    const pid = selectedProductId.value
    if (!pid) return allOutgoing.value
    return allOutgoing.value.filter(r => r.product_id === pid)
  })

  const ledger = computed(() => {
    const balanced = applyRunningBalances(
      filteredIncomingBase.value,
      filteredOutgoingBase.value
    )
    const sortAsc = <T extends { date: string, created_at: string }>(rows: T[]) =>
      [...rows].sort((a, b) => {
        const byDate = a.date.localeCompare(b.date)
        if (byDate !== 0) return byDate
        return a.created_at.localeCompare(b.created_at)
      })
    return {
      incoming: sortAsc(balanced.incoming),
      outgoing: sortAsc(balanced.outgoing)
    }
  })

  const stats = computed(() => {
    const kgIn = ledger.value.incoming.reduce((s, r) => s + r.quantity_kg, 0)
    const kgOut = ledger.value.outgoing.reduce((s, r) => s + r.quantity_kg, 0)
    return {
      kgIn,
      kgOut,
      kgRemaining: Number((kgIn - kgOut).toFixed(4))
    }
  })

  const transferStatusOptions = computed(() =>
    stockStatuses.value.map(s => ({ label: s.name, value: s.id }))
  )

  const transferAvailableKg = ref(0)

  const refreshTransferAvailable = async () => {
    transferAvailableKg.value = 0
    const id = toValue(locationId)
    if (
      !activeSeasonId.value
      || !id
      || !selectedProductId.value
      || !transferForm.status_id
    ) {
      return
    }
    const { data, error } = await client.rpc('location_remaining_kg', {
      p_kind: kind,
      p_id: id,
      p_product_id: selectedProductId.value,
      p_status_id: transferForm.status_id,
      p_season_id: activeSeasonId.value
    })
    if (error) {
      toast.add({ title: 'تعذر التحقق من الرصيد', description: error.message, color: 'error' })
      return
    }
    transferAvailableKg.value = Number(data) || 0
  }

  watch(
    () => [transferOpen.value, transferForm.status_id, selectedProductId.value] as const,
    async ([open]) => {
      if (open) await refreshTransferAvailable()
    }
  )

  const openTransfer = async () => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (!selectedProductId.value) {
      toast.add({ title: 'اختر الصنف أولاً', color: 'warning' })
      return
    }
    if (stats.value.kgRemaining <= 0.001) {
      toast.add({ title: 'لا يوجد رصيد للتحويل', color: 'warning' })
      return
    }
    try {
      await loadStatusesForProduct(selectedProductId.value)
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الحالات', description: e.message, color: 'error' })
      return
    }
    if (!stockStatuses.value.length) {
      toast.add({
        title: 'لا توجد حالات لهذا الصنف',
        description: 'أضف حالات من صفحة الصنف أولاً',
        color: 'warning'
      })
      return
    }
    try {
      await loadTransferDestinations()
    } catch (e: any) {
      toast.add({
        title: kind === 'store' ? 'تعذر تحميل المقالي' : 'تعذر تحميل المخازن',
        description: e.message,
        color: 'error'
      })
      return
    }
    transferForm.to_kind = 'sale'
    transferForm.to_id = ''
    transferForm.status_id = stockStatuses.value[0]?.id || ''
    transferForm.to_status_id = transferForm.status_id
    transferForm.quantity_kg = ''
    transferForm.movement_date = todayIsoDate()
    transferForm.notes = ''
    transferOpen.value = true
    await refreshTransferAvailable()
  }

  const cancelTransfer = () => {
    transferOpen.value = false
    transferForm.quantity_kg = ''
    transferForm.notes = ''
    transferForm.to_id = ''
  }

  const saveTransfer = async () => {
    if (!activeSeasonId.value) return
    const id = toValue(locationId)
    if (!id || !selectedProductId.value) {
      toast.add({ title: 'اختر الصنف أولاً', color: 'warning' })
      return
    }
    if (!transferForm.status_id) {
      toast.add({ title: 'اختر من الحالة', color: 'warning' })
      return
    }
    if (!transferForm.to_status_id) {
      toast.add({ title: 'اختر إلى الحالة', color: 'warning' })
      return
    }
    const toMekla = kind === 'store' && transferForm.to_kind === 'mekla'
    const toStore = kind === 'mekla' && transferForm.to_kind === 'store'
    if (toMekla && !transferForm.to_id) {
      toast.add({ title: 'اختر المقلى', color: 'warning' })
      return
    }
    if (toStore && !transferForm.to_id) {
      toast.add({ title: 'اختر المخزن', color: 'warning' })
      return
    }
    const qty = parseDecimal(transferForm.quantity_kg)
    if (!(qty > 0)) {
      toast.add({ title: 'الكمية يجب أن تكون أكبر من صفر', color: 'warning' })
      return
    }

    await refreshTransferAvailable()
    if (qty > transferAvailableKg.value + 0.001) {
      toast.add({
        title: 'الرصيد غير كافٍ',
        description: `المتاح: ${transferAvailableKg.value.toFixed(2)} كجم`,
        color: 'warning'
      })
      return
    }

    saving.value = true
    try {
      const toKind = toMekla
        ? 'mekla' as const
        : toStore
          ? 'store' as const
          : 'sale' as const
      const toId = (toMekla || toStore) ? transferForm.to_id : id
      const notes
        = transferForm.notes.trim()
        || (toMekla
          ? 'تحويل إلى مقلى'
          : toStore
            ? 'تحويل إلى مخزن'
            : 'بيع')
      const { error } = await client.from('stock_movements').insert({
        season_id: activeSeasonId.value,
        product_id: selectedProductId.value,
        status_id: transferForm.status_id,
        to_status_id: transferForm.to_status_id,
        movement_date: transferForm.movement_date,
        quantity_kg: qty,
        from_kind: kind,
        from_id: id,
        to_kind: toKind,
        to_id: toId,
        notes
      })
      if (error) throw error
      toast.add({
        title: toMekla
          ? 'تم التحويل إلى المقلى'
          : toStore
            ? 'تم التحويل إلى المخزن'
            : 'تم تسجيل البيع',
        color: 'success'
      })
      cancelTransfer()
      await invalidateAfterMutation(
        toMekla
          ? { toKind: 'mekla', toId }
          : toStore
            ? { toKind: 'store', toId }
            : undefined
      )
    } catch (e: any) {
      toast.add({ title: 'فشل التحويل', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
    isRefreshing,
    saving,
    entity,
    activeSeasonName,
    selectedProductId,
    productOptions,
    ledger,
    stats,
    listPath,
    entityLabel,
    transferOpen,
    transferForm,
    transferKindOptions,
    transferToOptions,
    transferToLabel,
    needsTransferDestination,
    transferStatusOptions,
    transferAvailableKg,
    openTransfer,
    onTransferKindChange,
    cancelTransfer,
    saveTransfer,
    setTransferQty: (raw: string) => {
      transferForm.quantity_kg = normalizeDecimalInput(raw)
    },
    load: invalidateAfterMutation
  }
}
