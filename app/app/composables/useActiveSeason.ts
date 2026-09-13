import type { Database } from '~/types/database.types'

export type ActiveSeason = {
  id: string
  name: string
  year: number
  ardab_factor: number
}

/** Shared active-season lookup for layout / header. */
export function useActiveSeason() {
  const client = useSupabaseClient<Database>()
  const season = useState<ActiveSeason | null>('active-season', () => null)
  const loading = useState('active-season-loading', () => false)
  const loaded = useState('active-season-loaded', () => false)

  const load = async (force = false) => {
    if (loaded.value && !force) return
    loading.value = true
    try {
      const { data, error } = await client
        .from('seasons')
        .select('id, name, year, ardab_factor')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      season.value = data
      loaded.value = true
    } catch {
      season.value = null
    } finally {
      loading.value = false
    }
  }

  const refresh = () => load(true)

  onMounted(() => {
    void load()
  })

  return { season, loading, load, refresh }
}
