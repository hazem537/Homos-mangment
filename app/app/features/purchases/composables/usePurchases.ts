import type { Database } from '~/types/database.types'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type Purchase = Database['public']['Tables']['purchases']['Row'] & {
  suppliers?: { id: string, name: string } | null
  seasons?: { id: string, name: string, ardab_factor: number } | null
}

type SeasonLite = { id: string, name: string, ardab_factor: number }
type SupplierLite = { id: string, name: string }

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function usePurchases() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { kgToArdab, totalPrice } = useArdab()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const purchases = ref<Purchase[]>([])
  const suppliers = ref<SupplierLite[]>([])
  const activeSeason = ref<SeasonLite | null>(null)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<Purchase | null>(null)

  const form = reactive({
    supplier_id: '' as string,
    purchase_date: todayIsoDate(),
    quantity_kg: '' as string,
    price_per_ardab: '' as string,
    notes: ''
  })

  const computedArdab = computed(() => {
    const factor = activeSeason.value?.ardab_factor ?? 170
    return kgToArdab(parseDecimal(form.quantity_kg), Number(factor))
  })

  const computedTotal = computed(() => {
    return totalPrice(computedArdab.value, parseDecimal(form.price_per_ardab))
  })

  const supplierOptions = computed(() =>
    suppliers.value.map(s => ({ label: s.name, value: s.id }))
  )

  const filtered = computed(() => {
    const rows = purchases.value
    const q = search.value.trim()
    if (!q) return rows
    return rows.filter((p) => {
      const supplierName = p.suppliers?.name || ''
      return supplierName.includes(q) || (p.notes || '').includes(q)
    })
  })

  const summary = computed(() => {
    const active = purchases.value
    const totalKg = active.reduce((sum, p) => sum + Number(p.quantity_kg), 0)
    const totalArdab = active.reduce((sum, p) => sum + Number(p.ardab), 0)
    const totalAmount = active.reduce((sum, p) => sum + Number(p.total_price), 0)
    const avgPrice = totalArdab > 0 ? Number((totalAmount / totalArdab).toFixed(4)) : 0
    const lastPrice = active[0] ? Number(active[0].price_per_ardab) : 0
    return { totalKg, totalArdab, totalAmount, avgPrice, lastPrice, count: active.length }
  })

  const loadLookups = async () => {
    const [seasonRes, suppliersRes] = await Promise.all([
      client.from('seasons').select('id, name, ardab_factor').eq('is_active', true).maybeSingle(),
      client.from('suppliers').select('id, name').eq('is_active', true).order('name')
    ])
    if (seasonRes.error) throw seasonRes.error
    if (suppliersRes.error) throw suppliersRes.error
    activeSeason.value = seasonRes.data
    suppliers.value = suppliersRes.data ?? []
  }

  const load = async () => {
    loading.value = true
    try {
      await loadLookups()
      if (!activeSeason.value) {
        purchases.value = []
        return
      }
      const { data, error } = await client
        .from('purchases')
        .select('*, suppliers(id, name), seasons(id, name, ardab_factor)')
        .eq('season_id', activeSeason.value.id)
        .eq('is_cancelled', false)
        .order('purchase_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      purchases.value = (data ?? []) as Purchase[]
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل المشتريات', description: e.message, color: 'error' })
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
      toast.add({ title: 'لا يوجد موردون', description: 'أضف مورداً قبل تسجيل شراء', color: 'warning' })
      return
    }
    editing.value = null
    form.supplier_id = suppliers.value[0]?.id || ''
    form.purchase_date = todayIsoDate()
    form.quantity_kg = ''
    form.price_per_ardab = ''
    form.notes = ''
    modalOpen.value = true
  }

  const openEdit = (row: Purchase) => {
    editing.value = row
    form.supplier_id = row.supplier_id
    form.purchase_date = row.purchase_date
    form.quantity_kg = String(row.quantity_kg)
    form.price_per_ardab = String(row.price_per_ardab)
    form.notes = row.notes || ''
    modalOpen.value = true
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
    if (!form.purchase_date) {
      toast.add({ title: 'التاريخ مطلوب', color: 'warning' })
      return
    }
    const quantityKg = parseDecimal(form.quantity_kg)
    const pricePerArdab = parseDecimal(form.price_per_ardab)
    if (!(quantityKg > 0)) {
      toast.add({ title: 'الكمية يجب أن تكون أكبر من صفر', color: 'warning' })
      return
    }
    if (!(pricePerArdab >= 0)) {
      toast.add({ title: 'سعر الأردب غير صالح', color: 'warning' })
      return
    }

    const payload = {
      season_id: activeSeason.value.id,
      supplier_id: form.supplier_id,
      purchase_date: form.purchase_date,
      quantity_kg: quantityKg,
      ardab: computedArdab.value,
      price_per_ardab: pricePerArdab,
      total_price: computedTotal.value,
      notes: form.notes.trim() || null
    }

    saving.value = true
    try {
      if (editing.value) {
        const { error } = await client.from('purchases').update(payload).eq('id', editing.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الشراء', color: 'success' })
      } else {
        const { error } = await client.from('purchases').insert(payload)
        if (error) throw error
        toast.add({ title: 'تم تسجيل الشراء', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: Purchase) => {
    const ok = await askConfirm('حذف عملية الشراء؟')
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('purchases').update({ is_cancelled: true }).eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم حذف الشراء', color: 'success' })
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
    computedArdab,
    computedTotal,
    openCreate,
    openEdit,
    save,
    softDelete,
    setDecimalField: (field: 'quantity_kg' | 'price_per_ardab', raw: string) => {
      form[field] = normalizeDecimalInput(raw)
    }
  }
}
