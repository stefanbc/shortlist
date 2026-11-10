import { Compass, RotateCw, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '@/components/layout/BrandMark'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { EmptyState } from '@/components/ui/EmptyState'

function Frame({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <main className="grid min-h-svh place-items-center px-4 py-16">
      <div className="w-full max-w-md">
        <BrandMark className="mb-8" />
        <EmptyState icon={icon} title={title} description={description} action={action} />
      </div>
    </main>
  )
}

export function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <Frame
      icon={Compass}
      title={t('common.notFoundTitle')}
      description={t('common.notFoundBody')}
      action={
        <Link to="/" className={buttonClasses({ variant: 'secondary' })}>
          {t('common.goHome')}
        </Link>
      }
    />
  )
}

export function RouteErrorPage() {
  const { t } = useTranslation()
  return (
    <Frame
      icon={TriangleAlert}
      title={t('common.errorTitle')}
      description={t('common.errorBody')}
      action={
        <Button variant="secondary" onClick={() => window.location.reload()}>
          <RotateCw aria-hidden />
          {t('common.retry')}
        </Button>
      }
    />
  )
}
