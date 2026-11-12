import { useQuery } from '@tanstack/vue-query'
import type { Database } from '~/types/database.types'
import type { ActiveSeason } from '~/types/activeSeason'
import { queryKeys } from './queryKeys'

export type LookupProduct = { id: string, name: string }
export type LookupAccountType = { id: string, name: string }
export type LookupSupplier = {
  id: string
  name: string
  account_type_id: string
  product_id: string
  product_name: string
}

const LOOKUP_STALE_MS = 5 * 60_000

export function useActiveSeasonQuery() {
  const client = useSupabaseClient<Database>()

  return useQuery({
    queryKey: queryKeys.activeSeason,
    staleTime: LOOKUP_STALE_MS,
    queryFn: async (): Promise<ActiveSeason | null> => {
      const { data, error } = await client
        .from('seasons')
        .select('id, name, year, ardab_factor')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data
    }
  })
}

export function useActiveProductsQuery() {
  const client = useSupabaseClient<Database>()

  return useQuery({
    queryKey: queryKeys.productsActive,
    staleTime: LOOKUP_STALE_MS,
    queryFn: async (): Promise<LookupProduct[]> => {
      const { data, error } = await client
        .from('products')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data ?? []
    }
  })
}

export function useAccountTypesQuery() {
  const client = useSupabaseClient<Database>()

  return useQuery({
    queryKey: queryKeys.accountTypes,
    staleTime: LOOKUP_STALE_MS,
    queryFn: async (): Promise<LookupAccountType[]> => {
      const { data, error } = await client
        .from('account_types')
        .select('id, name')
        .order('name')
      if (error) throw error
      return data ?? []
    }
  })
}

export function useActiveSuppliersQuery() {
  const client = useSupabaseClient<Database>()

  return useQuery({
    queryKey: queryKeys.suppliersActive,
    staleTime: LOOKUP_STALE_MS,
    queryFn: async (): Promise<LookupSupplier[]> => {
      const { data, error } = await client
        .from('suppliers')
        .select('id, name, account_type_id, product_id, products(name)')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return (data ?? []).map((s) => {
        const productName =
          (s.products as { name?: string } | null)?.name || '—'
        return {
          id: s.id,
          name: s.name,
          account_type_id: s.account_type_id,
          product_id: s.product_id,
          product_name: productName
        }
      })
    }
  })
}
