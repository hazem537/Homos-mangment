import type { Database, TransferKind } from '~/types/database.types'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type CashTransfer = Database['public']['Tables']['cash_transfers']['Row'] & {
  suppliers?: { id: string, name: string } | null
}

type SeasonLite = { id: string, name: string }
type SupplierLite = { id: string, name: string }

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export const transferKindOptions = [
  { label: 'تحويل', value: 'transfer' as TransferKind },
  { label: 'تسوية', value: 'settlement' as TransferKind },
  { label: 'عموله', value: 'commission' as TransferKind },
  { label: 'أخرى', value: 'other' as TransferKind }
]

export function transferKindLabel(kind: TransferKind | string) {
  return transferKindOptions.find(o => o.value === kind)?.label || kind
}

export function useCashTransfers() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const transfers = ref<CashTransfer[]>([])
  const suppliers = ref<SupplierLite[]>([])
  const activeSeason = ref<SeasonLite | null>(null)
  const purchasesTotal = ref(0)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<CashTransfer | null>(null)

  const form = reactive({
    supplier_id: '' as string,
    transfer_date: todayIsoDate(),
    amount: '' as string,
    kind: 'transfer' as TransferKind,
    notes: ''
  })

  const supplierDue = ref<number | null>(null)
  const loadingDue = ref(false)

  const supplierOptions = computed(() =>
    suppliers.value.map(s => ({ label: s.name, value: s.id }))
  )

  const loadSupplierDue = async (supplierId: string) => {
    if (!supplierId || !activeSeason.value) {
      supplierDue.value = null
      return
    }
    loadingDue.value = true
    try {
      const { data, error } = await client.rpc('supplier_due', {
        p_supplier_id: supplierId,
        p_season_id: activeSeason.value.id
      })
      if (error) throw error
      supplierDue.value = data?.[0] ? Number(data[0].balance) : 0
    } catch {
      supplierDue.value = null
    } finally {
      loadingDue.value = false
    }
  }

  watch(
    () => [modalOpen.value, form.supplier_id] as const,
    ([open, supplierId]) => {
      if (open && supplierId) {
        void loadSupplierDue(supplierId)
      } else if (!open) {
        supplierDue.value = null
      }
    }
  )

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return transfers.value
    return transfers.value.filter((t) => {
      const supplierName = t.suppliers?.name || ''
      return supplierName.includes(q)
        || (t.notes || '').includes(q)
        || transferKindLabel(t.kind).includes(q)
    })
  })

  const summary = computed(() => {
    const againstPurchase = transfers.value
      .filter(t => t.kind !== 'commission')
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const commissionTotal = transfers.value
      .filter(t => t.kind === 'commission')
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const totalTransfers = againstPurchase + commissionTotal
    const balance = Number((purchasesTotal.value - againstPurchase).toFixed(2))
    return {
      totalTransfers,
      commissionTotal,
      purchasesTotal: purchasesTotal.value,
      balance,
      count: transfers.value.length
    }
  })

  const loadLookups = async () => {
    const [seasonRes, suppliersRes] = await Promise.all([
      client.from('seasons').select('id, name').eq('is_active', true).maybeSingle(),
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
        transfers.value = []
        purchasesTotal.value = 0
        return
      }

      const [transfersRes, purchasesRes] = await Promise.all([
        client
          .from('cash_transfers')
          .select('*, suppliers(id, name)')
          .eq('season_id', activeSeason.value.id)
          .eq('is_cancelled', false)
          .order('transfer_date', { ascending: false })
          .order('created_at', { ascending: false }),
        client
          .from('purchases')
          .select('total_price')
          .eq('season_id', activeSeason.value.id)
          .eq('is_cancelled', false)
      ])
      if (transfersRes.error) throw transfersRes.error
      if (purchasesRes.error) throw purchasesRes.error

      transfers.value = (transfersRes.data ?? []) as CashTransfer[]
      purchasesTotal.value = (purchasesRes.data ?? []).reduce(
        (sum, p) => sum + Number(p.total_price),
        0
      )
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل التحويلات', description: e.message, color: 'error' })
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
      toast.add({ title: 'لا يوجد موردون', description: 'أضف مورداً قبل تسجيل تحويل', color: 'warning' })
      return
    }
    editing.value = null
    form.supplier_id = suppliers.value[0]?.id || ''
    form.transfer_date = todayIsoDate()
    form.amount = ''
    form.kind = 'transfer'
    form.notes = ''
    modalOpen.value = true
    void loadSupplierDue(form.supplier_id)
  }

  const openEdit = (row: CashTransfer) => {
    editing.value = row
    form.supplier_id = row.supplier_id
    form.transfer_date = row.transfer_date
    form.amount = String(row.amount)
    form.kind = row.kind
    form.notes = row.notes || ''
    modalOpen.value = true
    void loadSupplierDue(form.supplier_id)
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
    if (!form.transfer_date) {
      toast.add({ title: 'التاريخ مطلوب', color: 'warning' })
      return
    }
    const amount = parseDecimal(form.amount)
    if (!(amount > 0)) {
      toast.add({ title: 'المبلغ يجب أن يكون أكبر من صفر', color: 'warning' })
      return
    }
    if (form.kind === 'settlement' && !form.notes.trim()) {
      toast.add({ title: 'التسوية تتطلب ملاحظة', color: 'warning' })
      return
    }

    // تحويل: cannot exceed remaining purchase due for this supplier
    if (form.kind === 'transfer') {
      if (supplierDue.value == null) {
        await loadSupplierDue(form.supplier_id)
      }
      let maxAllowed = Number(supplierDue.value ?? 0)
      if (editing.value && editing.value.kind !== 'commission') {
        maxAllowed += Number(editing.value.amount)
      }
      maxAllowed = Number(maxAllowed.toFixed(2))
      if (amount > maxAllowed + 0.001) {
        toast.add({
          title: 'المبلغ أكبر من المستحق',
          description: `المتبقي المتاح: ${maxAllowed.toFixed(2)} جنيه`,
          color: 'warning'
        })
        return
      }
    }

    const payload = {
      season_id: activeSeason.value.id,
      supplier_id: form.supplier_id,
      transfer_date: form.transfer_date,
      amount,
      kind: form.kind,
      notes: form.notes.trim() || null
    }

    saving.value = true
    try {
      if (editing.value) {
        const { error } = await client.from('cash_transfers').update(payload).eq('id', editing.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث التحويل', color: 'success' })
      } else {
        const { error } = await client.from('cash_transfers').insert(payload)
        if (error) throw error
        toast.add({ title: 'تم تسجيل التحويل', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: CashTransfer) => {
    const ok = await askConfirm('حذف التحويل؟')
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('cash_transfers').update({ is_cancelled: true }).eq('id', row.id)
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
    supplierDue,
    loadingDue,
    transferKindOptions,
    openCreate,
    openEdit,
    save,
    softDelete,
    transferKindLabel,
    setDecimalField: (field: 'amount', raw: string) => {
      form[field] = normalizeDecimalInput(raw)
    }
  }
}
