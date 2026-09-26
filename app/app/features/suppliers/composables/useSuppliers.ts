import type { Database } from '~/types/database.types'

export type SupplierBalance = Database['public']['Functions']['supplier_balances']['Returns'][number]

export function useSuppliers() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()
  const { loadTypes, ensureDefaultTypeId } = useAccountTypes()

  const loading = ref(true)
  const saving = ref(false)
  const suppliers = ref<SupplierBalance[]>([])
  const activeSeasonName = ref<string | null>(null)
  const search = ref('')
  const selectedProductId = ref('all')
  const modalOpen = ref(false)
  const editing = ref<SupplierBalance | null>(null)

  const form = reactive({
    name: '',
    notes: '',
    account_type_id: '' as string
  })

  const productOptions = computed(() => {
    const map = new Map<string, string>()
    for (const s of suppliers.value) {
      if (s.product_id && s.product_name) map.set(s.product_id, s.product_name)
    }
    return [
      { label: 'كل الأصناف', value: 'all' },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ar'))
        .map(([value, label]) => ({ label, value }))
    ]
  })

  const filtered = computed(() => {
    let rows = suppliers.value
    if (selectedProductId.value && selectedProductId.value !== 'all') {
      rows = rows.filter(s => s.product_id === selectedProductId.value)
    }
    const q = search.value.trim()
    if (!q) return rows
    return rows.filter(s =>
      s.supplier_name.includes(q)
      || (s.notes || '').includes(q)
      || (s.product_name || '').includes(q)
      || (s.account_type_name || '').includes(q)
    )
  })

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, balancesRes] = await Promise.all([
        client.from('seasons').select('name').eq('is_active', true).maybeSingle(),
        client.rpc('supplier_balances'),
        loadTypes()
      ])
      if (balancesRes.error) throw balancesRes.error
      activeSeasonName.value = seasonRes.data?.name ?? null
      suppliers.value = balancesRes.data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الموردين', description: e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  const openCreate = async () => {
    editing.value = null
    form.name = ''
    form.notes = ''
    await loadTypes()
    form.account_type_id = ensureDefaultTypeId()
    modalOpen.value = true
  }

  const openEdit = (row: SupplierBalance) => {
    editing.value = row
    form.name = row.supplier_name
    form.notes = row.notes || ''
    form.account_type_id = row.account_type_id
    modalOpen.value = true
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.add({ title: 'الاسم مطلوب', color: 'warning' })
      return
    }
    if (!form.account_type_id) {
      toast.add({ title: 'اختر نوع الحساب', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const payload = {
        name: form.name.trim(),
        notes: form.notes.trim() || null,
        account_type_id: form.account_type_id,
        is_active: true
      }
      if (editing.value) {
        const { error } = await client.from('suppliers').update(payload).eq('id', editing.value.supplier_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث المورد', color: 'success' })
      } else {
        const { error } = await client.from('suppliers').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة المورد', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: SupplierBalance) => {
    const ok = await askConfirm(
      `حذف المورد «${row.supplier_name}» نهائياً؟\nسيتم حذف مشترياته وتحويلاته وتسليماته.`
    )
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('suppliers').delete().eq('id', row.supplier_id)
      if (error) throw error
      toast.add({ title: 'تم حذف المورد', color: 'success' })
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
    selectedProductId,
    productOptions,
    modalOpen,
    form,
    filtered,
    activeSeasonName,
    openCreate,
    openEdit,
    save,
    softDelete
  }
}
