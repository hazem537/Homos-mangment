import type { Database } from '~/types/database.types'

export type ProductRow = Database['public']['Tables']['products']['Row']

export function useProducts() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const products = ref<ProductRow[]>([])
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<ProductRow | null>(null)
  const form = reactive({ name: '', notes: '' })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return products.value
    return products.value.filter(p =>
      p.name.includes(q) || (p.notes || '').includes(q)
    )
  })

  const productOptions = computed(() =>
    products.value.map(p => ({ label: p.name, value: p.id }))
  )

  const load = async () => {
    loading.value = true
    try {
      const { data, error } = await client
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      products.value = data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الأصناف', description: e.message, color: 'error' })
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

  const openEdit = (row: ProductRow) => {
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
        const { error } = await client.from('products').update(payload).eq('id', editing.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الصنف', color: 'success' })
      } else {
        const { error } = await client.from('products').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة الصنف', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: ProductRow) => {
    const ok = await askConfirm(`حذف الصنف «${row.name}» نهائياً؟`)
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('products').delete().eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم حذف الصنف', color: 'success' })
      await load()
    } catch (e: any) {
      const msg = String(e.message || '')
      toast.add({
        title: 'فشل الحذف',
        description: msg.includes('foreign key') || msg.includes('violates')
          ? 'لا يمكن الحذف لوجود مشتريات أو تسليمات أو حركات مرتبطة'
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
    products,
    productOptions,
    openCreate,
    openEdit,
    save,
    softDelete,
    load
  }
}
