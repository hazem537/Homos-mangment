import type { Database } from '~/types/database.types'

export type StoreBalance =
  Database['public']['Functions']['store_balances']['Returns'][number]

export function useStores() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const stores = ref<StoreBalance[]>([])
  const activeSeasonName = ref<string | null>(null)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<StoreBalance | null>(null)
  const form = reactive({ name: '', notes: '' })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return stores.value
    return stores.value.filter(s =>
      s.store_name.includes(q)
      || (s.product_name || '').includes(q)
      || (s.status_name || '').includes(q)
      || (s.notes || '').includes(q)
    )
  })

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, balancesRes] = await Promise.all([
        client.from('seasons').select('name').eq('is_active', true).maybeSingle(),
        client.rpc('store_balances')
      ])
      if (balancesRes.error) throw balancesRes.error
      activeSeasonName.value = seasonRes.data?.name ?? null
      stores.value = balancesRes.data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل المخازن', description: e.message, color: 'error' })
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

  const openEdit = (row: StoreBalance) => {
    editing.value = row
    form.name = row.store_name
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
        const { error } = await client.from('stores').update(payload).eq('id', editing.value.store_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث المخزن', color: 'success' })
      } else {
        const { error } = await client.from('stores').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة المخزن', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: StoreBalance) => {
    const kgTotal = stores.value
      .filter(s => s.store_id === row.store_id)
      .reduce((sum, s) => sum + Number(s.kg_total), 0)
    if (Math.abs(kgTotal) > 0.001) {
      toast.add({
        title: 'لا يمكن حذف المخزن',
        description: 'الرصيد يجب أن يكون صفراً تقريباً',
        color: 'warning'
      })
      return
    }
    const ok = await askConfirm(`حذف المخزن «${row.store_name}» نهائياً؟`)
    if (!ok) return
    saving.value = true
    try {
      await client.from('stock_movements').delete().eq('from_kind', 'store').eq('from_id', row.store_id)
      await client.from('stock_movements').delete().eq('to_kind', 'store').eq('to_id', row.store_id)
      const { error } = await client.from('stores').delete().eq('id', row.store_id)
      if (error) throw error
      toast.add({ title: 'تم حذف المخزن', color: 'success' })
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
