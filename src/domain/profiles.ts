import type { Profile } from '@/stores/session'

/** Columns needed to build a `Profile` -- shared by the session store (the signed-in
 * user's own profile) and the users feature (the organizer's people list), so the two
 * never drift out of sync. */
export const PROFILE_COLUMNS = 'id, display_name, email, role, active'

export type ProfileDbRow = {
  id: string
  display_name: string
  email: string | null
  role: string
  active: boolean
}

/** Maps a `profiles` row (snake_case) to a `Profile`. Rows with an unrecognized role
 * (shouldn't happen -- `role` references the `roles` table) map to `null` rather than
 * being shown half-mapped. */
export function toProfile(row: ProfileDbRow): Profile | null {
  if (row.role !== 'admin' && row.role !== 'juror') return null
  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    active: row.active,
  }
}

/** Where a signed-in user of each role starts. */
export function roleHome(role: Profile['role']): '/admin' | '/score' {
  return role === 'admin' ? '/admin' : '/score'
}
