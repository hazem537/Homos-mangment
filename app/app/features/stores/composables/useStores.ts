import { useQueryClient } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from '~/composables/queries/queryKeys'
import {
  useStoreBalancesQuery,
  type StoreListRow
} from '~/composables/queries/useStoreBalancesQuery'

export type { StoreListRow }
export type StoreBalance = StoreListRow

export function useStores() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { confirm: askConfirm } = useConfirmDialog()

  const saving = ref(false)
  const search = ref('')
  const selectedProductId = ref('all')
  const selectedAccountTypeId = ref('all')
  const modalOpen = ref(false)
  const editing = ref<StoreListRow | null>(null)
  const form = reactive({ name: '', notes: '' })

  const {
    data: balancesData,
    listRows,
    error: balancesError,
    isLoading,
    isFetching,
    isPlaceholderData,
    refetch,
    seasonQuery
  } = useStoreBalancesQuery()

  const stores = computed(() => listRows.value)
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
      title: 'تعذر تحميل المخازن',
      description: (err as Error).message,
      color: 'error'
    })
  })

  const productOptions = computed(() => {
    const map = new Map<string, string>()
    for (const s of stores.value) {
      if (s.product_id && s.product_name) map.set(s.product_id, s.product_name)
    }
    return [
      { label: 'كل الأصناف', value: 'all' },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ar'))
        .map(([value, label]) => ({ label, value }))
    ]
  })

  /** Unused by UI (stores have no account type); kept for SuppliersFilters v-model. */
  const accountTypeOptions = computed(() => [
    { label: 'كل الأنواع', value: 'all' }
  ])

  const filtered = computed(() => {
    let rows = stores.value
    if (selectedProductId.value && selectedProductId.value !== 'all') {
      rows = rows.filter(s => s.product_id === selectedProductId.value)
    }
    const q = search.value.trim()
    if (!q) return rows
    return rows.filter(s =>
      s.store_name.includes(q)
      || (s.product_name || '').includes(q)
      || (s.notes || '').includes(q)
    )
  })

  const hasActiveFilters = computed(() =>
    search.value.trim().length > 0
    || selectedProductId.value !== 'all'
  )

  const emptyMessage = computed(() => {
    if (!stores.value.length) return 'لا توجد مخازن بعد'
    if (hasActiveFilters.value && !filtered.value.length) {
      return 'لا نتائج مطابقة للتصفية الحالية'
    }
    return 'لا توجد مخازن بعد'
  })

  const resetFilters = () => {
    search.value = ''
    selectedProductId.value = 'all'
    selectedAccountTypeId.value = 'all'
  }

  const invalidateStoreQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.storeBalances(seasonQuery.data.value?.id)
      }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    ])
  }

  const openCreate = () => {
    editing.value = null
    form.name = ''
    form.notes = ''
    modalOpen.value = true
  }

  const openEdit = (row: StoreListRow) => {
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
        const { error } = await client
          .from('stores')
          .update(payload)
          .eq('id', editing.value.store_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث المخزن', color: 'success' })
      } else {
        const { error } = await client.from('stores').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة المخزن', color: 'success' })
      }
      modalOpen.value = false
      await invalidateStoreQueries()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: StoreListRow) => {
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
      await invalidateStoreQueries()
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
    stores,
    activeSeasonName,
    openCreate,
    openEdit,
    save,
    softDelete,
    refetch
  }
}
