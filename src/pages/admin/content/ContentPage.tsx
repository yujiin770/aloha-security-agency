import { Outlet } from 'react-router-dom'
import { ExternalLink, Quote } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/components/ui/Card'
import { ButtonLink } from '@/components/ui/Button'

/**
 * Website Content hub.
 * 
 * This layout route now acts as a simple wrapper. The navigation tabs 
 * have been removed as they are now present in the Sidebar for better accessibility.
 */
export default function ContentPage() {
  return (
    <>
      <PageHeader
        title="Website Content"
        description="Manage the information, announcements, and photography shown on the public site."
        actions={
          <ButtonLink
            href="/"
            target="_blank"
            rel="noreferrer noopener"
            variant="secondary"
            rightIcon={<ExternalLink className="h-4 w-4" aria-hidden="true" />}
          >
            View site
          </ButtonLink>
        }
      />

      <Card className="mb-6 border-info/25 bg-info-soft">
        <div className="flex items-start gap-3">
          <Quote className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
          <p className="text-sm text-[var(--app-text-muted)]">
            Only <strong>published</strong> items appear on the public site.
            Unpublished rows aren't merely hidden — the database refuses to serve
            them to visitors at all, so a draft is genuinely private until you
            publish it.
          </p>
        </div>
      </Card>

      {/* 
          The sub-pages (Testimonials, Clients, etc.) 
          render here via the Outlet. 
      */}
      <Outlet />
    </>
  )
}