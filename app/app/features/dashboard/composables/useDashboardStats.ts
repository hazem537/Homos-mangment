import type { Database } from '~/types/database.types'
import { accountTypeLabel } from '~/utils/accountType'

export type FlowBar = {
  key: string
  label: string
  kg: number
  /** Distinct hex/CSS color per place */
  color: string
  hint?: string
}

const PLACE_COLORS: Record<string, string> = {
  purchased: '#2563eb', // أزرق — مشتريات
  delivered: '#16a34a', // أخضر — استلام
  remaining: '#ea580c', // برتقالي — متبقي عند المورد
  warehouse: '#ca8a04', // ذهبي — شون
  mekla: '#db2777', // وردي — مقالي
  store: '#0891b2', // سماوي — مخازن
  sold: '#7c3aed' // بنفسجي — مبيعات
}

function round2(n: number) {
  return Number(n.toFixed(2))
}

function addToMap(map: Map<string, number>, key: string, kg: number) {
  map.set(key, (map.get(key) || 0) + kg)
}

/** رصيد منسوب لكل موقع: وارد مطابق − صادر بنسبة حصة الوارد المطابق */
function attributedBalances(
  typedIn: Map<string, number>,
  totalIn: Map<string, number>,
  totalOut: Map<string, number>
) {
  let sum = 0
  const ids = new Set([...typedIn.keys(), ...totalOut.keys()])
  for (const id of ids) {
    const tin = typedIn.get(id) || 0
    if (!(tin > 0.00005)) continue
    const tot = totalIn.get(id) || 0
    const out = totalOut.get(id) || 0
    const share = tot > 0.00005 ? Math.min(1, tin / tot) : 1
    sum += Math.max(0, tin - out * share)
  }
  return sum
}

export function useDashboardStats() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()

  const loading = ref(true)
  const season = ref<{ id: string, name: string, year: number, ardab_factor: number } | null>(null)
  const products = ref<{ id: string, name: string }[]>([])
  const accountTypes = ref<{ id: string, name: string }[]>([])
  const suppliers = ref<{ id: string, name: string, account_type_id: string }[]>([])

  const selectedProductId = ref('')
  const selectedAccountTypeId = ref('all')
  const selectedSupplierId = ref('all')

  const purchasedKg = ref(0)
  const deliveredKg = ref(0)
  const remainingKg = ref(0)
  const warehouseKg = ref(0)
  const meklaKg = ref(0)
  const storeKg = ref(0)
  const soldKg = ref(0)

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
      label: s.name,
      value: s.id
    }))
  ])

  const syncSupplierWithType = () => {
    if (selectedSupplierId.value === 'all') return
    const ok = suppliersForType.value.some(s => s.id === selectedSupplierId.value)
    if (!ok) selectedSupplierId.value = 'all'
  }

  const defaultProductId = () => {
    const named = products.value.find(p => p.name === 'حمص خام')
    return named?.id || products.value[0]?.id || ''
  }

  const maxKg = computed(() =>
    Math.max(
      purchasedKg.value,
      deliveredKg.value,
      remainingKg.value,
      warehouseKg.value,
      meklaKg.value,
      storeKg.value,
      soldKg.value,
      0.001
    )
  )

  const flowBars = computed<FlowBar[]>(() => [
    {
      key: 'purchased',
      label: 'يجب أن يكون (مشتريات)',
      kg: purchasedKg.value,
      color: PLACE_COLORS.purchased!,
      hint: 'إجمالي ما تم شراؤه من الموردين'
    },
    {
      key: 'remaining',
      label: 'مطلوب من المورد',
      kg: remainingKg.value,
      color: PLACE_COLORS.remaining!,
      hint: 'مشتريات − مستلم (لم يُسلَّم بعد)'
    },
    {
      key: 'delivered',
      label: 'تم الاستلام',
      kg: deliveredKg.value,
      color: PLACE_COLORS.delivered!,
      hint: 'ما وصل فعلياً (شونة أو مخزن)'
    },
    {
      key: 'warehouse',
      label: 'في الشون',
      kg: warehouseKg.value,
      color: PLACE_COLORS.warehouse!,
      hint: 'رصيد الشون الحالي'
    },
    {
      key: 'store',
      label: 'في المخازن',
      kg: storeKg.value,
      color: PLACE_COLORS.store!,
      hint: 'رصيد المخازن الحالي'
    },
    {
      key: 'mekla',
      label: 'في المقالي',
      kg: meklaKg.value,
      color: PLACE_COLORS.mekla!,
      hint: 'رصيد المقالي الحالي'
    },
    {
      key: 'sold',
      label: 'مبيعات',
      kg: soldKg.value,
      color: PLACE_COLORS.sold!,
      hint: 'كميات مسجّلة كبيع'
    }
  ])

  /** أماكن الكمية — للدائرة */
  const placeBars = computed(() =>
    flowBars.value.filter(b =>
      ['remaining', 'warehouse', 'store', 'mekla', 'sold'].includes(b.key)
    )
  )

  const pieTotal = computed(() =>
    round2(placeBars.value.reduce((s, b) => s + Math.max(0, b.kg), 0))
  )

  type PieSlice = FlowBar & {
    percent: number
    startAngle: number
    endAngle: number
    path: string
  }

  const polar = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    }
  }

  const slicePath = (
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number
  ) => {
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

  const pieSlices = computed<PieSlice[]>(() => {
    const cx = 120
    const cy = 120
    const r = 100
    const total = pieTotal.value
    const active = placeBars.value.filter(b => b.kg > 0.005)
    if (!active.length || !(total > 0.005)) return []

    // شريحة واحدة = دائرة كاملة
    if (active.length === 1) {
      const only = active[0]!
      return [{
        ...only,
        percent: 100,
        startAngle: 0,
        endAngle: 360,
        path: [
          `M ${cx} ${cy - r}`,
          `A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`,
          'Z'
        ].join(' ')
      }]
    }

    let angle = 0
    return active.map((bar) => {
      const share = bar.kg / total
      const sweep = share * 360
      const startAngle = angle
      const endAngle = angle + sweep
      angle = endAngle
      return {
        ...bar,
        percent: round2(share * 100),
        startAngle,
        endAngle,
        path: slicePath(cx, cy, r, startAngle, endAngle)
      }
    })
  })

  const barPercent = (kg: number) => {
    const pct = (kg / maxKg.value) * 100
    if (!(pct > 0)) return 0
    return Math.min(100, Math.max(2, pct))
  }

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, productsRes, typesRes, suppliersListRes] = await Promise.all([
        client
          .from('seasons')
          .select('id, name, year, ardab_factor')
          .eq('is_active', true)
          .maybeSingle(),
        client.from('products').select('id, name').eq('is_active', true).order('name'),
        client.from('account_types').select('id, name').order('name'),
        client
          .from('suppliers')
          .select('id, name, account_type_id')
          .eq('is_active', true)
          .order('name')
      ])
      if (seasonRes.error) throw seasonRes.error
      if (productsRes.error) throw productsRes.error
      if (typesRes.error) throw typesRes.error
      if (suppliersListRes.error) throw suppliersListRes.error

      season.value = seasonRes.data
      products.value = productsRes.data ?? []
      accountTypes.value = typesRes.data ?? []
      suppliers.value = (suppliersListRes.data ?? []).map(s => ({
        id: s.id,
        name: s.name,
        account_type_id: s.account_type_id
      }))

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

      if (!seasonRes.data?.id || !selectedProductId.value) {
        purchasedKg.value = 0
        deliveredKg.value = 0
        remainingKg.value = 0
        warehouseKg.value = 0
        meklaKg.value = 0
        storeKg.value = 0
        soldKg.value = 0
        return
      }

      const seasonId = seasonRes.data.id
      const productId = selectedProductId.value
      const typeId = selectedAccountTypeId.value
      const supplierId = selectedSupplierId.value

      const filtersOpen = typeId === 'all' && supplierId === 'all'

      const [purchasesRes, deliveriesRes, whRes, storeRes, meklaRes, movementsRes, sectionsRes, warehousesRes]
        = await Promise.all([
          client
            .from('purchases')
            .select('supplier_id, quantity_kg')
            .eq('season_id', seasonId)
            .eq('product_id', productId)
            .eq('is_cancelled', false),
          client
            .from('warehouse_deliveries')
            .select('supplier_id, quantity_kg, destination_kind, warehouse_id, section_id, store_id')
            .eq('season_id', seasonId)
            .eq('product_id', productId)
            .eq('is_cancelled', false),
          client.rpc('warehouse_balances', { p_season_id: seasonId }),
          client.rpc('store_balances', { p_season_id: seasonId }),
          client.rpc('mekla_balances', { p_season_id: seasonId }),
          client
            .from('stock_movements')
            .select('quantity_kg, from_kind, from_id, to_kind, to_id')
            .eq('season_id', seasonId)
            .eq('product_id', productId)
            .eq('is_cancelled', false),
          client.from('warehouse_sections').select('id, warehouse_id'),
          client.from('warehouses').select('id, account_type_id').eq('is_active', true)
        ])

      if (purchasesRes.error) throw purchasesRes.error
      if (deliveriesRes.error) throw deliveriesRes.error
      if (movementsRes.error) throw movementsRes.error
      if (sectionsRes.error) throw sectionsRes.error
      if (warehousesRes.error) throw warehousesRes.error

      if (whRes.error || storeRes.error || meklaRes.error) {
        const msg = [whRes.error, storeRes.error, meklaRes.error]
          .filter(Boolean)
          .map(e => e!.message)
          .join(' · ')
        toast.add({
          title: 'تعذر تحميل بعض أرصدة الأماكن',
          description: msg,
          color: 'warning'
        })
      }

      const typeBySupplier = new Map(
        suppliers.value.map(s => [s.id, s.account_type_id] as const)
      )
      const warehouseType = new Map(
        (warehousesRes.data ?? []).map(w => [w.id, w.account_type_id] as const)
      )
      const sectionWarehouse = new Map(
        (sectionsRes.data ?? []).map(s => [s.id, s.warehouse_id] as const)
      )

      const matchSupplierFilter = (sid: string) => {
        if (supplierId !== 'all' && sid !== supplierId) return false
        if (typeId === 'all') return true
        return typeBySupplier.get(sid) === typeId
      }

      const sectionMatchesType = (sectionId: string) => {
        if (typeId === 'all') return true
        const whId = sectionWarehouse.get(sectionId)
        if (!whId) return false
        return warehouseType.get(whId) === typeId
      }

      /** حصة المورد من تسليمات ربع معيّن (للتصفية بالمورد) */
      const sectionDeliveryTotal = new Map<string, number>()
      const sectionDeliveryMatched = new Map<string, number>()
      for (const d of deliveriesRes.data ?? []) {
        if (d.destination_kind !== 'warehouse' || !d.section_id) continue
        const kg = Number(d.quantity_kg) || 0
        if (!(kg > 0)) continue
        addToMap(sectionDeliveryTotal, d.section_id, kg)
        if (matchSupplierFilter(d.supplier_id)) {
          addToMap(sectionDeliveryMatched, d.section_id, kg)
        }
      }

      const sectionMatchShare = (sectionId: string) => {
        if (!sectionMatchesType(sectionId)) return 0
        if (supplierId === 'all') return 1
        const tot = sectionDeliveryTotal.get(sectionId) || 0
        if (!(tot > 0.00005)) return 0
        return Math.min(1, (sectionDeliveryMatched.get(sectionId) || 0) / tot)
      }

      let purchased = 0
      for (const p of purchasesRes.data ?? []) {
        if (!matchSupplierFilter(p.supplier_id)) continue
        purchased += Number(p.quantity_kg) || 0
      }

      let delivered = 0
      for (const d of deliveriesRes.data ?? []) {
        if (!matchSupplierFilter(d.supplier_id)) continue
        delivered += Number(d.quantity_kg) || 0
      }

      let wh = 0
      let store = 0
      let mekla = 0
      let sold = 0

      if (filtersOpen) {
        if (!whRes.error) {
          for (const w of whRes.data ?? []) {
            if (!w.product_id || w.product_id !== productId) continue
            const kg = Number(w.kg_total) || 0
            if (kg > 0.00005) wh += kg
          }
        }
        if (!storeRes.error) {
          for (const s of storeRes.data ?? []) {
            if (!s.product_id || s.product_id !== productId) continue
            const kg = Number(s.kg_total) || 0
            if (kg > 0.00005) store += kg
          }
        }
        if (!meklaRes.error) {
          for (const m of meklaRes.data ?? []) {
            if (!m.product_id || m.product_id !== productId) continue
            const kg = Number(m.kg_total) || 0
            if (kg > 0.00005) mekla += kg
          }
        }
        for (const m of movementsRes.data ?? []) {
          if (m.to_kind !== 'sale') continue
          sold += Number(m.quantity_kg) || 0
        }
      } else {
        // شون: نوع الشونة + حصة المورد من تسليمات الأرباع عند اختيار مورد
        if (!whRes.error && supplierId === 'all') {
          for (const w of whRes.data ?? []) {
            if (!w.product_id || w.product_id !== productId) continue
            if (typeId !== 'all' && w.account_type_id !== typeId) continue
            const kg = Number(w.kg_total) || 0
            if (kg > 0.00005) wh += kg
          }
        } else {
          const whTypedIn = new Map<string, number>()
          const whTotalIn = new Map<string, number>()
          const whTotalOut = new Map<string, number>()

          for (const d of deliveriesRes.data ?? []) {
            if (d.destination_kind !== 'warehouse' || !d.warehouse_id) continue
            const kg = Number(d.quantity_kg) || 0
            if (!(kg > 0)) continue
            if (typeId !== 'all' && warehouseType.get(d.warehouse_id) !== typeId) continue
            addToMap(whTotalIn, d.warehouse_id, kg)
            if (matchSupplierFilter(d.supplier_id)) {
              addToMap(whTypedIn, d.warehouse_id, kg)
            }
          }
          for (const m of movementsRes.data ?? []) {
            const kg = Number(m.quantity_kg) || 0
            if (!(kg > 0)) continue
            if (m.from_kind === 'section') {
              const whId = sectionWarehouse.get(m.from_id)
              if (!whId) continue
              if (typeId !== 'all' && warehouseType.get(whId) !== typeId) continue
              addToMap(whTotalOut, whId, kg)
            }
            if (m.to_kind === 'section') {
              const whId = sectionWarehouse.get(m.to_id)
              if (!whId) continue
              if (typeId !== 'all' && warehouseType.get(whId) !== typeId) continue
              addToMap(whTotalIn, whId, kg)
              // حركات العودة بلا مورد — تُحسب في الإجمالي فقط
            }
          }
          wh = attributedBalances(whTypedIn, whTotalIn, whTotalOut)
        }

        // مخازن / مقالي / مبيعات — منسوبة حسب النوع والمورد (وارد أولاً ثم صادر)
        const storeTypedIn = new Map<string, number>()
        const storeTotalIn = new Map<string, number>()
        const storeTotalOut = new Map<string, number>()
        const meklaTypedIn = new Map<string, number>()
        const meklaTotalIn = new Map<string, number>()
        const meklaTotalOut = new Map<string, number>()

        for (const d of deliveriesRes.data ?? []) {
          if (d.destination_kind !== 'store' || !d.store_id) continue
          const kg = Number(d.quantity_kg) || 0
          if (!(kg > 0)) continue
          addToMap(storeTotalIn, d.store_id, kg)
          if (matchSupplierFilter(d.supplier_id)) {
            addToMap(storeTypedIn, d.store_id, kg)
          }
        }

        const movements = movementsRes.data ?? []

        for (const m of movements) {
          const kg = Number(m.quantity_kg) || 0
          if (!(kg > 0)) continue
          if (m.to_kind === 'store') {
            addToMap(storeTotalIn, m.to_id, kg)
            if (m.from_kind === 'section') {
              const share = sectionMatchShare(m.from_id)
              if (share > 0) addToMap(storeTypedIn, m.to_id, kg * share)
            }
          }
          if (m.from_kind === 'store') {
            addToMap(storeTotalOut, m.from_id, kg)
          }
        }

        const storeShare = (storeId: string) => {
          const tin = storeTypedIn.get(storeId) || 0
          const tot = storeTotalIn.get(storeId) || 0
          if (!(tot > 0.00005)) return 0
          return Math.min(1, tin / tot)
        }

        for (const m of movements) {
          const kg = Number(m.quantity_kg) || 0
          if (!(kg > 0)) continue
          if (m.to_kind === 'mekla') {
            addToMap(meklaTotalIn, m.to_id, kg)
            if (m.from_kind === 'section') {
              const share = sectionMatchShare(m.from_id)
              if (share > 0) addToMap(meklaTypedIn, m.to_id, kg * share)
            } else if (m.from_kind === 'store') {
              const share = storeShare(m.from_id)
              if (share > 0) addToMap(meklaTypedIn, m.to_id, kg * share)
            }
          }
          if (m.from_kind === 'mekla') {
            addToMap(meklaTotalOut, m.from_id, kg)
          }
        }

        const meklaShare = (meklaId: string) => {
          const tin = meklaTypedIn.get(meklaId) || 0
          const tot = meklaTotalIn.get(meklaId) || 0
          if (!(tot > 0.00005)) return 0
          return Math.min(1, tin / tot)
        }

        for (const m of movements) {
          if (m.to_kind !== 'sale') continue
          const kg = Number(m.quantity_kg) || 0
          if (!(kg > 0)) continue
          if (m.from_kind === 'section') {
            sold += kg * sectionMatchShare(m.from_id)
          } else if (m.from_kind === 'store') {
            sold += kg * storeShare(m.from_id)
          } else if (m.from_kind === 'mekla') {
            sold += kg * meklaShare(m.from_id)
          }
        }

        store = attributedBalances(storeTypedIn, storeTotalIn, storeTotalOut)
        mekla = attributedBalances(meklaTypedIn, meklaTotalIn, meklaTotalOut)
      }

      purchasedKg.value = round2(purchased)
      deliveredKg.value = round2(delivered)
      remainingKg.value = round2(purchased - delivered)
      if (Math.abs(remainingKg.value) < 0.005) remainingKg.value = 0
      warehouseKg.value = round2(wh)
      meklaKg.value = round2(mekla)
      storeKg.value = round2(store)
      soldKg.value = round2(sold)
    } catch (e: any) {
      toast.add({
        title: 'تعذر تحميل لوحة التحكم',
        description: e.message,
        color: 'error'
      })
      purchasedKg.value = 0
      deliveredKg.value = 0
      remainingKg.value = 0
      warehouseKg.value = 0
      meklaKg.value = 0
      storeKg.value = 0
      soldKg.value = 0
    } finally {
      loading.value = false
    }
  }

  const filtersReady = ref(false)

  watch(selectedAccountTypeId, () => {
    if (!filtersReady.value) return
    syncSupplierWithType()
  })

  watch([selectedProductId, selectedAccountTypeId, selectedSupplierId], () => {
    if (!filtersReady.value) return
    load()
  })

  onMounted(async () => {
    await load()
    filtersReady.value = true
  })

  return {
    loading,
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
    flowBars,
    placeBars,
    pieSlices,
    pieTotal,
    barPercent,
    load
  }
}
