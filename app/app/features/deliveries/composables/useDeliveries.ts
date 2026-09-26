import type { Database, DeliveryCostKind } from '~/types/database.types'
import {
  deliveryCostKindLabel,
  deliveryCostRest,
  formatNolonAuto,
  isNolonMatchingAuto,
  NOLON_RATE_PER_TON,
  paymentsForDelivery,
  sumDeliveryCostPaid,
  type DeliveryCostPaymentLite
} from '~/utils/deliveryCosts'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type WarehouseDelivery = Database['public']['Tables']['warehouse_deliveries']['Row'] & {
  suppliers?: { id: string, name: string } | null
  warehouses?: { id: string, name: string } | null
  products?: { id: string, name: string } | null
  stock_statuses?: { id: string, name: string } | null
}

type SeasonLite = { id: string, name: string, ardab_factor: number }
type SupplierLite = { id: string, name: string, account_type_id: string, account_type_name: string }
type WarehouseLite = { id: string, name: string, account_type_id: string, account_type_name: string }
type SectionLite = { id: string, name: string, warehouse_id: string }
type ProductLite = { id: string, name: string }
type StatusLite = { id: string, name: string, product_id: string }
type PurchaseLite = { supplier_id: string, product_id: string, quantity_kg: number }
type DeliveryMoneyField =
  | 'quantity_kg'
  | 'nolon_total'
  | 'nolon_paid'
  | 'nathriyat_total'
  | 'nathriyat_paid'

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function moneyOrZero(raw: string) {
  const n = parseDecimal(raw)
  return n >= 0 ? n : 0
}

export function useDeliveries() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()
  const { kgToArdab } = useArdab()

  const loading = ref(true)
  const saving = ref(false)
  const deliveries = ref<WarehouseDelivery[]>([])
  const costPayments = ref<DeliveryCostPaymentLite[]>([])
  const suppliers = ref<SupplierLite[]>([])
  const warehouses = ref<WarehouseLite[]>([])
  const sections = ref<SectionLite[]>([])
  const products = ref<ProductLite[]>([])
  const stockStatuses = ref<StatusLite[]>([])
  const seasonPurchases = ref<PurchaseLite[]>([])
  const activeSeason = ref<SeasonLite | null>(null)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<WarehouseDelivery | null>(null)
  const expandedDeliveryId = ref<string | null>(null)

  const paymentModalOpen = ref(false)
  const paymentDelivery = ref<WarehouseDelivery | null>(null)
  const paymentKind = ref<DeliveryCostKind>('nolon')
  const paymentForm = reactive({
    amount: '' as string,
    payment_date: todayIsoDate(),
    notes: ''
  })

  const form = reactive({
    supplier_id: '' as string,
    warehouse_id: '' as string,
    section_id: '' as string,
    product_id: '' as string,
    delivery_date: todayIsoDate(),
    quantity_kg: '' as string,
    nolon_total: '' as string,
    nolon_paid: '' as string,
    nathriyat_total: '' as string,
    nathriyat_paid: '' as string,
    vehicle_number: '',
    notes: ''
  })

  /** When false, nolon_total follows kg × rate; user edit flips it to true */
  const nolonManualOverride = ref(false)

  const computedArdab = computed(() => {
    const factor = activeSeason.value?.ardab_factor ?? 170
    return kgToArdab(parseDecimal(form.quantity_kg), Number(factor))
  })

  const supplierOptions = computed(() => {
    const warehouseType = warehouses.value.find(w => w.id === form.warehouse_id)?.account_type_id
    return suppliers.value
      .filter(s => !warehouseType || s.account_type_id === warehouseType)
      .map(s => ({
        label: s.account_type_name ? `${s.name} — ${s.account_type_name}` : s.name,
        value: s.id
      }))
  })

  const warehouseOptions = computed(() => {
    const supplierType = suppliers.value.find(s => s.id === form.supplier_id)?.account_type_id
    return warehouses.value
      .filter(w => !supplierType || w.account_type_id === supplierType)
      .map(w => ({
        label: w.account_type_name ? `${w.name} — ${w.account_type_name}` : w.name,
        value: w.id
      }))
  })

  const syncWarehouseForSupplierType = () => {
    const options = warehouseOptions.value
    if (!options.length) {
      form.warehouse_id = ''
      syncSectionForWarehouse()
      return
    }
    if (!options.some(o => o.value === form.warehouse_id)) {
      form.warehouse_id = options[0]?.value || ''
    }
    syncSectionForWarehouse()
  }

  const syncSupplierForWarehouseType = () => {
    const options = supplierOptions.value
    if (!options.length) {
      form.supplier_id = ''
      return
    }
    if (!options.some(o => o.value === form.supplier_id)) {
      form.supplier_id = options[0]?.value || ''
    }
  }

  const productOptions = computed(() => {
    const supplierId = form.supplier_id
    if (!supplierId) return []
    const purchasedIds = new Set(
      seasonPurchases.value
        .filter(p => p.supplier_id === supplierId)
        .map(p => p.product_id)
    )
    return products.value
      .filter(p => purchasedIds.has(p.id))
      .map(p => ({ label: p.name, value: p.id }))
  })

  const reloadStatuses = async () => {
    const { data, error } = await client
      .from('stock_statuses')
      .select('id, name, product_id')
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    stockStatuses.value = data ?? []
  }

  /** Delivery no longer asks for status — use product default (بدون غربلة). */
  const resolveStatusIdForProduct = async (productId: string) => {
    if (!productId) return null
    let forProduct = stockStatuses.value.filter(s => s.product_id === productId)
    if (!forProduct.length) {
      await client.from('stock_statuses').insert([
        { product_id: productId, name: 'بدون غربلة', notes: 'الحالة الافتراضية' },
        { product_id: productId, name: 'مغربل', notes: null }
      ])
      await reloadStatuses()
      forProduct = stockStatuses.value.filter(s => s.product_id === productId)
    }
    const preferred = forProduct.find(s => s.name.trim() === 'بدون غربلة')
    return preferred?.id || forProduct[0]?.id || null
  }

  const purchasedKgOf = (supplierId: string, productId: string) =>
    seasonPurchases.value
      .filter(p => p.supplier_id === supplierId && p.product_id === productId)
      .reduce((sum, p) => sum + Number(p.quantity_kg), 0)

  const deliveredKgOf = (
    supplierId: string,
    productId: string,
    excludeDeliveryId?: string | null
  ) =>
    deliveries.value
      .filter(d =>
        d.supplier_id === supplierId
        && d.product_id === productId
        && (!excludeDeliveryId || d.id !== excludeDeliveryId)
      )
      .reduce((sum, d) => sum + Number(d.quantity_kg), 0)

  const deliveryMaxKgAllowed = computed(() => {
    if (!form.supplier_id || !form.product_id) return 0
    const bought = purchasedKgOf(form.supplier_id, form.product_id)
    const delivered = deliveredKgOf(
      form.supplier_id,
      form.product_id,
      editing.value?.id
    )
    return Number((bought - delivered).toFixed(4))
  })

  const syncProductForSupplier = () => {
    const options = productOptions.value
    if (!options.length) {
      form.product_id = ''
      return
    }
    if (!options.some(o => o.value === form.product_id)) {
      const withRemaining = options.find(
        o =>
          purchasedKgOf(form.supplier_id, o.value)
          - deliveredKgOf(form.supplier_id, o.value, editing.value?.id)
          > 0.001
      )
      form.product_id = withRemaining?.value || options[0]?.value || ''
    }
  }

  const onSupplierChange = () => {
    syncWarehouseForSupplierType()
    syncProductForSupplier()
  }

  const onWarehouseChange = () => {
    syncSupplierForWarehouseType()
    syncSectionForWarehouse()
    syncProductForSupplier()
  }

  const sectionOptions = computed(() =>
    sections.value
      .filter(s => s.warehouse_id === form.warehouse_id)
      .map(s => ({ label: s.name, value: s.id }))
  )

  const syncSectionForWarehouse = () => {
    const options = sectionOptions.value
    if (!options.length) {
      form.section_id = ''
      return
    }
    if (!options.some(o => o.value === form.section_id)) {
      form.section_id = options[0]?.value || ''
    }
  }

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return deliveries.value
    return deliveries.value.filter((d) => {
      const supplierName = d.suppliers?.name || ''
      const warehouseName = d.warehouses?.name || ''
      const productName = d.products?.name || ''
      return supplierName.includes(q)
        || warehouseName.includes(q)
        || productName.includes(q)
        || (d.vehicle_number || '').includes(q)
        || (d.notes || '').includes(q)
    })
  })

  const nolonPaidOf = (deliveryId: string) =>
    sumDeliveryCostPaid(costPayments.value, deliveryId, 'nolon')

  const nathriyatPaidOf = (deliveryId: string) =>
    sumDeliveryCostPaid(costPayments.value, deliveryId, 'nathriyat')

  const nolonRestOf = (row: WarehouseDelivery) =>
    deliveryCostRest(row.nolon_total, nolonPaidOf(row.id))

  const nathriyatRestOf = (row: WarehouseDelivery) =>
    deliveryCostRest(row.nathriyat_total, nathriyatPaidOf(row.id))

  const paymentsOf = (deliveryId: string) =>
    paymentsForDelivery(costPayments.value, deliveryId)

  const summary = computed(() => {
    const totalKg = deliveries.value.reduce((sum, d) => sum + Number(d.quantity_kg), 0)
    const totalArdab = deliveries.value.reduce((sum, d) => sum + Number(d.ardab), 0)
    const nolonTotal = deliveries.value.reduce((sum, d) => sum + Number(d.nolon_total), 0)
    const nathriyatTotal = deliveries.value.reduce((sum, d) => sum + Number(d.nathriyat_total), 0)
    const nolonPaid = costPayments.value
      .filter(p => p.kind === 'nolon' && !p.is_cancelled)
      .reduce((sum, p) => sum + Number(p.amount), 0)
    const nathriyatPaid = costPayments.value
      .filter(p => p.kind === 'nathriyat' && !p.is_cancelled)
      .reduce((sum, p) => sum + Number(p.amount), 0)
    return {
      totalKg,
      totalArdab,
      count: deliveries.value.length,
      nolonTotal,
      nolonPaid,
      nolonRest: deliveryCostRest(nolonTotal, nolonPaid),
      nathriyatTotal,
      nathriyatPaid,
      nathriyatRest: deliveryCostRest(nathriyatTotal, nathriyatPaid)
    }
  })

  const paymentRemaining = computed(() => {
    if (!paymentDelivery.value) return 0
    return paymentKind.value === 'nolon'
      ? nolonRestOf(paymentDelivery.value)
      : nathriyatRestOf(paymentDelivery.value)
  })

  const loadLookups = async () => {
    const [seasonRes, suppliersRes, warehousesRes, sectionsRes, productsRes, statusesRes] = await Promise.all([
      client.from('seasons').select('id, name, ardab_factor').eq('is_active', true).maybeSingle(),
      client.from('suppliers').select('id, name, account_type_id, account_types(name)').eq('is_active', true).order('name'),
      client.from('warehouses').select('id, name, account_type_id, account_types(name)').eq('is_active', true).order('name'),
      client.from('warehouse_sections').select('id, name, warehouse_id').eq('is_active', true).order('name'),
      client.from('products').select('id, name').eq('is_active', true).order('name'),
      client.from('stock_statuses').select('id, name, product_id').eq('is_active', true).order('name')
    ])
    if (seasonRes.error) throw seasonRes.error
    if (suppliersRes.error) throw suppliersRes.error
    if (warehousesRes.error) throw warehousesRes.error
    if (sectionsRes.error) throw sectionsRes.error
    if (productsRes.error) throw productsRes.error
    if (statusesRes.error) throw statusesRes.error
    activeSeason.value = seasonRes.data
    suppliers.value = (suppliersRes.data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      account_type_id: s.account_type_id,
      account_type_name: s.account_types?.name || '—'
    }))
    warehouses.value = (warehousesRes.data ?? []).map((w: any) => ({
      id: w.id,
      name: w.name,
      account_type_id: w.account_type_id,
      account_type_name: w.account_types?.name || '—'
    }))
    sections.value = sectionsRes.data ?? []
    products.value = productsRes.data ?? []
    stockStatuses.value = statusesRes.data ?? []
  }

  const loadPaymentsForDeliveries = async (deliveryIds: string[]) => {
    if (!deliveryIds.length) {
      costPayments.value = []
      return
    }
    const { data, error } = await client
      .from('delivery_cost_payments')
      .select('*')
      .in('delivery_id', deliveryIds)
      .eq('is_cancelled', false)
      .order('payment_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    costPayments.value = (data ?? []) as DeliveryCostPaymentLite[]
  }

  const load = async () => {
    loading.value = true
    try {
      await loadLookups()
      if (!activeSeason.value) {
        deliveries.value = []
        costPayments.value = []
        seasonPurchases.value = []
        return
      }
      const [deliveriesRes, purchasesRes] = await Promise.all([
        client
          .from('warehouse_deliveries')
          .select('*, suppliers(id, name), warehouses(id, name), products(id, name), stock_statuses(id, name)')
          .eq('season_id', activeSeason.value.id)
          .eq('is_cancelled', false)
          .order('delivery_date', { ascending: false })
          .order('created_at', { ascending: false }),
        client
          .from('purchases')
          .select('supplier_id, product_id, quantity_kg')
          .eq('season_id', activeSeason.value.id)
          .eq('is_cancelled', false)
      ])
      if (deliveriesRes.error) throw deliveriesRes.error
      if (purchasesRes.error) throw purchasesRes.error
      deliveries.value = (deliveriesRes.data ?? []) as WarehouseDelivery[]
      seasonPurchases.value = (purchasesRes.data ?? []) as PurchaseLite[]
      await loadPaymentsForDeliveries(deliveries.value.map(d => d.id))
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل التسليمات', description: e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  const openCreate = () => {
    if (!activeSeason.value) {
      toast.add({ title: 'لا يوجد موسم نشط', description: 'فعّل موسماً من شاشة المواسم أولاً', color: 'warning' })
      return
    }
    if (!suppliers.value.length) {
      toast.add({ title: 'لا يوجد موردون', description: 'أضف مورداً قبل تسجيل تسليم', color: 'warning' })
      return
    }
    if (!warehouses.value.length) {
      toast.add({ title: 'لا توجد شون', description: 'أضف شونة قبل تسجيل تسليم', color: 'warning' })
      return
    }
    if (!products.value.length) {
      toast.add({ title: 'لا توجد أصناف', description: 'أضف صنفاً قبل تسجيل تسليم', color: 'warning' })
      return
    }
    editing.value = null
    form.supplier_id = suppliers.value[0]?.id || ''
    syncWarehouseForSupplierType()
    if (!warehouseOptions.value.length) {
      toast.add({
        title: 'لا توجد شون بنفس نوع المورد',
        description: 'أضف شونة بنفس نوع الحساب أولاً',
        color: 'warning'
      })
      return
    }
    syncProductForSupplier()
    if (!productOptions.value.length) {
      toast.add({
        title: 'لا يوجد صنف للتسليم',
        description: 'سجّل شراء لهذا المورد أولاً',
        color: 'warning'
      })
      return
    }
    form.delivery_date = todayIsoDate()
    form.quantity_kg = ''
    form.nolon_total = ''
    form.nolon_paid = ''
    form.nathriyat_total = ''
    form.nathriyat_paid = ''
    form.vehicle_number = ''
    form.notes = ''
    nolonManualOverride.value = false
    modalOpen.value = true
  }

  const openEdit = (row: WarehouseDelivery) => {
    editing.value = row
    form.supplier_id = row.supplier_id
    form.warehouse_id = row.warehouse_id
    form.section_id = row.section_id
    form.product_id = row.product_id
    syncSectionForWarehouse()
    form.delivery_date = row.delivery_date
    form.quantity_kg = String(row.quantity_kg)
    form.nolon_total = String(row.nolon_total ?? 0)
    form.nolon_paid = String(nolonPaidOf(row.id))
    form.nathriyat_total = String(row.nathriyat_total ?? 0)
    form.nathriyat_paid = String(nathriyatPaidOf(row.id))
    form.vehicle_number = row.vehicle_number || ''
    form.notes = row.notes || ''
    nolonManualOverride.value = !isNolonMatchingAuto(
      Number(row.quantity_kg),
      Number(row.nolon_total ?? 0)
    )
    modalOpen.value = true
  }

  const toggleExpand = (deliveryId: string) => {
    expandedDeliveryId.value = expandedDeliveryId.value === deliveryId ? null : deliveryId
  }

  const openPay = (row: WarehouseDelivery, kind: DeliveryCostKind) => {
    const rest = kind === 'nolon' ? nolonRestOf(row) : nathriyatRestOf(row)
    if (!(rest > 0)) {
      toast.add({ title: 'لا يوجد باقي للدفع', color: 'warning' })
      return
    }
    paymentDelivery.value = row
    paymentKind.value = kind
    paymentForm.amount = String(rest)
    paymentForm.payment_date = todayIsoDate()
    paymentForm.notes = ''
    paymentModalOpen.value = true
  }

  const savePayment = async () => {
    if (!paymentDelivery.value) return
    const amount = moneyOrZero(paymentForm.amount)
    const remaining = paymentRemaining.value
    if (!(amount > 0)) {
      toast.add({ title: 'المبلغ يجب أن يكون أكبر من صفر', color: 'warning' })
      return
    }
    if (amount > remaining + 0.001) {
      toast.add({ title: 'المبلغ أكبر من الباقي', description: `الباقي ${remaining}`, color: 'warning' })
      return
    }
    if (!paymentForm.payment_date) {
      toast.add({ title: 'التاريخ مطلوب', color: 'warning' })
      return
    }

    saving.value = true
    try {
      const { error } = await client.from('delivery_cost_payments').insert({
        delivery_id: paymentDelivery.value.id,
        kind: paymentKind.value,
        amount,
        payment_date: paymentForm.payment_date,
        notes: paymentForm.notes.trim() || null
      })
      if (error) throw error
      toast.add({
        title: `تم تسجيل دفع ${deliveryCostKindLabel(paymentKind.value)}`,
        color: 'success'
      })
      paymentModalOpen.value = false
      expandedDeliveryId.value = paymentDelivery.value.id
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل تسجيل الدفع', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDeletePayment = async (payment: DeliveryCostPaymentLite) => {
    const ok = await askConfirm(`حذف دفعة ${deliveryCostKindLabel(payment.kind)} نهائياً؟`)
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client
        .from('delivery_cost_payments')
        .delete()
        .eq('id', payment.id)
      if (error) throw error
      toast.add({ title: 'تم حذف الدفعة', color: 'success' })
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const save = async () => {
    if (!activeSeason.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (!form.supplier_id) {
      toast.add({ title: 'اختر المورد', color: 'warning' })
      return
    }
    if (!form.warehouse_id) {
      toast.add({ title: 'اختر الشونة', color: 'warning' })
      return
    }
    const supplier = suppliers.value.find(s => s.id === form.supplier_id)
    const warehouse = warehouses.value.find(w => w.id === form.warehouse_id)
    if (
      supplier
      && warehouse
      && supplier.account_type_id !== warehouse.account_type_id
    ) {
      toast.add({
        title: 'نوع المورد يجب أن يطابق نوع الشونة',
        color: 'warning'
      })
      return
    }
    if (!form.product_id) {
      toast.add({ title: 'اختر الصنف', color: 'warning' })
      return
    }
    if (!form.section_id) {
      toast.add({ title: 'اختر الربع', color: 'warning' })
      return
    }
    if (!form.delivery_date) {
      toast.add({ title: 'التاريخ مطلوب', color: 'warning' })
      return
    }
    const quantityKg = parseDecimal(form.quantity_kg)
    if (!(quantityKg > 0)) {
      toast.add({ title: 'الكمية يجب أن تكون أكبر من صفر', color: 'warning' })
      return
    }

    const maxKg = deliveryMaxKgAllowed.value
    if (quantityKg > maxKg + 0.001) {
      toast.add({
        title: 'الكمية أكبر من المطلوب استلامه لهذا الصنف',
        description: `المتبقي المتاح: ${maxKg.toFixed(2)} كجم`,
        color: 'warning'
      })
      return
    }

    const nolonTotal = moneyOrZero(form.nolon_total)
    const nathriyatTotal = moneyOrZero(form.nathriyat_total)
    const nolonPaid = moneyOrZero(form.nolon_paid)
    const nathriyatPaid = moneyOrZero(form.nathriyat_paid)

    if (!editing.value) {
      if (nolonPaid > nolonTotal + 0.001) {
        toast.add({ title: 'مدفوع النولون أكبر من الإجمالي', color: 'warning' })
        return
      }
      if (nathriyatPaid > nathriyatTotal + 0.001) {
        toast.add({ title: 'مدفوع النثريات أكبر من الإجمالي', color: 'warning' })
        return
      }
    }

    const statusId =
      editing.value && editing.value.product_id === form.product_id
        ? editing.value.status_id
        : await resolveStatusIdForProduct(form.product_id)
    if (!statusId) {
      toast.add({
        title: 'تعذر تحديد حالة الصنف',
        description: 'أضف حالات من صفحة الصنف أولاً',
        color: 'warning'
      })
      return
    }

    const payload = {
      season_id: activeSeason.value.id,
      supplier_id: form.supplier_id,
      warehouse_id: form.warehouse_id,
      section_id: form.section_id,
      product_id: form.product_id,
      status_id: statusId,
      delivery_date: form.delivery_date,
      quantity_kg: quantityKg,
      ardab: computedArdab.value,
      nolon_total: nolonTotal,
      nathriyat_total: nathriyatTotal,
      vehicle_number: form.vehicle_number.trim() || null,
      notes: form.notes.trim() || null
    }

    saving.value = true
    try {
      if (editing.value) {
        const { error } = await client.from('warehouse_deliveries').update(payload).eq('id', editing.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث التسليم', color: 'success' })
      } else {
        const { data, error } = await client
          .from('warehouse_deliveries')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error

        const initialPayments = []
        if (nolonPaid > 0) {
          initialPayments.push({
            delivery_id: data.id,
            kind: 'nolon' as const,
            amount: nolonPaid,
            payment_date: form.delivery_date,
            notes: null
          })
        }
        if (nathriyatPaid > 0) {
          initialPayments.push({
            delivery_id: data.id,
            kind: 'nathriyat' as const,
            amount: nathriyatPaid,
            payment_date: form.delivery_date,
            notes: null
          })
        }
        if (initialPayments.length) {
          const { error: payError } = await client
            .from('delivery_cost_payments')
            .insert(initialPayments)
          if (payError) throw payError
        }

        toast.add({ title: 'تم تسجيل التسليم', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: WarehouseDelivery) => {
    const ok = await askConfirm('حذف التسليم نهائياً؟')
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('warehouse_deliveries').delete().eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم الحذف', color: 'success' })
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  onMounted(load)

  return {
    loading,
    saving,
    search,
    modalOpen,
    editing,
    form,
    filtered,
    summary,
    activeSeason,
    supplierOptions,
    warehouseOptions,
    productOptions,
    deliveryMaxKgAllowed,
    onSupplierChange,
    onWarehouseChange,
    computedArdab,
    expandedDeliveryId,
    paymentModalOpen,
    paymentKind,
    paymentForm,
    paymentRemaining,
    paymentDelivery,
    nolonPaidOf,
    nathriyatPaidOf,
    nolonRestOf,
    nathriyatRestOf,
    paymentsOf,
    deliveryCostKindLabel,
    toggleExpand,
    openPay,
    savePayment,
    softDeletePayment,
    openCreate,
    openEdit,
    save,
    softDelete,
    setDecimalField: (field: DeliveryMoneyField, raw: string) => {
      form[field] = normalizeDecimalInput(raw)
      if (field === 'nolon_total') {
        nolonManualOverride.value = true
        return
      }
      if (field === 'quantity_kg' && !nolonManualOverride.value) {
        form.nolon_total = formatNolonAuto(parseDecimal(form.quantity_kg))
      }
    },
    nolonManualOverride,
    nolonRatePerTon: NOLON_RATE_PER_TON,
    setPaymentDecimal: (raw: string) => {
      paymentForm.amount = normalizeDecimalInput(raw)
    }
  }
}
