import { Link } from 'react-router-dom'
import { Award, ArrowUpRight, CalendarDays, Quote, Star, Building2  } from 'lucide-react'
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
import { formatDate } from '@/utils/format'
import { initials } from '@/utils/format'

/**
 * Social-proof sections, driven by the CMS.
 *
 * Each renders real content once an administrator publishes some, and a
 * "content needed" panel until then — pointing at the admin page rather than a
 * source file, because filling these in is an editor's job, not a developer's.
 *
 * Nothing here fabricates a testimonial, a client relationship or a credential.
 * The empty state is honest; invented filler would not be.
 */

const ADMIN_HINT = 'Add these in the admin console under Website Content.'

/* -------------------------------------------------------------------------- */
/* Client Showcase (Modern Highlighted Card Style)                            */
/* -------------------------------------------------------------------------- */

export function TrustBarSection() {
  const { data: clients = [], isLoading } = useClients(true)

  return (
    <Section tone="muted" size="lg" className="border-y border-[var(--app-border)] relative overflow-hidden">
      {/* Dynamic Background Decoration */}
      <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: `radial-gradient(circle at 2px 2px, var(--color-brand-500) 1px, transparent 0)`, backgroundSize: '40px 40px' }} />

      <Container className="relative z-10">
        <Reveal className="text-center mb-16">
          <p className="text-xs font-extrabold tracking-[0.3em] text-brand-600 uppercase mb-4">
            Our Network of Trust
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-ink tracking-tight">
            Our Esteemed Partners
          </h2>
          <div className="h-1 w-20 bg-brand-500 mx-auto mt-6 rounded-full" />
          <p className="mt-8 text-[var(--app-text-muted)] max-w-2xl mx-auto text-lg leading-relaxed text-pretty">
            Partnering with the Philippines' most respected institutions to deliver 
            uncompromising security and operational excellence.
          </p>
        </Reveal>

        {/* The Card Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-56 rounded-[2rem]" />
            ))}
          </div>
        ) : (
          <RevealGroup 
            as="ul" 
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6"
          >
            {clients.map((client) => (
              <RevealItem as="li" key={client.id} className="h-full">
                <div className="group h-full flex flex-col p-5 bg-white border border-neutral-100 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 hover:shadow-[0_20px_50px_rgba(226,56,40,0.1)] hover:-translate-y-2 hover:border-brand-100">
                  
                  {/* Modern Image "Pod" */}
                  <div className="relative aspect-square w-full flex items-center justify-center mb-5 bg-neutral-50 rounded-[1.5rem] overflow-hidden border border-neutral-50 group-hover:bg-white transition-colors duration-500">
                    {/* Subtle Inset Shadow for depth */}
                    <div className="absolute inset-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]" />
                    
                    {client.logo_path ? (
                      <img
                        src={mediaUrl(client.logo_path) ?? ''}
                        alt={client.name}
                        loading="lazy"
                        className="relative z-10 max-h-[60%] max-w-[70%] object-contain drop-shadow-sm group-hover:scale-110 transition-transform duration-700 ease-out"
                        /* Note: grayscale and low-opacity removed so it's already "highlighted" */
                      />
                    ) : (
                      <Building2 className="w-8 h-8 text-neutral-200" />
                    )}
                  </div>

                  {/* Label Typography */}
                  <div className="px-2 pb-2 mt-auto">
                    <h3 className="text-center text-[11px] font-black text-ink uppercase tracking-[0.15em] leading-tight opacity-80 group-hover:text-brand-600 group-hover:opacity-100 transition-all">
                      {client.name}
                    </h3>
                    <div className="w-0 h-0.5 bg-brand-500 mx-auto mt-2 group-hover:w-8 transition-all duration-500 rounded-full" />
                  </div>
                  
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        )}

        {!isLoading && clients.length === 0 && (
           <div className="mt-12">
              <Placeholder 
                label="Partner Roster Empty" 
                hint="Use the Admin Console > Website Content > Clients to showcase your partners." 
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

