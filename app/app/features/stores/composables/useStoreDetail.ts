export function useStoreDetail(storeId: MaybeRefOrGetter<string>) {
  return useStockLocationDetail('store', storeId)
}
