import type { Database } from '~/types/database.types'

export type StockStatusRow = Database['public']['Tables']['stock_statuses']['Row']

export function useStockStatuses() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const statuses = ref<StockStatusRow[]>([])
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<StockStatusRow | null>(null)
  const form = reactive({ name: '', notes: '' })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return statuses.value
    return statuses.value.filter(s =>
      s.name.includes(q) || (s.notes || '').includes(q)
    )
  })

  const statusOptions = computed(() =>
    statuses.value.map(s => ({ label: s.name, value: s.id }))
  )

  const load = async () => {
    loading.value = true
    try {
      const { data, error } = await client
        .from('stock_statuses')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      statuses.value = data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الحالات', description: e.message, color: 'error' })
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

  const openEdit = (row: StockStatusRow) => {
    editing.value = row
    form.name = row.name
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
        const { error } = await client.from('stock_statuses').update(payload).eq('id', editing.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الحالة', color: 'success' })
      } else {
        const { error } = await client.from('stock_statuses').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة الحالة', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: StockStatusRow) => {
    const ok = await askConfirm(`حذف الحالة «${row.name}» نهائياً؟`)
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('stock_statuses').delete().eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم حذف الحالة', color: 'success' })
      await load()
    } catch (e: any) {
      const msg = String(e.message || '')
      toast.add({
        title: 'فشل الحذف',
        description: msg.includes('foreign key') || msg.includes('violates')
          ? 'لا يمكن الحذف لوجود تسليمات أو حركات مرتبطة'
          : msg,
        color: 'error'
      })
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
    statuses,
    statusOptions,
    openCreate,
    openEdit,
    save,
    softDelete,
    load
  }
}
