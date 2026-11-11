import { create } from 'zustand'
import { PROFILE_COLUMNS, toProfile } from '@/domain/profiles'
import type { Id } from '@/domain/types'
import i18n from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface Profile {
  id: Id
  displayName: string
  email: string | null
  role: 'admin' | 'juror'
  active: boolean
}

type SessionStatus = 'loading' | 'signedOut' | 'signedIn'

type SessionState = {
  status: SessionStatus
  profile: Profile | null
  signOut(): Promise<void>
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  profile: null,
  signOut: async () => {
    await supabase.auth.signOut()
    set({ status: 'signedOut', profile: null })
  },
}))

type ProfileLookup =
  | { kind: 'found'; profile: Profile | null }
  | { kind: 'missing' }
  | { kind: 'unavailable' }

/** Fetches the user's profile row, telling a definite answer (the row, or no row) apart
 * from not getting an answer at all (offline, a timeout, a server error). */
async function lookUpProfile(userId: string): Promise<ProfileLookup> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', userId)
      .maybeSingle()
    if (error) return { kind: 'unavailable' }
    return data ? { kind: 'found', profile: toProfile(data) } : { kind: 'missing' }
  } catch {
    return { kind: 'unavailable' }
  }
}

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

// Each auth event starts a new sync "generation"; a lookup or scheduled retry from an
// older generation (superseded by a newer sign-in or a sign-out) is dropped.
let syncGeneration = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined

/** Settles the store for the signed-in user. Only a definite answer changes who is signed
 * in: no user, no profile row, an invalid row or an inactive profile all resolve to
 * 'signedOut'. When the lookup gets no answer (a phone waking up before its wifi is back,
 * where auth-js re-emits SIGNED_IN on visibility change) the current status and profile
 * are kept as they are and the lookup is retried with exponential backoff. */
async function syncProfile(userId: string | undefined, generation: number, attempt: number) {
  if (!userId) {
    useSession.setState({ status: 'signedOut', profile: null })
    return
  }

  const lookup = await lookUpProfile(userId)
  if (generation !== syncGeneration) return

  if (lookup.kind === 'unavailable') {
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS)
    retryTimer = setTimeout(() => runSync(userId, generation, attempt + 1), delay)
    return
  }

  const profile = lookup.kind === 'found' ? lookup.profile : null
  if (!profile) {
    useSession.setState({ status: 'signedOut', profile: null })
    return
  }

  if (!profile.active) {
    // A deactivated account is treated as signed out everywhere in the app.
    await supabase.auth.signOut()
    useSession.setState({ status: 'signedOut', profile: null })
    toast.error(i18n.t('auth.deactivated'))
    return
  }

  useSession.setState({ status: 'signedIn', profile })
}

function runSync(userId: string | undefined, generation: number, attempt: number) {
  // syncProfile handles every outcome it knows about itself; this only catches something
  // unexpected (e.g. signOut throwing) so the store never gets stuck at 'loading'.
  void syncProfile(userId, generation, attempt).catch(() => {
    if (generation === syncGeneration) useSession.setState({ status: 'signedOut', profile: null })
  })
}

supabase.auth.onAuthStateChange((_event, session) => {
  // A sign-in for a user the store doesn't already hold the profile for must not leave
  // `status` at whatever it last settled to (e.g. 'signedOut', from the no-session check
  // every fresh client does on load): a guarded route reading that stale value the instant
  // a caller navigates there (RedeemJurorLinkPage does, right after verifyOtp resolves)
  // would bounce to /login. Setting 'loading' synchronously here, before the profile
  // fetch starts, closes the window.
  const newUserId = session?.user.id
  if (newUserId && newUserId !== useSession.getState().profile?.id) {
    useSession.setState({ status: 'loading' })
  }
  syncGeneration += 1
  clearTimeout(retryTimer)
  runSync(newUserId, syncGeneration, 0)
})
