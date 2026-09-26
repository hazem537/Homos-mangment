import type { Database } from '~/types/database.types'

export type MeklaBalance =
  Database['public']['Functions']['mekla_balances']['Returns'][number]

export function useMeklas() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const meklas = ref<MeklaBalance[]>([])
  const activeSeasonName = ref<string | null>(null)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<MeklaBalance | null>(null)
  const form = reactive({ name: '', notes: '' })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return meklas.value
    return meklas.value.filter(m =>
      m.mekla_name.includes(q)
      || (m.product_name || '').includes(q)
      || (m.status_name || '').includes(q)
      || (m.notes || '').includes(q)
    )
  })

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, balancesRes] = await Promise.all([
        client.from('seasons').select('name').eq('is_active', true).maybeSingle(),
        client.rpc('mekla_balances')
      ])
      if (balancesRes.error) throw balancesRes.error
      activeSeasonName.value = seasonRes.data?.name ?? null
      meklas.value = balancesRes.data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل المقالي', description: e.message, color: 'error' })
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

  const openEdit = (row: MeklaBalance) => {
    editing.value = row
    form.name = row.mekla_name
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
        const { error } = await client.from('meklas').update(payload).eq('id', editing.value.mekla_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث المقلى', color: 'success' })
      } else {
        const { error } = await client.from('meklas').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة المقلى', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: MeklaBalance) => {
    const kgTotal = meklas.value
      .filter(m => m.mekla_id === row.mekla_id)
      .reduce((sum, m) => sum + Number(m.kg_total), 0)
    if (Math.abs(kgTotal) > 0.001) {
      toast.add({
        title: 'لا يمكن حذف المقلى',
        description: 'الرصيد يجب أن يكون صفراً تقريباً',
        color: 'warning'
      })
      return
    }
    const ok = await askConfirm(`حذف المقلى «${row.mekla_name}» نهائياً؟`)
    if (!ok) return
    saving.value = true
    try {
      await client.from('stock_movements').delete().eq('from_kind', 'mekla').eq('from_id', row.mekla_id)
      await client.from('stock_movements').delete().eq('to_kind', 'mekla').eq('to_id', row.mekla_id)
      const { error } = await client.from('meklas').delete().eq('id', row.mekla_id)
      if (error) throw error
      toast.add({ title: 'تم حذف المقلى', color: 'success' })
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
