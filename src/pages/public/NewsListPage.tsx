import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, Newspaper } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Feedback'
import {
  RevealGroup,
  RevealItem,
  Section,
  SmartImage,
} from '@/components/marketing'
import { PageHero } from './components/PageHero'
import { mediaUrl } from '@/features/cms/api/cmsApi'
import { useNewsPosts } from '@/features/cms/hooks/useCms'
import { usePageMeta } from '@/hooks/usePageMeta'
import { formatDate } from '@/utils/format'

export default function NewsListPage() {
  usePageMeta(
    'News',
    'Announcements, recruitment drives and company updates from Aloha Security Agency.',
  )

  const { data: posts = [], isLoading } = useNewsPosts(true)

  return (
    <>
      <PageHero
        breadcrumb="News"
        eyebrow="Newsroom"
        title="News and announcements"
        description="Recruitment drives, new detachments and company updates."
      />

      <Section tone="white" size="lg">
        {isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-80 rounded-[var(--radius-xl)]" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-canvas p-12 text-center">
            <Newspaper
              className="mx-auto h-8 w-8 text-[var(--app-text-subtle)]"
              aria-hidden="true"
            />
            <h2 className="mt-4 text-lg font-bold text-ink">Nothing published yet</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--app-text-muted)]">
              Company announcements will appear here. Check back soon.
            </p>
          </div>
        ) : (
          <RevealGroup as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <RevealItem as="li" key={post.id}>
                <article className="group hover-lift flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-white shadow-[var(--shadow-soft)]">
                  <Link to={`/news/${post.slug}`} className="block">
                    <SmartImage
                      src={mediaUrl(post.cover_path) ?? '/images/news-placeholder.jpg'}
                      alt=""
                      width={800}
                      height={500}
                      rounded="none"
                      wrapperClassName="aspect-[16/10]"
                    />
                  </Link>

                  <div className="flex flex-1 flex-col p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      {post.category && (
                        <Badge tone="brand" size="sm">
                          {post.category}
                        </Badge>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--app-text-subtle)]">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDate(post.published_at)}
                      </span>
                    </div>

                    <h2 className="mt-3 text-lg leading-snug font-bold text-ink">
                      <Link to={`/news/${post.slug}`} className="hover:text-brand-600">
                        {post.title}
                      </Link>
                    </h2>

                    {post.excerpt && (
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--app-text-muted)]">
                        {post.excerpt}
                      </p>
                    )}

                    <Link
                      to={`/news/${post.slug}`}
                      className="mt-5 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-brand-600"
                    >
                      Read more
                      <ArrowUpRight
                        className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>
                </article>
              </RevealItem>
            ))}
          </RevealGroup>
        )}
      </Section>
    </>
  )
}
