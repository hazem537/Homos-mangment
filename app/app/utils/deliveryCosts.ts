import type { DeliveryCostKind } from '~/types/database.types'

/** Default nolon rate: EGP per metric ton (1000 kg) */
export const NOLON_RATE_PER_TON = 400

export type DeliveryCostPaymentLite = {
  id: string
  delivery_id: string
  kind: DeliveryCostKind
  amount: number
  payment_date: string
  notes: string | null
  is_cancelled: boolean
  created_at?: string
}

export function deliveryCostKindLabel(kind: DeliveryCostKind | string) {
  if (kind === 'nolon') return 'نولون'
  if (kind === 'nathriyat') return 'نثريات'
  return kind
}

/** Auto nolon from kg: (kg / 1000) × ratePerTon */
export function nolonFromKg(kg: number, ratePerTon = NOLON_RATE_PER_TON) {
  if (!(kg > 0)) return 0
  return Number(((kg / 1000) * ratePerTon).toFixed(2))
}

export function formatNolonAuto(kg: number, ratePerTon = NOLON_RATE_PER_TON) {
  const amount = nolonFromKg(kg, ratePerTon)
  return amount > 0 ? String(amount) : ''
}

export function isNolonMatchingAuto(
  kg: number,
  nolonTotal: number,
  ratePerTon = NOLON_RATE_PER_TON
) {
  return Math.abs(Number(nolonTotal || 0) - nolonFromKg(kg, ratePerTon)) <= 0.01
}

export function sumDeliveryCostPaid(
  payments: DeliveryCostPaymentLite[],
  deliveryId: string,
  kind: DeliveryCostKind
) {
  return payments
    .filter(p => p.delivery_id === deliveryId && p.kind === kind && !p.is_cancelled)
    .reduce((sum, p) => sum + Number(p.amount), 0)
}

export function deliveryCostRest(total: number | null | undefined, paid: number) {
  return Number((Number(total ?? 0) - paid).toFixed(2))
}

export function paymentsForDelivery(
  payments: DeliveryCostPaymentLite[],
  deliveryId: string
) {
  return payments
    .filter(p => p.delivery_id === deliveryId && !p.is_cancelled)
    .slice()
    .sort((a, b) => {
      if (a.payment_date !== b.payment_date) {
        return a.payment_date < b.payment_date ? 1 : -1
      }
      return String(b.created_at || '').localeCompare(String(a.created_at || ''))
    })
}
