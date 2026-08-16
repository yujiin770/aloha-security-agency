import { Link } from 'react-router-dom'
import { Award, ArrowUpRight, CalendarDays, Quote, Star, Building2  } from 'lucide-react'
import { cn } from '@/utils/cn' // Import for alternating layout logic
import {
  MarketingCard,
  Placeholder,
  Reveal,
  RevealGroup,
  RevealItem,
  Section,
  Container,
  SectionHeading,
  SmartImage,
} from '@/components/marketing'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Feedback'
import { mediaUrl } from '@/features/cms/api/cmsApi'
import {
  useAccreditations,
  useClients,
  useNewsPosts,
  useTestimonials,
} from '@/features/cms/hooks/useCms'
import { formatDate, initials } from '@/utils/format'

const ADMIN_HINT = 'Add these in the admin console under Website Content.'

/* -------------------------------------------------------------------------- */
/* Client Showcase (Alternating Big Image Style)                             */
/* -------------------------------------------------------------------------- */

export function TrustBarSection() {
  const { data: clients = [], isLoading } = useClients(true)

  return (
    <Section tone="muted" size="lg" className="overflow-hidden">
      <Container>
        <Reveal className="text-center mb-24">
          <p className="text-xs font-bold tracking-[0.4em] text-brand-600 uppercase mb-4">
            Our Network
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-ink tracking-tight">
            Our Esteemed Partners
          </h2>
          <p className="mt-6 text-[var(--app-text-muted)] max-w-2xl mx-auto text-lg leading-relaxed">
            We are proud to secure some of the most prominent facilities and 
            institutions across the Philippines.
          </p>
        </Reveal>

        {isLoading ? (
          <div className="space-y-20">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-[400px] rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-32 lg:space-y-48">
            {clients.map((client, index) => {
              const isEven = index % 2 === 0
              return (
                <div 
                  key={client.id} 
                  className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-center"
                >
                  {/* Image Side */}
                  <Reveal 
                    direction={isEven ? 'right' : 'left'} 
                    className={cn(isEven ? 'lg:order-1' : 'lg:order-2')}
                  >
                    <div className="relative group">
                      <div className="absolute -inset-4 bg-brand-500/5 rounded-[2.5rem] scale-95 group-hover:scale-100 transition-transform duration-700 -z-10" />
                      <div className="aspect-[16/10] overflow-hidden rounded-[2rem] shadow-[var(--shadow-lift)] border border-[var(--app-border)] bg-white">
                        {client.logo_path ? (
                          <img
                            src={mediaUrl(client.logo_path) ?? ''}
                            alt={client.name}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-white">
                            <Building2 className="w-20 h-20 text-neutral-200" />
                          </div>
                        )}
                      </div>
                    </div>
                  </Reveal>

                  {/* Text Side */}
                  <Reveal 
                    direction={isEven ? 'left' : 'right'} 
                    className={cn("space-y-6", isEven ? 'lg:order-2' : 'lg:order-1')}
                  >
                    <div className="space-y-2">
                      <span className="font-mono text-sm font-bold text-brand-600 tracking-tighter">
                        PARTNER {String(index + 1).padStart(2, '0')}
                      </span>
                      <h3 className="text-3xl lg:text-4xl font-bold text-ink">
                        {client.name}
                      </h3>
                      {client.industry && (
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-neutral-400">
                          {client.industry}
                        </p>
                      )}
                    </div>

                    <p className="text-[17px] font-medium leading-relaxed text-[var(--app-text-muted)] text-pretty">
                      Providing comprehensive security management and professional 
                      officer deployment for {client.name}. Our partnership ensures 
                      operational continuity and safety standards aligned with 
                      national regulations.
                    </p>

                    {client.website_url && (
                      <div className="pt-4">
                        <a
                          href={client.website_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-2 text-sm font-bold text-ink group/link"
                        >
                          Visit Official Website
                          <ArrowUpRight className="w-4 h-4 transition-transform group-hover/link:translate-x-1 group-hover/link:-translate-y-1" />
                        </a>
                      </div>
                    )}
                  </Reveal>
                </div>
              )
            })}
          </div>
        )}

        {!isLoading && clients.length === 0 && (
           <div className="mt-12">
              <Placeholder 
                label="Partner Roster Empty" 
                hint="Add clients in the Admin Console to replace this placeholder." 
              />
           </div>
        )}
      </Container>
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Testimonials                                                               */
/* -------------------------------------------------------------------------- */

export function TestimonialsSection() {
  const { data: testimonials = [], isLoading } = useTestimonials(true)

  return (
    <Section id="testimonials" tone="muted" size="lg">
      <SectionHeading
        align="center"
        eyebrow="What clients say"
        title="In their words"
        lead="Feedback from the site managers and business owners who rely on our detachments."
      />

      {isLoading ? (
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-[var(--radius-xl)]" />
          ))}
        </div>
      ) : testimonials.length === 0 ? (
        <Reveal delay={0.1} className="mt-14">
          <Placeholder
            label="No testimonials published yet"
            hint={`Add two or three short quotes with the person's name, role and company — with their permission to publish. ${ADMIN_HINT}`}
            file="/admin/content/testimonials"
            className="mx-auto max-w-2xl"
          />
        </Reveal>
      ) : (
        <RevealGroup
          as="ul"
          className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {testimonials.map((testimonial) => (
            <RevealItem as="li" key={testimonial.id}>
              <MarketingCard interactive={false} className="h-full">
                <Quote
                  className="h-8 w-8 text-brand-200"
                  aria-hidden="true"
                />

                {testimonial.rating && (
                  <div
                    className="mt-4 flex gap-0.5"
                    aria-label={`${testimonial.rating} out of 5`}
                  >
                    {Array.from({ length: testimonial.rating }).map((_, index) => (
                      <Star
                        key={index}
                        className="h-4 w-4 fill-warning text-warning"
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                )}

                <blockquote className="mt-5 flex-1 text-[15px] leading-relaxed text-[var(--app-text)]">
                  “{testimonial.quote}”
                </blockquote>

                <figcaption className="mt-6 flex items-center gap-3 border-t border-[var(--app-border)] pt-5">
                  {testimonial.avatar_path ? (
                    <img
                      src={mediaUrl(testimonial.avatar_path) ?? ''}
                      alt=""
                      loading="lazy"
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                      {initials(testimonial.author_name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {testimonial.author_name}
                    </p>
                    <p className="truncate text-xs text-[var(--app-text-muted)]">
                      {[testimonial.author_role, testimonial.company]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                </figcaption>
              </MarketingCard>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Accreditations                                                             */
/* -------------------------------------------------------------------------- */

export function AccreditationsSection() {
  const { data: accreditations = [], isLoading } = useAccreditations(true)

  return (
    <Section tone="white" size="md">
      <SectionHeading
        align="center"
        eyebrow="Accreditations"
        title="Licensed, registered, accountable"
        lead="Our regulatory standing and industry memberships."
      />

      {isLoading ? (
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-[var(--radius-xl)]" />
          ))}
        </div>
      ) : accreditations.length === 0 ? (
        <Reveal delay={0.1} className="mt-12">
          <Placeholder
            label="No accreditations published yet"
            hint={`List the agency's genuine licences and registrations — PNP-SOSIA, DOLE, SEC/DTI, PADPAO. ${ADMIN_HINT}`}
            file="/admin/content/accreditations"
            className="mx-auto max-w-2xl"
          />
        </Reveal>
      ) : (
        <RevealGroup
          as="ul"
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {accreditations.map((item) => (
            <RevealItem as="li" key={item.id}>
              <MarketingCard padding="md" interactive={false} className="h-full text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-canvas">
                  {item.logo_path ? (
                    <img
                      src={mediaUrl(item.logo_path) ?? ''}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain p-1.5"
                    />
                  ) : (
                    <Award className="h-6 w-6 text-brand-500" aria-hidden="true" />
                  )}
                </span>

                <h3 className="mt-4 text-sm font-bold text-ink">{item.name}</h3>
                {item.issuer && (
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    {item.issuer}
                  </p>
                )}
                {item.reference_no && (
                  <p className="mt-2 font-mono text-[11px] text-[var(--app-text-subtle)]">
                    {item.reference_no}
                  </p>
                )}
              </MarketingCard>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </Section>
  )
}

/* -------------------------------------------------------------------------- */
/* Latest news                                                                */
/* -------------------------------------------------------------------------- */

export function NewsSection() {
  const { data: posts = [], isLoading } = useNewsPosts(true, 3)

  return (
    <Section tone="muted" size="lg">
      <SectionHeading
        eyebrow="Latest news"
        title="From the agency"
        lead="Announcements, recruitment drives and company updates."
      />

      {isLoading ? (
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-72 rounded-[var(--radius-xl)]" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Reveal delay={0.1} className="mt-12">
          <Placeholder
            label="No news published yet"
            hint={`Write announcements — new detachments, recruitment drives, training milestones. ${ADMIN_HINT}`}
            file="/admin/content/news"
          />
        </Reveal>
      ) : (
        <RevealGroup as="ul" className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <RevealItem as="li" key={post.id}>
              <article className="group hover-lift flex h-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-white shadow-[var(--shadow-soft)]">
                <SmartImage
                  src={mediaUrl(post.cover_path) ?? '/images/news-placeholder.jpg'}
                  alt=""
                  width={800}
                  height={500}
                  rounded="none"
                  wrapperClassName="aspect-[16/10]"
                />

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

                  <h3 className="mt-3 text-lg leading-snug font-bold text-ink">
                    {post.title}
                  </h3>

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
  )
}