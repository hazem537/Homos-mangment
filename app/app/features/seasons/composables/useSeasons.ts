import type { Database } from '~/types/database.types'
import { normalizeDecimalInput, parseDecimal } from '~/utils/formatNumber'
import { useActiveSeason } from '~/composables/useActiveSeason'

export type Season = Database['public']['Tables']['seasons']['Row']

export function useSeasons() {
  const client = useSupabaseClient<Database>()
  const toast = useToast()
  const { refresh: refreshActiveSeason } = useActiveSeason()

  const loading = ref(true)
  const saving = ref(false)
  const seasons = ref<Season[]>([])
  const modalOpen = ref(false)
  const editing = ref<Season | null>(null)

  const form = reactive({
    name: '',
    year: String(new Date().getFullYear()),
    ardab_factor: '170',
    is_active: false
  })

  const setDecimalField = (field: 'year' | 'ardab_factor', raw: string) => {
    const cleaned = normalizeDecimalInput(raw)
    form[field] = field === 'year' ? cleaned.replace(/\./g, '') : cleaned
  }

  const load = async () => {
    loading.value = true
    try {
      const { data, error } = await client
        .from('seasons')
        .select('*')
        .order('year', { ascending: false })
      if (error) throw error
      seasons.value = data ?? []
    } catch (e: any) {
      toast.add({ title: 'تعذر تحميل المواسم', description: e.message, color: 'error' })
    } finally {
      loading.value = false
    }
  }

  const openCreate = () => {
    editing.value = null
    form.name = `موسم ${new Date().getFullYear()}`
    form.year = String(new Date().getFullYear())
    form.ardab_factor = '170'
    form.is_active = false
    modalOpen.value = true
  }

  const openEdit = (row: Season) => {
    editing.value = row
    form.name = row.name
    form.year = String(row.year)
    form.ardab_factor = String(row.ardab_factor)
    form.is_active = row.is_active
    modalOpen.value = true
  }

  const save = async () => {
    const year = Math.round(parseDecimal(form.year))
    const ardabFactor = parseDecimal(form.ardab_factor)
    if (!form.name.trim() || !year || ardabFactor <= 0) {
      toast.add({ title: 'أكمل البيانات بشكل صحيح', color: 'warning' })
      return
    }
    saving.value = true
    try {
      if (form.is_active) {
        await client.from('seasons').update({ is_active: false }).eq('is_active', true)
      }

      const payload = {
        name: form.name.trim(),
        year,
        ardab_factor: ardabFactor,
        is_active: form.is_active
      }

      if (editing.value) {
        const { error } = await client.from('seasons').update(payload).eq('id', editing.value.id)
        if (error) throw error
        toast.add({ title: 'تم تحديث الموسم', color: 'success' })
      } else {
        const { error } = await client.from('seasons').insert(payload)
        if (error) throw error
        toast.add({ title: 'تمت إضافة الموسم', color: 'success' })
      }
      modalOpen.value = false
      await load()
      await refreshActiveSeason()
    } catch (e: any) {
      toast.add({ title: 'فشل الحفظ', description: e.message, color: 'error' })
    } finally {
      saving.value = false
    }
  }

  onMounted(load)

  return {
    loading,
    saving,
    seasons,
    modalOpen,
    form,
    openCreate,
    openEdit,
    save,
    setDecimalField
  }
}
