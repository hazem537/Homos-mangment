import type { ChartBar } from '~/utils/pieChart'
import type { DashboardMetrics } from './dashboardMetrics'

export const PLACE_COLORS: Record<string, string> = {
  purchased: '#2563eb',
  delivered: '#16a34a',
  remaining: '#ea580c',
  warehouse: '#ca8a04',
  mekla: '#db2777',
  store: '#0891b2',
  sold: '#7c3aed'
}

export function buildFlowBars(metrics: DashboardMetrics): ChartBar[] {
  return [
    {
      key: 'purchased',
      label: 'يجب أن يكون (مشتريات)',
      value: metrics.purchasedKg,
      color: PLACE_COLORS.purchased!,
      hint: 'إجمالي ما تم شراؤه من الموردين'
    },
    {
      key: 'remaining',
      label: 'مطلوب من المورد',
      value: metrics.remainingKg,
      color: PLACE_COLORS.remaining!,
      hint: 'مشتريات − مستلم (لم يُسلَّم بعد)'
    },
    {
      key: 'delivered',
      label: 'تم الاستلام',
      value: metrics.deliveredKg,
      color: PLACE_COLORS.delivered!,
      hint: 'ما وصل فعلياً (شونة أو مخزن)'
    },
    {
      key: 'warehouse',
      label: 'في الشون',
      value: metrics.warehouseKg,
      color: PLACE_COLORS.warehouse!,
      hint: 'رصيد الشون الحالي'
    },
    {
      key: 'store',
      label: 'في المخازن',
      value: metrics.storeKg,
      color: PLACE_COLORS.store!,
      hint: 'رصيد المخازن الحالي'
    },
    {
      key: 'mekla',
      label: 'في المقالي',
      value: metrics.meklaKg,
      color: PLACE_COLORS.mekla!,
      hint: 'رصيد المقالي الحالي'
    },
    {
      key: 'sold',
      label: 'مبيعات',
      value: metrics.soldKg,
      color: PLACE_COLORS.sold!,
      hint: 'كميات مسجّلة كبيع'
    }
  ]
}

export function buildPlaceBars(flowBars: ChartBar[]): ChartBar[] {
  return flowBars.filter(b =>
    ['remaining', 'warehouse', 'store', 'mekla', 'sold'].includes(b.key)
  )
}
