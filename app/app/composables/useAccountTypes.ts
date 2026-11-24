import { useQueryClient } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from '~/composables/queries/queryKeys'

export type AccountTypeRow = Database['public']['Tables']['account_types']['Row']

export function useAccountTypes() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const queryClient = useQueryClient()

  const types = ref<AccountTypeRow[]>([])
  const loading = ref(false)
  const saving = ref(false)

  const typeOptions = computed(() =>
    types.value.map(t => ({ label: t.name, value: t.id }))
  )

  const typeNameOf = (id: string | null | undefined) =>
    types.value.find(t => t.id === id)?.name || '—'

  const invalidateLookups = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.accountTypes }),
      queryClient.invalidateQueries({ queryKey: ['supplier-balances'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    ])
  }

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
      await invalidateLookups()
      return data.id as string
    } catch (e: any) {
      toast.add({ title: 'فشل إضافة النوع', description: e.message, color: 'error' })
      return null
    } finally {
      saving.value = false
    }
  }

  const renameType = async (id: string, name: string) => {
    return updateType(id, { name })
  }

  const updateType = async (
    id: string,
    patch: { name?: string, notes?: string | null }
  ) => {
    if (!id) return false
    const payload: { name?: string, notes?: string | null } = {}
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim()
      if (!trimmed) {
        toast.add({ title: 'اسم النوع مطلوب', color: 'warning' })
        return false
      }
      payload.name = trimmed
    }
    if (patch.notes !== undefined) {
      payload.notes = patch.notes?.trim() || null
    }
    if (!Object.keys(payload).length) return true

    saving.value = true
    try {
      const { error } = await client
        .from('account_types')
        .update(payload)
        .eq('id', id)
      if (error) throw error
      toast.add({ title: 'تم تحديث النوع', color: 'success' })
      await loadTypes()
      await invalidateLookups()
      return true
    } catch (e: any) {
      toast.add({ title: 'فشل تعديل النوع', description: e.message, color: 'error' })
      return false
    } finally {
      saving.value = false
    }
  }

  const deactivateType = async (id: string) => {
    if (!id) return false
    saving.value = true
    try {
      const { error } = await client
        .from('account_types')
        .update({ is_active: false })
        .eq('id', id)
      if (error) throw error
      toast.add({ title: 'تم إخفاء النوع', color: 'success' })
      await loadTypes()
      await invalidateLookups()
      return true
    } catch (e: any) {
      toast.add({
        title: 'فشل إخفاء النوع',
        description: e.message,
        color: 'error'
      })
      return false
    } finally {
      saving.value = false
    }
  }

  /** Hard-delete when unused; otherwise soft-hide so FK rows stay valid. */
  const deleteType = async (id: string) => {
    if (!id) return false
    saving.value = true
    try {
      const [{ count: supplierCount, error: sErr }, { count: warehouseCount, error: wErr }]
        = await Promise.all([
          client
            .from('suppliers')
            .select('id', { count: 'exact', head: true })
            .eq('account_type_id', id),
          client
            .from('warehouses')
            .select('id', { count: 'exact', head: true })
            .eq('account_type_id', id)
        ])
      if (sErr) throw sErr
      if (wErr) throw wErr

      const inUse = (supplierCount ?? 0) > 0 || (warehouseCount ?? 0) > 0
      if (inUse) {
        const { error } = await client
          .from('account_types')
          .update({ is_active: false })
          .eq('id', id)
        if (error) throw error
        toast.add({
          title: 'تم إخفاء النوع',
          description: 'مرتبط بمورد أو شونة — أُخفي من القوائم فقط',
          color: 'success'
        })
      } else {
        const { error } = await client
          .from('account_types')
          .delete()
          .eq('id', id)
        if (error) throw error
        toast.add({ title: 'تم حذف النوع', color: 'success' })
      }
      await loadTypes()
      await invalidateLookups()
      return true
    } catch (e: any) {
      toast.add({
        title: 'فشل حذف النوع',
        description: e.message,
        color: 'error'
      })
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
    renameType,
    updateType,
    deactivateType,
    deleteType
  }
}
