import { useQueryClient } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { queryKeys } from '~/composables/queries/queryKeys'
import {
  useSeasonCostsQuery,
  type SeasonCost
} from '~/composables/queries/useSeasonCostsQuery'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type { SeasonCost }

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function useSeasonCosts() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { confirm: askConfirm } = useConfirmDialog()

  const saving = ref(false)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<SeasonCost | null>(null)
  const form = reactive({
    cost_date: todayIsoDate(),
    title: '',
    amount: '' as string,
    notes: ''
  })

  const {
    data: costsData,
    error: costsError,
    isLoading,
    isFetching,
    isPlaceholderData,
    seasonQuery,
    seasonId
  } = useSeasonCostsQuery()

  const costs = computed(() => costsData.value ?? [])
  const activeSeasonName = computed(() => seasonQuery.data.value?.name ?? null)

  const initialLoading = computed(() =>
    seasonQuery.isPending.value
    || (isLoading.value && !isPlaceholderData.value && !costsData.value)
  )

  const isRefreshing = computed(() =>
    !initialLoading.value && isFetching.value
  )

  watch(costsError, (err) => {
    if (!err) return
    toast.add({
      title: 'تعذر تحميل المصروفات',
      description: (err as Error).message,
      color: 'error'
    })
  })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return costs.value
    return costs.value.filter(c =>
      c.title.includes(q)
      || (c.notes || '').includes(q)
      || c.cost_date.includes(q)
    )
  })

  const totalAmount = computed(() =>
    filtered.value.reduce((sum, c) => sum + Number(c.amount), 0)
  )

  const hasActiveFilters = computed(() => search.value.trim().length > 0)

  const emptyMessage = computed(() => {
    if (!costs.value.length) return 'لا توجد مصروفات بعد'
    if (hasActiveFilters.value && !filtered.value.length) {
      return 'لا نتائج مطابقة للبحث'
    }
    return 'لا توجد مصروفات بعد'
  })

  const resetFilters = () => {
    search.value = ''
  }

  const invalidateCosts = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.seasonCosts(seasonId.value)
    })
  }

  const openCreate = () => {
    if (!seasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    editing.value = null
    form.cost_date = todayIsoDate()
    form.title = ''
    form.amount = ''
    form.notes = ''
    modalOpen.value = true
  }

  const openEdit = (row: SeasonCost) => {
    editing.value = row
    form.cost_date = row.cost_date
    form.title = row.title
    form.amount = String(row.amount)
    form.notes = row.notes || ''
    modalOpen.value = true
  }

  const save = async () => {
    if (!seasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    if (!form.cost_date) {
      toast.add({ title: 'التاريخ مطلوب', color: 'warning' })
      return
    }
    if (!form.title.trim()) {
      toast.add({ title: 'العنوان مطلوب', color: 'warning' })
      return
    }
    const amount = parseDecimal(form.amount)
    if (!(amount > 0)) {
      toast.add({ title: 'المبلغ يجب أن يكون أكبر من صفر', color: 'warning' })
      return
    }

    saving.value = true
    try {
      const payload = {
        season_id: seasonId.value,
        cost_date: form.cost_date,
        title: form.title.trim(),
        amount,
        notes: form.notes.trim() || null
      }
      if (editing.value) {
        const { error } = await client
          .from('season_costs')
          .update(payload)
          .eq('id', editing.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث المصروف', color: 'success' })
      } else {
        const { error } = await client.from('season_costs').insert(payload)
        if (error) throw error
        toast.add({ title: 'تم تسجيل المصروف', color: 'success' })
      }
      modalOpen.value = false
      await invalidateCosts()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: SeasonCost) => {
    const ok = await askConfirm(`حذف المصروف «${row.title}» نهائياً؟`)
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('season_costs').delete().eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم الحذف', color: 'success' })
      await invalidateCosts()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  return {
    initialLoading,
    isRefreshing,
    saving,
    search,
    hasActiveFilters,
    resetFilters,
    emptyMessage,
    modalOpen,
    editing,
    form,
    filtered,
    costs,
    totalAmount,
    activeSeasonName,
    openCreate,
    openEdit,
    save,
    softDelete,
    setAmount: (raw: string) => {
      form.amount = normalizeDecimalInput(raw)
    }
  }
}
