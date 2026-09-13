import { request as playwrightRequest } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanupE2eLeftovers } from './helpers/cleanup'

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile(resolve(process.cwd(), '.env'))
loadEnvFile(resolve(process.cwd(), '.env.e2e'))

async function globalTeardown() {
  const serviceKey = process.env.E2E_SERVICE_ROLE_KEY
  if (!serviceKey) {
    console.warn('[e2e] skip leftover cleanup — set E2E_SERVICE_ROLE_KEY for global teardown')
    return
  }
  const api = await playwrightRequest.newContext()
  try {
    await cleanupE2eLeftovers(api, serviceKey)
    console.log('[e2e] leftover test data cleaned')
  } finally {
    await api.dispose()
  }
}

export default globalTeardown
