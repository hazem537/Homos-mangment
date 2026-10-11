import type { Database } from '~/types/database.types'
import { useArdab } from '~/composables/useArdab'
import { accountTypeLabel } from '~/utils/accountType'

export type SupplierStatsRow = {
  account_type_id: string
  account_type_name: string
  purchased_kg: number
  delivered_kg: number
  remaining_kg: number
  ardab_total: number
  ardab_delivered: number
  ardab_remaining: number
  purchases_total: number
  money_paid: number
  money_due: number
  commission_total: number
  avg_price_per_ardab: number
  nolon_total: number
  nathriyat_total: number
  cost_total: number
  cost_paid: number
  cost_needed: number
}

export type SupplierDetailRow = SupplierStatsRow & {
  supplier_id: string
  supplier_name: string
}

export type StatsBar = {
  key: string
  label: string
  value: number
  color: string
  hint?: string
  /** للنقدية: مدفوع / مستحق داخل نفس الشريط */
  paid?: number
  due?: number
  /** للكمية: مسلّم / متبقي داخل نفس الشريط */
  delivered?: number
  remaining?: number
}

export type StatsPieSlice = StatsBar & {
  percent: number
  path: string
}

const TYPE_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#ca8a04',
  '#db2777',
  '#0891b2',
  '#7c3aed',
  '#dc2626',
  '#0d9488',
  '#4f46e5'
]

const METRIC_COLORS = {
  purchased: '#2563eb',
  delivered: '#16a34a',
  remaining: '#ea580c',
  paid: '#16a34a',
  due: '#ea580c',
  commission: '#7c3aed',
  cost: '#0891b2',
  costPaid: '#16a34a',
  costNeeded: '#ea580c'
}

function emptyRow(account_type_id: string, account_type_name: string): SupplierStatsRow {
  return {
    account_type_id,
    account_type_name,
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
    avg_price_per_ardab: 0,
    nolon_total: 0,
    nathriyat_total: 0,
    cost_total: 0,
    cost_paid: 0,
    cost_needed: 0
  }
}

function round2(n: number) {
  return Number(n.toFixed(2))
}

function round4(n: number) {
  return Number(n.toFixed(4))
}

function finalizeAvgPrice(row: SupplierStatsRow) {
  const costed
    = row.purchases_total + row.commission_total + row.nolon_total + row.nathriyat_total
  row.avg_price_per_ardab = row.ardab_total > 0.00005
    ? round2(costed / row.ardab_total)
    : 0
}

function finalizeRow(row: SupplierStatsRow, factor: number, kgToArdab: (kg: number, f: number) => number) {
  row.purchased_kg = round2(row.purchased_kg)
  row.delivered_kg = round2(row.delivered_kg)
  row.remaining_kg = round2(row.remaining_kg)
  if (Math.abs(row.remaining_kg) < 0.00005) row.remaining_kg = 0
  row.ardab_total = kgToArdab(row.purchased_kg, factor)
  row.ardab_delivered = kgToArdab(row.delivered_kg, factor)
  row.ardab_remaining = kgToArdab(row.remaining_kg, factor)
  if (Math.abs(row.ardab_remaining) < 0.00005) row.ardab_remaining = 0
  row.purchases_total = round2(row.purchases_total)
  row.money_paid = round2(row.money_paid)
  row.money_due = round2(row.purchases_total - row.money_paid)
  row.commission_total = round2(row.commission_total)
  row.nolon_total = round2(row.nolon_total)
  row.nathriyat_total = round2(row.nathriyat_total)
  row.cost_total = round2(row.nolon_total + row.nathriyat_total)
  row.cost_paid = round2(row.cost_paid)
  row.cost_needed = round2(row.cost_total - row.cost_paid)
  finalizeAvgPrice(row)
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  }
}

function slicePath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
) {
  const start = polar(cx, cy, r, startAngle)
  const end = polar(cx, cy, r, endAngle)
  const large = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`,
    'Z'
  ].join(' ')
}

function buildPieSlices(bars: StatsBar[]): { slices: StatsPieSlice[], total: number } {
  const active = bars.filter(b => b.value > 0.005)
  const total = round2(active.reduce((s, b) => s + b.value, 0))
  if (!active.length || !(total > 0.005)) return { slices: [], total: 0 }

  const cx = 120
  const cy = 120
  const r = 100

  if (active.length === 1) {
    const only = active[0]!
    return {
      total,
      slices: [{
        ...only,
        percent: 100,
        path: [
          `M ${cx} ${cy - r}`,
          `A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`,
          'Z'
        ].join(' ')
      }]
    }
  }

  let angle = 0
  const slices = active.map((bar) => {
    const share = bar.value / total
    const sweep = share * 360
    const startAngle = angle
    const endAngle = angle + sweep
    angle = endAngle
    return {
      ...bar,
      percent: round2(share * 100),
      path: slicePath(cx, cy, r, startAngle, endAngle)
    }
  })
  return { slices, total }
}

export function useSupplierStats() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const route = useRoute()
  const { kgToArdab } = useArdab()

  const loading = ref(true)
  const season = ref<{ id: string, name: string, ardab_factor: number } | null>(null)
  const products = ref<{ id: string, name: string }[]>([])
  const accountTypes = ref<{ id: string, name: string }[]>([])
  const rows = ref<SupplierStatsRow[]>([])
  const supplierRows = ref<SupplierDetailRow[]>([])

  const queryProductId = () => {
    const q = route.query.product
    return typeof q === 'string' && q.trim() ? q.trim() : ''
  }

  const selectedProductId = ref(queryProductId())
  const selectedAccountTypeId = ref('all')

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

  const totals = computed<SupplierStatsRow>(() => {
    const t = emptyRow('__total__', 'الإجمالي')
    for (const r of rows.value) {
      t.purchased_kg += r.purchased_kg
      t.delivered_kg += r.delivered_kg
      t.remaining_kg += r.remaining_kg
      t.ardab_total += r.ardab_total
      t.ardab_delivered += r.ardab_delivered
      t.ardab_remaining += r.ardab_remaining
      t.purchases_total += r.purchases_total
      t.money_paid += r.money_paid
      t.money_due += r.money_due
      t.commission_total += r.commission_total
      t.nolon_total += r.nolon_total
      t.nathriyat_total += r.nathriyat_total
      t.cost_total += r.cost_total
      t.cost_paid += r.cost_paid
      t.cost_needed += r.cost_needed
    }
    t.purchased_kg = round2(t.purchased_kg)
    t.delivered_kg = round2(t.delivered_kg)
    t.remaining_kg = round2(t.remaining_kg)
    t.ardab_total = round4(t.ardab_total)
    t.ardab_delivered = round4(t.ardab_delivered)
    t.ardab_remaining = round4(t.ardab_remaining)
    t.purchases_total = round2(t.purchases_total)
    t.money_paid = round2(t.money_paid)
    t.money_due = round2(t.money_due)
    t.commission_total = round2(t.commission_total)
    t.nolon_total = round2(t.nolon_total)
    t.nathriyat_total = round2(t.nathriyat_total)
    t.cost_total = round2(t.cost_total)
    t.cost_paid = round2(t.cost_paid)
    t.cost_needed = round2(t.cost_needed)
    finalizeAvgPrice(t)
    return t
  })

  const selectedTypeRow = computed(() => {
    if (selectedAccountTypeId.value === 'all') return null
    return rows.value.find(r => r.account_type_id === selectedAccountTypeId.value) || null
  })

  const isAllTypesView = computed(() => selectedAccountTypeId.value === 'all')

  const typeColor = (index: number) =>
    TYPE_PALETTE[index % TYPE_PALETTE.length]!

  const typeColorById = computed(() => {
    const map = new Map<string, string>()
    rows.value.forEach((r, i) => map.set(r.account_type_id, typeColor(i)))
    return map
  })

  const typeKgBars = computed<StatsBar[]>(() =>
    rows.value.map((r, i) => ({
      key: r.account_type_id,
      label: accountTypeLabel(r.account_type_name),
      value: r.purchased_kg,
      color: typeColor(i),
      delivered: r.delivered_kg,
      remaining: Math.max(0, r.remaining_kg),
      hint: `مسلّم ${round2(r.delivered_kg)} · متبقي ${round2(r.remaining_kg)}`
    }))
  )

  const typeMoneyBars = computed<StatsBar[]>(() =>
    rows.value.map((r, i) => ({
      key: `money-${r.account_type_id}`,
      label: accountTypeLabel(r.account_type_name),
      value: r.purchases_total,
      color: typeColor(i),
      paid: r.money_paid,
      due: r.money_due,
      hint: `مدفوع ${round2(r.money_paid)} · مستحق ${round2(r.money_due)}`
    }))
  )

  const typeKgPie = computed(() => buildPieSlices(typeKgBars.value))
  const typeMoneyPie = computed(() => buildPieSlices(typeMoneyBars.value))

  const maxTypeKg = computed(() =>
    Math.max(...typeKgBars.value.map(b => b.value), 0.001)
  )
  const maxTypeMoney = computed(() =>
    Math.max(...typeMoneyBars.value.map(b => b.value), 0.001)
  )

  const detailFlowBars = computed<StatsBar[]>(() => {
    const row = selectedTypeRow.value
    if (!row) return []
    return [
      {
        key: 'purchased',
        label: 'المشتريات',
        value: row.purchased_kg,
        color: METRIC_COLORS.purchased,
        hint: 'إجمالي ما تم شراؤه'
      },
      {
        key: 'delivered',
        label: 'المسلّم',
        value: row.delivered_kg,
        color: METRIC_COLORS.delivered,
        hint: 'ما وصل من الموردين'
      },
      {
        key: 'remaining',
        label: 'المتبقي',
        value: row.remaining_kg,
        color: METRIC_COLORS.remaining,
        hint: 'لم يُسلَّم بعد'
      }
    ]
  })

  const detailMoneyBars = computed<StatsBar[]>(() => {
    const row = selectedTypeRow.value
    if (!row) return []
    return [
      {
        key: 'total',
        label: 'إجمالي المبلغ',
        value: row.purchases_total,
        color: METRIC_COLORS.purchased
      },
      {
        key: 'paid',
        label: 'المدفوع',
        value: row.money_paid,
        color: METRIC_COLORS.paid
      },
      {
        key: 'due',
        label: 'المستحق',
        value: row.money_due,
        color: METRIC_COLORS.due
      },
      {
        key: 'commission',
        label: 'العمولة',
        value: row.commission_total,
        color: METRIC_COLORS.commission
      }
    ]
  })

  const detailMaxKg = computed(() =>
    Math.max(...detailFlowBars.value.map(b => b.value), 0.001)
  )
  const detailMaxMoney = computed(() =>
    Math.max(...detailMoneyBars.value.map(b => b.value), 0.001)
  )

  const suppliersForSelectedType = computed(() => {
    if (selectedAccountTypeId.value === 'all') return supplierRows.value
    return supplierRows.value.filter(
      s => s.account_type_id === selectedAccountTypeId.value
    )
  })

  const barPercent = (value: number, max: number) => {
    const pct = (value / max) * 100
    if (!(pct > 0)) return 0
    return Math.min(100, Math.max(2, pct))
  }

  const loadLookups = async () => {
    const [seasonRes, productsRes, typesRes] = await Promise.all([
      client.from('seasons').select('id, name, ardab_factor').eq('is_active', true).maybeSingle(),
      client.from('products').select('id, name').eq('is_active', true).order('name'),
      client.from('account_types').select('id, name').order('name')
    ])
    if (seasonRes.error) throw seasonRes.error
    if (productsRes.error) throw productsRes.error
    if (typesRes.error) throw typesRes.error

    season.value = seasonRes.data
      ? {
          id: seasonRes.data.id,
          name: seasonRes.data.name,
          ardab_factor: Number(seasonRes.data.ardab_factor) || 170
        }
      : null
    products.value = productsRes.data ?? []
    accountTypes.value = typesRes.data ?? []

    if (!selectedProductId.value || !products.value.some(p => p.id === selectedProductId.value)) {
      const fromQuery = queryProductId()
      selectedProductId.value
        = (fromQuery && products.value.some(p => p.id === fromQuery) ? fromQuery : null)
        || products.value[0]?.id
        || ''
    }
  }

  const loadStats = async () => {
    rows.value = []
    supplierRows.value = []
    if (!season.value?.id || !selectedProductId.value) return

    const seasonId = season.value.id
    const productId = selectedProductId.value
    const factor = season.value.ardab_factor || 170

    const [suppliersRes, purchasesRes, deliveriesRes, transfersRes] = await Promise.all([
      client
        .from('suppliers')
        .select('id, name, account_type_id')
        .eq('is_active', true)
        .order('name'),
      client
        .from('purchases')
        .select('supplier_id, quantity_kg, total_price')
        .eq('season_id', seasonId)
        .eq('product_id', productId)
        .eq('is_cancelled', false),
      client
        .from('warehouse_deliveries')
        .select('id, supplier_id, quantity_kg, nolon_total, nathriyat_total')
        .eq('season_id', seasonId)
        .eq('product_id', productId)
        .eq('is_cancelled', false),
      client
        .from('cash_transfers')
        .select('supplier_id, amount, kind')
        .eq('season_id', seasonId)
        .eq('product_id', productId)
        .eq('is_cancelled', false)
    ])
    if (suppliersRes.error) throw suppliersRes.error
    if (purchasesRes.error) throw purchasesRes.error
    if (deliveriesRes.error) throw deliveriesRes.error
    if (transfersRes.error) throw transfersRes.error

    const deliveries = deliveriesRes.data ?? []
    const deliveryIds = deliveries.map(d => d.id)

    let costPayments: { delivery_id: string, amount: number }[] = []
    if (deliveryIds.length) {
      const paymentsRes = await client
        .from('delivery_cost_payments')
        .select('delivery_id, amount')
        .in('delivery_id', deliveryIds)
        .eq('is_cancelled', false)
      if (paymentsRes.error) throw paymentsRes.error
      costPayments = paymentsRes.data ?? []
    }

    const typeNameById = new Map(accountTypes.value.map(t => [t.id, t.name]))
    const suppliersList = suppliersRes.data ?? []
    const typeBySupplier = new Map(
      suppliersList.map(s => [s.id, s.account_type_id] as const)
    )
    const nameBySupplier = new Map(
      suppliersList.map(s => [s.id, s.name] as const)
    )

    const byType = new Map<string, SupplierStatsRow>()
    const ensureType = (typeId: string) => {
      let row = byType.get(typeId)
      if (!row) {
        row = emptyRow(typeId, accountTypeLabel(typeNameById.get(typeId)))
        byType.set(typeId, row)
      }
      return row
    }

    const bySupplier = new Map<string, SupplierDetailRow>()
    const ensureSupplier = (supplierId: string, typeId: string) => {
      let row = bySupplier.get(supplierId)
      if (!row) {
        row = {
          ...emptyRow(typeId, accountTypeLabel(typeNameById.get(typeId))),
          supplier_id: supplierId,
          supplier_name: nameBySupplier.get(supplierId) || '—'
        }
        bySupplier.set(supplierId, row)
      }
      return row
    }

    for (const t of accountTypes.value) {
      ensureType(t.id)
    }

    const purchasedKgBySupplier = new Map<string, number>()
    const deliveredKgBySupplier = new Map<string, number>()

    for (const p of purchasesRes.data ?? []) {
      const typeId = typeBySupplier.get(p.supplier_id)
      if (!typeId) continue
      const typeRow = ensureType(typeId)
      const supplierRow = ensureSupplier(p.supplier_id, typeId)
      const kg = Number(p.quantity_kg) || 0
      const price = Number(p.total_price) || 0
      typeRow.purchased_kg += kg
      typeRow.purchases_total += price
      supplierRow.purchased_kg += kg
      supplierRow.purchases_total += price
      purchasedKgBySupplier.set(
        p.supplier_id,
        (purchasedKgBySupplier.get(p.supplier_id) || 0) + kg
      )
    }

    for (const d of deliveries) {
      const typeId = typeBySupplier.get(d.supplier_id)
      if (!typeId) continue
      const typeRow = ensureType(typeId)
      const supplierRow = ensureSupplier(d.supplier_id, typeId)
      const kg = Number(d.quantity_kg) || 0
      const nolon = Number(d.nolon_total) || 0
      const nathriyat = Number(d.nathriyat_total) || 0
      typeRow.delivered_kg += kg
      typeRow.nolon_total += nolon
      typeRow.nathriyat_total += nathriyat
      supplierRow.delivered_kg += kg
      supplierRow.nolon_total += nolon
      supplierRow.nathriyat_total += nathriyat
      deliveredKgBySupplier.set(
        d.supplier_id,
        (deliveredKgBySupplier.get(d.supplier_id) || 0) + kg
      )
    }

    for (const [supplierId, purchasedKg] of purchasedKgBySupplier) {
      const typeId = typeBySupplier.get(supplierId)
      if (!typeId) continue
      const deliveredKg = deliveredKgBySupplier.get(supplierId) || 0
      const remaining = purchasedKg - deliveredKg
      ensureType(typeId).remaining_kg += remaining
      ensureSupplier(supplierId, typeId).remaining_kg += remaining
    }

    for (const t of transfersRes.data ?? []) {
      const typeId = typeBySupplier.get(t.supplier_id)
      if (!typeId) continue
      const amount = Number(t.amount) || 0
      const typeRow = ensureType(typeId)
      const supplierRow = ensureSupplier(t.supplier_id, typeId)
      if (t.kind === 'commission') {
        typeRow.commission_total += amount
        supplierRow.commission_total += amount
      } else {
        typeRow.money_paid += amount
        supplierRow.money_paid += amount
      }
    }

    const deliverySupplierById = new Map<string, string>()
    for (const d of deliveries) {
      deliverySupplierById.set(d.id, d.supplier_id)
    }
    for (const pay of costPayments) {
      const supplierId = deliverySupplierById.get(pay.delivery_id)
      if (!supplierId) continue
      const typeId = typeBySupplier.get(supplierId)
      if (!typeId) continue
      const amount = Number(pay.amount) || 0
      ensureType(typeId).cost_paid += amount
      ensureSupplier(supplierId, typeId).cost_paid += amount
    }

    const typeResult: SupplierStatsRow[] = []
    for (const t of accountTypes.value) {
      const row = byType.get(t.id) || emptyRow(t.id, accountTypeLabel(t.name))
      finalizeRow(row, factor, kgToArdab)
      typeResult.push(row)
    }
    rows.value = typeResult

    const supplierResult = [...bySupplier.values()]
      .map((row) => {
        finalizeRow(row, factor, kgToArdab)
        return row
      })
      .sort((a, b) => {
        if (b.purchased_kg !== a.purchased_kg) return b.purchased_kg - a.purchased_kg
        return a.supplier_name.localeCompare(b.supplier_name, 'ar')
      })
    supplierRows.value = supplierResult

    if (
      selectedAccountTypeId.value !== 'all'
      && !accountTypes.value.some(t => t.id === selectedAccountTypeId.value)
    ) {
      selectedAccountTypeId.value = 'all'
    }
  }

  const load = async () => {
    loading.value = true
    try {
      await loadLookups()
      await loadStats()
    } catch (e: any) {
      toast.add({
        title: 'تعذر تحميل الإحصائيات',
        description: e.message,
        color: 'error'
      })
    } finally {
      loading.value = false
    }
  }

  let ready = false

  watch(selectedProductId, (id) => {
    if (!ready || !id) return
    const current = queryProductId()
    if (current !== id) {
      void navigateTo({
        path: route.path,
        query: { ...route.query, product: id }
      }, { replace: true })
    }
    void loadStats().catch((e: any) => {
      toast.add({
        title: 'تعذر تحميل الإحصائيات',
        description: e.message,
        color: 'error'
      })
    })
  })

  watch(
    () => route.query.product,
    () => {
      if (!ready) return
      const fromQuery = queryProductId()
      if (fromQuery && fromQuery !== selectedProductId.value) {
        selectedProductId.value = fromQuery
      }
    }
  )

  onMounted(async () => {
    await load()
    ready = true
  })

  return {
    loading,
    season,
    productOptions,
    accountTypeOptions,
    selectedProductId,
    selectedAccountTypeId,
    isAllTypesView,
    selectedTypeRow,
    rows,
    totals,
    supplierRows,
    suppliersForSelectedType,
    typeKgBars,
    typeMoneyBars,
    typeKgPie,
    typeMoneyPie,
    maxTypeKg,
    maxTypeMoney,
    detailFlowBars,
    detailMoneyBars,
    detailMaxKg,
    detailMaxMoney,
    typeColorById,
    barPercent,
    metricColors: METRIC_COLORS,
    load
  }
}
