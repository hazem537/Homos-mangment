import type { Database } from '~/types/database.types'

export type WarehouseBalance = Database['public']['Functions']['warehouse_balances']['Returns'][number]

export function useWarehouses() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()
  const { loadTypes, ensureDefaultTypeId } = useAccountTypes()

  const loading = ref(true)
  const saving = ref(false)
  const warehouses = ref<WarehouseBalance[]>([])
  const activeSeasonName = ref<string | null>(null)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<WarehouseBalance | null>(null)

  const form = reactive({
    name: '',
    notes: '',
    account_type_id: '' as string
  })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return warehouses.value
    return warehouses.value.filter(w =>
      w.warehouse_name.includes(q)
      || (w.product_name || '').includes(q)
      || (w.status_name || '').includes(q)
      || (w.account_type_name || '').includes(q)
      || (w.notes || '').includes(q)
    )
  })

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, balancesRes] = await Promise.all([
        client.from('seasons').select('name').eq('is_active', true).maybeSingle(),
        client.rpc('warehouse_balances'),
        loadTypes()
      ])
      if (balancesRes.error) throw balancesRes.error
      activeSeasonName.value = seasonRes.data?.name ?? null
      warehouses.value = balancesRes.data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الشون', description: e.message, color: 'error' })
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

  const openEdit = (row: WarehouseBalance) => {
    editing.value = row
    form.name = row.warehouse_name
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
        const { error } = await client.from('warehouses').update(payload).eq('id', editing.value.warehouse_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الشونة', color: 'success' })
      } else {
        const { error } = await client.from('warehouses').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة الشونة', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: WarehouseBalance) => {
    const ok = await askConfirm(
      `حذف الشونة «${row.warehouse_name}» نهائياً؟\nسيتم حذف الأرباع والتسليمات المرتبطة.`
    )
    if (!ok) return
    saving.value = true
    try {
      const { data: sections, error: secErr } = await client
        .from('warehouse_sections')
        .select('id')
        .eq('warehouse_id', row.warehouse_id)
      if (secErr) throw secErr
      const sectionIds = (sections ?? []).map(s => s.id)
      if (sectionIds.length) {
        await client.from('stock_movements').delete().eq('from_kind', 'section').in('from_id', sectionIds)
        await client.from('stock_movements').delete().eq('to_kind', 'section').in('to_id', sectionIds)
      }
      const { error } = await client.from('warehouses').delete().eq('id', row.warehouse_id)
      if (error) throw error
      toast.add({ title: 'تم حذف الشونة', color: 'success' })
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
    form,
    filtered,
    activeSeasonName,
    openCreate,
    openEdit,
    save,
    softDelete
  }
}
