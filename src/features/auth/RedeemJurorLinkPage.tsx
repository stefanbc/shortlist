import type { ParseKeys } from 'i18next'
import { KeyRound, Link2Off, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { BrandMark } from '@/components/layout/BrandMark'
import { PreferencesMenu } from '@/components/layout/PreferencesMenu'
import { EmptyState } from '@/components/ui/EmptyState'
import { readFunctionsErrorCode } from '@/lib/functionsError'
import { supabase } from '@/lib/supabase'

const REDEEM_ERROR_CODES = ['invalid_token', 'inactive'] as const
type RedeemReason = (typeof REDEEM_ERROR_CODES)[number] | 'unknown'
type RedeemState = { kind: 'loading' } | { kind: 'error'; reason: RedeemReason }

const REASON_CONTENT: Record<
  RedeemReason,
  { icon: typeof Link2Off; titleKey: ParseKeys; bodyKey: ParseKeys }
> = {
  invalid_token: {
    icon: Link2Off,
    titleKey: 'auth.redeemInvalidTitle',
    bodyKey: 'auth.redeemInvalidBody',
  },
  inactive: {
    icon: UserX,
    titleKey: 'auth.redeemInactiveTitle',
    bodyKey: 'auth.redeemInactiveBody',
  },
  unknown: {
    icon: Link2Off,
    titleKey: 'auth.redeemErrorTitle',
    bodyKey: 'auth.redeemErrorBody',
  },
}

/** Opens a juror's personal link: redeems the token for a magic-link hash, exchanges it
 * for a session, then lands on /score. Unauthenticated by nature — anyone with the link
 * (or a stale/revoked one) can land here, so failures get friendly, non-technical copy. */
export function RedeemJurorLinkPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [state, setState] = useState<RedeemState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function redeem() {
      if (!token) {
        setState({ kind: 'error', reason: 'invalid_token' })
        return
      }

      const { data, error } = await supabase.functions.invoke<{ tokenHash: string }>(
        'juror-link',
        { body: { action: 'redeem', token } },
      )
      if (cancelled) return
      if (error) {
        setState({ kind: 'error', reason: await readFunctionsErrorCode(error, REDEEM_ERROR_CODES) })
        return
      }
      if (!data?.tokenHash) {
        setState({ kind: 'error', reason: 'unknown' })
        return
      }

      const { error: otpError } = await supabase.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: 'magiclink',
      })
      if (cancelled) return
      if (otpError) {
        setState({ kind: 'error', reason: 'unknown' })
        return
      }

      navigate('/score', { replace: true })
    }

    void redeem()
    return () => {
      cancelled = true
    }
  }, [token, navigate])

  const content =
    state.kind === 'loading'
      ? { icon: KeyRound, title: t('auth.redeemLink'), description: t('auth.redeemLoadingBody') }
      : {
          icon: REASON_CONTENT[state.reason].icon,
          title: t(REASON_CONTENT[state.reason].titleKey),
          description: t(REASON_CONTENT[state.reason].bodyKey),
        }

  return (
    <div className="relative grid min-h-svh place-items-center px-4 py-16">
      <PreferencesMenu className="absolute top-3 right-3" />
      <main className="w-full max-w-md">
        <BrandMark className="mb-8" />
        <EmptyState icon={content.icon} title={content.title} description={content.description} />
      </main>
    </div>
  )
}
