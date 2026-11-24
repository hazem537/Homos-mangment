import { useQueryClient } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import { accountTypeLabel } from '~/utils/accountType'
import { queryKeys } from '~/composables/queries/queryKeys'
import {
  useSupplierBalancesQuery,
  type SupplierBalance
} from '~/composables/queries/useSupplierBalancesQuery'
import { useActiveProductsQuery } from '~/composables/queries/useLookupQueries'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export function useSuppliers() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { confirm: askConfirm } = useConfirmDialog()
  const { loadTypes, ensureDefaultTypeId } = useAccountTypes()
  const productsQuery = useActiveProductsQuery()

  const saving = ref(false)
  const search = ref('')
  const selectedProductId = ref('all')
  const selectedAccountTypeId = ref('all')
  const modalOpen = ref(false)
  const editing = ref<SupplierBalance | null>(null)

  const form = reactive({
    name: '',
    color: '#64748b' as string,
    account_type_id: '' as string,
    product_id: '' as string,
    ardab_factor: '170' as string
  })

  const normalizeProfileColor = (raw: string | null | undefined) => {
    const value = String(raw || '').trim()
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value.toUpperCase()
    return null
  }

  const setFormDecimal = (field: 'ardab_factor', raw: string) => {
    form[field] = normalizeDecimalInput(raw)
  }

  const formProductOptions = computed(() =>
    (productsQuery.data.value ?? []).map(p => ({
      label: p.name,
      value: p.id
    }))
  )

  const {
    data: balancesData,
    error: balancesError,
    isLoading,
    isFetching,
    isPlaceholderData,
    refetch,
    seasonQuery
  } = useSupplierBalancesQuery()

  const suppliers = computed(() => balancesData.value ?? [])
  const season = computed(() => seasonQuery.data.value ?? null)
  const activeSeasonName = computed(() => season.value?.name ?? null)

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
      title: 'تعذر تحميل الموردين',
      description: (err as Error).message,
      color: 'error'
    })
  })

  const productOptions = computed(() => {
    const map = new Map<string, string>()
    for (const s of suppliers.value) {
      if (s.product_id && s.product_name) map.set(s.product_id, s.product_name)
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
    for (const s of suppliers.value) {
      if (s.account_type_id && s.account_type_name) {
        map.set(s.account_type_id, s.account_type_name)
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
    let rows = suppliers.value
    if (selectedProductId.value && selectedProductId.value !== 'all') {
      rows = rows.filter(s => s.product_id === selectedProductId.value)
    }
    if (selectedAccountTypeId.value && selectedAccountTypeId.value !== 'all') {
      rows = rows.filter(s => s.account_type_id === selectedAccountTypeId.value)
    }
    const q = search.value.trim()
    if (!q) return rows
    return rows.filter(s =>
      s.supplier_name.includes(q)
      || (s.product_name || '').includes(q)
      || (s.account_type_name || '').includes(q)
    )
  })

  const hasActiveFilters = computed(() =>
    search.value.trim().length > 0
    || selectedProductId.value !== 'all'
    || selectedAccountTypeId.value !== 'all'
  )

  const emptyMessage = computed(() => {
    if (!suppliers.value.length) return 'لا يوجد موردون بعد'
    if (hasActiveFilters.value && !filtered.value.length) {
      return 'لا نتائج مطابقة للتصفية الحالية'
    }
    return 'لا يوجد موردون بعد'
  })

  const resetFilters = () => {
    search.value = ''
    selectedProductId.value = 'all'
    selectedAccountTypeId.value = 'all'
  }

  const invalidateSupplierQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['supplier-balances'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliersActive }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
    ])
  }

  const openCreate = async () => {
    editing.value = null
    form.name = ''
    form.color = '#64748b'
    form.product_id = ''
    form.ardab_factor = '170'
    await loadTypes()
    await productsQuery.refetch()
    form.account_type_id = ensureDefaultTypeId()
    form.product_id = formProductOptions.value[0]?.value || ''
    modalOpen.value = true
  }

  const openEdit = (row: SupplierBalance) => {
    editing.value = row
    form.name = row.supplier_name
    form.color = normalizeProfileColor(row.color) || '#64748b'
    form.account_type_id = row.account_type_id
    form.product_id = row.product_id || ''
    form.ardab_factor = String(Number(row.ardab_factor) || 170)
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
    if (!form.product_id) {
      toast.add({ title: 'اختر الصنف', color: 'warning' })
      return
    }
    const ardabFactor = parseDecimal(form.ardab_factor)
    if (!(ardabFactor > 0)) {
      toast.add({ title: 'معامل الأردب يجب أن يكون أكبر من صفر', color: 'warning' })
      return
    }
    saving.value = true
    try {
      const payload = {
        name: form.name.trim(),
        color: normalizeProfileColor(form.color),
        account_type_id: form.account_type_id,
        product_id: form.product_id,
        ardab_factor: ardabFactor,
        is_active: true
      }
      if (editing.value) {
        const { error } = await client.from('suppliers').update(payload).eq('id', editing.value.supplier_id)
        if (error) throw error
        toast.add({ title: 'تم تحديث ملف المورد', color: 'success' })
      } else {
        const { error } = await client.from('suppliers').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة ملف المورد', color: 'success' })
      }
      modalOpen.value = false
      await invalidateSupplierQueries()
    } catch (e: any) {
      const code = e?.code as string | undefined
      const msg = String(e?.message || '')
      const isDuplicateProfile =
        code === '23505'
        || msg.includes('suppliers_active_name_type_product_unique')
        || /duplicate key/i.test(msg)

      if (isDuplicateProfile) {
        const productLabel =
          formProductOptions.value.find(p => p.value === form.product_id)?.label
          || 'هذا الصنف'
        toast.add({
          title: 'ملف المورد موجود مسبقاً',
          description: `يوجد بالفعل مورد بنفس الاسم والنوع والصنف «${productLabel}». افتح الملف الحالي أو اختر صنفاً/نوعاً آخر.`,
          color: 'warning'
        })
      } else {
        toast.add({ title: 'فشل الحفظ', description: msg, color: 'error' })
      }
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: SupplierBalance) => {
    const ok = await askConfirm(
      `حذف ملف المورد «${row.supplier_name}» / «${row.product_name || '—'}» نهائياً؟\nسيتم حذف مشترياته وتحويلاته وتسليماته لهذا الصنف فقط.`
    )
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('suppliers').delete().eq('id', row.supplier_id)
      if (error) throw error
      toast.add({ title: 'تم حذف المورد', color: 'success' })
      await invalidateSupplierQueries()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  /** Inline cell save for Excel sheet (name only). */
  const saveInlineField = async (
    row: SupplierBalance,
    field: 'name',
    value: string
  ) => {
    const next = value.trim()
    if (field === 'name') {
      if (!next) {
        toast.add({ title: 'الاسم مطلوب', color: 'warning' })
        return false
      }
      if (next === row.supplier_name) return true
    }

    saving.value = true
    try {
      const { error } = await client
        .from('suppliers')
        .update({ name: next })
        .eq('id', row.supplier_id)
      if (error) throw error
      toast.add({
        title: 'تم تحديث الاسم',
        color: 'success'
      })
      await invalidateSupplierQueries()
      return true
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
      return false
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
    formProductOptions,
    accountTypeOptions,
    hasActiveFilters,
    resetFilters,
    emptyMessage,
    modalOpen,
    editing,
    form,
    filtered,
    suppliers,
    season,
    activeSeasonName,
    openCreate,
    openEdit,
    save,
    setFormDecimal,
    softDelete,
    saveInlineField,
    refetch
  }
}
