import { useQueryClient } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { accountTypeLabel } from '~/utils/accountType'
import { queryKeys } from '~/composables/queries/queryKeys'
import {
  useWarehouseBalancesQuery,
  type WarehouseListRow
} from '~/composables/queries/useWarehouseBalancesQuery'

export type { WarehouseListRow }
export type WarehouseBalance = WarehouseListRow

export function useWarehouses() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { confirm: askConfirm } = useConfirmDialog()
  const { loadTypes, ensureDefaultTypeId } = useAccountTypes()

  const saving = ref(false)
  const search = ref('')
  const selectedProductId = ref('all')
  const selectedAccountTypeId = ref('all')
  const modalOpen = ref(false)
  const editing = ref<WarehouseListRow | null>(null)

  const form = reactive({
    name: '',
    notes: '',
    account_type_id: '' as string
  })

  const {
    data: balancesData,
    listRows,
    error: balancesError,
    isLoading,
    isFetching,
    isPlaceholderData,
    refetch,
    seasonQuery
  } = useWarehouseBalancesQuery()

  const warehouses = computed(() => listRows.value)
  const activeSeasonName = computed(() => seasonQuery.data.value?.name ?? null)

  const initialLoading = computed(() =>
    seasonQuery.isPending.value
    || (isLoading.value && !isPlaceholderData.value && !balancesData.value)
  )

  const isRefreshing = computed(() =>
    !initialLoading.value && isFetching.value
  )

  watch(balancesError, (err) => {
    if (!err) return
    toast.add({
      title: 'تعذر تحميل الشون',
      description: (err as Error).message,
      color: 'error'
    })
  })

  const productOptions = computed(() => {
    const map = new Map<string, string>()
    for (const w of warehouses.value) {
      if (w.product_id && w.product_name) map.set(w.product_id, w.product_name)
    }
    return [
      { label: 'كل الأصناف', value: 'all' },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ar'))
        .map(([value, label]) => ({ label, value }))
    ]
  })

  const accountTypeOptions = computed(() => {
    const map = new Map<string, string>()
    for (const w of warehouses.value) {
      if (w.account_type_id && w.account_type_name) {
        map.set(w.account_type_id, w.account_type_name)
      }
    }
    return [
      { label: 'كل الأنواع', value: 'all' },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ar'))
        .map(([value, label]) => ({
          label: accountTypeLabel(label),
          value
        }))
    ]
  })

  const filtered = computed(() => {
    let rows = warehouses.value
    if (selectedProductId.value && selectedProductId.value !== 'all') {
      rows = rows.filter(w => w.product_id === selectedProductId.value)
    }
    if (selectedAccountTypeId.value && selectedAccountTypeId.value !== 'all') {
      rows = rows.filter(w => w.account_type_id === selectedAccountTypeId.value)
    }
    const q = search.value.trim()
    if (!q) return rows
    return rows.filter(w =>
      w.warehouse_name.includes(q)
      || (w.product_name || '').includes(q)
      || (w.account_type_name || '').includes(q)
      || (w.notes || '').includes(q)
    )
  })

  const hasActiveFilters = computed(() =>
    search.value.trim().length > 0
    || selectedProductId.value !== 'all'
    || selectedAccountTypeId.value !== 'all'
  )

  const emptyMessage = computed(() => {
    if (!warehouses.value.length) return 'لا توجد شون بعد'
    if (hasActiveFilters.value && !filtered.value.length) {
      return 'لا نتائج مطابقة للتصفية الحالية'
    }
    return 'لا توجد شون بعد'
  })

  const resetFilters = () => {
    search.value = ''
    selectedProductId.value = 'all'
    selectedAccountTypeId.value = 'all'
  }

  const invalidateWarehouseQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.warehouseBalances(seasonQuery.data.value?.id)
      }),
      queryClient.invalidateQueries({ queryKey: ['warehouse-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    ])
  }

  const openCreate = async () => {
    editing.value = null
    form.name = ''
    form.notes = ''
    await loadTypes()
    form.account_type_id = ensureDefaultTypeId()
    modalOpen.value = true
  }

  const openEdit = (row: WarehouseListRow) => {
    editing.value = row
    form.name = row.warehouse_name
    form.notes = row.notes || ''
    form.account_type_id = row.account_type_id
    modalOpen.value = true
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.add({ title: 'الاسم مطلوب', color: 'warning' })
      return
    }
    if (!form.account_type_id) {
      toast.add({ title: 'اختر نوع الحساب', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const payload = {
        name: form.name.trim(),
        notes: form.notes.trim() || null,
        account_type_id: form.account_type_id,
        is_active: true
      }
      if (editing.value) {
        const { error } = await client
          .from('warehouses')
          .update(payload)
          .eq('id', editing.value.warehouse_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الشونة', color: 'success' })
      } else {
        const { error } = await client.from('warehouses').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة الشونة', color: 'success' })
      }
      modalOpen.value = false
      await invalidateWarehouseQueries()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: WarehouseListRow) => {
    const ok = await askConfirm(
      `حذف الشونة «${row.warehouse_name}» نهائياً؟\nسيتم حذف الأرباع والتسليمات المرتبطة.`
    )
    if (!ok) return
    saving.value = true
    try {
      const { data: sections, error: secErr } = await client
        .from('warehouse_sections')
        .select('id')
        .eq('warehouse_id', row.warehouse_id)
      if (secErr) throw secErr
      const sectionIds = (sections ?? []).map(s => s.id)
      if (sectionIds.length) {
        const { error: fromErr } = await client
          .from('stock_movements')
          .delete()
          .eq('from_kind', 'section')
          .in('from_id', sectionIds)
        if (fromErr) throw fromErr
        const { error: toErr } = await client
          .from('stock_movements')
          .delete()
          .eq('to_kind', 'section')
          .in('to_id', sectionIds)
        if (toErr) throw toErr
      }
      const { error } = await client.from('warehouses').delete().eq('id', row.warehouse_id)
      if (error) throw error
      toast.add({ title: 'تم حذف الشونة', color: 'success' })
      await invalidateWarehouseQueries()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  return {
    loading: initialLoading,
    initialLoading,
    isRefreshing,
    saving,
    search,
    selectedProductId,
    selectedAccountTypeId,
    productOptions,
    accountTypeOptions,
    hasActiveFilters,
    resetFilters,
    emptyMessage,
    modalOpen,
    editing,
    form,
    filtered,
    warehouses,
    activeSeasonName,
    openCreate,
    openEdit,
    save,
    softDelete,
    refetch
  }
}
