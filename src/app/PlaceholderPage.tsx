import type { ParseKeys } from 'i18next'
import { Hammer } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '@/components/layout/BrandMark'
import { Page, PageHeader } from '@/components/layout/Page'
import { PreferencesMenu } from '@/components/layout/PreferencesMenu'
import { EmptyState } from '@/components/ui/EmptyState'

type PlaceholderPageProps = {
  title: ParseKeys
  /** Render outside the app shell (sign-in, juror link): centered, with its own preferences control. */
  standalone?: boolean
}

/** Stand-in for screens that later tasks build. */
export function PlaceholderPage({ title, standalone = false }: PlaceholderPageProps) {
  const { t } = useTranslation()
  const body = (
    <EmptyState
      icon={Hammer}
      title={t('common.placeholderTitle')}
      description={t('common.placeholderBody')}
    />
  )

  if (standalone) {
    return (
      <div className="relative grid min-h-svh place-items-center px-4 py-16">
        <PreferencesMenu className="absolute top-3 right-3" />
        <main className="w-full max-w-md">
          <BrandMark className="mb-8" />
          <h1 className="mb-6 text-2xl font-bold">{t(title)}</h1>
          {body}
        </main>
      </div>
    )
  }

  return (
    <Page>
      <PageHeader title={t(title)} />
      {body}
    </Page>
  )
}
