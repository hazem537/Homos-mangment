import type { Database, StockLocationKind } from '~/types/database.types'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type SectionBalance =
  Database['public']['Functions']['section_balances']['Returns'][number]

export type SectionIncomingRow = {
  id: string
  date: string
  created_at: string
  source: string
  quantity_kg: number
  qty_before: number
  qty_after: number
  notes: string | null
  kind: 'delivery' | 'movement'
}

export type SectionOutgoingRow = {
  id: string
  date: string
  created_at: string
  destination: string
  quantity_kg: number
  qty_before: number
  qty_after: number
  notes: string | null
}

export type SectionCard = SectionBalance & {
  incoming: SectionIncomingRow[]
  outgoing: SectionOutgoingRow[]
}

export type WarehouseLedgerIncomingRow = SectionIncomingRow & {
  section_id: string
  section_name: string
}

export type WarehouseLedgerOutgoingRow = SectionOutgoingRow & {
  section_id: string
  section_name: string
}

export type WarehouseLedgerCard = {
  incoming: WarehouseLedgerIncomingRow[]
  outgoing: WarehouseLedgerOutgoingRow[]
  kg_in: number
  kg_out: number
  kg_remaining: number
}

type WarehouseRow = Database['public']['Tables']['warehouses']['Row']
type MovementRow = Database['public']['Tables']['stock_movements']['Row']

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function locationKindLabel(kind: StockLocationKind) {
  if (kind === 'store') return 'مخزن'
  if (kind === 'mekla') return 'مقلى'
  if (kind === 'client') return 'عميل'
  return 'ربع'
}

function applySectionRunningBalances(
  incoming: Omit<SectionIncomingRow, 'qty_before' | 'qty_after'>[],
  outgoing: Omit<SectionOutgoingRow, 'qty_before' | 'qty_after'>[]
) {
  type Event = {
    id: string
    date: string
    created_at: string
    delta: number
  }

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

  const withBalance = <T extends { id: string }>(
    rows: T[]
  ): Array<T & { qty_before: number, qty_after: number }> =>
    rows.map((row) => {
      const bal = balanceById.get(row.id) ?? { qty_before: 0, qty_after: 0 }
      return { ...row, ...bal }
    })

  return {
    incoming: withBalance(incoming) as SectionIncomingRow[],
    outgoing: withBalance(outgoing) as SectionOutgoingRow[]
  }
}

export function useWarehouseDetail(warehouseId: MaybeRefOrGetter<string>) {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const warehouse = ref<WarehouseRow | null>(null)
  const sectionCards = ref<SectionCard[]>([])
  const activeSeasonName = ref<string | null>(null)
  const activeSeasonId = ref<string | null>(null)

  const sectionModalOpen = ref(false)
  const editingSection = ref<SectionBalance | null>(null)
  const sectionForm = reactive({
    name: '',
    notes: ''
  })

  const transferModalOpen = ref(false)
  const transferFromSection = ref<SectionBalance | null>(null)
  const stores = ref<{ id: string, name: string }[]>([])
  const meklas = ref<{ id: string, name: string }[]>([])
  const transferForm = reactive({
    to_kind: 'store' as Extract<StockLocationKind, 'store' | 'mekla'>,
    to_id: '' as string,
    quantity_kg: '' as string,
    movement_date: todayIsoDate(),
    notes: ''
  })

  const transferToOptions = computed(() => {
    const rows = transferForm.to_kind === 'store' ? stores.value : meklas.value
    return rows.map(r => ({ label: r.name, value: r.id }))
  })

  const resolveLocationName = async (
    kind: StockLocationKind,
    id: string,
    sectionNameById: Map<string, string>
  ) => {
    if (kind === 'section') {
      return sectionNameById.get(id) || 'ربع'
    }
    const table
      = kind === 'store'
        ? 'stores'
        : kind === 'mekla'
          ? 'meklas'
          : 'clients'
    const { data } = await client.from(table).select('name').eq('id', id).maybeSingle()
    const name = data?.name || '—'
    return `${locationKindLabel(kind)}: ${name}`
  }

  const load = async () => {
    const id = toValue(warehouseId)
    if (!id) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const [whRes, seasonRes, sectionsRes] = await Promise.all([
        client.from('warehouses').select('*').eq('id', id).maybeSingle(),
        client.from('seasons').select('id, name').eq('is_active', true).maybeSingle(),
        client.rpc('section_balances', { p_warehouse_id: id })
      ])
      if (whRes.error) throw whRes.error
      if (seasonRes.error) throw seasonRes.error
      if (sectionsRes.error) throw sectionsRes.error

      warehouse.value = whRes.data
      activeSeasonName.value = seasonRes.data?.name ?? null
      activeSeasonId.value = seasonRes.data?.id ?? null
      const balances = sectionsRes.data ?? []
      const sectionIds = balances.map(s => s.section_id)
      const sectionNameById = new Map(balances.map(s => [s.section_id, s.section_name]))

      const incomingBySection = new Map<string, SectionIncomingRow[]>()
      const outgoingBySection = new Map<string, SectionOutgoingRow[]>()
      for (const sid of sectionIds) {
        incomingBySection.set(sid, [])
        outgoingBySection.set(sid, [])
      }

      if (seasonRes.data?.id && sectionIds.length) {
        const [deliveriesRes, outMovRes, inMovRes] = await Promise.all([
          client
            .from('warehouse_deliveries')
            .select('id, section_id, delivery_date, quantity_kg, notes, created_at, suppliers(name)')
            .eq('warehouse_id', id)
            .eq('season_id', seasonRes.data.id)
            .eq('is_cancelled', false)
            .order('delivery_date', { ascending: false })
            .order('created_at', { ascending: false }),
          client
            .from('stock_movements')
            .select('*')
            .eq('season_id', seasonRes.data.id)
            .eq('from_kind', 'section')
            .in('from_id', sectionIds)
            .eq('is_cancelled', false)
            .order('movement_date', { ascending: false })
            .order('created_at', { ascending: false }),
          client
            .from('stock_movements')
            .select('*')
            .eq('season_id', seasonRes.data.id)
            .eq('to_kind', 'section')
            .in('to_id', sectionIds)
            .eq('is_cancelled', false)
            .order('movement_date', { ascending: false })
            .order('created_at', { ascending: false })
        ])
        if (deliveriesRes.error) throw deliveriesRes.error
        if (outMovRes.error) throw outMovRes.error
        if (inMovRes.error) throw inMovRes.error

        for (const d of deliveriesRes.data ?? []) {
          const list = incomingBySection.get(d.section_id)
          if (!list) continue
          const supplierName = (d as { suppliers?: { name?: string } | null }).suppliers?.name
          list.push({
            id: d.id,
            date: d.delivery_date,
            created_at: d.created_at || d.delivery_date,
            source: supplierName ? `مورد: ${supplierName}` : 'تسليم',
            quantity_kg: Number(d.quantity_kg),
            qty_before: 0,
            qty_after: 0,
            notes: d.notes,
            kind: 'delivery'
          })
        }

        const nameCache = new Map<string, string>()
        const cachedName = async (kind: StockLocationKind, locId: string) => {
          const key = `${kind}:${locId}`
          if (nameCache.has(key)) return nameCache.get(key)!
          const label = await resolveLocationName(kind, locId, sectionNameById)
          nameCache.set(key, label)
          return label
        }

        for (const m of (outMovRes.data ?? []) as MovementRow[]) {
          const list = outgoingBySection.get(m.from_id)
          if (!list) continue
          list.push({
            id: m.id,
            date: m.movement_date,
            created_at: m.created_at || m.movement_date,
            destination: await cachedName(m.to_kind, m.to_id),
            quantity_kg: Number(m.quantity_kg),
            qty_before: 0,
            qty_after: 0,
            notes: m.notes
          })
        }

        for (const m of (inMovRes.data ?? []) as MovementRow[]) {
          const list = incomingBySection.get(m.to_id)
          if (!list) continue
          list.push({
            id: m.id,
            date: m.movement_date,
            created_at: m.created_at || m.movement_date,
            source: await cachedName(m.from_kind, m.from_id),
            quantity_kg: Number(m.quantity_kg),
            qty_before: 0,
            qty_after: 0,
            notes: m.notes,
            kind: 'movement'
          })
        }

        for (const sid of sectionIds) {
          const balanced = applySectionRunningBalances(
            incomingBySection.get(sid) ?? [],
            outgoingBySection.get(sid) ?? []
          )
          balanced.incoming.sort((a, b) => {
            const byDate = b.date.localeCompare(a.date)
            if (byDate !== 0) return byDate
            return b.created_at.localeCompare(a.created_at)
          })
          balanced.outgoing.sort((a, b) => {
            const byDate = b.date.localeCompare(a.date)
            if (byDate !== 0) return byDate
            return b.created_at.localeCompare(a.created_at)
          })
          incomingBySection.set(sid, balanced.incoming)
          outgoingBySection.set(sid, balanced.outgoing)
        }
      }

      sectionCards.value = balances.map(b => ({
        ...b,
        incoming: incomingBySection.get(b.section_id) ?? [],
        outgoing: outgoingBySection.get(b.section_id) ?? []
      }))

      if (
        selectedSectionId.value !== 'all'
        && !sectionCards.value.some(s => s.section_id === selectedSectionId.value)
      ) {
        selectedSectionId.value = 'all'
      }
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الشونة', description: e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  const openCreateSection = () => {
    editingSection.value = null
    sectionForm.name = ''
    sectionForm.notes = ''
    sectionModalOpen.value = true
  }

  const openEditSection = (row: SectionBalance) => {
    editingSection.value = row
    sectionForm.name = row.section_name
    sectionForm.notes = row.notes || ''
    sectionModalOpen.value = true
  }

  const saveSection = async () => {
    const id = toValue(warehouseId)
    if (!id || !sectionForm.name.trim()) {
      toast.add({ title: 'اسم الربع مطلوب', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const payload = {
        warehouse_id: id,
        name: sectionForm.name.trim(),
        notes: sectionForm.notes.trim() || null,
        is_active: true
      }
      if (editingSection.value) {
        const { error } = await client
          .from('warehouse_sections')
          .update(payload)
          .eq('id', editingSection.value.section_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الربع', color: 'success' })
      } else {
        const { error } = await client.from('warehouse_sections').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة الربع', color: 'success' })
      }
      sectionModalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDeleteSection = async (row: SectionBalance) => {
    if (Math.abs(Number(row.kg_remaining)) > 0.001) {
      toast.add({
        title: 'لا يمكن حذف الربع',
        description: 'الرصيد يجب أن يكون صفراً تقريباً',
        color: 'warning'
      })
      return
    }
    const ok = await askConfirm(`حذف الربع «${row.section_name}»؟`)
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client
        .from('warehouse_sections')
        .update({ is_active: false })
        .eq('id', row.section_id)
      if (error) throw error
      toast.add({ title: 'تم حذف الربع', color: 'success' })
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const ensureDestinations = async () => {
    const [storesRes, meklasRes] = await Promise.all([
      client.from('stores').select('id, name').eq('is_active', true).order('name'),
      client.from('meklas').select('id, name').eq('is_active', true).order('name')
    ])
    if (storesRes.error) throw storesRes.error
    if (meklasRes.error) throw meklasRes.error
    stores.value = storesRes.data ?? []
    meklas.value = meklasRes.data ?? []
  }

  const openTransfer = async (row: SectionBalance) => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (Number(row.kg_remaining) <= 0.001) {
      toast.add({ title: 'لا يوجد رصيد للتحويل', color: 'warning' })
      return
    }
    try {
      await ensureDestinations()
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الوجهات', description: e.message, color: 'error' })
      return
    }
    if (!stores.value.length && !meklas.value.length) {
      toast.add({
        title: 'لا توجد وجهات',
        description: 'أضف مخزناً أو مقلى أولاً',
        color: 'warning'
      })
      return
    }
    transferFromSection.value = row
    transferForm.to_kind = stores.value.length ? 'store' : 'mekla'
    transferForm.to_id
      = (transferForm.to_kind === 'store' ? stores.value[0]?.id : meklas.value[0]?.id) || ''
    transferForm.quantity_kg = ''
    transferForm.movement_date = todayIsoDate()
    transferForm.notes = ''
    transferModalOpen.value = true
  }

  const onTransferKindChange = () => {
    const first = transferToOptions.value[0]?.value || ''
    transferForm.to_id = first
  }

  const saveTransfer = async () => {
    if (!activeSeasonId.value || !transferFromSection.value) return
    const qty = parseDecimal(transferForm.quantity_kg)
    if (!transferForm.to_id) {
      toast.add({ title: 'اختر الوجهة', color: 'warning' })
      return
    }
    if (!(qty > 0)) {
      toast.add({ title: 'الكمية يجب أن تكون أكبر من صفر', color: 'warning' })
      return
    }
    if (qty > Number(transferFromSection.value.kg_remaining) + 0.001) {
      toast.add({
        title: 'الكمية أكبر من الرصيد',
        description: `المتاح: ${Number(transferFromSection.value.kg_remaining).toFixed(2)} كجم`,
        color: 'warning'
      })
      return
    }
    saving.value = true
    try {
      const { error } = await client.from('stock_movements').insert({
        season_id: activeSeasonId.value,
        movement_date: transferForm.movement_date,
        quantity_kg: qty,
        from_kind: 'section',
        from_id: transferFromSection.value.section_id,
        to_kind: transferForm.to_kind,
        to_id: transferForm.to_id,
        notes: transferForm.notes.trim() || null
      })
      if (error) throw error
      toast.add({ title: 'تم التحويل', color: 'success' })
      transferModalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل التحويل', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const selectedSectionId = ref('all')

  watch(() => toValue(warehouseId), () => {
    selectedSectionId.value = 'all'
    load()
  })

  onMounted(load)

  const warehouseStats = computed(() => {
    const rows = sectionCards.value
    const kgIn = rows.reduce((s, r) => s + Number(r.kg_in || 0), 0)
    const kgOut = rows.reduce((s, r) => s + Number(r.kg_out || 0), 0)
    const kgRemaining = rows.reduce((s, r) => s + Number(r.kg_remaining || 0), 0)
    return {
      sectionsCount: rows.length,
      kgIn,
      kgOut,
      kgRemaining
    }
  })

  const sectionFilterOptions = computed(() => [
    { label: 'كل الأرباع', value: 'all' },
    ...sectionCards.value.map(s => ({
      label: s.section_name,
      value: s.section_id
    }))
  ])

  const filteredSectionCards = computed(() => {
    if (selectedSectionId.value === 'all') return sectionCards.value
    return sectionCards.value.filter(s => s.section_id === selectedSectionId.value)
  })

  const showWarehouseLedger = computed(() => selectedSectionId.value === 'all')

  const warehouseLedgerCard = computed<WarehouseLedgerCard>(() => {
    const incomingBase: Omit<WarehouseLedgerIncomingRow, 'qty_before' | 'qty_after'>[] = []
    const outgoingBase: Omit<WarehouseLedgerOutgoingRow, 'qty_before' | 'qty_after'>[] = []

    for (const card of sectionCards.value) {
      for (const row of card.incoming) {
        incomingBase.push({
          id: row.id,
          date: row.date,
          created_at: row.created_at,
          source: row.source,
          quantity_kg: row.quantity_kg,
          notes: row.notes,
          kind: row.kind,
          section_id: card.section_id,
          section_name: card.section_name
        })
      }
      for (const row of card.outgoing) {
        outgoingBase.push({
          id: row.id,
          date: row.date,
          created_at: row.created_at,
          destination: row.destination,
          quantity_kg: row.quantity_kg,
          notes: row.notes,
          section_id: card.section_id,
          section_name: card.section_name
        })
      }
    }

    const balanced = applySectionRunningBalances(incomingBase, outgoingBase)

    const sortDesc = <T extends { date: string, created_at: string }>(rows: T[]) =>
      [...rows].sort((a, b) => {
        const byDate = b.date.localeCompare(a.date)
        if (byDate !== 0) return byDate
        return b.created_at.localeCompare(a.created_at)
      })

    return {
      incoming: sortDesc(balanced.incoming) as WarehouseLedgerIncomingRow[],
      outgoing: sortDesc(balanced.outgoing) as WarehouseLedgerOutgoingRow[],
      kg_in: warehouseStats.value.kgIn,
      kg_out: warehouseStats.value.kgOut,
      kg_remaining: warehouseStats.value.kgRemaining
    }
  })

  return {
    loading,
    saving,
    warehouse,
    sectionCards,
    filteredSectionCards,
    warehouseLedgerCard,
    showWarehouseLedger,
    warehouseStats,
    selectedSectionId,
    sectionFilterOptions,
    activeSeasonName,
    sectionModalOpen,
    sectionForm,
    transferModalOpen,
    transferFromSection,
    transferForm,
    transferToOptions,
    openCreateSection,
    openEditSection,
    saveSection,
    softDeleteSection,
    openTransfer,
    onTransferKindChange,
    saveTransfer,
    setTransferQty: (raw: string) => {
      transferForm.quantity_kg = normalizeDecimalInput(raw)
    },
    load
  }
}
