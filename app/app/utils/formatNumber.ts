/** LTR isolate — keeps digits from flipping inside RTL sheets/UI. */
const LRI = '\u2066'
const PDI = '\u2069'

function ltr(text: string) {
  return `${LRI}${text}${PDI}`
}

/** Display only — does not change stored/calculated values. Always 2 decimal places. */
export function formatNumber(n: number | null | undefined) {
  const v = nearZero(n) ? 0 : Number(n ?? 0)
  // Spreadsheet-style: 10,080.00 (avoids RTL flipping of fr-FR "10  080,00")
  const body = v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return ltr(body)
}

/** Money display with currency postfix (number LTR, currency readable in RTL). */
export function formatMoney(n: number | null | undefined) {
  const v = nearZero(n) ? 0 : Number(n ?? 0)
  const body = v.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return ltr(`${body}\u00A0جنيه`)
}

/**
 * Compact display for large amounts (ألف / مليون / مليار) to avoid UI overflow.
 * Below 1 000 keeps full formatNumber precision.
 */
export function formatCompactNumber(n: number | null | undefined) {
  const v = nearZero(n) ? 0 : Number(n ?? 0)
  const abs = Math.abs(v)
  if (abs < 1000) return formatNumber(v)

  const neg = v < 0 ? '-' : ''
  let divisor = 1000
  let label = 'ألف'
  if (abs >= 1_000_000_000) {
    divisor = 1_000_000_000
    label = 'مليار'
  } else if (abs >= 1_000_000) {
    divisor = 1_000_000
    label = 'مليون'
  }

  const scaled = abs / divisor
  const digits = scaled >= 100 ? 1 : 2
  const body = scaled.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })

  return ltr(`${neg}${body} ${label}`)
}

/** Compact money; full value available via formatMoney for tooltips. */
export function formatCompactMoney(n: number | null | undefined) {
  const v = nearZero(n) ? 0 : Number(n ?? 0)
  if (Math.abs(v) < 1000) return formatMoney(v)
  const compact = formatCompactNumber(v).replaceAll(LRI, '').replaceAll(PDI, '')
  return ltr(`${compact}\u00A0جنيه`)
}

/** Treat tiny float leftovers as zero (display / badge). */
export function nearZero(n: number | null | undefined, eps = 0.005) {
  return Math.abs(Number(n ?? 0)) < eps
}

/** Positive → warning, negative → error, ~0 → success */
export function signedTone(n: number | null | undefined): 'warning' | 'error' | 'success' {
  const v = Number(n ?? 0)
  if (nearZero(v)) return 'success'
  if (v > 0) return 'warning'
  return 'error'
}

/** Accept `.` (and `,`) while typing; map Arabic digits to Western. */
export function normalizeDecimalInput(raw: string): string {
  let western = String(raw ?? '')
    .replace(/[\u2066\u2067\u2068\u2069\u200E\u200F]/g, '')
    .replace(/جنيه/gi, '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .trim()

  const hasDot = western.includes('.')
  const hasComma = western.includes(',')
  if (hasDot && hasComma) {
    // 10,080.00 → thousand commas
    western = western.replace(/,/g, '')
  } else if (hasComma && !hasDot) {
    // 10080,00 → decimal comma (legacy fr-FR style)
    western = western.replace(/,/g, '.')
  }

  western = western.replace(/[^\d.]/g, '')

  const firstDot = western.indexOf('.')
  if (firstDot === -1) return western
  return western.slice(0, firstDot + 1) + western.slice(firstDot + 1).replace(/\./g, '')
}

export function parseDecimal(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  const cleaned = normalizeDecimalInput(String(raw ?? ''))
  if (!cleaned || cleaned === '.') return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
