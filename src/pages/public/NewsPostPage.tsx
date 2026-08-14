import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingState } from '@/components/ui/Feedback'
import { Container, Section, SmartImage } from '@/components/marketing'
import { mediaUrl } from '@/features/cms/api/cmsApi'
import { useNewsPost } from '@/features/cms/hooks/useCms'
import { usePageMeta } from '@/hooks/usePageMeta'
import { formatDate } from '@/utils/format'

export default function NewsPostPage() {
  const { slug } = useParams()
  const { data: post, isLoading } = useNewsPost(slug)

  usePageMeta(post?.title ?? 'News', post?.excerpt ?? undefined)

  if (isLoading) {
    return (
      <div className="pt-32 pb-20">
        <LoadingState label="Loading post…" />
      </div>
    )
  }

  // A draft is unreadable to the public by RLS, not merely hidden — so an
  // unpublished slug legitimately looks identical to one that never existed.
  if (!post || !post.is_published) {
    return (
      <Section tone="white" size="lg" className="pt-40">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-3xl font-bold text-ink">Post not found</h1>
          <p className="mt-3 leading-relaxed text-[var(--app-text-muted)]">
            This article doesn't exist, or it hasn't been published yet.
          </p>
          <ButtonLink
            to="/news"
            variant="secondary"
            size="lg"
            className="mt-8"
            leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
          >
            All news
          </ButtonLink>
        </div>
      </Section>
    )
  }

  const cover = mediaUrl(post.cover_path)

  return (
    <>
      <section className="relative bg-ink pt-32 pb-16 sm:pt-40">
       

        <Container className="relative">
          <Link
            to="/news"
            className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All news
          </Link>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {post.category && <Badge tone="brand">{post.category}</Badge>}
            <span className="inline-flex items-center gap-1.5 text-sm text-neutral-400">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {formatDate(post.published_at)}
            </span>
          </div>

          <h1 className="text-display mt-5 max-w-3xl text-3xl text-white text-balance sm:text-5xl">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400">
              {post.excerpt}
            </p>
          )}
        </Container>
      </section>

      <Section tone="white" size="lg">
        <div className="mx-auto max-w-3xl">
          {cover && (
            <SmartImage
              src={cover}
              alt=""
              width={1200}
              height={750}
              priority
              rounded="2xl"
              wrapperClassName="aspect-[16/10] mb-12 shadow-[var(--shadow-lift)]"
            />
          )}

          {post.body ? (
            // Body is stored as plain text and split on blank lines. React
            // escapes each paragraph, so author-supplied content cannot inject
            // markup — no `dangerouslySetInnerHTML` anywhere in this codebase.
            <div className="space-y-5">
              {post.body
                .split(/\n\s*\n/)
                .filter((paragraph) => paragraph.trim())
                .map((paragraph, index) => (
                  <p
                    key={index}
                    className="text-[17px] leading-relaxed whitespace-pre-line text-[var(--app-text)]"
                  >
                    {paragraph.trim()}
                  </p>
                ))}
            </div>
          ) : (
            <p className="text-[var(--app-text-muted)]">
              This post has no further detail.
            </p>
          )}

          <div className="mt-14 border-t border-[var(--app-border)] pt-8">
            <ButtonLink
              to="/news"
              variant="secondary"
              leftIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
            >
              Back to all news
            </ButtonLink>
          </div>
        </div>
      </Section>
    </>
  )
}
