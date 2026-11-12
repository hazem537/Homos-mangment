import type { ActiveSeason } from '~/types/activeSeason'
import { useActiveSeasonQuery } from '~/composables/queries/useLookupQueries'

export type { ActiveSeason }

/** Shared active-season lookup for layout / header (backed by Vue Query cache). */
export function useActiveSeason() {
  const query = useActiveSeasonQuery()

  const season = computed(() => query.data.value ?? null)
  const loading = computed(() => query.isPending.value)

  const load = async (force = false) => {
    if (force) {
      await query.refetch()
      return
    }
    if (query.dataUpdatedAt.value) return
    await query.refetch()
  }

  const refresh = () => load(true)

  return { season, loading, load, refresh }
}
