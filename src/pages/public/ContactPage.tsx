import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  Building2,
  Clock,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
  UserPlus,
} from 'lucide-react'
import { zodResolver } from '@/lib/zodResolver'
import { ButtonLink, Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import {
  MarketingCard,
  Reveal,
  RevealGroup,
  RevealItem,
  Section,
  SectionHeading,
} from '@/components/marketing'
import { PageHero } from './components/PageHero'
import { usePublicSettings } from '@/features/settings/hooks/useSettings'
import { usePageMeta } from '@/hooks/usePageMeta'
import { SUPPORT_EMAIL } from '@/lib/env'

const schema = z.object({
  name: z.string().trim().min(1, 'Your name is required').max(120),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  phone: z.string().trim().max(20).optional().or(z.literal('')),
  company: z.string().trim().max(120).optional().or(z.literal('')),
  topic: z.enum(['services', 'recruitment', 'other']),
  message: z.string().trim().min(10, 'Please give us a little more detail').max(2000),
})

type FormValues = z.infer<typeof schema>

export default function ContactPage() {
  usePageMeta(
    'Contact Us',
    'Get in touch with Aloha Security Agency for security services, recruitment enquiries or client support.',
  )

  const { data: settings } = usePublicSettings()
  const [sent, setSent] = useState(false)

  const email = String(settings?.['company.email'] ?? SUPPORT_EMAIL)
  const phone = String(settings?.['company.phone'] ?? '+63 900 000 0000')
  const address = String(settings?.['company.address'] ?? 'Philippines')

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      company: '',
      topic: 'services',
      message: '',
    },
  })

  /**
   * There is no server-side mail endpoint reachable from the public site — the
   * `send-notification-email` Edge Function requires a staff session, and
   * exposing an unauthenticated one would be an open relay. So the form
   * composes a pre-filled mailto instead. It is honest about what it does and
   * needs no backend.
   */
  function onSubmit(values: FormValues) {
    const subject = `[${values.topic}] Enquiry from ${values.name}`
    const body = [
      `Name: ${values.name}`,
      `Email: ${values.email}`,
      values.phone ? `Phone: ${values.phone}` : null,
      values.company ? `Company: ${values.company}` : null,
      '',
      values.message,
    ]
      .filter(Boolean)
      .join('\n')

    // `assign()` rather than setting `location.href` — the React Compiler
    // rejects assigning to a value defined outside the component, and this
    // expresses the navigation more plainly anyway.
    window.location.assign(
      `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    )

    setSent(true)
  }

  const errors = form.formState.errors

  const details = [
    {
      icon: Mail,
      label: 'Email',
      value: email,
      href: `mailto:${email}`,
      detail: 'We reply to enquiries within two working days.',
    },
    {
      icon: Phone,
      label: 'Phone',
      value: phone,
      href: `tel:${phone.replace(/\s/g, '')}`,
      detail: 'Monday to Saturday, 8:00 AM – 5:00 PM.',
    },
    {
      icon: MapPin,
      label: 'Head office',
      value: address,
      detail: 'Walk-in applicants welcome during office hours.',
    },
    {
      icon: Clock,
      label: 'Office hours',
      value: 'Mon–Sat, 8:00 AM – 5:00 PM',
      detail: 'Closed Sundays and public holidays.',
    },
  ]

  return (
    <>
      <PageHero
        breadcrumb="Contact"
        eyebrow="Contact"
        title="Let's talk about your site"
        description="For security services, recruitment enquiries or anything else — here's how to reach us."
      />

      {/* Contact details ------------------------------------------------- */}
      <Section tone="white" size="lg">
        <RevealGroup as="ul" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {details.map((item) => (
            <RevealItem as="li" key={item.label}>
              <MarketingCard padding="md" interactive={Boolean(item.href)} className="h-full">
                <span
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"
                  aria-hidden="true"
                >
                  <item.icon className="h-5 w-5" />
                </span>
                <p className="mt-5 text-xs font-semibold tracking-wide text-[var(--app-text-subtle)] uppercase">
                  {item.label}
                </p>
                {item.href ? (
                  <a
                    href={item.href}
                    className="mt-1 block text-[15px] font-semibold break-words text-brand-600 hover:underline"
                  >
                    {item.value}
                  </a>
                ) : (
                  <p className="mt-1 text-[15px] font-semibold text-ink">
                    {item.value}
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-muted)]">
                  {item.detail}
                </p>
              </MarketingCard>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* Form + applicant routes ----------------------------------------- */}
      <Section tone="muted" size="lg">
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <SectionHeading
              eyebrow="Send a message"
              title="Tell us what you need"
              lead="Give us the location, the number of posts and the shift pattern, and we'll come back with a scoped detachment."
            />

            <Reveal delay={0.1} className="mt-10">
              {sent ? (
                <div className="rounded-[var(--radius-xl)] border border-success/25 bg-success-soft p-8">
                  <h3 className="text-lg font-bold text-success">
                    Your email client should have opened
                  </h3>
                  <p className="mt-2 leading-relaxed text-[var(--app-text-muted)]">
                    We've pre-filled a message to{' '}
                    <strong className="font-semibold">{email}</strong>. If
                    nothing opened, email us directly — your details are ready to
                    copy from the form.
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-5"
                    onClick={() => setSent(false)}
                  >
                    Back to the form
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-white p-7 shadow-[var(--shadow-soft)] sm:p-9"
                  noValidate
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Your name" required error={errors.name?.message}>
                      <Input autoComplete="name" {...form.register('name')} />
                    </Field>
                    <Field label="Email address" required error={errors.email?.message}>
                      <Input type="email" autoComplete="email" {...form.register('email')} />
                    </Field>
                    <Field label="Phone" error={errors.phone?.message}>
                      <Input type="tel" autoComplete="tel" {...form.register('phone')} />
                    </Field>
                    <Field label="Company" error={errors.company?.message}>
                      <Input autoComplete="organization" {...form.register('company')} />
                    </Field>
                  </div>

                  <Field
                    label="What is this about?"
                    required
                    className="mt-5"
                    error={errors.topic?.message}
                  >
                    <Select
                      options={[
                        { value: 'services', label: 'Security services for my site' },
                        { value: 'recruitment', label: 'Recruitment enquiry' },
                        { value: 'other', label: 'Something else' },
                      ]}
                      {...form.register('topic')}
                    />
                  </Field>

                  <Field
                    label="Message"
                    required
                    className="mt-5"
                    error={errors.message?.message}
                  >
                    <Textarea
                      rows={5}
                      placeholder="Tell us about the site, the number of posts and the shift pattern you need…"
                      {...form.register('message')}
                    />
                  </Field>

                  <Button
                    type="submit"
                    size="xl"
                    className="mt-7"
                    leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
                  >
                    Send message
                  </Button>

                  <p className="mt-4 text-xs text-[var(--app-text-subtle)]">
                    This opens a pre-filled message in your email app — nothing
                    is stored on this website.
                  </p>
                </form>
              )}
            </Reveal>
          </div>

          {/* Applicant routes ------------------------------------------- */}
          <aside className="space-y-5 lg:col-span-5">
            <Reveal direction="left">
              <div className="rounded-[var(--radius-xl)] bg-ink p-8">
                <span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white"
                  aria-hidden="true"
                >
                  <UserPlus className="h-5 w-5" />
                </span>
                <h2 className="mt-6 text-xl font-bold text-white">
                  Applying for a position?
                </h2>
                <p className="mt-2.5 leading-relaxed text-neutral-400">
                  You don't need to email us. Apply through the online form and
                  you'll get a reference number straight away.
                </p>
                <ButtonLink to="/apply" size="lg" fullWidth className="mt-6">
                  Apply online
                </ButtonLink>
              </div>
            </Reveal>

            <Reveal direction="left" delay={0.1}>
              <div className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-white p-8 shadow-[var(--shadow-soft)]">
                <span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-canvas text-[var(--app-text-muted)]"
                  aria-hidden="true"
                >
                  <Search className="h-5 w-5" />
                </span>
                <h2 className="mt-6 text-xl font-bold text-ink">
                  Already applied?
                </h2>
                <p className="mt-2.5 leading-relaxed text-[var(--app-text-muted)]">
                  Check your progress with your reference number and surname.
                </p>
                <ButtonLink
                  to="/status"
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="mt-6"
                >
                  Check status
                </ButtonLink>
              </div>
            </Reveal>

            <Reveal direction="left" delay={0.15}>
              <div className="rounded-[var(--radius-xl)] border border-[var(--app-border)] bg-white p-8 shadow-[var(--shadow-soft)]">
                <span
                  className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-laurel-100 text-laurel-600"
                  aria-hidden="true"
                >
                  <Building2 className="h-5 w-5" />
                </span>
                <h2 className="mt-6 text-xl font-bold text-ink">
                  Visit our office
                </h2>
                <p className="mt-2.5 leading-relaxed text-[var(--app-text-muted)]">
                  {address}
                </p>
                <p className="mt-1 text-sm text-[var(--app-text-subtle)]">
                  Monday to Saturday, 8:00 AM – 5:00 PM
                </p>
              </div>
            </Reveal>
          </aside>
        </div>
      </Section>
    </>
  )
}
