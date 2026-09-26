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
    if (!season.value?.id || !selectedProductId.value) return

    const seasonId = season.value.id
    const productId = selectedProductId.value
    const factor = season.value.ardab_factor || 170

    const [suppliersRes, purchasesRes, deliveriesRes, transfersRes] = await Promise.all([
      client
        .from('suppliers')
        .select('id, account_type_id')
        .eq('is_active', true),
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
    const typeBySupplier = new Map(
      (suppliersRes.data ?? []).map(s => [s.id, s.account_type_id] as const)
    )

    const byType = new Map<string, SupplierStatsRow>()
    const ensure = (typeId: string) => {
      let row = byType.get(typeId)
      if (!row) {
        row = emptyRow(typeId, accountTypeLabel(typeNameById.get(typeId)))
        byType.set(typeId, row)
      }
      return row
    }

    // Pre-seed known account types so empty types still appear if we want —
    // plan says one row per account type with data; show all types with zeros for clarity
    for (const t of accountTypes.value) {
      ensure(t.id)
    }

    const purchasedKgBySupplier = new Map<string, number>()
    const deliveredKgBySupplier = new Map<string, number>()

    for (const p of purchasesRes.data ?? []) {
      const typeId = typeBySupplier.get(p.supplier_id)
      if (!typeId) continue
      const row = ensure(typeId)
      const kg = Number(p.quantity_kg) || 0
      const price = Number(p.total_price) || 0
      row.purchased_kg += kg
      row.purchases_total += price
      purchasedKgBySupplier.set(
        p.supplier_id,
        (purchasedKgBySupplier.get(p.supplier_id) || 0) + kg
      )
    }

    for (const d of deliveries) {
      const typeId = typeBySupplier.get(d.supplier_id)
      if (!typeId) continue
      const row = ensure(typeId)
      const kg = Number(d.quantity_kg) || 0
      row.delivered_kg += kg
      row.nolon_total += Number(d.nolon_total) || 0
      row.nathriyat_total += Number(d.nathriyat_total) || 0
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
      ensure(typeId).remaining_kg += remaining
    }

    for (const t of transfersRes.data ?? []) {
      const typeId = typeBySupplier.get(t.supplier_id)
      if (!typeId) continue
      const amount = Number(t.amount) || 0
      if (t.kind === 'commission') {
        ensure(typeId).commission_total += amount
      } else {
        ensure(typeId).money_paid += amount
      }
    }

    const deliveryTypeById = new Map<string, string>()
    for (const d of deliveries) {
      const typeId = typeBySupplier.get(d.supplier_id)
      if (typeId) deliveryTypeById.set(d.id, typeId)
    }
    for (const pay of costPayments) {
      const typeId = deliveryTypeById.get(pay.delivery_id)
      if (!typeId) continue
      ensure(typeId).cost_paid += Number(pay.amount) || 0
    }

    const result: SupplierStatsRow[] = []
    for (const t of accountTypes.value) {
      const row = byType.get(t.id) || emptyRow(t.id, accountTypeLabel(t.name))
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
      result.push(row)
    }

    rows.value = result

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
    load
  }
}
