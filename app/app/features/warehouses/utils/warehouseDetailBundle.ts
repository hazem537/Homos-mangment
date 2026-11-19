import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, StockLocationKind } from '~/types/database.types'

type Client = SupabaseClient<Database>

export type SectionBalance =
  Database['public']['Functions']['section_balances']['Returns'][number]

export type SectionIncomingRow = {
  id: string
  date: string
  created_at: string
  source: string
  quantity_kg: number
  qty_before: number
  qty_after: number
  status_name: string | null
  kind: 'delivery' | 'movement'
  product_id?: string
  status_id?: string | null
  from_kind?: StockLocationKind
  from_id?: string
  to_kind?: StockLocationKind
  to_id?: string
}

export type SectionOutgoingRow = {
  id: string
  date: string
  created_at: string
  destination: string
  status_name: string | null
  quantity_kg: number
  qty_before: number
  qty_after: number
  product_id: string
  status_id: string | null
  to_status_id?: string | null
  from_kind: StockLocationKind
  from_id: string
  to_kind: StockLocationKind
  to_id: string
}

export type SectionCard = SectionBalance & {
  incoming: SectionIncomingRow[]
  outgoing: SectionOutgoingRow[]
}

export type WarehouseSectionLite = {
  id: string
  name: string
  is_active: boolean
}

export type SeasonLite = { id: string, name: string }

export type WarehouseDeliveryLite = {
  id: string
  section_id: string
  product_id: string
  status_id: string | null
  delivery_date: string
  created_at: string | null
  quantity_kg: number
  supplier_name: string
}

export type WarehouseMovementOutLite = {
  id: string
  from_id: string
  product_id: string
  status_id: string | null
  to_status_id?: string | null
  movement_date: string
  created_at: string | null
  quantity_kg: number
  from_kind: StockLocationKind
  to_kind: StockLocationKind
  to_id: string
  status_name: string | null
  destination: string
}

export type WarehouseMovementInLite = {
  id: string
  to_id: string
  product_id: string
  status_id: string | null
  to_status_id?: string | null
  movement_date: string
  created_at: string | null
  quantity_kg: number
  from_kind: StockLocationKind
  from_id: string
  to_kind: StockLocationKind
  source: string
}

export type WarehouseRow = Database['public']['Tables']['warehouses']['Row']

export type WarehouseExpense = Database['public']['Tables']['warehouse_expenses']['Row']

export type WarehouseDetailBundle = {
  warehouse: WarehouseRow | null
  account_type_name: string | null
  season: SeasonLite | null
  sections: WarehouseSectionLite[]
  balances: SectionBalance[]
  deliveries: WarehouseDeliveryLite[]
  movements_out: WarehouseMovementOutLite[]
  movements_in: WarehouseMovementInLite[]
  expenses: WarehouseExpense[]
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function emptyBundle(): WarehouseDetailBundle {
  return {
    warehouse: null,
    account_type_name: null,
    season: null,
    sections: [],
    balances: [],
    deliveries: [],
    movements_out: [],
    movements_in: [],
    expenses: []
  }
}

export function sectionProductKey(
  sectionId: string,
  productId: string | null | undefined,
  statusId: string | null | undefined
) {
  return `${sectionId}:${productId || ''}:${statusId || ''}`
}

export function applySectionRunningBalances(
  incoming: Omit<SectionIncomingRow, 'qty_before' | 'qty_after'>[],
  outgoing: Omit<SectionOutgoingRow, 'qty_before' | 'qty_after'>[]
) {
  type Event = {
    key: string
    date: string
    created_at: string
    delta: number
  }

  const events: Event[] = [
    ...incoming.map(r => ({
      key: `in:${r.id}`,
      date: r.date,
      created_at: r.created_at,
      delta: Number(r.quantity_kg)
    })),
    ...outgoing.map(r => ({
      key: `out:${r.id}`,
      date: r.date,
      created_at: r.created_at,
      delta: -Number(r.quantity_kg)
    }))
  ]

  events.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.created_at.localeCompare(b.created_at)
  })

  const balanceByKey = new Map<string, { qty_before: number, qty_after: number }>()
  let balance = 0
  for (const event of events) {
    const qty_before = Number(balance.toFixed(4))
    const qty_after = Number((balance + event.delta).toFixed(4))
    balanceByKey.set(event.key, { qty_before, qty_after })
    balance = qty_after
  }

  const withBalance = <T extends { id: string }>(
    rows: T[],
    dir: 'in' | 'out'
  ): Array<T & { qty_before: number, qty_after: number }> =>
    rows.map((row) => {
      const bal = balanceByKey.get(`${dir}:${row.id}`) ?? { qty_before: 0, qty_after: 0 }
      return { ...row, ...bal }
    })

  return {
    incoming: withBalance(incoming, 'in') as SectionIncomingRow[],
    outgoing: withBalance(outgoing, 'out') as SectionOutgoingRow[]
  }
}

export function buildSectionCards(bundle: WarehouseDetailBundle): SectionCard[] {
  const balances = bundle.balances
  const pairKeys = balances.map(s =>
    sectionProductKey(s.section_id, s.product_id, s.status_id)
  )

  const incomingBySection = new Map<string, SectionIncomingRow[]>()
  const outgoingBySection = new Map<string, SectionOutgoingRow[]>()
  for (const key of pairKeys) {
    incomingBySection.set(key, [])
    outgoingBySection.set(key, [])
  }

  const statusNameByKey = new Map(
    balances.map(b => [
      sectionProductKey(b.section_id, b.product_id, b.status_id),
      b.status_name ?? null
    ])
  )

  for (const d of bundle.deliveries) {
    const key = sectionProductKey(d.section_id, d.product_id, d.status_id)
    const list = incomingBySection.get(key)
    if (!list) continue
    list.push({
      id: d.id,
      date: d.delivery_date,
      created_at: d.created_at || d.delivery_date,
      source: d.supplier_name || 'تسليم',
      quantity_kg: Number(d.quantity_kg),
      qty_before: 0,
      qty_after: 0,
      status_name: statusNameByKey.get(key) ?? null,
      kind: 'delivery',
      product_id: d.product_id,
      status_id: d.status_id
    })
  }

  for (const m of bundle.movements_out) {
    const list = outgoingBySection.get(
      sectionProductKey(m.from_id, m.product_id, m.status_id)
    )
    if (!list) continue
    list.push({
      id: m.id,
      date: m.movement_date,
      created_at: m.created_at || m.movement_date,
      destination: m.destination,
      status_name: m.status_name ?? null,
      quantity_kg: Number(m.quantity_kg),
      qty_before: 0,
      qty_after: 0,
      product_id: m.product_id,
      status_id: m.status_id,
      to_status_id: m.to_status_id ?? m.status_id,
      from_kind: m.from_kind,
      from_id: m.from_id,
      to_kind: m.to_kind,
      to_id: m.to_id
    })
  }

  for (const m of bundle.movements_in) {
    const key = sectionProductKey(m.to_id, m.product_id, m.status_id)
    const list = incomingBySection.get(key)
    if (!list) continue
    list.push({
      id: m.id,
      date: m.movement_date,
      created_at: m.created_at || m.movement_date,
      source: m.source,
      quantity_kg: Number(m.quantity_kg),
      qty_before: 0,
      qty_after: 0,
      status_name: statusNameByKey.get(key) ?? null,
      kind: 'movement',
      product_id: m.product_id,
      status_id: m.status_id,
      from_kind: m.from_kind,
      from_id: m.from_id,
      to_kind: m.to_kind,
      to_id: m.to_id
    })
  }

  for (const key of pairKeys) {
    const balanced = applySectionRunningBalances(
      incomingBySection.get(key) ?? [],
      outgoingBySection.get(key) ?? []
    )
    balanced.incoming.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.created_at.localeCompare(b.created_at)
    })
    balanced.outgoing.sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.created_at.localeCompare(b.created_at)
    })
    incomingBySection.set(key, balanced.incoming)
    outgoingBySection.set(key, balanced.outgoing)
  }

  return balances.map(b => ({
    ...b,
    incoming: incomingBySection.get(
      sectionProductKey(b.section_id, b.product_id, b.status_id)
    ) ?? [],
    outgoing: outgoingBySection.get(
      sectionProductKey(b.section_id, b.product_id, b.status_id)
    ) ?? []
  }))
}

export function mapWarehouseDetailBundle(raw: unknown): WarehouseDetailBundle {
  if (!raw || typeof raw !== 'object') return emptyBundle()
  const data = raw as Record<string, unknown>
  if (typeof data.error === 'string') throw new Error(data.error)

  const seasonRaw = data.season
  let season: SeasonLite | null = null
  if (seasonRaw && typeof seasonRaw === 'object') {
    const s = seasonRaw as Record<string, unknown>
    if (typeof s.id === 'string') {
      season = { id: s.id, name: typeof s.name === 'string' ? s.name : '' }
    }
  }

  return {
    warehouse: (data.warehouse as WarehouseRow | null) ?? null,
    account_type_name:
      typeof data.account_type_name === 'string' ? data.account_type_name : null,
    season,
    sections: asArray<WarehouseSectionLite>(data.sections),
    balances: asArray<SectionBalance>(data.balances),
    deliveries: asArray<WarehouseDeliveryLite>(data.deliveries),
    movements_out: asArray<WarehouseMovementOutLite>(data.movements_out),
    movements_in: asArray<WarehouseMovementInLite>(data.movements_in),
    expenses: asArray<WarehouseExpense>(data.expenses)
  }
}

export async function fetchWarehouseDetailBundle(
  client: Client,
  warehouseId: string,
  seasonId?: string | null
): Promise<WarehouseDetailBundle> {
  if (!warehouseId) return emptyBundle()

  const { data, error } = await client.rpc('warehouse_detail_bundle', {
    p_warehouse_id: warehouseId,
    p_season_id: seasonId ?? null
  })
  if (error) throw error
  return mapWarehouseDetailBundle(data)
}
