import type { Database } from '~/types/database.types'

export function useDashboardStats() {
  const client = useSupabaseClient<Database>()

  const loading = ref(true)
  const season = ref<{ id: string, name: string, year: number, ardab_factor: number } | null>(null)
  const suppliersCount = ref(0)
  const warehousesCount = ref(0)
  const purchasesCount = ref(0)
  const transfersCount = ref(0)
  const deliveriesCount = ref(0)

  const load = async () => {
    loading.value = true
    try {
      const [seasonRes, suppliersRes, warehousesRes] = await Promise.all([
        client.from('seasons').select('id, name, year, ardab_factor').eq('is_active', true).maybeSingle(),
        client.from('suppliers').select('id', { count: 'exact', head: true }).eq('is_active', true),
        client.from('warehouses').select('id', { count: 'exact', head: true }).eq('is_active', true)
      ])

      season.value = seasonRes.data
      suppliersCount.value = suppliersRes.count ?? 0
      warehousesCount.value = warehousesRes.count ?? 0

      if (seasonRes.data?.id) {
        const [purchasesRes, transfersRes, deliveriesRes] = await Promise.all([
          client
            .from('purchases')
            .select('id', { count: 'exact', head: true })
            .eq('season_id', seasonRes.data.id)
            .eq('is_cancelled', false),
          client
            .from('cash_transfers')
            .select('id', { count: 'exact', head: true })
            .eq('season_id', seasonRes.data.id)
            .eq('is_cancelled', false),
          client
            .from('warehouse_deliveries')
            .select('id', { count: 'exact', head: true })
            .eq('season_id', seasonRes.data.id)
            .eq('is_cancelled', false)
        ])
        purchasesCount.value = purchasesRes.count ?? 0
        transfersCount.value = transfersRes.count ?? 0
        deliveriesCount.value = deliveriesRes.count ?? 0
      } else {
        purchasesCount.value = 0
        transfersCount.value = 0
        deliveriesCount.value = 0
      }
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  return {
    loading,
    season,
    suppliersCount,
    warehousesCount,
    purchasesCount,
    transfersCount,
    deliveriesCount
  }
}
