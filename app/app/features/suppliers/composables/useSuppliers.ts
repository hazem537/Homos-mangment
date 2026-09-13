import type { Database, SupplierAccountType } from '~/types/database.types'
import { supplierAccountTypeOptions } from '~/utils/supplierAccountType'

export type SupplierBalance = Database['public']['Functions']['supplier_balances']['Returns'][number]

export function useSuppliers() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const suppliers = ref<SupplierBalance[]>([])
  const activeSeasonName = ref<string | null>(null)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<SupplierBalance | null>(null)

  const form = reactive({
    name: '',
    notes: '',
    account_type: 'normal' as SupplierAccountType
  })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return suppliers.value
    return suppliers.value.filter(s =>
      s.supplier_name.includes(q) || (s.notes || '').includes(q)
    )
  })

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, balancesRes] = await Promise.all([
        client.from('seasons').select('name').eq('is_active', true).maybeSingle(),
        client.rpc('supplier_balances')
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

  const openCreate = () => {
    editing.value = null
    form.name = ''
    form.notes = ''
    form.account_type = 'normal'
    modalOpen.value = true
  }

  const openEdit = (row: SupplierBalance) => {
    editing.value = row
    form.name = row.supplier_name
    form.notes = row.notes || ''
    form.account_type = row.account_type || 'normal'
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
        account_type: form.account_type,
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
    const ok = await askConfirm(`حذف المورد «${row.supplier_name}»؟`)
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('suppliers').update({ is_active: false }).eq('id', row.supplier_id)
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
    modalOpen,
    form,
    filtered,
    activeSeasonName,
    supplierAccountTypeOptions,
    openCreate,
    openEdit,
    save,
    softDelete
  }
}
