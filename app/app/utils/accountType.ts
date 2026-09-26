/** Display helpers for account type names from DB */

export function accountTypeLabel(name: string | null | undefined) {
  return name?.trim() || '—'
}

export function withAccountType(
  entityName: string | null | undefined,
  typeName: string | null | undefined
) {
  const name = entityName?.trim() || '—'
  const type = typeName?.trim()
  return type ? `${name} — ${type}` : name
}
