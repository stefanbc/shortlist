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

/** Loads the profile for the signed-in user and settles the store on every outcome:
 * no user, no/invalid profile row, or an inactive profile all resolve to 'signedOut'. */
async function syncProfile(userId: string | undefined): Promise<void> {
  if (!userId) {
    useSession.setState({ status: 'signedOut', profile: null })
    return
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle()

  const profile = !error && data ? toProfile(data) : null
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

supabase.auth.onAuthStateChange((_event, session) => {
  void syncProfile(session?.user.id)
})
