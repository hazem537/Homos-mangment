import type { Database, StockLocationKind } from '~/types/database.types'
import { withAccountType } from '~/utils/accountType'
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
  /** Present when kind === 'movement' */
  product_id?: string
  status_id?: string | null
  from_kind?: StockLocationKind
  from_id?: string
  to_kind?: StockLocationKind
  to_id?: string
}

export type SectionOutgoingRow = {
  id: string
  date: string
  created_at: string
  destination: string
  status_name: string | null
  quantity_kg: number
  qty_before: number
  qty_after: number
  notes: string | null
  product_id: string
  status_id: string | null
  from_kind: StockLocationKind
  from_id: string
  to_kind: StockLocationKind
  to_id: string
}

export type SectionCard = SectionBalance & {
  incoming: SectionIncomingRow[]
  outgoing: SectionOutgoingRow[]
}

export type WarehouseLedgerIncomingRow = SectionIncomingRow & {
  section_id: string
  section_name: string
  product_name: string | null
}

export type WarehouseLedgerOutgoingRow = SectionOutgoingRow & {
  section_id: string
  section_name: string
  product_name: string | null
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
export type WarehouseExpense = Database['public']['Tables']['warehouse_expenses']['Row']

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

/** Kept for a future over-limit alert (not surfaced in UI yet). */
export const WASTE_MAX_RATIO = 0.02

function locationKindLabel(kind: StockLocationKind) {
  if (kind === 'store') return 'مخزن'
  if (kind === 'mekla') return 'مقلى'
  if (kind === 'client') return 'عميل'
  if (kind === 'waste') return 'هدر'
  if (kind === 'sale') return 'بيع'
  return 'ربع'
}

function sectionProductKey(
  sectionId: string,
  productId: string | null | undefined,
  statusId: string | null | undefined
) {
  return `${sectionId}:${productId || ''}:${statusId || ''}`
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
  const allSections = ref<{ id: string, name: string, notes: string | null, is_active: boolean }[]>([])
  const activeSeasonName = ref<string | null>(null)
  const activeSeasonId = ref<string | null>(null)

  const sectionModalOpen = ref(false)
  const editingSection = ref<SectionBalance | null>(null)
  const sectionForm = reactive({
    name: '',
    notes: ''
  })

  const expenses = ref<WarehouseExpense[]>([])
  const editingExpense = ref<WarehouseExpense | null>(null)
  const isExpenseCreating = ref(false)
  const expenseForm = reactive({
    payment_date: todayIsoDate(),
    amount: '' as string,
    notes: ''
  })

  const transferModalOpen = ref(false)
  const transferScope = ref<'section' | 'warehouse'>('section')
  const transferFromSection = ref<SectionBalance | null>(null)
  const editingMovementId = ref<string | null>(null)
  const editingMovementQty = ref(0)
  const stores = ref<{ id: string, name: string }[]>([])
  const meklas = ref<{ id: string, name: string }[]>([])
  const otherWarehouses = ref<{ id: string, name: string, account_type_name: string | null }[]>([])
  const destSections = ref<{ id: string, name: string }[]>([])
  const stockStatuses = ref<{ id: string, name: string, product_id: string }[]>([])
  type TransferUiKind = 'store' | 'mekla' | 'warehouse'
  const transferForm = reactive({
    to_kind: 'store' as TransferUiKind,
    to_warehouse_id: '' as string,
    to_id: '' as string,
    status_id: '' as string,
    quantity_kg: '' as string,
    movement_date: todayIsoDate(),
    notes: ''
  })

  type TransferPool = {
    section_id: string
    section_name: string
    product_id: string
    product_name: string | null
    status_id: string
    status_name: string | null
    kg_remaining: number
  }

  type TransferAllocationLine = TransferPool & { qty: number }

  const transferToOptions = computed(() => {
    if (transferForm.to_kind === 'store') {
      return stores.value.map(r => ({ label: r.name, value: r.id }))
    }
    if (transferForm.to_kind === 'mekla') {
      return meklas.value.map(r => ({ label: r.name, value: r.id }))
    }
    return destSections.value.map(r => ({ label: r.name, value: r.id }))
  })

  const destWarehouseOptions = computed(() =>
    otherWarehouses.value.map(w => ({
      label: withAccountType(w.name, w.account_type_name),
      value: w.id
    }))
  )

  const resolveLocationName = async (
    kind: StockLocationKind,
    id: string,
    sectionNameById: Map<string, string>
  ) => {
    if (kind === 'waste') return 'هدر'
    if (kind === 'sale') return 'بيع'
    if (kind === 'section') {
      const local = sectionNameById.get(id)
      if (local) return local
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
      = kind === 'store'
        ? 'stores'
        : kind === 'mekla'
          ? 'meklas'
          : 'clients'
    const { data } = await client.from(table).select('name').eq('id', id).maybeSingle()
    const name = data?.name || '—'
    return `${locationKindLabel(kind)}: ${name}`
  }

  const accountTypeName = ref<string | null>(null)

  const load = async () => {
    const id = toValue(warehouseId)
    if (!id) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const [whRes, seasonRes, sectionsRes, sectionsListRes] = await Promise.all([
        client
          .from('warehouses')
          .select('*, account_types(name)')
          .eq('id', id)
          .maybeSingle(),
        client.from('seasons').select('id, name').eq('is_active', true).maybeSingle(),
        client.rpc('section_balances', { p_warehouse_id: id }),
        client
          .from('warehouse_sections')
          .select('id, name, notes, is_active')
          .eq('warehouse_id', id)
          .eq('is_active', true)
          .order('name')
      ])
      if (whRes.error) throw whRes.error
      if (seasonRes.error) throw seasonRes.error
      if (sectionsRes.error) throw sectionsRes.error
      if (sectionsListRes.error) throw sectionsListRes.error

      const raw = whRes.data as
        | (WarehouseRow & { account_types?: { name: string } | null })
        | null
      if (raw) {
        const { account_types: atJoin, ...wh } = raw
        warehouse.value = wh
        accountTypeName.value = atJoin?.name ?? null
      } else {
        warehouse.value = null
        accountTypeName.value = null
      }
      activeSeasonName.value = seasonRes.data?.name ?? null
      activeSeasonId.value = seasonRes.data?.id ?? null
      allSections.value = sectionsListRes.data ?? []
      const balances = sectionsRes.data ?? []
      const sectionIds = [...new Set([
        ...balances.map(s => s.section_id),
        ...allSections.value.map(s => s.id)
      ])]
      const pairKeys = balances.map(s =>
        sectionProductKey(s.section_id, s.product_id, s.status_id)
      )
      const sectionNameById = new Map<string, string>([
        ...balances.map(s => [s.section_id, s.section_name] as const),
        ...allSections.value.map(s => [s.id, s.name] as const)
      ])

      const incomingBySection = new Map<string, SectionIncomingRow[]>()
      const outgoingBySection = new Map<string, SectionOutgoingRow[]>()
      for (const key of pairKeys) {
        incomingBySection.set(key, [])
        outgoingBySection.set(key, [])
      }

      if (seasonRes.data?.id && sectionIds.length) {
        const [deliveriesRes, outMovRes, inMovRes] = await Promise.all([
          client
            .from('warehouse_deliveries')
            .select('id, section_id, product_id, status_id, delivery_date, quantity_kg, notes, created_at, suppliers(name)')
            .eq('warehouse_id', id)
            .eq('season_id', seasonRes.data.id)
            .eq('is_cancelled', false)
            .order('delivery_date', { ascending: true })
            .order('created_at', { ascending: true }),
          client
            .from('stock_movements')
            .select('*, stock_statuses(name)')
            .eq('season_id', seasonRes.data.id)
            .eq('from_kind', 'section')
            .in('from_id', sectionIds)
            .eq('is_cancelled', false)
            .order('movement_date', { ascending: true })
            .order('created_at', { ascending: true }),
          client
            .from('stock_movements')
            .select('*')
            .eq('season_id', seasonRes.data.id)
            .eq('to_kind', 'section')
            .in('to_id', sectionIds)
            .eq('is_cancelled', false)
            .order('movement_date', { ascending: true })
            .order('created_at', { ascending: true })
        ])
        if (deliveriesRes.error) throw deliveriesRes.error
        if (outMovRes.error) throw outMovRes.error
        if (inMovRes.error) throw inMovRes.error

        for (const d of deliveriesRes.data ?? []) {
          const list = incomingBySection.get(
            sectionProductKey(d.section_id, d.product_id, d.status_id)
          )
          if (!list) continue
          const supplierName = (d as { suppliers?: { name?: string } | null }).suppliers?.name
          list.push({
            id: d.id,
            date: d.delivery_date,
            created_at: d.created_at || d.delivery_date,
            source: supplierName || 'تسليم',
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

        for (const m of (outMovRes.data ?? []) as Array<
          MovementRow & { stock_statuses?: { name?: string } | null }
        >) {
          const list = outgoingBySection.get(
            sectionProductKey(m.from_id, m.product_id, m.status_id)
          )
          if (!list) continue
          list.push({
            id: m.id,
            date: m.movement_date,
            created_at: m.created_at || m.movement_date,
            destination: await cachedName(m.to_kind, m.to_id),
            status_name: m.stock_statuses?.name ?? null,
            quantity_kg: Number(m.quantity_kg),
            qty_before: 0,
            qty_after: 0,
            notes: m.notes,
            product_id: m.product_id,
            status_id: m.status_id,
            from_kind: m.from_kind,
            from_id: m.from_id,
            to_kind: m.to_kind,
            to_id: m.to_id
          })
        }

        for (const m of (inMovRes.data ?? []) as MovementRow[]) {
          const list = incomingBySection.get(
            sectionProductKey(m.to_id, m.product_id, m.status_id)
          )
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
            kind: 'movement',
            product_id: m.product_id,
            status_id: m.status_id,
            from_kind: m.from_kind,
            from_id: m.from_id,
            to_kind: m.to_kind,
            to_id: m.to_id
          })
        }

        for (const key of pairKeys) {
          const balanced = applySectionRunningBalances(
            incomingBySection.get(key) ?? [],
            outgoingBySection.get(key) ?? []
          )
          balanced.incoming.sort((a, b) => {
            const byDate = a.date.localeCompare(b.date)
            if (byDate !== 0) return byDate
            return a.created_at.localeCompare(b.created_at)
          })
          balanced.outgoing.sort((a, b) => {
            const byDate = a.date.localeCompare(b.date)
            if (byDate !== 0) return byDate
            return a.created_at.localeCompare(b.created_at)
          })
          incomingBySection.set(key, balanced.incoming)
          outgoingBySection.set(key, balanced.outgoing)
        }
      }

      sectionCards.value = balances.map(b => ({
        ...b,
        incoming: incomingBySection.get(
          sectionProductKey(b.section_id, b.product_id, b.status_id)
        ) ?? [],
        outgoing: outgoingBySection.get(
          sectionProductKey(b.section_id, b.product_id, b.status_id)
        ) ?? []
      }))

      if (seasonRes.data?.id) {
        const expensesRes = await client
          .from('warehouse_expenses')
          .select('*')
          .eq('warehouse_id', id)
          .eq('season_id', seasonRes.data.id)
          .order('payment_date', { ascending: true })
          .order('created_at', { ascending: true })
        if (expensesRes.error) throw expensesRes.error
        expenses.value = (expensesRes.data ?? []) as WarehouseExpense[]
      } else {
        expenses.value = []
      }

      if (
        selectedSectionId.value !== 'all'
        && !sectionCards.value.some(
          s => sectionProductKey(s.section_id, s.product_id, s.status_id) === selectedSectionId.value
        )
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
    const kgRemaining = sectionCards.value
      .filter(s => s.section_id === row.section_id)
      .reduce((sum, s) => sum + Number(s.kg_remaining), 0)
    if (Math.abs(kgRemaining) > 0.001) {
      toast.add({
        title: 'لا يمكن حذف الربع',
        description: 'الرصيد يجب أن يكون صفراً تقريباً',
        color: 'warning'
      })
      return
    }
    const ok = await askConfirm(`حذف الربع «${row.section_name}» نهائياً؟`)
    if (!ok) return
    saving.value = true
    try {
      await client.from('stock_movements').delete().eq('from_kind', 'section').eq('from_id', row.section_id)
      await client.from('stock_movements').delete().eq('to_kind', 'section').eq('to_id', row.section_id)
      const { error } = await client
        .from('warehouse_sections')
        .delete()
        .eq('id', row.section_id)
      if (error) throw error
      toast.add({ title: 'تم حذف الربع', color: 'success' })
      await load()
    } catch (e: any) {
      const msg = String(e.message || '')
      toast.add({
        title: 'فشل الحذف',
        description: msg.includes('foreign key') || msg.includes('violates')
          ? 'لا يمكن الحذف لوجود تسليمات مرتبطة بهذا الربع'
          : msg,
        color: 'error'
      })
    } finally {
      saving.value = false
    }
  }

  const expensesTotal = computed(() =>
    expenses.value.reduce((sum, e) => sum + Number(e.amount), 0)
  )

  const isExpenseRowEditing = (row: WarehouseExpense) =>
    !!editingExpense.value && editingExpense.value.id === row.id

  const resetExpenseForm = () => {
    expenseForm.payment_date = todayIsoDate()
    expenseForm.amount = ''
    expenseForm.notes = ''
  }

  const cancelExpenseInline = () => {
    isExpenseCreating.value = false
    editingExpense.value = null
    resetExpenseForm()
  }

  const openCreateExpense = () => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    editingExpense.value = null
    isExpenseCreating.value = true
    resetExpenseForm()
  }

  const openEditExpense = (row: WarehouseExpense) => {
    isExpenseCreating.value = false
    editingExpense.value = row
    expenseForm.payment_date = row.payment_date
    expenseForm.amount = String(row.amount)
    expenseForm.notes = row.notes || ''
  }

  const onExpenseKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void saveExpense()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelExpenseInline()
    }
  }

  const saveExpense = async () => {
    const id = toValue(warehouseId)
    if (!id || !activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (!expenseForm.payment_date) {
      toast.add({ title: 'التاريخ مطلوب', color: 'warning' })
      return
    }
    const amount = parseDecimal(expenseForm.amount)
    if (!(amount > 0)) {
      toast.add({ title: 'المبلغ يجب أن يكون أكبر من صفر', color: 'warning' })
      return
    }

    const payload = {
      warehouse_id: id,
      season_id: activeSeasonId.value,
      payment_date: expenseForm.payment_date,
      amount,
      notes: expenseForm.notes.trim() || null
    }

    saving.value = true
    try {
      if (editingExpense.value) {
        const { error } = await client
          .from('warehouse_expenses')
          .update(payload)
          .eq('id', editingExpense.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث المصروف', color: 'success' })
      } else {
        const { error } = await client.from('warehouse_expenses').insert(payload)
        if (error) throw error
        toast.add({ title: 'تم تسجيل المصروف', color: 'success' })
      }
      cancelExpenseInline()
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const deleteExpense = async (row: WarehouseExpense) => {
    const ok = await askConfirm('حذف المصروف نهائياً؟')
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('warehouse_expenses').delete().eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم الحذف', color: 'success' })
      if (editingExpense.value?.id === row.id) cancelExpenseInline()
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const ensureDestinations = async () => {
    const currentId = toValue(warehouseId)
    const productId = selectedProductId.value || transferFromSection.value?.product_id || ''
    const [storesRes, meklasRes, warehousesRes, statusesRes] = await Promise.all([
      client.from('stores').select('id, name').eq('is_active', true).order('name'),
      client.from('meklas').select('id, name').eq('is_active', true).order('name'),
      client
        .from('warehouses')
        .select('id, name, account_types(name)')
        .eq('is_active', true)
        .order('name'),
      productId
        ? client
          .from('stock_statuses')
          .select('id, name, product_id')
          .eq('product_id', productId)
          .eq('is_active', true)
          .order('name')
        : Promise.resolve({ data: [] as { id: string, name: string, product_id: string }[], error: null })
    ])
    if (storesRes.error) throw storesRes.error
    if (meklasRes.error) throw meklasRes.error
    if (warehousesRes.error) throw warehousesRes.error
    if (statusesRes.error) throw statusesRes.error
    stores.value = storesRes.data ?? []
    meklas.value = meklasRes.data ?? []
    otherWarehouses.value = (warehousesRes.data ?? [])
      .filter(w => w.id !== currentId)
      .map((w) => {
        const raw = w as { id: string, name: string, account_types?: { name: string } | null }
        return {
          id: raw.id,
          name: raw.name,
          account_type_name: raw.account_types?.name ?? null
        }
      })
    stockStatuses.value = statusesRes.data ?? []
  }

  const loadDestSections = async (warehouseDestId: string) => {
    destSections.value = []
    if (!warehouseDestId) return
    const { data, error } = await client
      .from('warehouse_sections')
      .select('id, name')
      .eq('warehouse_id', warehouseDestId)
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    destSections.value = data ?? []
  }

  const resetTransferForm = (preferKind?: TransferUiKind, statusId = '') => {
    const kind
      = preferKind
      || (stores.value.length ? 'store' : meklas.value.length ? 'mekla' : 'warehouse')
    transferForm.to_kind = kind
    transferForm.to_warehouse_id = ''
    transferForm.to_id = ''
    transferForm.status_id = statusId || stockStatuses.value[0]?.id || ''
    transferForm.quantity_kg = ''
    transferForm.movement_date = todayIsoDate()
    transferForm.notes = ''
    destSections.value = []
    if (kind === 'store') transferForm.to_id = stores.value[0]?.id || ''
    else if (kind === 'mekla') transferForm.to_id = meklas.value[0]?.id || ''
  }

  const openTransfer = async (row: SectionBalance) => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (!row.product_id || !row.status_id) {
      toast.add({ title: 'لا يوجد رصيد للتحويل', color: 'warning' })
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
    if (!stores.value.length && !meklas.value.length && !otherWarehouses.value.length) {
      toast.add({
        title: 'لا توجد وجهات',
        description: 'أضف مخزناً أو مقلى أو شونة أخرى أولاً',
        color: 'warning'
      })
      return
    }
    transferScope.value = 'section'
    transferFromSection.value = row
    editingMovementId.value = null
    editingMovementQty.value = 0
    resetTransferForm(undefined, row.status_id || '')
    transferModalOpen.value = true
  }

  const openWarehouseTransfer = async () => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (!selectedProductId.value) {
      toast.add({ title: 'اختر الصنف أولاً', color: 'warning' })
      return
    }
    try {
      await ensureDestinations()
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الوجهات', description: e.message, color: 'error' })
      return
    }
    if (!stores.value.length && !meklas.value.length && !otherWarehouses.value.length) {
      toast.add({
        title: 'لا توجد وجهات',
        description: 'أضف مخزناً أو مقلى أو شونة أخرى أولاً',
        color: 'warning'
      })
      return
    }
    transferScope.value = 'warehouse'
    transferFromSection.value = null
    editingMovementId.value = null
    editingMovementQty.value = 0
    resetTransferForm()
    const available = productFilteredCards.value
      .filter(r => r.product_id && r.status_id)
      .reduce((s, r) => s + Number(r.kg_remaining || 0), 0)
    if (available <= 0.001) {
      toast.add({ title: 'لا يوجد رصيد للتحويل لهذا الصنف', color: 'warning' })
      return
    }
    transferModalOpen.value = true
  }

  const cancelTransfer = () => {
    transferModalOpen.value = false
    transferFromSection.value = null
    transferScope.value = 'section'
    editingMovementId.value = null
    editingMovementQty.value = 0
  }

  type MovementEditRow = {
    id: string
    date: string
    quantity_kg: number
    notes: string | null
    product_id: string
    status_id: string | null
    from_kind: StockLocationKind
    from_id: string
    to_kind: StockLocationKind
    to_id: string
    section_name?: string
  }

  const openEditMovement = async (row: MovementEditRow) => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (row.from_kind !== 'section') {
      toast.add({
        title: 'لا يمكن التعديل من هنا',
        description: 'يمكن تعديل التحويلات الصادرة من ربع فقط',
        color: 'warning'
      })
      return
    }
    if (row.to_kind !== 'store' && row.to_kind !== 'mekla' && row.to_kind !== 'section') {
      toast.add({ title: 'نوع الوجهة غير مدعوم للتعديل', color: 'warning' })
      return
    }

    const card = sectionCards.value.find(
      c =>
        c.section_id === row.from_id
        && c.product_id === row.product_id
        && c.status_id === row.status_id
    ) || sectionCards.value.find(c => c.section_id === row.from_id)

    try {
      // ensureDestinations uses product from transferFromSection / selectedProductId
      if (row.product_id) selectedProductId.value = row.product_id
      transferFromSection.value = card
        ? card
        : {
            section_id: row.from_id,
            section_name: row.section_name || allSections.value.find(s => s.id === row.from_id)?.name || 'ربع',
            product_id: row.product_id,
            product_name: null,
            status_id: row.status_id,
            status_name: null,
            notes: null,
            is_active: true,
            kg_in: 0,
            kg_out: 0,
            kg_remaining: Number(row.quantity_kg)
          } as SectionBalance
      await ensureDestinations()
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الوجهات', description: e.message, color: 'error' })
      return
    }

    editingMovementId.value = row.id
    editingMovementQty.value = Number(row.quantity_kg)
    transferScope.value = 'section'

    const uiKind: TransferUiKind
      = row.to_kind === 'store' ? 'store' : row.to_kind === 'mekla' ? 'mekla' : 'warehouse'
    transferForm.to_kind = uiKind
    transferForm.status_id = row.status_id || stockStatuses.value[0]?.id || ''
    transferForm.quantity_kg = String(row.quantity_kg)
    transferForm.movement_date = row.date
    transferForm.notes = row.notes || ''
    transferForm.to_warehouse_id = ''
    transferForm.to_id = ''
    destSections.value = []

    if (uiKind === 'warehouse') {
      const { data: sec } = await client
        .from('warehouse_sections')
        .select('warehouse_id')
        .eq('id', row.to_id)
        .maybeSingle()
      transferForm.to_warehouse_id = sec?.warehouse_id || ''
      if (transferForm.to_warehouse_id) {
        try {
          await loadDestSections(transferForm.to_warehouse_id)
        } catch (e: any) {
          toast.add({ title: 'تعذر تحميل أرباع الوجهة', description: e.message, color: 'error' })
        }
      }
      transferForm.to_id = row.to_id
    } else {
      transferForm.to_id = row.to_id
    }

    transferModalOpen.value = true
  }

  const deleteMovement = async (row: { id: string, kind?: string }) => {
    if (row.kind === 'delivery') {
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
      const { error } = await client.from('stock_movements').delete().eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم حذف التحويل', color: 'success' })
      if (editingMovementId.value === row.id) cancelTransfer()
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const onTransferKindChange = async () => {
    transferForm.to_id = ''
    transferForm.to_warehouse_id = ''
    destSections.value = []
    if (transferForm.to_kind === 'store') {
      transferForm.to_id = stores.value[0]?.id || ''
    } else if (transferForm.to_kind === 'mekla') {
      transferForm.to_id = meklas.value[0]?.id || ''
    } else if (transferForm.to_kind === 'warehouse') {
      transferForm.to_warehouse_id = otherWarehouses.value[0]?.id || ''
      if (transferForm.to_warehouse_id) {
        try {
          await loadDestSections(transferForm.to_warehouse_id)
          transferForm.to_id = destSections.value[0]?.id || ''
        } catch (e: any) {
          toast.add({ title: 'تعذر تحميل أرباع الوجهة', description: e.message, color: 'error' })
        }
      }
    }
  }

  const onTransferWarehouseChange = async () => {
    transferForm.to_id = ''
    try {
      await loadDestSections(transferForm.to_warehouse_id)
      transferForm.to_id = destSections.value[0]?.id || ''
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل أرباع الوجهة', description: e.message, color: 'error' })
    }
  }

  const saveTransfer = async () => {
    if (!activeSeasonId.value) return
    const qty = parseDecimal(transferForm.quantity_kg)
    if (!transferForm.to_id) {
      toast.add({ title: 'اختر الوجهة', color: 'warning' })
      return
    }
    if (!transferForm.status_id) {
      toast.add({ title: 'اختر الحالة', color: 'warning' })
      return
    }
    if (transferForm.to_kind === 'warehouse' && !transferForm.to_warehouse_id) {
      toast.add({ title: 'اختر الشونة الوجهة', color: 'warning' })
      return
    }
    if (!(qty > 0)) {
      toast.add({ title: 'الكمية يجب أن تكون أكبر من صفر', color: 'warning' })
      return
    }

    const toKind: StockLocationKind
      = transferForm.to_kind === 'warehouse' ? 'section' : transferForm.to_kind
    const toId = transferForm.to_id
    const baseNotes = transferForm.notes.trim()

    // Edit existing single movement
    if (editingMovementId.value) {
      if (!transferFromSection.value?.section_id || !transferFromSection.value.product_id) {
        toast.add({ title: 'بيانات المصدر غير مكتملة', color: 'warning' })
        return
      }
      const available
        = Number(transferFromSection.value.kg_remaining || 0) + editingMovementQty.value
      if (qty > available + 0.001) {
        toast.add({
          title: 'الرصيد غير كافٍ',
          description: `المتاح: ${available.toFixed(2)} كجم`,
          color: 'warning'
        })
        return
      }
      saving.value = true
      try {
        const { error } = await client
          .from('stock_movements')
          .update({
            status_id: transferForm.status_id,
            movement_date: transferForm.movement_date,
            quantity_kg: qty,
            to_kind: toKind,
            to_id: toId,
            notes: baseNotes || null
          })
          .eq('id', editingMovementId.value)
        if (error) throw error
        toast.add({ title: 'تم تحديث التحويل', color: 'success' })
        cancelTransfer()
        await load()
      } catch (e: any) {
        toast.add({ title: 'فشل التحديث', description: e.message, color: 'error' })
      } finally {
        saving.value = false
      }
      return
    }

    const allocation = allocateTransferQty(qty)
    if (!allocation.ok || !allocation.plan.length) {
      toast.add({
        title: 'الرصيد غير كافٍ',
        description: `المتاح في الشونة: ${allocation.total.toFixed(2)} كجم — المطلوب: ${qty.toFixed(2)} كجم`,
        color: 'warning'
      })
      return
    }

    saving.value = true
    try {
      const rows = allocation.plan.map((line) => {
        return {
          season_id: activeSeasonId.value!,
          product_id: line.product_id,
          status_id: line.status_id,
          movement_date: transferForm.movement_date,
          quantity_kg: line.qty,
          from_kind: 'section' as const,
          from_id: line.section_id,
          to_kind: toKind,
          to_id: toId,
          notes: baseNotes || null
        }
      })
      const { error } = await client.from('stock_movements').insert(rows)
      if (error) throw error
      toast.add({
        title: allocation.plan.length > 1
          ? `تم التحويل من ${allocation.plan.length} أرباع`
          : 'تم التحويل',
        color: 'success'
      })
      cancelTransfer()
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل التحويل', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const selectedSectionId = ref('all')
  const route = useRoute()
  const queryProductId = () => {
    const q = route.query.product
    return typeof q === 'string' && q.trim() ? q.trim() : ''
  }
  const selectedProductId = ref(queryProductId() || '')

  watch(() => toValue(warehouseId), () => {
    selectedSectionId.value = 'all'
    selectedProductId.value = queryProductId() || ''
    load()
  })

  watch(
    () => route.query.product,
    () => {
      const fromQuery = queryProductId()
      if (fromQuery) selectedProductId.value = fromQuery
    }
  )

  onMounted(load)

  const productOptions = computed(() => {
    const map = new Map<string, string>()
    for (const s of sectionCards.value) {
      if (s.product_id && s.product_name) map.set(s.product_id, s.product_name)
    }
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'ar'))
      .map(([value, label]) => ({ label, value }))
  })

  const syncSelectedProduct = () => {
    const options = productOptions.value
    if (!options.length) {
      selectedProductId.value = ''
      return
    }
    if (options.some(o => o.value === selectedProductId.value)) return
    const fromQuery = queryProductId()
    selectedProductId.value
      = (fromQuery && options.some(o => o.value === fromQuery) ? fromQuery : null)
      || options[0]?.value
      || ''
  }

  watch(productOptions, syncSelectedProduct)

  watch(selectedProductId, (id) => {
    if (!id) return
    const current = queryProductId()
    if (current === id) return
    void navigateTo({
      path: route.path,
      query: { ...route.query, product: id }
    }, { replace: true })
  })

  const productFilteredCards = computed(() => {
    const pid = selectedProductId.value
    const matching = pid
      ? sectionCards.value.filter(s => s.product_id === pid)
      : sectionCards.value

    return matching
      .filter(s =>
        Number(s.kg_in || 0) > 0.001
        || Number(s.kg_out || 0) > 0.001
        || Number(s.kg_remaining || 0) > 0.001
        || s.incoming.length > 0
        || s.outgoing.length > 0
      )
      .sort((a, b) => {
        const byAmount = Number(b.kg_remaining || 0) - Number(a.kg_remaining || 0)
        if (byAmount !== 0) return byAmount
        return a.section_name.localeCompare(b.section_name, 'ar')
      })
  })

  const transferPools = computed<TransferPool[]>(() => {
    const rows
      = transferScope.value === 'section' && transferFromSection.value
        ? [transferFromSection.value]
        : productFilteredCards.value
    return rows
      .map((r) => {
        const base = Number(r.kg_remaining)
        const boost
          = editingMovementId.value
          && transferFromSection.value
          && r.section_id === transferFromSection.value.section_id
          && r.product_id === transferFromSection.value.product_id
          && r.status_id === transferFromSection.value.status_id
            ? editingMovementQty.value
            : 0
        return {
          section_id: r.section_id,
          section_name: r.section_name,
          product_id: r.product_id as string,
          product_name: r.product_name ?? null,
          status_id: r.status_id as string,
          status_name: r.status_name ?? null,
          kg_remaining: base + boost
        }
      })
      .filter(r =>
        r.product_id
        && r.status_id
        && r.kg_remaining > 0.001
        && (!transferForm.status_id || r.status_id === transferForm.status_id)
      )
  })

  const transferStatusOptions = computed(() =>
    stockStatuses.value.map(s => ({ label: s.name, value: s.id }))
  )

  const transferAvailableKg = computed(() =>
    transferPools.value.reduce((s, p) => s + p.kg_remaining, 0)
  )

  const allocateTransferQty = (qty: number): {
    ok: boolean
    total: number
    plan: TransferAllocationLine[]
  } => {
    const pools = [...transferPools.value].sort((a, b) => b.kg_remaining - a.kg_remaining)
    const total = pools.reduce((s, p) => s + p.kg_remaining, 0)
    if (!(qty > 0)) return { ok: false, total, plan: [] }
    if (qty > total + 0.001) return { ok: false, total, plan: [] }

    const single = pools.find(p => p.kg_remaining + 0.001 >= qty)
    if (single) {
      return { ok: true, total, plan: [{ ...single, qty }] }
    }

    let need = qty
    const plan: TransferAllocationLine[] = []
    for (const pool of pools) {
      if (need <= 0.001) break
      const take = Math.min(pool.kg_remaining, need)
      if (take > 0.001) {
        plan.push({ ...pool, qty: Number(take.toFixed(4)) })
        need = Number((need - take).toFixed(4))
      }
    }
    return { ok: need <= 0.001, total, plan }
  }

  const transferAllocation = computed(() => {
    const qty = parseDecimal(transferForm.quantity_kg)
    if (!(qty > 0)) {
      return { ok: false, total: transferAvailableKg.value, plan: [] as TransferAllocationLine[] }
    }
    return allocateTransferQty(qty)
  })

  const warehouseStats = computed(() => {
    const rows = productFilteredCards.value
    const kgIn = rows.reduce((s, r) => s + Number(r.kg_in || 0), 0)
    const kgOut = rows.reduce((s, r) => s + Number(r.kg_out || 0), 0)
    const kgRemaining = rows.reduce((s, r) => s + Number(r.kg_remaining || 0), 0)
    const wasteRatio = kgIn > 0.001 ? kgRemaining / kgIn : 0
    return {
      sectionsCount: new Set(rows.map(r => r.section_id)).size,
      kgIn,
      kgOut,
      kgRemaining,
      wasteRatio
    }
  })

  const saveWasteAllRemaining = async () => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    const id = toValue(warehouseId)
    if (!id || !selectedProductId.value) {
      toast.add({ title: 'اختر الصنف أولاً', color: 'warning' })
      return
    }
    if (warehouseStats.value.kgRemaining <= 0.001) {
      toast.add({ title: 'لا يوجد رصيد متبقي', color: 'warning' })
      return
    }

    const ok = await askConfirm('نقل كل الرصيد المتبقي كهدر؟')
    if (!ok) return

    const prevScope = transferScope.value
    const prevStatus = transferForm.status_id
    const prevFrom = transferFromSection.value
    const prevEditingId = editingMovementId.value
    const prevEditingQty = editingMovementQty.value

    transferScope.value = 'warehouse'
    transferFromSection.value = null
    editingMovementId.value = null
    editingMovementQty.value = 0
    transferForm.status_id = ''

    const qty = transferAvailableKg.value
    const allocation = allocateTransferQty(qty)

    transferScope.value = prevScope
    transferForm.status_id = prevStatus
    transferFromSection.value = prevFrom
    editingMovementId.value = prevEditingId
    editingMovementQty.value = prevEditingQty

    if (!allocation.ok || !allocation.plan.length) {
      toast.add({
        title: 'الرصيد غير كافٍ',
        description: `المتاح: ${allocation.total.toFixed(2)} كجم`,
        color: 'warning'
      })
      return
    }

    saving.value = true
    try {
      const rows = allocation.plan.map(line => ({
        season_id: activeSeasonId.value!,
        product_id: line.product_id,
        status_id: line.status_id,
        movement_date: todayIsoDate(),
        quantity_kg: line.qty,
        from_kind: 'section' as const,
        from_id: line.section_id,
        to_kind: 'waste' as const,
        to_id: id,
        notes: 'هدر'
      }))
      const { error } = await client.from('stock_movements').insert(rows)
      if (error) throw error
      toast.add({
        title: allocation.plan.length > 1
          ? `تم تسجيل الهدر من ${allocation.plan.length} أرباع`
          : 'تم تسجيل الهدر',
        color: 'success'
      })
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل تسجيل الهدر', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const sectionFilterOptions = computed(() => [
    { label: 'كل الأرباع', value: 'all' },
    ...productFilteredCards.value.map(s => ({
      label: `${s.section_name} — ${s.product_name || '—'}`,
      value: sectionProductKey(s.section_id, s.product_id, s.status_id)
    }))
  ])

  const filteredSectionCards = computed(() => {
    let rows = productFilteredCards.value
    if (selectedSectionId.value !== 'all') {
      rows = rows.filter(
        s => sectionProductKey(s.section_id, s.product_id, s.status_id) === selectedSectionId.value
      )
    }
    return rows
  })

  const warehouseLedgerCard = computed<WarehouseLedgerCard>(() => {
    const cards = productFilteredCards.value
    const incomingBase: Omit<WarehouseLedgerIncomingRow, 'qty_before' | 'qty_after'>[] = []
    const outgoingBase: Omit<WarehouseLedgerOutgoingRow, 'qty_before' | 'qty_after'>[] = []

    for (const card of cards) {
      for (const row of card.incoming) {
        incomingBase.push({
          id: row.id,
          date: row.date,
          created_at: row.created_at,
          source: row.source,
          quantity_kg: row.quantity_kg,
          notes: row.notes,
          kind: row.kind,
          product_id: row.product_id,
          status_id: row.status_id,
          from_kind: row.from_kind,
          from_id: row.from_id,
          to_kind: row.to_kind,
          to_id: row.to_id,
          section_id: card.section_id,
          section_name: card.section_name,
          product_name: card.product_name ?? null
        })
      }
      for (const row of card.outgoing) {
        outgoingBase.push({
          id: row.id,
          date: row.date,
          created_at: row.created_at,
          destination: row.destination,
          status_name: row.status_name ?? card.status_name ?? null,
          quantity_kg: row.quantity_kg,
          notes: row.notes,
          product_id: row.product_id,
          status_id: row.status_id,
          from_kind: row.from_kind,
          from_id: row.from_id,
          to_kind: row.to_kind,
          to_id: row.to_id,
          section_id: card.section_id,
          section_name: card.section_name,
          product_name: card.product_name ?? null
        })
      }
    }

    const balanced = applySectionRunningBalances(incomingBase, outgoingBase)

    const sortAsc = <T extends { date: string, created_at: string }>(rows: T[]) =>
      [...rows].sort((a, b) => {
        const byDate = a.date.localeCompare(b.date)
        if (byDate !== 0) return byDate
        return a.created_at.localeCompare(b.created_at)
      })

    return {
      incoming: sortAsc(balanced.incoming) as WarehouseLedgerIncomingRow[],
      outgoing: sortAsc(balanced.outgoing) as WarehouseLedgerOutgoingRow[],
      kg_in: warehouseStats.value.kgIn,
      kg_out: warehouseStats.value.kgOut,
      kg_remaining: warehouseStats.value.kgRemaining
    }
  })

  return {
    loading,
    saving,
    warehouse,
    accountTypeName,
    sectionCards,
    filteredSectionCards,
    warehouseLedgerCard,
    warehouseStats,
    expenses,
    expensesTotal,
    expenseForm,
    isExpenseCreating,
    isExpenseRowEditing,
    selectedSectionId,
    selectedProductId,
    productOptions,
    sectionFilterOptions,
    activeSeasonName,
    sectionModalOpen,
    sectionForm,
    transferModalOpen,
    transferScope,
    transferFromSection,
    editingMovementId,
    transferForm,
    transferToOptions,
    destWarehouseOptions,
    transferAvailableKg,
    transferAllocation,
    transferStatusOptions,
    openCreateSection,
    openEditSection,
    saveSection,
    softDeleteSection,
    openCreateExpense,
    openEditExpense,
    cancelExpenseInline,
    onExpenseKey,
    saveExpense,
    deleteExpense,
    openTransfer,
    openWarehouseTransfer,
    openEditMovement,
    deleteMovement,
    cancelTransfer,
    onTransferKindChange,
    onTransferWarehouseChange,
    saveTransfer,
    saveWasteAllRemaining,
    setTransferQty: (raw: string) => {
      transferForm.quantity_kg = normalizeDecimalInput(raw)
    },
    setExpenseAmount: (raw: string) => {
      expenseForm.amount = normalizeDecimalInput(raw)
    },
    load
  }
}
