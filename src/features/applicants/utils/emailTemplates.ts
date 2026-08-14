/**
 * Applicant-facing email templates.
 *
 * These are the only emails an applicant ever receives — they are not users and
 * have no account, so this and the public status checker are the whole of their
 * visibility into the pipeline.
 *
 * Written as inline-styled HTML on purpose. Mail clients strip <style> blocks
 * (Gmail) and have no CSS variables, so the app's design tokens cannot be used
 * here; the palette below is hardcoded to match them.
 *
 * `rejection_reason` is deliberately NOT sent. It is an internal note written for
 * staff ("failed the background check", "lied about the licence") and is frequently
 * phrased in ways that would be damaging or actionable if forwarded to the
 * applicant. If the business wants reasons disclosed, that should be a separate,
 * curated field — not this one.
 */

import { APP_NAME, SUPPORT_EMAIL } from '@/lib/env'
import { formatDateTime } from '@/utils/format'
import type { ApplicantRow, ApplicantStatus } from '@/types/database.types'

export interface ApplicantEmail {
  subject: string
  html: string
  /**
   * Plain-text alternative. Some clients render only this, and an HTML-only
   * message scores worse with spam filters — which matters most for the
   * rejection notice, the one nobody is watching their inbox for.
   */
  text: string
  /** Stored on email_logs.template — also the duplicate-send key. */
  template: string
}

/** Footer shared by the plain-text parts, mirroring `layout()`. */
function textFooter(referenceNo: string): string {
  return [
    '',
    `Reference number: ${referenceNo}`,
    `Questions? Write to ${SUPPORT_EMAIL}`,
    '',
    APP_NAME,
  ].join('\n')
}

const BRAND = '#0f172a'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'
const SUCCESS = '#16a34a'

/** Escapes interpolated values — names and notes are user-supplied. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Default small print. Every applicant-facing message carries it except the hire
 * confirmation, where "do not treat this as an offer of employment" would
 * contradict the entire message.
 */
const NOT_AN_OFFER =
  'This message was sent automatically — please do not treat it as an offer of employment.'

function layout(
  heading: string,
  body: string,
  referenceNo: string,
  disclaimer: string = NOT_AN_OFFER,
): string {
  return `
<div style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden;">
    <div style="padding:20px 28px;border-bottom:1px solid ${BORDER};">
      <span style="font-size:15px;font-weight:700;color:${BRAND};">${esc(APP_NAME)}</span>
    </div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 16px;font-size:19px;line-height:1.35;color:${BRAND};">${heading}</h1>
      ${body}
    </div>
    <div style="padding:18px 28px;border-top:1px solid ${BORDER};background:#f8fafc;">
      <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED};">
        Reference number <strong style="color:${BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${esc(referenceNo)}</strong><br>
        Quote this in any reply. Questions? Write to
        <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:${BRAND};">${esc(SUPPORT_EMAIL)}</a>.
      </p>
      <p style="margin:12px 0 0;font-size:11px;color:${MUTED};">
        ${esc(disclaimer)}
      </p>
    </div>
  </div>
</div>`.trim()
}

function p(text: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#334155;">${text}</p>`
}

/**
 * Returns null for statuses the applicant should not be emailed about.
 *
 * `pending` is the state they are already in when they apply, and `archived` is
 * a retention concern that means nothing to them — mailing either would be noise.
 */
export function buildStatusEmail(
  applicant: Pick<
    ApplicantRow,
    'first_name' | 'last_name' | 'reference_no' | 'interview_at'
  >,
  status: ApplicantStatus,
): ApplicantEmail | null {
  const name = esc(applicant.first_name)
  const ref = applicant.reference_no

  switch (status) {
    case 'screening':
      return {
        template: 'applicant_screening',
        subject: `Your application is under review — ${ref}`,
        html: layout(
          'Your application is being reviewed',
          p(`Hello ${name},`) +
            p(
              `Thank you for applying to ${esc(APP_NAME)}. Your application has passed our initial checks and is now with our recruitment team for review.`,
            ) +
            p(
              'We will contact you once the review is complete. No action is needed from you in the meantime.',
            ),
          ref,
        ),
        text: [
          `Hello ${applicant.first_name},`,
          '',
          `Thank you for applying to ${APP_NAME}. Your application has passed our initial checks and is now with our recruitment team for review.`,
          '',
          'We will contact you once the review is complete. No action is needed from you in the meantime.',
          textFooter(ref),
        ].join('\n'),
      }

    case 'interview':
      // The date is optional in the status dialog, so the email has to read
      // correctly both with and without it rather than printing an empty slot.
      return {
        template: 'applicant_interview',
        subject: applicant.interview_at
          ? `Interview scheduled — ${ref}`
          : `You have been shortlisted for interview — ${ref}`,
        html: layout(
          applicant.interview_at
            ? 'Your interview has been scheduled'
            : 'You have been shortlisted for an interview',
          p(`Hello ${name},`) +
            p(
              `We are pleased to let you know that your application to ${esc(APP_NAME)} has progressed to the interview stage.`,
            ) +
            (applicant.interview_at
              ? `<div style="margin:0 0 14px;padding:14px 16px;background:#f1f5f9;border-left:3px solid ${BRAND};border-radius:6px;">
                   <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};">Interview schedule</div>
                   <div style="margin-top:4px;font-size:15px;font-weight:600;color:${BRAND};">${esc(formatDateTime(applicant.interview_at))}</div>
                 </div>` +
                p(
                  'Please bring a valid government-issued ID and original copies of the credentials you submitted. Arrive at least 15 minutes early.',
                ) +
                p(
                  'If you cannot make this schedule, reply to this email as early as possible so we can arrange another slot.',
                )
              : p(
                  'Our recruitment team will contact you shortly to arrange a date and time. Please keep the contact number on your application reachable.',
                )),
          ref,
        ),
        text: [
          `Hello ${applicant.first_name},`,
          '',
          `We are pleased to let you know that your application to ${APP_NAME} has progressed to the interview stage.`,
          '',
          ...(applicant.interview_at
            ? [
                `Interview schedule: ${formatDateTime(applicant.interview_at)}`,
                '',
                'Please bring a valid government-issued ID and original copies of the credentials you submitted. Arrive at least 15 minutes early.',
                '',
                'If you cannot make this schedule, reply to this email as early as possible so we can arrange another slot.',
              ]
            : [
                'Our recruitment team will contact you shortly to arrange a date and time. Please keep the contact number on your application reachable.',
              ]),
          textFooter(ref),
        ].join('\n'),
      }

    case 'rejected':
      return {
        template: 'applicant_rejected',
        subject: `Update on your application — ${ref}`,
        html: layout(
          'Update on your application',
          p(`Hello ${name},`) +
            p(
              `Thank you for the time and effort you put into applying to ${esc(APP_NAME)}, and for your interest in joining our team.`,
            ) +
            p(
              'After careful consideration, we will not be moving forward with your application on this occasion. This decision reflects the requirements of the roles we are currently filling and is not a judgement of your capability.',
            ) +
            p(
              'Your details remain on file, and you are welcome to apply again for future openings.',
            ),
          ref,
        ),
        text: [
          `Hello ${applicant.first_name},`,
          '',
          `Thank you for the time and effort you put into applying to ${APP_NAME}, and for your interest in joining our team.`,
          '',
          'After careful consideration, we will not be moving forward with your application on this occasion. This decision reflects the requirements of the roles we are currently filling and is not a judgement of your capability.',
          '',
          'Your details remain on file, and you are welcome to apply again for future openings.',
          textFooter(ref),
        ].join('\n'),
      }

    case 'hired': {
      // No start date, salary, or reporting branch here. Those are terms of
      // employment: they live on the personnel record created by
      // promote_applicant_to_personnel, are frequently still blank at the moment
      // the status flips, and a wrong figure in writing is a dispute. This
      // confirms the outcome and hands off to a person.
      const nextSteps = [
        'Bring the original copies of every document you submitted, including your NBI and police clearance.',
        'Bring your SSS, PhilHealth, Pag-IBIG and TIN numbers if you have not given them yet.',
        'Our HR team will contact you to confirm your start date, reporting branch and schedule.',
      ]

      return {
        template: 'applicant_hired',
        subject: `Welcome to ${APP_NAME} — ${ref}`,
        html: layout(
          `Congratulations, ${name} — welcome to the team`,
          p(`Hello ${name},`) +
            p(
              `We are delighted to let you know that your application to ${esc(APP_NAME)} has been successful. Thank you for the time you gave to the process.`,
            ) +
            `<div style="margin:0 0 14px;padding:14px 16px;background:#f0fdf4;border-left:3px solid ${SUCCESS};border-radius:6px;">
               <div style="font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};">Before you report</div>
               <ul style="margin:8px 0 0;padding-left:18px;font-size:14px;line-height:1.65;color:#334155;">
                 ${nextSteps.map((step) => `<li style="margin-bottom:4px;">${esc(step)}</li>`).join('')}
               </ul>
             </div>` +
            p(
              'If anything above has changed, or you have questions before you start, reply to this email and we will help.',
            ),
          ref,
          'This message confirms the outcome of your application. Your start date and terms will be confirmed separately by our HR team.',
        ),
        text: [
          `Hello ${applicant.first_name},`,
          '',
          `We are delighted to let you know that your application to ${APP_NAME} has been successful. Thank you for the time you gave to the process.`,
          '',
          'Before you report:',
          ...nextSteps.map((step) => `- ${step}`),
          '',
          'If anything above has changed, or you have questions before you start, reply to this email and we will help.',
          textFooter(ref),
        ].join('\n'),
      }
    }

    default:
      return null
  }
}
