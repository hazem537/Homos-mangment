import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, StockLocationKind } from '~/types/database.types'

type Client = SupabaseClient<Database>

export type StockLocationDetailKind = Extract<StockLocationKind, 'store' | 'mekla'>

export type StoreSlotLite = {
  id: string
  name: string
  color: string | null
  store_id: string
}

export type LocationMovementLite = {
  id: string
  date: string
  created_at: string
  counterparty: string
  product_id: string | null
  product_name: string | null
  status_id: string | null
  status_name: string | null
  quantity_kg: number
  slot_id?: string | null
  slot_name?: string | null
  slot_color?: string | null
  /** delivery = warehouse_deliveries row; movement = stock_movements */
  source?: 'delivery' | 'movement'
  from_kind?: StockLocationKind | null
  from_id?: string | null
  to_kind?: StockLocationKind | null
  to_id?: string | null
  to_status_id?: string | null
}

export type StockLocationEntity = {
  id: string
  name: string
  notes: string | null
}

export type StockLocationDetailBundle = {
  entity: StockLocationEntity | null
  season: { id: string, name: string } | null
  products: { id: string, name: string }[]
  slots: StoreSlotLite[]
  incoming: LocationMovementLite[]
  outgoing: LocationMovementLite[]
  productOptions: { label: string, value: string }[]
}

function locationKindLabel(kind: StockLocationKind) {
  if (kind === 'store') return 'مخزن'
  if (kind === 'store_slot') return 'خانة'
  if (kind === 'mekla') return 'مقلى'
  if (kind === 'client') return 'عميل'
  if (kind === 'waste') return 'هدر'
  if (kind === 'sale') return 'بيع'
  return 'ربع'
}

async function resolveLocationName(
  client: Client,
  locKind: StockLocationKind,
  id: string
) {
  if (locKind === 'waste') return 'هدر'
  if (locKind === 'sale') return 'بيع'
  if (locKind === 'section') {
    const { data } = await client
      .from('warehouse_sections')
      .select('name, warehouses(name)')
      .eq('id', id)
      .maybeSingle()
    const row = data as { name?: string, warehouses?: { name?: string } | null } | null
    if (row?.name) {
      const wh = row.warehouses?.name
      return wh ? `شونة ${wh}: ${row.name}` : row.name
    }
    return 'ربع'
  }
  if (locKind === 'store_slot') {
    const { data } = await client
      .from('store_slots')
      .select('name, stores(name)')
      .eq('id', id)
      .maybeSingle()
    const row = data as { name?: string, stores?: { name?: string } | null } | null
    if (row?.name) {
      const storeName = row.stores?.name
      return storeName ? `مخزن ${storeName}: ${row.name}` : row.name
    }
    return 'خانة'
  }
  const table
    = locKind === 'store'
      ? 'stores'
      : locKind === 'mekla'
        ? 'meklas'
        : 'clients'
  const { data } = await client.from(table).select('name').eq('id', id).maybeSingle()
  const name = data?.name || '—'
  return `${locationKindLabel(locKind)}: ${name}`
}

async function resolveLocationNamesBatch(
  client: Client,
  pairs: Array<{ kind: StockLocationKind, id: string }>
) {
  const unique = new Map<string, { kind: StockLocationKind, id: string }>()
  for (const p of pairs) {
    unique.set(`${p.kind}:${p.id}`, p)
  }
  const entries = [...unique.entries()]
  const resolved = await Promise.all(
    entries.map(async ([key, p]) => [key, await resolveLocationName(client, p.kind, p.id)] as const)
  )
  return new Map(resolved)
}

export async function fetchStockLocationDetailBundle(
  client: Client,
  kind: StockLocationDetailKind,
  locationId: string,
  seasonId: string | null
): Promise<StockLocationDetailBundle> {
  const tableName = kind === 'store' ? 'stores' : 'meklas'

  if (!locationId) {
    return {
      entity: null,
      season: null,
      products: [],
      slots: [],
      incoming: [],
      outgoing: [],
      productOptions: []
    }
  }

  const [entityRes, productsRes, slotsRes] = await Promise.all([
    client.from(tableName).select('id, name, notes').eq('id', locationId).maybeSingle(),
    client.from('products').select('id, name').eq('is_active', true).order('name'),
    kind === 'store'
      ? client
          .from('store_slots')
          .select('id, name, color, store_id')
          .eq('store_id', locationId)
          .eq('is_active', true)
          .order('name')
      : Promise.resolve({ data: [], error: null })
  ])
  if (entityRes.error) throw entityRes.error
  if (productsRes.error) throw productsRes.error
  if (slotsRes.error) throw slotsRes.error

  const entity = entityRes.data
  const products = productsRes.data ?? []
  const slots = (slotsRes.data ?? []) as StoreSlotLite[]
  const slotIds = slots.map(s => s.id)
  const slotById = new Map(slots.map(s => [s.id, s]))

  if (!seasonId || !entity) {
    return {
      entity,
      season: null,
      products,
      slots,
      incoming: [],
      outgoing: [],
      productOptions: []
    }
  }

  const seasonRes = await client
    .from('seasons')
    .select('id, name')
    .eq('id', seasonId)
    .maybeSingle()
  if (seasonRes.error) throw seasonRes.error
  const season = seasonRes.data

  const movementSelect
    = '*, products(name), stock_statuses!stock_movements_status_id_fkey(name), to_stock_statuses:stock_statuses!stock_movements_to_status_id_fkey(name)'

  const movementKind = kind === 'store' ? 'store_slot' as const : kind
  const locationFilterIds = kind === 'store' ? slotIds : [locationId]

  const emptyMovements = { data: [] as never[], error: null }

  const [inRes, outRes, deliveriesRes] = await Promise.all([
    locationFilterIds.length
      ? client
          .from('stock_movements')
          .select(movementSelect)
          .eq('season_id', seasonId)
          .eq('to_kind', movementKind)
          .in('to_id', locationFilterIds)
          .eq('is_cancelled', false)
          .order('movement_date', { ascending: true })
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyMovements),
    locationFilterIds.length
      ? client
          .from('stock_movements')
          .select(movementSelect)
          .eq('season_id', seasonId)
          .eq('from_kind', movementKind)
          .in('from_id', locationFilterIds)
          .eq('is_cancelled', false)
          .order('movement_date', { ascending: true })
          .order('created_at', { ascending: true })
      : Promise.resolve(emptyMovements),
    kind === 'store'
      ? client
          .from('warehouse_deliveries')
          .select('id, product_id, status_id, store_slot_id, delivery_date, quantity_kg, created_at, products(name), stock_statuses(name), suppliers(name)')
          .eq('season_id', seasonId)
          .eq('destination_kind', 'store')
          .eq('store_id', locationId)
          .eq('is_cancelled', false)
          .order('delivery_date', { ascending: true })
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [], error: null })
  ])
  if (inRes.error) throw inRes.error
  if (outRes.error) throw outRes.error
  if (deliveriesRes.error) throw deliveriesRes.error

  type MovJoined = Database['public']['Tables']['stock_movements']['Row'] & {
    products?: { name?: string } | null
    stock_statuses?: { name?: string } | null
    to_stock_statuses?: { name?: string } | null
  }

  const inMovements = (inRes.data ?? []) as MovJoined[]
  const outMovements = (outRes.data ?? []) as MovJoined[]

  const namePairs: Array<{ kind: StockLocationKind, id: string }> = []
  for (const m of inMovements) {
    namePairs.push({ kind: m.from_kind, id: m.from_id })
  }
  for (const m of outMovements) {
    namePairs.push({ kind: m.to_kind, id: m.to_id })
  }
  const nameMap = await resolveLocationNamesBatch(client, namePairs)

  const incoming: LocationMovementLite[] = []

  for (const d of deliveriesRes.data ?? []) {
    const row = d as {
      id: string
      delivery_date: string
      created_at?: string | null
      product_id: string | null
      status_id: string | null
      store_slot_id?: string | null
      quantity_kg: number
      products?: { name?: string } | null
      stock_statuses?: { name?: string } | null
      suppliers?: { name?: string } | null
    }
    const slot = row.store_slot_id ? slotById.get(row.store_slot_id) : null
    incoming.push({
      id: row.id,
      date: row.delivery_date,
      created_at: row.created_at || row.delivery_date,
      counterparty: row.suppliers?.name
        ? `مورد: ${row.suppliers.name}`
        : 'تسليم مباشر',
      product_id: row.product_id,
      product_name: row.products?.name ?? null,
      status_id: row.status_id,
      status_name: row.stock_statuses?.name ?? null,
      quantity_kg: Number(row.quantity_kg),
      slot_id: slot?.id ?? row.store_slot_id ?? null,
      slot_name: slot?.name ?? null,
      slot_color: slot?.color ?? null,
      source: 'delivery'
    })
  }

  for (const m of inMovements) {
    const slot = kind === 'store' ? slotById.get(m.to_id) : null
    incoming.push({
      id: m.id,
      date: m.movement_date,
      created_at: m.created_at || m.movement_date,
      counterparty: nameMap.get(`${m.from_kind}:${m.from_id}`) || '—',
      product_id: m.product_id,
      product_name: m.products?.name ?? null,
      status_id: m.to_status_id,
      status_name: m.to_stock_statuses?.name ?? m.stock_statuses?.name ?? null,
      quantity_kg: Number(m.quantity_kg),
      slot_id: slot?.id ?? null,
      slot_name: slot?.name ?? null,
      slot_color: slot?.color ?? null,
      source: 'movement',
      from_kind: m.from_kind,
      from_id: m.from_id,
      to_kind: m.to_kind,
      to_id: m.to_id,
      to_status_id: m.to_status_id
    })
  }

  const outgoing: LocationMovementLite[] = outMovements.map((m) => {
    const slot = kind === 'store' ? slotById.get(m.from_id) : null
    return {
      id: m.id,
      date: m.movement_date,
      created_at: m.created_at || m.movement_date,
      counterparty: nameMap.get(`${m.to_kind}:${m.to_id}`) || '—',
      product_id: m.product_id,
      product_name: m.products?.name ?? null,
      status_id: m.status_id,
      status_name: m.stock_statuses?.name ?? null,
      quantity_kg: Number(m.quantity_kg),
      slot_id: slot?.id ?? null,
      slot_name: slot?.name ?? null,
      slot_color: slot?.color ?? null,
      source: 'movement' as const,
      from_kind: m.from_kind,
      from_id: m.from_id,
      to_kind: m.to_kind,
      to_id: m.to_id,
      to_status_id: m.to_status_id
    }
  })

  const productIds = new Set<string>()
  for (const row of [...incoming, ...outgoing]) {
    if (row.product_id) productIds.add(row.product_id)
  }
  const productOptions = products
    .filter(p => productIds.has(p.id))
    .map(p => ({ label: p.name, value: p.id }))
  for (const pid of productIds) {
    if (!productOptions.some(o => o.value === pid)) {
      const name
        = [...incoming, ...outgoing].find(r => r.product_id === pid)?.product_name
        || pid
      productOptions.push({ label: name, value: pid })
    }
  }

  return {
    entity,
    season,
    products,
    slots,
    incoming,
    outgoing,
    productOptions
  }
}
