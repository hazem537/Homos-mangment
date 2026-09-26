import type { Database } from '~/types/database.types'

export type ProductRow = Database['public']['Tables']['products']['Row']
export type StockStatusRow = Database['public']['Tables']['stock_statuses']['Row']

export function useProductDetail(productId: MaybeRefOrGetter<string>) {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const product = ref<ProductRow | null>(null)
  const statuses = ref<StockStatusRow[]>([])
  const statusModalOpen = ref(false)
  const editingStatus = ref<StockStatusRow | null>(null)
  const statusForm = reactive({ name: '', notes: '' })
  const productEditOpen = ref(false)
  const productForm = reactive({ name: '', notes: '' })

  const load = async () => {
    const id = toValue(productId)
    if (!id) {
      loading.value = false
      return
    }
    loading.value = true
    try {
      const [productRes, statusesRes] = await Promise.all([
        client.from('products').select('*').eq('id', id).maybeSingle(),
        client
          .from('stock_statuses')
          .select('*')
          .eq('product_id', id)
          .eq('is_active', true)
          .order('name')
      ])
      if (productRes.error) throw productRes.error
      if (statusesRes.error) throw statusesRes.error
      product.value = productRes.data
      statuses.value = statusesRes.data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل الصنف', description: e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  const openProductEdit = () => {
    if (!product.value) return
    productForm.name = product.value.name
    productForm.notes = product.value.notes || ''
    productEditOpen.value = true
  }

  const saveProduct = async () => {
    const id = toValue(productId)
    if (!id || !productForm.name.trim()) {
      toast.add({ title: 'الاسم مطلوب', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const { error } = await client
        .from('products')
        .update({
          name: productForm.name.trim(),
          notes: productForm.notes.trim() || null
        })
        .eq('id', id)
      if (error) throw error
      toast.add({ title: 'تم تحديث الصنف', color: 'success' })
      productEditOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const openStatusCreate = () => {
    editingStatus.value = null
    statusForm.name = ''
    statusForm.notes = ''
    statusModalOpen.value = true
  }

  const openStatusEdit = (row: StockStatusRow) => {
    editingStatus.value = row
    statusForm.name = row.name
    statusForm.notes = row.notes || ''
    statusModalOpen.value = true
  }

  const saveStatus = async () => {
    const id = toValue(productId)
    if (!id || !statusForm.name.trim()) {
      toast.add({ title: 'اسم الحالة مطلوب', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const payload = {
        product_id: id,
        name: statusForm.name.trim(),
        notes: statusForm.notes.trim() || null,
        is_active: true
      }
      if (editingStatus.value) {
        const { error } = await client
          .from('stock_statuses')
          .update(payload)
          .eq('id', editingStatus.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الحالة', color: 'success' })
      } else {
        const { error } = await client.from('stock_statuses').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة الحالة', color: 'success' })
      }
      statusModalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const deleteStatus = async (row: StockStatusRow) => {
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

  watch(() => toValue(productId), () => load())
  onMounted(load)

  return {
    loading,
    saving,
    product,
    statuses,
    statusModalOpen,
    statusForm,
    productEditOpen,
    productForm,
    openProductEdit,
    saveProduct,
    openStatusCreate,
    openStatusEdit,
    saveStatus,
    deleteStatus
  }
}
