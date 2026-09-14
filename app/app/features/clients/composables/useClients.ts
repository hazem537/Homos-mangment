import type { Database, StockLocationKind } from '~/types/database.types'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'

export type ClientRow = Database['public']['Tables']['clients']['Row']

type FromKind = Extract<StockLocationKind, 'section' | 'store' | 'mekla'>

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function useClients() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { confirm: askConfirm } = useConfirmDialog()

  const loading = ref(true)
  const saving = ref(false)
  const clients = ref<ClientRow[]>([])
  const activeSeasonId = ref<string | null>(null)
  const activeSeasonName = ref<string | null>(null)
  const search = ref('')
  const modalOpen = ref(false)
  const editing = ref<ClientRow | null>(null)
  const form = reactive({ name: '', notes: '' })

  const issueModalOpen = ref(false)
  const issueClient = ref<ClientRow | null>(null)
  const sections = ref<{ id: string, name: string, warehouse_name: string }[]>([])
  const stores = ref<{ id: string, name: string }[]>([])
  const meklas = ref<{ id: string, name: string }[]>([])
  const issueForm = reactive({
    from_kind: 'section' as FromKind,
    from_id: '' as string,
    quantity_kg: '' as string,
    movement_date: todayIsoDate(),
    notes: ''
  })

  const filtered = computed(() => {
    const q = search.value.trim()
    if (!q) return clients.value
    return clients.value.filter(c =>
      c.name.includes(q) || (c.notes || '').includes(q)
    )
  })

  const issueFromOptions = computed(() => {
    if (issueForm.from_kind === 'section') {
      return sections.value.map(s => ({
        label: `${s.warehouse_name} — ${s.name}`,
        value: s.id
      }))
    }
    if (issueForm.from_kind === 'store') {
      return stores.value.map(s => ({ label: s.name, value: s.id }))
    }
    return meklas.value.map(m => ({ label: m.name, value: m.id }))
  })

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, clientsRes] = await Promise.all([
        client.from('seasons').select('id, name').eq('is_active', true).maybeSingle(),
        client.from('clients').select('*').eq('is_active', true).order('name')
      ])
      if (clientsRes.error) throw clientsRes.error
      activeSeasonId.value = seasonRes.data?.id ?? null
      activeSeasonName.value = seasonRes.data?.name ?? null
      clients.value = clientsRes.data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل العملاء', description: e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  const openCreate = () => {
    editing.value = null
    form.name = ''
    form.notes = ''
    modalOpen.value = true
  }

  const openEdit = (row: ClientRow) => {
    editing.value = row
    form.name = row.name
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
        const { error } = await client.from('clients').update(payload).eq('id', editing.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث العميل', color: 'success' })
      } else {
        const { error } = await client.from('clients').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة العميل', color: 'success' })
      }
      modalOpen.value = false
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const softDelete = async (row: ClientRow) => {
    const ok = await askConfirm(`حذف العميل «${row.name}»؟`)
    if (!ok) return
    saving.value = true
    try {
      const { error } = await client.from('clients').update({ is_active: false }).eq('id', row.id)
      if (error) throw error
      toast.add({ title: 'تم حذف العميل', color: 'success' })
      await load()
    } catch (e: any) {
      toast.add({ title: 'فشل الحذف', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  const loadIssueSources = async () => {
    const [secRes, storesRes, meklasRes] = await Promise.all([
      client
        .from('warehouse_sections')
        .select('id, name, warehouses(name)')
        .eq('is_active', true)
        .order('name'),
      client.from('stores').select('id, name').eq('is_active', true).order('name'),
      client.from('meklas').select('id, name').eq('is_active', true).order('name')
    ])
    if (secRes.error) throw secRes.error
    if (storesRes.error) throw storesRes.error
    if (meklasRes.error) throw meklasRes.error

    sections.value = (secRes.data ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      warehouse_name: s.warehouses?.name || '—'
    }))
    stores.value = storesRes.data ?? []
    meklas.value = meklasRes.data ?? []
  }

  const onIssueKindChange = () => {
    issueForm.from_id = issueFromOptions.value[0]?.value || ''
  }

  const openIssue = async (row: ClientRow) => {
    if (!activeSeasonId.value) {
      toast.add({ title: 'لا يوجد موسم نشط', color: 'warning' })
      return
    }
    try {
      await loadIssueSources()
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل المواقع', description: e.message, color: 'error' })
      return
    }
    if (!sections.value.length && !stores.value.length && !meklas.value.length) {
      toast.add({ title: 'لا توجد مواقع للصرف منها', color: 'warning' })
      return
    }
    issueClient.value = row
    issueForm.from_kind = sections.value.length
      ? 'section'
      : stores.value.length
        ? 'store'
        : 'mekla'
    issueForm.from_id = ''
    onIssueKindChange()
    issueForm.quantity_kg = ''
    issueForm.movement_date = todayIsoDate()
    issueForm.notes = ''
    issueModalOpen.value = true
  }

  const saveIssue = async () => {
    if (!activeSeasonId.value || !issueClient.value) return
    const qty = parseDecimal(issueForm.quantity_kg)
    if (!issueForm.from_id) {
      toast.add({ title: 'اختر المصدر', color: 'warning' })
      return
    }
    if (!(qty > 0)) {
      toast.add({ title: 'الكمية يجب أن تكون أكبر من صفر', color: 'warning' })
      return
    }

    const { data: remaining, error: remError } = await client.rpc('location_remaining_kg', {
      p_kind: issueForm.from_kind,
      p_id: issueForm.from_id,
      p_season_id: activeSeasonId.value
    })
    if (remError) {
      toast.add({ title: 'تعذر التحقق من الرصيد', description: remError.message, color: 'error' })
      return
    }
    if (qty > Number(remaining) + 0.001) {
      toast.add({
        title: 'الكمية أكبر من الرصيد',
        description: `المتاح: ${Number(remaining).toFixed(2)} كجم`,
        color: 'warning'
      })
      return
    }

    saving.value = true
    try {
      const { error } = await client.from('stock_movements').insert({
        season_id: activeSeasonId.value,
        movement_date: issueForm.movement_date,
        quantity_kg: qty,
        from_kind: issueForm.from_kind,
        from_id: issueForm.from_id,
        to_kind: 'client',
        to_id: issueClient.value.id,
        notes: issueForm.notes.trim() || null
      })
      if (error) throw error
      toast.add({ title: 'تم صرف الكمية للعميل', color: 'success' })
      issueModalOpen.value = false
    } catch (e: any) {
      toast.add({ title: 'فشل الصرف', description: e.message, color: 'error' })
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
    issueModalOpen,
    issueClient,
    issueForm,
    issueFromOptions,
    openCreate,
    openEdit,
    save,
    softDelete,
    openIssue,
    onIssueKindChange,
    saveIssue,
    setIssueQty: (raw: string) => {
      issueForm.quantity_kg = normalizeDecimalInput(raw)
    }
  }
}
