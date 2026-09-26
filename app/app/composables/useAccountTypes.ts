import type { Database } from '~/types/database.types'

export type AccountTypeRow = Database['public']['Tables']['account_types']['Row']

export function useAccountTypes() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()

  const types = ref<AccountTypeRow[]>([])
  const loading = ref(false)
  const saving = ref(false)

  const typeOptions = computed(() =>
    types.value.map(t => ({ label: t.name, value: t.id }))
  )

  const typeNameOf = (id: string | null | undefined) =>
    types.value.find(t => t.id === id)?.name || '—'

  const loadTypes = async () => {
    loading.value = true
    try {
      const { data, error } = await client
        .from('account_types')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      types.value = data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل أنواع الحساب', description: e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  const ensureDefaultTypeId = () => {
    if (!types.value.length) return ''
    const ordinary = types.value.find(t => t.name.trim() === 'عادي')
    return ordinary?.id || types.value[0]?.id || ''
  }

  const createType = async (name: string, notes?: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.add({ title: 'اسم النوع مطلوب', color: 'warning' })
      return null
    }
    saving.value = true
    try {
      const { data, error } = await client
        .from('account_types')
        .insert({
          name: trimmed,
          notes: notes?.trim() || null,
          is_active: true
        })
        .select('*')
        .single()
      if (error) throw error
      toast.add({ title: 'تمت إضافة النوع', color: 'success' })
      await loadTypes()
      return data.id as string
    } catch (e: any) {
      toast.add({ title: 'فشل إضافة النوع', description: e.message, color: 'error' })
      return null
    } finally {
      saving.value = false
    }
  }

  const renameType = async (id: string, name: string) => {
    const trimmed = name.trim()
    if (!id || !trimmed) {
      toast.add({ title: 'اسم النوع مطلوب', color: 'warning' })
      return false
    }
    saving.value = true
    try {
      const { error } = await client
        .from('account_types')
        .update({ name: trimmed })
        .eq('id', id)
      if (error) throw error
      toast.add({ title: 'تم تحديث اسم النوع', color: 'success' })
      await loadTypes()
      return true
    } catch (e: any) {
      toast.add({ title: 'فشل تعديل النوع', description: e.message, color: 'error' })
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    types,
    loading,
    saving,
    typeOptions,
    typeNameOf,
    loadTypes,
    ensureDefaultTypeId,
    createType,
    renameType
  }
}
