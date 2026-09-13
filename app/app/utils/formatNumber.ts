/** Display only — does not change stored/calculated values. Always 2 decimal places. */
export function formatNumber(n: number | null | undefined) {
  const v = nearZero(n) ? 0 : Number(n ?? 0)
  // Latin digits + comma decimals; widen thousand gaps (fr-FR uses a thin space)
  return v
    .toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    .replace(/[\u202F\u00A0]/g, '  ')
}

/** Money display with currency postfix. */
export function formatMoney(n: number | null | undefined) {
  return `${formatNumber(n)}\u00A0جنيه`
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
  const western = String(raw ?? '')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '')

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
