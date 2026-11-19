import type { Database, Json } from '~/types/database.types'

export type WorkbookStyles = Record<string, unknown>

/**
 * Load / save per-user sheet layout + cell formatting prefs
 * (font, colors, bold/italic, alignment, column widths).
 * Never store business row data here — only presentation.
 */
export function useTablePrefs(tableKey: MaybeRefOrGetter<string>) {
  const client = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const styles = ref<WorkbookStyles | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const lastError = ref<string | null>(null)

  const resolvedKey = computed(() => String(toValue(tableKey) || '').trim())

  async function resolveUserId(): Promise<string | null> {
    const fromState = user.value?.id
    if (fromState) return fromState
    try {
      const { data } = await client.auth.getSession()
      return data.session?.user?.id ?? null
    } catch {
      return null
    }
  }

  const load = async () => {
    const key = resolvedKey.value
    const uid = await resolveUserId()
    if (!key || !uid) {
      styles.value = null
      return null
    }
    loading.value = true
    lastError.value = null
    try {
      const { data, error } = await client
        .from('table_view_prefs')
        .select('workbook_styles')
        .eq('user_id', uid)
        .eq('table_key', key)
        .maybeSingle()
      if (error) throw error
      const raw = data?.workbook_styles
      styles.value
        = raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as WorkbookStyles)
          : {}
      return styles.value
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError.value = msg
      console.warn('[useTablePrefs] load failed', e)
      styles.value = null
      return null
    } finally {
      loading.value = false
    }
  }

  const save = async (next: WorkbookStyles) => {
    const key = resolvedKey.value
    const uid = await resolveUserId()
    if (!key || !uid) {
      lastError.value = 'not signed in'
      console.warn('[useTablePrefs] save skipped: missing user or table key')
      return false
    }
    saving.value = true
    lastError.value = null
    try {
      // Strip Vue proxies so jsonb payload is plain JSON
      const plain = JSON.parse(JSON.stringify(next ?? {})) as WorkbookStyles
      const payload = {
        user_id: uid,
        table_key: key,
        workbook_styles: plain as Json,
        updated_at: new Date().toISOString()
      }
      const { error } = await client
        .from('table_view_prefs')
        .upsert(payload, { onConflict: 'user_id,table_key' })
      if (error) throw error
      styles.value = plain
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      lastError.value = msg
      console.warn('[useTablePrefs] save failed', e)
      return false
    } finally {
      saving.value = false
    }
  }

  watch(
    [() => user.value?.id, resolvedKey],
    () => {
      void load()
    },
    { immediate: true }
  )

  return {
    styles,
    loading,
    saving,
    lastError,
    load,
    save
  }
}
