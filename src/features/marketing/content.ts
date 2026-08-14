import {
  Award,
  Banknote,
  Building2,
  Camera,
  Car,
  ClipboardCheck,
  Eye,
  Factory,
  GraduationCap,
  Home,
  MapPinned,
  Radio,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Siren,
  Truck,
  UserCheck,
  Users,
  Warehouse,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Marketing copy, in one place.
 *
 * The landing page and the Services/About pages draw from the same source, so
 * a service can't be described one way on the home page and another on its own
 * page. Everything here is a claim about how the agency operates — it is
 * written from what the system actually does, and deliberately contains no
 * invented clients, testimonials or awards.
 */

export interface ServiceItem {
  icon: LucideIcon
  title: string
  body: string
  image?: string
}

export const SERVICES: ServiceItem[] = [
  {
    icon: ShieldCheck,
    title: 'Manned Guarding',
    body: 'Uniformed officers for static posts, roving patrols and access control at commercial, residential and government sites.',
    image: '/images/service-guarding.jpg',
  },
  {
    icon: UserCheck,
    title: 'Lady Guard Services',
    body: 'Trained female officers for frisking, customer-facing duty and any area requiring same-sex screening.',
  },
  {
    icon: Siren,
    title: 'VIP & Close-in Protection',
    body: 'Experienced escorts for executives, dignitaries and high-profile clients, including advance route planning.',
    image: '/images/service-escort.jpg',
  },
  {
    icon: Camera,
    title: 'CCTV & Command Centre',
    body: 'Round-the-clock camera monitoring, incident logging and radio coordination with ground units.',
    image: '/images/service-cctv.jpg',
  },
  {
    icon: Car,
    title: 'Secure Transport',
    body: 'Professionally licensed drivers for personnel movement, cash-in-transit support and client transport.',
  },
  {
    icon: Warehouse,
    title: 'Industrial & Logistics',
    body: 'Gate control, truck inspection and inventory-protection details for warehouses and distribution hubs.',
  },
  {
    icon: Building2,
    title: 'Detachment Management',
    body: 'Full detachment set-up with a dedicated coordinator, shift rotation planning and headcount reporting.',
  },
  {
    icon: GraduationCap,
    title: 'Training & Refreshers',
    body: 'Pre-deployment orientation and refresher training aligned with SOSIA requirements.',
    image: '/images/training.jpg',
  },
]

export interface DifferentiatorItem {
  icon: LucideIcon
  title: string
  body: string
}

/**
 * Why choose us — each of these describes a control the system genuinely
 * enforces, not a marketing aspiration.
 */
export const DIFFERENTIATORS: DifferentiatorItem[] = [
  {
    icon: ClipboardCheck,
    title: 'Every applicant verified',
    body: 'NBI and police clearances, licence status and supporting documents are checked and recorded before anyone is offered a post — not after.',
  },
  {
    icon: Award,
    title: 'Licences never lapse quietly',
    body: 'LESP/SOSIA licence expiry is tracked centrally and flagged sixty days out, so no officer is deployed on an expired credential.',
  },
  {
    icon: MapPinned,
    title: 'Accountable deployment',
    body: 'Every assignment, transfer and end of duty is recorded against the officer and the post, giving you an auditable history of who was on site and when.',
  },
  {
    icon: Users,
    title: 'A coordinator per detachment',
    body: 'Each post has a named branch coordinator with direct visibility of their roster, so escalations reach someone who knows the site.',
  },
  {
    icon: Radio,
    title: 'Round-the-clock coordination',
    body: 'Command-centre monitoring and radio contact keep ground units connected to a supervisor at every hour of the shift.',
  },
  {
    icon: Scale,
    title: 'Compliant by design',
    body: 'Operations follow SOSIA requirements and Philippine labour standards, with personnel records retained under the Data Privacy Act.',
  },
]

export interface IndustryItem {
  icon: LucideIcon
  title: string
  body: string
}

export const INDUSTRIES: IndustryItem[] = [
  {
    icon: Building2,
    title: 'Corporate & Offices',
    body: 'Lobby reception, access control and after-hours cover for business towers.',
  },
  {
    icon: ShoppingBag,
    title: 'Retail & Malls',
    body: 'Customer-facing officers, loss prevention and crowd management.',
  },
  {
    icon: Home,
    title: 'Residential',
    body: 'Subdivision and condominium gate control, visitor logging and patrols.',
  },
  {
    icon: Factory,
    title: 'Industrial',
    body: 'Plant perimeter security, contractor screening and shift-change control.',
  },
  {
    icon: Banknote,
    title: 'Banking & Finance',
    body: 'Branch guarding, ATM details and cash-in-transit escort support.',
  },
  {
    icon: Truck,
    title: 'Logistics & Warehousing',
    body: 'Gatehouse operations, vehicle inspection and inventory protection.',
  },
]

export interface ProcessStep {
  title: string
  body: string
}

export const PROCESS_STEPS: ProcessStep[] = [
  {
    title: 'Submit your application',
    body: 'Complete the online form and upload your résumé, valid ID and clearances. It takes about ten minutes, and you get a reference number straight away.',
  },
  {
    title: 'Screening',
    body: 'Our recruitment officers verify your documents, clearances and licence status against the requirements for the position you applied for.',
  },
  {
    title: 'Interview',
    body: 'Shortlisted applicants are invited to interview at the nearest office. Bring your original clearances and valid ID.',
  },
  {
    title: 'Deployment',
    body: 'Successful applicants are onboarded to the roster, assigned a rank, and deployed to a client post with a named coordinator.',
  },
]

export interface ValueItem {
  icon: LucideIcon
  title: string
  body: string
}

export const VALUES: ValueItem[] = [
  {
    icon: Eye,
    title: 'Vigilance',
    body: 'Attention does not lapse between incidents. Our officers are trained to observe, log and escalate before a situation develops.',
  },
  {
    icon: Scale,
    title: 'Integrity',
    body: 'Every applicant is screened and every deployment is recorded. Clients get an auditable account of who was on post and when.',
  },
  {
    icon: Users,
    title: 'Service',
    body: 'Security is a customer-facing role. We recruit for temperament and communication, not just physical readiness.',
  },
  {
    icon: Award,
    title: 'Professionalism',
    body: 'Licensing, refresher training and clearance validity are tracked centrally so nothing lapses unnoticed.',
  },
]

/**
 * FAQ answers describe the actual behaviour of this system — reference numbers,
 * document handling, retention — so they stay true as long as the code does.
 */
export const FAQS: { question: string; answer: string }[] = [
  {
    question: 'How do I apply for a position?',
    answer:
      'Apply online through this website. The form takes about ten minutes and asks for your personal details, the position you want, your government numbers and any clearances you already hold. You do not need an account.',
  },
  {
    question: 'What documents do I need to prepare?',
    answer:
      'A résumé or bio-data, a valid government ID and an NBI clearance are the essentials. Police and barangay clearances, a PSA birth certificate, your diploma or transcript, and a LESP/SOSIA licence for licensed roles can be brought to interview if you do not have them to hand.',
  },
  {
    question: 'Do I need a security licence before applying?',
    answer:
      'It depends on the position. Guarding and escort roles require a valid LESP/SOSIA licence and completion of the Basic Security Guard Course. CCTV operator and driver roles do not. Each open position lists its own requirements.',
  },
  {
    question: 'How do I check the progress of my application?',
    answer:
      'When you submit, you receive a reference number in the format ASA-YYYY-NNNNNN. Enter that number and your surname on the Check Status page to see where your application stands and any interview date that has been set.',
  },
  {
    question: 'How long does the process take?',
    answer:
      'Screening usually begins within a few working days of submission. The full path from application to deployment depends on how complete your documents are and on current openings at the posts you are suited to.',
  },
  {
    question: 'What happens to my personal information?',
    answer:
      'Your details are used solely to assess your application, in line with the Data Privacy Act of 2012 (RA 10173). Documents are stored privately and are only accessible to authorised recruitment staff. Closed applications are retained for five years, then permanently deleted.',
  },
  {
    question: 'Can I apply for more than one position?',
    answer:
      'Submit one application for the position that best matches your experience. Our recruitment officers will consider you for other suitable openings during screening, so there is no need to apply repeatedly.',
  },
  {
    question: 'We need guards for our site. How do we engage you?',
    answer:
      'Get in touch through the contact page with the location, the number of posts and the shift pattern you need. We will scope the detachment with you, including headcount, supervision and reporting.',
  },
]

/** Trust signals shown under the hero. Statements of practice, not awards. */
export const TRUST_BADGES = [
  'SOSIA-compliant operations',
  'NBI-cleared personnel',
  'Nationwide deployment',
  'Licensed & bonded',
]
