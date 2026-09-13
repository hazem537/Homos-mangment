import type { Database } from '~/types/database.types'

export type WarehouseBalance = Database['public']['Functions']['warehouse_balances']['Returns'][number]

export function useWarehouses() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const warehouses = ref<WarehouseBalance[]>([])
  const activeSeasonName = ref<string | null>(null)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<WarehouseBalance | null>(null)

  const form = reactive({
    name: '',
    notes: ''
  })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return warehouses.value
    return warehouses.value.filter(w =>
      w.warehouse_name.includes(q) || (w.notes || '').includes(q)
    )
  })

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, balancesRes] = await Promise.all([
        client.from('seasons').select('name').eq('is_active', true).maybeSingle(),
        client.rpc('warehouse_balances')
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

  const openCreate = () => {
    editing.value = null
    form.name = ''
    form.notes = ''
    modalOpen.value = true
  }

  const openEdit = (row: WarehouseBalance) => {
    editing.value = row
    form.name = row.warehouse_name
    form.notes = row.notes || ''
    modalOpen.value = true
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.add({ title: 'الاسم مطلوب', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const payload = {
        name: form.name.trim(),
        notes: form.notes.trim() || null,
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
    const ok = await askConfirm(`حذف الشونة «${row.warehouse_name}»؟`)
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('warehouses').update({ is_active: false }).eq('id', row.warehouse_id)
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
