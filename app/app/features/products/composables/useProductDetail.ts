import type { Database } from '~/types/database.types'
import type { ProductRow } from './useProducts'
import type { StockStatusRow } from '~/features/stock-statuses/composables/useStockStatuses'

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
  const statusForm = reactive({ name: '', notes: '', is_default: false })
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
          .order('is_default', { ascending: false })
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
    statusForm.is_default = !statuses.value.some(s => s.is_default)
    statusModalOpen.value = true
  }

  const openStatusEdit = (row: StockStatusRow) => {
    editingStatus.value = row
    statusForm.name = row.name
    statusForm.notes = row.notes || ''
    statusForm.is_default = !!row.is_default
    statusModalOpen.value = true
  }

  const setDefaultExclusive = async (productId: string, statusId: string) => {
    const { error: clearError } = await client
      .from('stock_statuses')
      .update({ is_default: false })
      .eq('product_id', productId)
      .eq('is_default', true)
    if (clearError) throw clearError
    const { error: setError } = await client
      .from('stock_statuses')
      .update({ is_default: true })
      .eq('id', statusId)
    if (setError) throw setError
  }

  const saveStatus = async () => {
    const id = toValue(productId)
    if (!id || !statusForm.name.trim()) {
      toast.add({ title: 'اسم الحالة مطلوب', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const makeDefault = !!statusForm.is_default
      if (editingStatus.value) {
        const { error } = await client
          .from('stock_statuses')
          .update({
            product_id: id,
            name: statusForm.name.trim(),
            notes: statusForm.notes.trim() || null,
            is_active: true
          })
          .eq('id', editingStatus.value.id)
        if (error) throw error
        if (makeDefault && !editingStatus.value.is_default) {
          await setDefaultExclusive(id, editingStatus.value.id)
        } else if (!makeDefault && editingStatus.value.is_default) {
          toast.add({
            title: 'اختر حالة افتراضية أخرى أولاً',
            color: 'warning'
          })
          saving.value = false
          return
        }
        toast.add({ title: 'تم تحديث الحالة', color: 'success' })
      } else {
        const { data, error } = await client
          .from('stock_statuses')
          .insert({
            product_id: id,
            name: statusForm.name.trim(),
            notes: statusForm.notes.trim() || null,
            is_active: true,
            is_default: false
          })
          .select('id')
          .single()
        if (error) throw error
        if (makeDefault && data?.id) {
          await setDefaultExclusive(id, data.id)
        }
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

  const setAsDefault = async (row: StockStatusRow) => {
    const id = toValue(productId)
    if (!id || row.is_default) return
    saving.value = true
    try {
      await setDefaultExclusive(id, row.id)
      toast.add({ title: `الحالة الافتراضية: ${row.name}`, color: 'success' })
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل التعيين', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const deleteStatus = async (row: StockStatusRow) => {
    if (row.is_default) {
      toast.add({
        title: 'لا يمكن حذف الحالة الافتراضية',
        description: 'عيّن حالة أخرى كافتراضية أولاً',
        color: 'warning'
      })
      return
    }
    const ok = await askConfirm({
      title: 'تأكيد الحذف',
      description: `حذف الحالة «${row.name}»؟`,
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      confirmColor: 'error'
    })
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('stock_statuses').delete().eq('id', row.id)
      if (error) {
        // In use → soft-hide so lists stay clean without breaking history
        const msg = String(error.message || '')
        if (msg.includes('foreign key') || msg.includes('violates')) {
          const { error: softErr } = await client
            .from('stock_statuses')
            .update({ is_active: false })
            .eq('id', row.id)
          if (softErr) throw softErr
          toast.add({
            title: 'تم إخفاء الحالة',
            description: 'مرتبطة بتسليمات أو حركات — أُخفيت من القوائم فقط',
            color: 'success'
          })
          await load()
          return
        }
        throw error
      }
      toast.add({ title: 'تم حذف الحالة', color: 'success' })
      await load()
    } catch (e: any) {
      toast.add({
        title: 'فشل الحذف',
        description: e.message,
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
    editingStatus,
    productEditOpen,
    productForm,
    openProductEdit,
    saveProduct,
    openStatusCreate,
    openStatusEdit,
    saveStatus,
    setAsDefault,
    deleteStatus
  }
}
