import type { APIRequestContext, Page, Response } from '@playwright/test'

type Table =
  | 'suppliers'
  | 'warehouses'
  | 'warehouse_sections'
  | 'seasons'
  | 'purchases'
  | 'cash_transfers'
  | 'warehouse_deliveries'
  | 'stores'
  | 'meklas'
  | 'clients'
  | 'stock_movements'
  | 'products'
  | 'stock_statuses'

function supabaseConfig() {
  const url = process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.E2E_SUPABASE_URL
  const anonKey = process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.E2E_SUPABASE_ANON_KEY
  const serviceKey = process.env.E2E_SERVICE_ROLE_KEY
  if (!url || !anonKey) {
    throw new Error('Set NUXT_PUBLIC_SUPABASE_URL and NUXT_PUBLIC_SUPABASE_KEY (or E2E_* equivalents) for cleanup')
  }
  return { url: url.replace(/\/$/, ''), anonKey, serviceKey }
}

function tokenFromBearer(header?: string) {
  if (!header) return null
  const m = header.match(/^Bearer\s+(.+)$/i)
  return m?.[1]?.trim() || null
}

/** Prefer service role, then Authorization from the create request, then page session. */
export async function resolveAccessToken(opts: {
  page?: Page
  createResponse?: Response
}) {
  const { serviceKey } = supabaseConfig()
  if (serviceKey) return serviceKey

  const fromRequest = tokenFromBearer(opts.createResponse?.request().headers()['authorization'])
  if (fromRequest) return fromRequest

  if (opts.page) {
    const fromPage = await opts.page.evaluate(() => {
      const readJson = (raw: string | null) => {
        if (!raw) return null
        try {
          let text = raw
          if (text.startsWith('base64-')) {
            text = atob(text.slice(7))
          }
          return JSON.parse(decodeURIComponent(text))
        } catch {
          try {
            return JSON.parse(raw)
          } catch {
            return null
          }
        }
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key) continue
        const parsed = readJson(localStorage.getItem(key))
        const token = parsed?.access_token
          || parsed?.currentSession?.access_token
          || parsed?.session?.access_token
        if (token) return token as string
      }

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (!key) continue
        const parsed = readJson(sessionStorage.getItem(key))
        const token = parsed?.access_token
          || parsed?.currentSession?.access_token
          || parsed?.session?.access_token
        if (token) return token as string
      }

      return null
    })
    if (fromPage) return fromPage

    const cookies = await opts.page.context().cookies()
    for (const cookie of cookies) {
      if (!/auth-token|sb-/i.test(cookie.name)) continue
      try {
        let raw = decodeURIComponent(cookie.value)
        if (raw.startsWith('base64-')) {
          raw = Buffer.from(raw.slice(7), 'base64').toString('utf8')
        }
        const parsed = JSON.parse(raw)
        const token = parsed?.access_token
          || parsed?.currentSession?.access_token
          || parsed?.session?.access_token
        if (token) return token as string
      } catch {
        // ignore
      }
    }
  }

  throw new Error('Could not resolve Supabase access token for cleanup; set E2E_SERVICE_ROLE_KEY')
}

function headers(token: string, anonKey: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    Prefer: 'return=minimal'
  }
}

export function idFromInsertBody(body: unknown): string | null {
  if (Array.isArray(body) && body[0]?.id) return String(body[0].id)
  if (body && typeof body === 'object' && 'id' in body && (body as { id?: string }).id) {
    return String((body as { id: string }).id)
  }
  return null
}

/** Safe parse — PostgREST often returns empty body (Prefer: return=minimal). */
export async function idFromInsertResponse(response: Response): Promise<string | null> {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return idFromInsertBody(JSON.parse(text))
  } catch {
    return null
  }
}

export async function deleteById(
  request: APIRequestContext,
  table: Table,
  id: string,
  accessToken: string
) {
  const { url, anonKey } = supabaseConfig()
  const res = await request.delete(`${url}/rest/v1/${table}?id=eq.${id}`, {
    headers: headers(accessToken, anonKey)
  })
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`cleanup ${table}/${id} failed: ${res.status()} ${await res.text()}`)
  }
}

export async function deleteByFilter(
  request: APIRequestContext,
  table: Table,
  query: string,
  accessToken: string
) {
  const { url, anonKey } = supabaseConfig()
  const res = await request.delete(`${url}/rest/v1/${table}?${query}`, {
    headers: headers(accessToken, anonKey)
  })
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`cleanup ${table}?${query} failed: ${res.status()} ${await res.text()}`)
  }
}

export async function deleteByExactName(
  request: APIRequestContext,
  table: Table,
  name: string,
  accessToken: string
) {
  await deleteByFilter(request, table, `name=eq.${encodeURIComponent(name)}`, accessToken)
}

/** Delete by id when known, otherwise by exact name (or notes for purchases/transfers). */
export async function cleanupCreatedRow(
  request: APIRequestContext,
  table: Table,
  opts: {
    id?: string | null
    name?: string | null
    notes?: string | null
    page?: Page
    createResponse?: Response
  }
) {
  const accessToken = await resolveAccessToken({
    page: opts.page,
    createResponse: opts.createResponse
  })
  if (opts.id) {
    await deleteById(request, table, opts.id, accessToken)
    return
  }
  if (opts.notes && (table === 'purchases' || table === 'cash_transfers' || table === 'warehouse_deliveries')) {
    await deleteByFilter(request, table, `notes=eq.${encodeURIComponent(opts.notes)}`, accessToken)
    return
  }
  if (opts.name) {
    await deleteByExactName(request, table, opts.name, accessToken)
  }
}

/** Wipe leftover e2e rows (safe patterns only). Needs service role or a user token. */
export async function cleanupE2eLeftovers(request: APIRequestContext, accessToken: string) {
  await deleteByFilter(request, 'purchases', `notes=like.${encodeURIComponent('*purchase-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'purchases', `notes=like.${encodeURIComponent('*ledger-purchase-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'cash_transfers', `notes=like.${encodeURIComponent('*transfer-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'stock_movements', `notes=like.${encodeURIComponent('*e2e*')}`, accessToken)
  await deleteByFilter(request, 'warehouse_deliveries', `notes=like.${encodeURIComponent('*delivery-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'suppliers', `name=like.${encodeURIComponent('*مورد-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'suppliers', `name=like.${encodeURIComponent('*مورد-كشف-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'suppliers', `name=like.${encodeURIComponent('*00-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'warehouse_sections', `name=like.${encodeURIComponent('*ربع-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'warehouses', `name=like.${encodeURIComponent('*شونة-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'warehouses', `name=like.${encodeURIComponent('*شونة-كشف-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'warehouses', `name=like.${encodeURIComponent('*00-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'stores', `name=like.${encodeURIComponent('*مخزن-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'meklas', `name=like.${encodeURIComponent('*مقلى-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'clients', `name=like.${encodeURIComponent('*عميل-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'products', `name=like.${encodeURIComponent('*صنف-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'stock_statuses', `name=like.${encodeURIComponent('*حالة-e2e-*')}`, accessToken)
  await deleteByFilter(request, 'seasons', `name=like.${encodeURIComponent('*موسم اختبار*')}`, accessToken)
  await deleteByFilter(request, 'seasons', 'year=gte.2100', accessToken)
}
