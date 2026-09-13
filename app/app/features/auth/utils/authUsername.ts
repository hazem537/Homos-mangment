/** Fake domain used so Supabase Auth can store username as an email. */
export const AUTH_EMAIL_DOMAIN = 'homos.local'

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

/** Maps login username → auth email (e.g. admin → admin@homos.local). */
export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`
}
