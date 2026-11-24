import { useQueryClient } from '@tanstack/vue-query'
import type { Database, StockLocationKind } from '~/types/database.types'
import { queryKeys } from '~/composables/queries/queryKeys'
import { useStockLocationDetailQuery } from '~/composables/queries/useStockLocationDetailQuery'
import {
  type LocationMovementLite,
  type StockLocationDetailKind,
  type StoreSlotLite
} from '~/features/stores/utils/stockLocationDetailBundle'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

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
  const { confirm: askConfirm } = useConfirmDialog()
  const detailQuery = useStockLocationDetailQuery(kind, locationId)

  const saving = ref(false)
  const stockStatuses = ref<{ id: string, name: string, product_id: string }[]>([])

  type TransferUiKind = 'sale' | 'mekla' | 'store'

  const transferOpen = ref(false)
  const editingMovementId = ref<string | null>(null)
  const editingMovementQty = ref(0)
  const editingMovementSnapshot = ref<{
    to_kind: StockLocationKind
    to_id: string
    product_id: string
    to_status_id: string
    quantity_kg: number
  } | null>(null)
  const meklas = ref<{ id: string, name: string }[]>([])
  const stores = ref<{ id: string, name: string }[]>([])
  const transferForm = reactive({
    from_slot_id: '' as string,
    to_kind: 'sale' as TransferUiKind,
    to_id: '' as string,
    to_slot_id: '' as string,
    status_id: '' as string,
    to_status_id: '' as string,
    quantity_kg: '' as string,
    movement_date: todayIsoDate()
  })

  const destStoreSlots = ref<StoreSlotLite[]>([])
  const selectedSlotId = ref('all')
  const slotModalOpen = ref(false)
  const editingSlot = ref<StoreSlotLite | null>(null)
  const slotForm = reactive({
    name: '',
    color: '#64748B'
  })

  const normalizeSlotColor = (raw: string | null | undefined) => {
    const value = String(raw || '').trim()
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value.toUpperCase()
    return null
  }

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
  const slots = computed(() => detailQuery.data.value?.slots ?? [])
  const slotOptions = computed(() => [
    { label: 'كل الخانات', value: 'all' },
    ...slots.value.map(s => ({ label: s.name, value: s.id }))
  ])
  const transferFromSlotOptions = computed(() =>
    slots.value.map(s => ({ label: s.name, value: s.id }))
  )
  const transferToSlotOptions = computed(() =>
    destStoreSlots.value.map(s => ({ label: s.name, value: s.id }))
  )
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

  const loadDestStoreSlots = async (storeId: string) => {
    destStoreSlots.value = []
    transferForm.to_slot_id = ''
    if (!storeId) return
    const { data, error } = await client
      .from('store_slots')
      .select('id, name, color, store_id')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    destStoreSlots.value = (data ?? []) as StoreSlotLite[]
    transferForm.to_slot_id = destStoreSlots.value[0]?.id || ''
  }

  const onTransferKindChange = async (next: TransferUiKind) => {
    transferForm.to_kind = next
    transferForm.to_slot_id = ''
    destStoreSlots.value = []
    if (next === 'mekla') {
      transferForm.to_id = meklas.value[0]?.id || ''
    } else if (next === 'store') {
      transferForm.to_id = stores.value[0]?.id || ''
      if (transferForm.to_id) await loadDestStoreSlots(transferForm.to_id)
    } else {
      transferForm.to_id = ''
    }
  }

  const onTransferStoreChange = async (storeId: string) => {
    transferForm.to_id = storeId
    await loadDestStoreSlots(storeId)
  }

  const filteredIncomingBase = computed(() => {
    let rows = allIncoming.value
    const pid = selectedProductId.value
    if (pid) rows = rows.filter(r => r.product_id === pid)
    if (kind === 'store' && selectedSlotId.value !== 'all') {
      rows = rows.filter(r => r.slot_id === selectedSlotId.value)
    }
    return rows
  })

  const filteredOutgoingBase = computed(() => {
    let rows = allOutgoing.value
    const pid = selectedProductId.value
    if (pid) rows = rows.filter(r => r.product_id === pid)
    if (kind === 'store' && selectedSlotId.value !== 'all') {
      rows = rows.filter(r => r.slot_id === selectedSlotId.value)
    }
    return rows
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
  const transferAvailableForForm = computed(
    () =>
      transferAvailableKg.value
      + (editingMovementId.value ? editingMovementQty.value : 0)
  )

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
    const fromKind = kind === 'store' ? 'store_slot' as const : kind
    const fromId = kind === 'store' ? transferForm.from_slot_id : id
    if (!fromId) return
    const { data, error } = await client.rpc('location_remaining_kg', {
      p_kind: fromKind,
      p_id: fromId,
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
    () => [
      transferOpen.value,
      transferForm.status_id,
      transferForm.from_slot_id,
      selectedProductId.value
    ] as const,
    async ([open]) => {
      if (open) await refreshTransferAvailable()
    }
  )

  const assertDestinationAllowsRemoval = async (opts: {
    to_kind: StockLocationKind
    to_id: string
    product_id: string
    to_status_id: string
    season_id: string
    remove_kg: number
  }) => {
    if (!(opts.remove_kg > 0.001)) return
    if (opts.to_kind === 'sale') return
    const { data, error } = await client.rpc('location_remaining_kg', {
      p_kind: opts.to_kind,
      p_id: opts.to_id,
      p_product_id: opts.product_id,
      p_status_id: opts.to_status_id,
      p_season_id: opts.season_id
    })
    if (error) throw error
    const remaining = Number(data ?? 0)
    const after = remaining - opts.remove_kg
    if (after < -0.001) {
      throw new Error(
        `رصيد الوجهة سيصبح سالباً (${after.toFixed(2)} كجم). انقل أو احذف الحركات اللاحقة أولاً`
      )
    }
  }

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
    editingMovementId.value = null
    editingMovementQty.value = 0
    editingMovementSnapshot.value = null
    transferForm.to_kind = 'sale'
    transferForm.to_id = ''
    transferForm.to_slot_id = ''
    destStoreSlots.value = []
    transferForm.from_slot_id
      = (selectedSlotId.value !== 'all' ? selectedSlotId.value : '')
      || slots.value[0]?.id
      || ''
    transferForm.status_id = stockStatuses.value[0]?.id || ''
    transferForm.to_status_id = transferForm.status_id
    transferForm.quantity_kg = ''
    transferForm.movement_date = todayIsoDate()
    transferOpen.value = true
    await refreshTransferAvailable()
  }

  const openEditMovement = async (row: LocationMovementLite) => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (row.source === 'delivery') {
      toast.add({
        title: 'لا يمكن التعديل من هنا',
        description: 'التسليمات تُدار من صفحة المورد',
        color: 'warning'
      })
      return
    }
    const expectedFrom = kind === 'store' ? 'store_slot' : 'mekla'
    if (row.from_kind !== expectedFrom) {
      toast.add({
        title: 'لا يمكن التعديل من هنا',
        description: kind === 'store'
          ? 'يمكن تعديل التحويلات الصادرة من خانة فقط'
          : 'يمكن تعديل التحويلات الصادرة من المقلى فقط',
        color: 'warning'
      })
      return
    }
    if (
      row.to_kind !== 'sale'
      && row.to_kind !== 'mekla'
      && row.to_kind !== 'store_slot'
    ) {
      toast.add({ title: 'نوع الوجهة غير مدعوم للتعديل', color: 'warning' })
      return
    }
    if (!row.product_id) {
      toast.add({ title: 'بيانات الحركة غير مكتملة', color: 'warning' })
      return
    }

    selectedProductId.value = row.product_id
    try {
      await loadStatusesForProduct(row.product_id)
      await loadTransferDestinations()
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الوجهات', description: e.message, color: 'error' })
      return
    }

    editingMovementId.value = row.id
    editingMovementQty.value = Number(row.quantity_kg)
    editingMovementSnapshot.value = {
      to_kind: row.to_kind,
      to_id: row.to_id || '',
      product_id: row.product_id,
      to_status_id: row.to_status_id || row.status_id || '',
      quantity_kg: Number(row.quantity_kg)
    }

    const uiKind: TransferUiKind
      = row.to_kind === 'store_slot'
        ? 'store'
        : row.to_kind === 'mekla'
          ? 'mekla'
          : 'sale'
    transferForm.to_kind = uiKind
    transferForm.from_slot_id = kind === 'store' ? (row.from_id || '') : ''
    transferForm.status_id = row.status_id || stockStatuses.value[0]?.id || ''
    transferForm.to_status_id
      = row.to_status_id || transferForm.status_id || stockStatuses.value[0]?.id || ''
    transferForm.quantity_kg = String(row.quantity_kg)
    transferForm.movement_date = row.date
    transferForm.to_id = ''
    transferForm.to_slot_id = ''
    destStoreSlots.value = []

    if (uiKind === 'store' && row.to_id) {
      const { data: slot } = await client
        .from('store_slots')
        .select('id, store_id')
        .eq('id', row.to_id)
        .maybeSingle()
      transferForm.to_id = slot?.store_id || ''
      if (transferForm.to_id) await loadDestStoreSlots(transferForm.to_id)
      transferForm.to_slot_id = slot?.id || row.to_id
    } else if (uiKind === 'mekla') {
      transferForm.to_id = row.to_id || ''
    } else {
      transferForm.to_id = ''
    }

    transferOpen.value = true
    await refreshTransferAvailable()
  }

  const deleteMovement = async (row: LocationMovementLite) => {
    if (row.source === 'delivery') {
      toast.add({
        title: 'لا يمكن الحذف من هنا',
        description: 'التسليمات تُدار من صفحة المورد',
        color: 'warning'
      })
      return
    }
    const ok = await askConfirm('حذف التحويل نهائياً؟')
    if (!ok) return
    saving.value = true
    try {
      if (
        activeSeasonId.value
        && row.to_kind
        && row.to_id
        && row.product_id
        && (row.to_status_id || row.status_id)
      ) {
        await assertDestinationAllowsRemoval({
          to_kind: row.to_kind,
          to_id: row.to_id,
          product_id: row.product_id,
          to_status_id: row.to_status_id || row.status_id || '',
          season_id: activeSeasonId.value,
          remove_kg: Number(row.quantity_kg || 0)
        })
      }
      const { error } = await client.from('stock_movements').delete().eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم حذف التحويل', color: 'success' })
      if (editingMovementId.value === row.id) cancelTransfer()
      const invalidateTarget
        = row.to_kind === 'mekla' && row.to_id
          ? { toKind: 'mekla' as const, toId: row.to_id }
          : row.to_kind === 'store_slot' && row.to_id
            ? await (async () => {
                const { data: slot } = await client
                  .from('store_slots')
                  .select('store_id')
                  .eq('id', row.to_id!)
                  .maybeSingle()
                return slot?.store_id
                  ? { toKind: 'store' as const, toId: slot.store_id }
                  : undefined
              })()
            : undefined
      await invalidateAfterMutation(invalidateTarget)
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const cancelTransfer = () => {
    transferOpen.value = false
    editingMovementId.value = null
    editingMovementQty.value = 0
    editingMovementSnapshot.value = null
    transferForm.quantity_kg = ''
    transferForm.to_id = ''
    transferForm.to_slot_id = ''
    transferForm.from_slot_id = ''
    destStoreSlots.value = []
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
    const toSale = transferForm.to_kind === 'sale'
    if (kind === 'store' && !transferForm.from_slot_id) {
      toast.add({ title: 'اختر الخانة المصدر', color: 'warning' })
      return
    }
    if (toMekla && !transferForm.to_id) {
      toast.add({ title: 'اختر المقلى', color: 'warning' })
      return
    }
    if (toStore && !transferForm.to_id) {
      toast.add({ title: 'اختر المخزن', color: 'warning' })
      return
    }
    if (toStore && !transferForm.to_slot_id) {
      toast.add({ title: 'اختر خانة المخزن', color: 'warning' })
      return
    }
    const qty = parseDecimal(transferForm.quantity_kg)
    if (!(qty > 0)) {
      toast.add({ title: 'الكمية يجب أن تكون أكبر من صفر', color: 'warning' })
      return
    }

    await refreshTransferAvailable()
    const available
      = transferAvailableKg.value
      + (editingMovementId.value ? editingMovementQty.value : 0)
    if (qty > available + 0.001) {
      toast.add({
        title: 'الرصيد غير كافٍ',
        description: `المتاح: ${available.toFixed(2)} كجم`,
        color: 'warning'
      })
      return
    }

    const fromKind = kind === 'store' ? 'store_slot' as const : kind
    const fromId = kind === 'store' ? transferForm.from_slot_id : id
    const toKind = toMekla
      ? 'mekla' as const
      : toStore
        ? 'store_slot' as const
        : 'sale' as const
    const toId = toMekla
      ? transferForm.to_id
      : toStore
        ? transferForm.to_slot_id
        : id

    if (editingMovementId.value) {
      saving.value = true
      try {
        const snap = editingMovementSnapshot.value
        if (snap && activeSeasonId.value) {
          const sameDest
            = snap.to_kind === toKind
            && snap.to_id === toId
            && snap.product_id === selectedProductId.value
            && snap.to_status_id === transferForm.to_status_id
          const removeKg = sameDest
            ? Math.max(0, snap.quantity_kg - qty)
            : snap.quantity_kg
          await assertDestinationAllowsRemoval({
            to_kind: snap.to_kind,
            to_id: snap.to_id,
            product_id: snap.product_id,
            to_status_id: snap.to_status_id,
            season_id: activeSeasonId.value,
            remove_kg: removeKg
          })
        }
        const { error } = await client
          .from('stock_movements')
          .update({
            status_id: transferForm.status_id,
            to_status_id: transferForm.to_status_id,
            movement_date: transferForm.movement_date,
            quantity_kg: qty,
            from_kind: fromKind,
            from_id: fromId,
            to_kind: toKind,
            to_id: toId
          })
          .eq('id', editingMovementId.value)
        if (error) throw error
        toast.add({ title: 'تم تحديث التحويل', color: 'success' })
        const invalidateTarget = toMekla
          ? { toKind: 'mekla' as const, toId: transferForm.to_id }
          : toStore
            ? { toKind: 'store' as const, toId: transferForm.to_id }
            : undefined
        cancelTransfer()
        await invalidateAfterMutation(invalidateTarget)
      } catch (e: any) {
        toast.add({ title: 'فشل التحديث', description: e.message, color: 'error' })
      } finally {
        saving.value = false
      }
      return
    }

    saving.value = true
    try {
      const { error } = await client.from('stock_movements').insert({
        season_id: activeSeasonId.value,
        product_id: selectedProductId.value,
        status_id: transferForm.status_id,
        to_status_id: transferForm.to_status_id,
        movement_date: transferForm.movement_date,
        quantity_kg: qty,
        from_kind: fromKind,
        from_id: fromId,
        to_kind: toKind,
        to_id: toId
      })
      if (error) throw error
      toast.add({
        title: toMekla
          ? 'تم التحويل إلى المقلى'
          : toStore
            ? 'تم التحويل إلى المخزن'
            : toSale
              ? 'تم تسجيل البيع'
              : 'تم التحويل',
        color: 'success'
      })
      const invalidateTarget = toMekla
        ? { toKind: 'mekla' as const, toId: transferForm.to_id }
        : toStore
          ? { toKind: 'store' as const, toId: transferForm.to_id }
          : undefined
      cancelTransfer()
      await invalidateAfterMutation(invalidateTarget)
    } catch (e: any) {
      toast.add({ title: 'فشل التحويل', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const openSlotCreate = () => {
    editingSlot.value = null
    slotForm.name = ''
    slotForm.color = '#64748B'
    slotModalOpen.value = true
  }

  const openSlotEdit = (slot: StoreSlotLite) => {
    editingSlot.value = slot
    slotForm.name = slot.name
    slotForm.color = normalizeSlotColor(slot.color) || '#64748B'
    slotModalOpen.value = true
  }

  const saveSlot = async () => {
    if (kind !== 'store') return
    const storeId = toValue(locationId)
    const name = slotForm.name.trim()
    if (!storeId || !name) {
      toast.add({ title: 'اسم الخانة مطلوب', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const payload = {
        store_id: storeId,
        name,
        color: normalizeSlotColor(slotForm.color),
        is_active: true
      }
      if (editingSlot.value) {
        const { error } = await client
          .from('store_slots')
          .update({ name: payload.name, color: payload.color })
          .eq('id', editingSlot.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الخانة', color: 'success' })
      } else {
        const { error } = await client.from('store_slots').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة الخانة', color: 'success' })
      }
      slotModalOpen.value = false
      await invalidateAfterMutation()
    } catch (e: any) {
      toast.add({ title: 'فشل حفظ الخانة', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDeleteSlot = async (slot: StoreSlotLite) => {
    if (kind !== 'store') return
    if (slots.value.length <= 1) {
      toast.add({ title: 'لا يمكن حذف آخر خانة', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const { error } = await client.from('store_slots').delete().eq('id', slot.id)
      if (error) throw error
      if (selectedSlotId.value === slot.id) selectedSlotId.value = 'all'
      toast.add({ title: 'تم حذف الخانة', color: 'success' })
      await invalidateAfterMutation()
    } catch (e: any) {
      toast.add({
        title: 'فشل حذف الخانة',
        description: e.message.includes('restrict') || e.message.includes('foreign')
          ? 'الخانة مرتبطة بحركات أو تسليمات'
          : e.message,
        color: 'error'
      })
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
    isRefreshing,
    saving,
    entity,
    slots,
    selectedSlotId,
    slotOptions,
    transferFromSlotOptions,
    transferToSlotOptions,
    slotModalOpen,
    editingSlot,
    slotForm,
    activeSeasonName,
    selectedProductId,
    productOptions,
    ledger,
    allIncoming,
    allOutgoing,
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
    transferAvailableForForm,
    openTransfer,
    openEditMovement,
    deleteMovement,
    editingMovementId,
    onTransferKindChange,
    onTransferStoreChange,
    cancelTransfer,
    saveTransfer,
    openSlotCreate,
    openSlotEdit,
    saveSlot,
    softDeleteSlot,
    setTransferQty: (raw: string) => {
      transferForm.quantity_kg = normalizeDecimalInput(raw)
    },
    load: invalidateAfterMutation
  }
}
