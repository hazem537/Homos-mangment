import type { SupplierAccountType } from '~/types/database.types'

export type { SupplierAccountType }

export const supplierAccountTypeOptions = [
  { label: 'عادي', value: 'normal' as SupplierAccountType },
  { label: 'استثمار', value: 'investment' as SupplierAccountType },
  { label: 'شركة', value: 'company' as SupplierAccountType }
]

export function supplierAccountTypeLabel(type: SupplierAccountType | string | null | undefined) {
  return supplierAccountTypeOptions.find(o => o.value === type)?.label || 'عادي'
}
