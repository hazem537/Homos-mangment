export const queryKeys = {
  activeSeason: ['active-season'] as const,
  productsActive: ['products', 'active'] as const,
  accountTypes: ['account-types'] as const,
  suppliersActive: ['suppliers', 'active'] as const,
  supplierBalances: (seasonId: string | null | undefined) =>
    ['supplier-balances', seasonId || 'active'] as const,
  supplierDetail: (
    supplierId: string,
    productId: string,
    seasonId: string | null | undefined
  ) =>
    ['supplier-detail', supplierId, productId, seasonId || 'active'] as const,
  warehouseBalances: (seasonId: string | null | undefined) =>
    ['warehouse-balances', seasonId || 'active'] as const,
  warehouseDetail: (
    warehouseId: string,
    seasonId: string | null | undefined
  ) =>
    ['warehouse-detail', warehouseId, seasonId || 'active'] as const,
  storeBalances: (seasonId: string | null | undefined) =>
    ['store-balances', seasonId || 'active'] as const,
  meklaBalances: (seasonId: string | null | undefined) =>
    ['mekla-balances', seasonId || 'active'] as const,
  stockLocationDetail: (
    kind: 'store' | 'mekla',
    locationId: string,
    seasonId: string | null | undefined
  ) =>
    ['stock-location-detail', kind, locationId, seasonId || 'active'] as const,
  supplierStats: (
    seasonId: string,
    productId: string,
    accountTypeId: string
  ) =>
    ['supplier-stats', seasonId, productId, accountTypeId] as const,
  dashboardMetrics: (
    seasonId: string,
    productId: string,
    accountTypeId: string,
    supplierId: string
  ) =>
    ['dashboard-metrics', seasonId, productId, accountTypeId, supplierId] as const
}
