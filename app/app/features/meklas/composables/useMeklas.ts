import { useQueryClient } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from '~/composables/queries/queryKeys'
import {
  useMeklaBalancesQuery,
  type MeklaListRow
} from '~/composables/queries/useMeklaBalancesQuery'

export function useMeklas() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { confirm: askConfirm } = useConfirmDialog()

  const saving = ref(false)
  const search = ref('')
  const selectedProductId = ref('all')
  const selectedAccountTypeId = ref('all')
  const modalOpen = ref(false)
  const editing = ref<MeklaListRow | null>(null)
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
  } = useMeklaBalancesQuery()

  const meklas = computed(() => listRows.value)
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
      title: 'تعذر تحميل المقالي',
      description: (err as Error).message,
      color: 'error'
    })
  })

  const productOptions = computed(() => {
    const map = new Map<string, string>()
    for (const m of meklas.value) {
      if (m.product_id && m.product_name) map.set(m.product_id, m.product_name)
    }
    return [
      { label: 'كل الأصناف', value: 'all' },
      ...[...map.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], 'ar'))
        .map(([value, label]) => ({ label, value }))
    ]
  })

  /** Unused by UI (meklas have no account type); kept for SuppliersFilters v-model. */
  const accountTypeOptions = computed(() => [
    { label: 'كل الأنواع', value: 'all' }
  ])

  const filtered = computed(() => {
    let rows = meklas.value
    if (selectedProductId.value && selectedProductId.value !== 'all') {
      rows = rows.filter(m => m.product_id === selectedProductId.value)
    }
    const q = search.value.trim()
    if (!q) return rows
    return rows.filter(m =>
      m.mekla_name.includes(q)
      || (m.product_name || '').includes(q)
      || (m.notes || '').includes(q)
    )
  })

  const hasActiveFilters = computed(() =>
    search.value.trim().length > 0
    || selectedProductId.value !== 'all'
  )

  const emptyMessage = computed(() => {
    if (!meklas.value.length) return 'لا توجد مقالي بعد'
    if (hasActiveFilters.value && !filtered.value.length) {
      return 'لا نتائج مطابقة للتصفية الحالية'
    }
    return 'لا توجد مقالي بعد'
  })

  const resetFilters = () => {
    search.value = ''
    selectedProductId.value = 'all'
    selectedAccountTypeId.value = 'all'
  }

  const invalidateMeklaQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.meklaBalances(seasonQuery.data.value?.id)
      }),
      queryClient.invalidateQueries({ queryKey: ['stock-location-detail'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    ])
  }

  const openCreate = () => {
    editing.value = null
    form.name = ''
    form.notes = ''
    modalOpen.value = true
  }

  const openEdit = (row: MeklaListRow) => {
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
        const { error } = await client
          .from('meklas')
          .update(payload)
          .eq('id', editing.value.mekla_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث المقلى', color: 'success' })
      } else {
        const { error } = await client.from('meklas').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة المقلى', color: 'success' })
      }
      modalOpen.value = false
      await invalidateMeklaQueries()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: MeklaListRow) => {
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
      const { error: fromErr } = await client
        .from('stock_movements')
        .delete()
        .eq('from_kind', 'mekla')
        .eq('from_id', row.mekla_id)
      if (fromErr) throw fromErr
      const { error: toErr } = await client
        .from('stock_movements')
        .delete()
        .eq('to_kind', 'mekla')
        .eq('to_id', row.mekla_id)
      if (toErr) throw toErr
      const { error } = await client.from('meklas').delete().eq('id', row.mekla_id)
      if (error) throw error
      toast.add({ title: 'تم حذف المقلى', color: 'success' })
      await invalidateMeklaQueries()
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
    meklas,
    activeSeasonName,
    openCreate,
    openEdit,
    save,
    softDelete,
    refetch
  }
}
