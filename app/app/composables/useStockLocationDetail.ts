import type { Database, StockLocationKind } from '~/types/database.types'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type StockLocationDetailKind = Extract<StockLocationKind, 'store' | 'mekla'>

type MovementRow = Database['public']['Tables']['stock_movements']['Row']

export type LocationMovementRow = {
  id: string
  date: string
  created_at: string
  counterparty: string
  product_id: string | null
  product_name: string | null
  status_id: string | null
  status_name: string | null
  quantity_kg: number
  qty_before: number
  qty_after: number
  notes: string | null
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function locationKindLabel(kind: StockLocationKind) {
  if (kind === 'store') return 'مخزن'
  if (kind === 'mekla') return 'مقلى'
  if (kind === 'client') return 'عميل'
  if (kind === 'waste') return 'هدر'
  if (kind === 'sale') return 'بيع'
  return 'ربع'
}

function applyRunningBalances(
  incoming: Omit<LocationMovementRow, 'qty_before' | 'qty_after'>[],
  outgoing: Omit<LocationMovementRow, 'qty_before' | 'qty_after'>[]
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

  const loading = ref(true)
  const saving = ref(false)
  const entity = ref<{ id: string, name: string, notes: string | null } | null>(null)
  const activeSeasonName = ref<string | null>(null)
  const activeSeasonId = ref<string | null>(null)
  const selectedProductId = ref('')
  const productOptions = ref<{ label: string, value: string }[]>([])
  const stockStatuses = ref<{ id: string, name: string, product_id: string }[]>([])

  const allIncoming = ref<Omit<LocationMovementRow, 'qty_before' | 'qty_after'>[]>([])
  const allOutgoing = ref<Omit<LocationMovementRow, 'qty_before' | 'qty_after'>[]>([])

  const transferOpen = ref(false)
  const transferForm = reactive({
    to_kind: 'sale' as const,
    status_id: '' as string,
    quantity_kg: '' as string,
    movement_date: todayIsoDate(),
    notes: ''
  })

  const transferKindOptions = [
    { label: 'بيع', value: 'sale' }
  ]

  const tableName = kind === 'store' ? 'stores' : 'meklas'
  const listPath = kind === 'store' ? '/stores' : '/meklas'
  const entityLabel = kind === 'store' ? 'المخزن' : 'المقلى'

  const resolveLocationName = async (
    locKind: StockLocationKind,
    id: string
  ) => {
    if (locKind === 'waste') return 'هدر'
    if (locKind === 'sale') return 'بيع'
    if (locKind === 'section') {
      const { data } = await client
        .from('warehouse_sections')
        .select('name, warehouses(name)')
        .eq('id', id)
        .maybeSingle()
      const row = data as { name?: string, warehouses?: { name?: string } | null } | null
      if (row?.name) {
        const wh = row.warehouses?.name
        return wh ? `شونة ${wh}: ${row.name}` : row.name
      }
      return 'ربع'
    }
    const table
      = locKind === 'store'
        ? 'stores'
        : locKind === 'mekla'
          ? 'meklas'
          : 'clients'
    const { data } = await client.from(table).select('name').eq('id', id).maybeSingle()
    const name = data?.name || '—'
    return `${locationKindLabel(locKind)}: ${name}`
  }

  const queryProductId = () => {
    const q = route.query.product
    return typeof q === 'string' && q.trim() ? q.trim() : ''
  }

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

  const load = async () => {
    const id = toValue(locationId)
    if (!id) {
      loading.value = false
      entity.value = null
      return
    }
    loading.value = true
    try {
      const [entityRes, seasonRes, productsRes] = await Promise.all([
        client.from(tableName).select('id, name, notes').eq('id', id).maybeSingle(),
        client.from('seasons').select('id, name').eq('is_active', true).maybeSingle(),
        client.from('products').select('id, name').eq('is_active', true).order('name')
      ])
      if (entityRes.error) throw entityRes.error
      if (seasonRes.error) throw seasonRes.error
      if (productsRes.error) throw productsRes.error

      entity.value = entityRes.data
      activeSeasonId.value = seasonRes.data?.id ?? null
      activeSeasonName.value = seasonRes.data?.name ?? null

      if (!seasonRes.data?.id || !entityRes.data) {
        allIncoming.value = []
        allOutgoing.value = []
        productOptions.value = []
        stockStatuses.value = []
        return
      }

      const [inRes, outRes, deliveriesRes] = await Promise.all([
        client
          .from('stock_movements')
          .select('*, products(name), stock_statuses(name)')
          .eq('season_id', seasonRes.data.id)
          .eq('to_kind', kind)
          .eq('to_id', id)
          .eq('is_cancelled', false)
          .order('movement_date', { ascending: true })
          .order('created_at', { ascending: true }),
        client
          .from('stock_movements')
          .select('*, products(name), stock_statuses(name)')
          .eq('season_id', seasonRes.data.id)
          .eq('from_kind', kind)
          .eq('from_id', id)
          .eq('is_cancelled', false)
          .order('movement_date', { ascending: true })
          .order('created_at', { ascending: true }),
        kind === 'store'
          ? client
              .from('warehouse_deliveries')
              .select('id, product_id, status_id, delivery_date, quantity_kg, notes, created_at, products(name), stock_statuses(name), suppliers(name)')
              .eq('season_id', seasonRes.data.id)
              .eq('destination_kind', 'store')
              .eq('store_id', id)
              .eq('is_cancelled', false)
              .order('delivery_date', { ascending: true })
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ])
      if (inRes.error) throw inRes.error
      if (outRes.error) throw outRes.error
      if (deliveriesRes.error) throw deliveriesRes.error

      const nameCache = new Map<string, string>()
      const cachedName = async (locKind: StockLocationKind, locId: string) => {
        const key = `${locKind}:${locId}`
        if (nameCache.has(key)) return nameCache.get(key)!
        const label = await resolveLocationName(locKind, locId)
        nameCache.set(key, label)
        return label
      }

      type MovJoined = MovementRow & {
        products?: { name?: string } | null
        stock_statuses?: { name?: string } | null
      }

      const incoming: Omit<LocationMovementRow, 'qty_before' | 'qty_after'>[] = []

      for (const d of deliveriesRes.data ?? []) {
        const row = d as {
          id: string
          delivery_date: string
          created_at?: string | null
          product_id: string | null
          status_id: string | null
          quantity_kg: number
          notes: string | null
          products?: { name?: string } | null
          stock_statuses?: { name?: string } | null
          suppliers?: { name?: string } | null
        }
        incoming.push({
          id: row.id,
          date: row.delivery_date,
          created_at: row.created_at || row.delivery_date,
          counterparty: row.suppliers?.name
            ? `مورد: ${row.suppliers.name}`
            : 'تسليم مباشر',
          product_id: row.product_id,
          product_name: row.products?.name ?? null,
          status_id: row.status_id,
          status_name: row.stock_statuses?.name ?? null,
          quantity_kg: Number(row.quantity_kg),
          notes: row.notes
        })
      }

      for (const m of (inRes.data ?? []) as MovJoined[]) {
        incoming.push({
          id: m.id,
          date: m.movement_date,
          created_at: m.created_at || m.movement_date,
          counterparty: await cachedName(m.from_kind, m.from_id),
          product_id: m.product_id,
          product_name: m.products?.name ?? null,
          status_id: m.status_id,
          status_name: m.stock_statuses?.name ?? null,
          quantity_kg: Number(m.quantity_kg),
          notes: m.notes
        })
      }

      const outgoing: Omit<LocationMovementRow, 'qty_before' | 'qty_after'>[] = []
      for (const m of (outRes.data ?? []) as MovJoined[]) {
        outgoing.push({
          id: m.id,
          date: m.movement_date,
          created_at: m.created_at || m.movement_date,
          counterparty: await cachedName(m.to_kind, m.to_id),
          product_id: m.product_id,
          product_name: m.products?.name ?? null,
          status_id: m.status_id,
          status_name: m.stock_statuses?.name ?? null,
          quantity_kg: Number(m.quantity_kg),
          notes: m.notes
        })
      }

      allIncoming.value = incoming
      allOutgoing.value = outgoing

      const productIds = new Set<string>()
      for (const row of [...incoming, ...outgoing]) {
        if (row.product_id) productIds.add(row.product_id)
      }
      const fromCatalog = (productsRes.data ?? [])
        .filter(p => productIds.has(p.id))
        .map(p => ({ label: p.name, value: p.id }))
      for (const pid of productIds) {
        if (!fromCatalog.some(o => o.value === pid)) {
          const name
            = [...incoming, ...outgoing].find(r => r.product_id === pid)?.product_name
            || pid
          fromCatalog.push({ label: name, value: pid })
        }
      }
      productOptions.value = fromCatalog

      const qPid = queryProductId()
      if (qPid && productOptions.value.some(o => o.value === qPid)) {
        selectedProductId.value = qPid
      } else if (
        selectedProductId.value
        && productOptions.value.some(o => o.value === selectedProductId.value)
      ) {
        // keep
      } else {
        selectedProductId.value = productOptions.value[0]?.value || ''
      }

      await loadStatusesForProduct(selectedProductId.value)
      if (
        transferForm.status_id
        && !stockStatuses.value.some(s => s.id === transferForm.status_id)
      ) {
        transferForm.status_id = stockStatuses.value[0]?.id || ''
      }
    } catch (e: any) {
      toast.add({
        title: `تعذر تحميل ${entityLabel}`,
        description: e.message,
        color: 'error'
      })
      entity.value = null
      allIncoming.value = []
      allOutgoing.value = []
    } finally {
      loading.value = false
    }
  }

  watch(() => toValue(locationId), () => {
    selectedProductId.value = queryProductId()
    cancelTransfer()
    load()
  })

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
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الحالات', description: e.message, color: 'error' })
    }
  })

  onMounted(() => {
    selectedProductId.value = queryProductId()
    load()
  })

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
    transferForm.to_kind = 'sale'
    transferForm.status_id = stockStatuses.value[0]?.id || ''
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
  }

  const saveTransfer = async () => {
    if (!activeSeasonId.value) return
    const id = toValue(locationId)
    if (!id || !selectedProductId.value) {
      toast.add({ title: 'اختر الصنف أولاً', color: 'warning' })
      return
    }
    if (!transferForm.status_id) {
      toast.add({ title: 'اختر الحالة', color: 'warning' })
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
      const notes = transferForm.notes.trim() || 'بيع'
      const { error } = await client.from('stock_movements').insert({
        season_id: activeSeasonId.value,
        product_id: selectedProductId.value,
        status_id: transferForm.status_id,
        movement_date: transferForm.movement_date,
        quantity_kg: qty,
        from_kind: kind,
        from_id: id,
        to_kind: 'sale',
        to_id: id,
        notes
      })
      if (error) throw error
      toast.add({ title: 'تم تسجيل البيع', color: 'success' })
      cancelTransfer()
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل التحويل', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  return {
    loading,
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
    transferStatusOptions,
    transferAvailableKg,
    openTransfer,
    cancelTransfer,
    saveTransfer,
    setTransferQty: (raw: string) => {
      transferForm.quantity_kg = normalizeDecimalInput(raw)
    },
    load
  }
}
