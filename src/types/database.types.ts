/**
 * Supabase database types.
 *
 * Hand-authored to match `supabase/migrations/*`. Once your project is linked,
 * regenerate from the live schema instead of editing this file by hand:
 *
 *   supabase gen types typescript --linked > src/types/database.types.ts
 *
 * Keep the shape below in sync with the migrations until you do.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export type AppRole =
  | 'owner'
  | 'admin'
  | 'system_administrator'
  | 'hr_staff'
  | 'recruitment_officer'
  | 'deployment_officer'
  | 'branch_coordinator'

/** Badge colour tokens; mirrors the CHECK constraint on `positions.tone`. */
export type ToneToken =
  | 'neutral'
  | 'info'
  | 'warning'
  | 'success'
  | 'danger'
  | 'brand'
  | 'laurel'

export type ApplicantStatus =
  | 'pending'
  | 'screening'
  | 'interview'
  | 'hired'
  | 'rejected'
  | 'archived'

/**
 * Positions and ranks are configuration data, not enums.
 *
 * Migration 0013 replaced the `position_type` enum with the `positions` table
 * so a system administrator can add a post type without a schema change.
 * Anywhere that used to hold a `PositionType` now holds a `position_id`.
 */
export type PositionRow = {
  id: string
  code: string
  name: string
  description: string | null
  category: string | null
  min_age: number
  max_age: number | null
  min_height_cm: number | null
  min_years_experience: number
  requires_license: boolean
  default_daily_rate: number | null
  tone: ToneToken
  sort_order: number
  is_active: boolean
  is_public: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RankRow = {
  id: string
  code: string
  name: string
  description: string | null
  level: number
  sort_order: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type PositionRankRow = {
  position_id: string
  rank_id: string
}

export type EmploymentStatus =
  | 'active'
  | 'on_leave'
  | 'suspended'
  | 'resigned'
  | 'terminated'

export type DeploymentStatus =
  | 'pending'
  | 'active'
  | 'ended'
  | 'transferred'
  | 'cancelled'

export type ShiftType = 'day' | 'night' | 'mid' | 'rotating'

export type DocumentType =
  | 'resume'
  | 'government_id'
  | 'nbi_clearance'
  | 'police_clearance'
  | 'barangay_clearance'
  | 'medical_certificate'
  | 'training_certificate'
  | 'security_license'
  | 'diploma'
  | 'photo'
  | 'other'

export type NotificationType =
  | 'applicant_submitted'
  | 'applicant_status_changed'
  | 'interview_scheduled'
  | 'deployment_assigned'
  | 'deployment_ended'
  | 'document_uploaded'
  | 'system'

export type CivilStatus =
  | 'single'
  | 'married'
  | 'widowed'
  | 'separated'
  | 'divorced'

export type SexType = 'male' | 'female'

export type AuditAction = 'insert' | 'update' | 'delete'

/* -------------------------------------------------------------------------- */
/* Row shapes                                                                  */
/* -------------------------------------------------------------------------- */

export type ProfileRow = {
  id: string
  email: string
  full_name: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  avatar_path: string | null
  job_title: string | null
  branch_id: string | null
  is_active: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

/**
 * `key` is plain text since 0020: roles are rows, not enum values, so they can
 * be created from the UI. `inherits_from` names the built-in role whose RLS
 * privileges the role carries — null only for the seven system roles, whose key
 * already is a built-in.
 */
export type RoleRow = {
  key: string
  label: string
  description: string
  rank: number
  is_assignable: boolean
  inherits_from: AppRole | null
  is_system: boolean
  created_at: string
}

export type PermissionRow = {
  key: string
  resource: string
  action: string
  description: string
  created_at: string
}

export type RolePermissionRow = {
  role_key: string
  permission_key: string
}

export type UserRoleRow = {
  id: string
  user_id: string
  /** A `roles.key`, which since 0020 may be a custom role, not just a built-in. */
  role: string
  granted_by: string | null
  granted_at: string
}

export type BranchRow = {
  id: string
  code: string
  name: string
  description: string | null
  address_line: string | null
  barangay: string | null
  city_municipality: string
  province: string | null
  region: string | null
  postal_code: string | null
  contact_person: string | null
  contact_phone: string | null
  contact_email: string | null
  coordinator_id: string | null
  required_headcount: number
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ApplicantRow = {
  id: string
  reference_no: string
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
  email: string
  phone: string
  birth_date: string
  sex: SexType
  civil_status: CivilStatus | null
  height_cm: number | null
  weight_kg: number | null
  address_line: string | null
  barangay: string | null
  city_municipality: string | null
  province: string | null
  region: string | null
  postal_code: string | null
  position_id: string
  preferred_branch_id: string | null
  years_experience: number
  highest_education: string | null
  expected_salary: number | null
  availability_date: string | null
  source: string | null
  sss_no: string | null
  philhealth_no: string | null
  pagibig_no: string | null
  tin_no: string | null
  nbi_clearance_no: string | null
  nbi_clearance_expiry: string | null
  police_clearance_no: string | null
  security_license_no: string | null
  security_license_expiry: string | null
  is_licensed: boolean
  status: ApplicantStatus
  status_changed_at: string
  reviewed_by: string | null
  interview_at: string | null
  interview_notes: string | null
  rating: number | null
  rejection_reason: string | null
  internal_notes: string | null
  archived_at: string | null
  purge_after: string | null
  /** Idempotency key from the public form (0019). Null for staff-created rows. */
  submission_id: string | null
  created_at: string
  updated_at: string
}

export type ApplicantDocumentRow = {
  id: string
  applicant_id: string
  document_type: DocumentType
  bucket_id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  verified_by: string | null
  verified_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type ApplicantStatusHistoryRow = {
  id: string
  applicant_id: string
  from_status: ApplicantStatus | null
  to_status: ApplicantStatus
  changed_by: string | null
  note: string | null
  created_at: string
}

export type PersonnelRow = {
  id: string
  employee_no: string
  applicant_id: string | null
  profile_id: string | null
  first_name: string
  middle_name: string | null
  last_name: string
  suffix: string | null
  email: string | null
  phone: string | null
  birth_date: string | null
  sex: SexType | null
  position_id: string
  rank_id: string | null
  date_hired: string
  date_separated: string | null
  employment_status: EmploymentStatus
  photo_path: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  sss_no: string | null
  philhealth_no: string | null
  pagibig_no: string | null
  tin_no: string | null
  security_license_no: string | null
  security_license_expiry: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type DeploymentRow = {
  id: string
  personnel_id: string
  branch_id: string
  shift: ShiftType
  post_assignment: string | null
  start_date: string
  end_date: string | null
  status: DeploymentStatus
  daily_rate: number | null
  remarks: string | null
  ended_reason: string | null
  assigned_by: string | null
  created_at: string
  updated_at: string
}

export type DeploymentHistoryRow = {
  id: string
  deployment_id: string
  personnel_id: string
  branch_id: string | null
  from_status: DeploymentStatus | null
  to_status: DeploymentStatus
  changed_by: string | null
  note: string | null
  created_at: string
}

export type AuditLogRow = {
  id: number
  table_name: string
  record_id: string | null
  action: AuditAction
  actor_id: string | null
  actor_email: string | null
  old_data: Json | null
  new_data: Json | null
  changed_keys: string[] | null
  created_at: string
}

export type ActivityLogRow = {
  id: number
  actor_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string
  metadata: Json
  created_at: string
}

export type NotificationRow = {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  entity_type: string | null
  entity_id: string | null
  read_at: string | null
  created_at: string
}

export type SettingRow = {
  key: string
  value: Json
  description: string
  is_public: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type EmailLogRow = {
  id: string
  to_email: string
  subject: string
  template: string | null
  status: 'queued' | 'sent' | 'failed' | 'bounced'
  provider_id: string | null
  error_message: string | null
  entity_type: string | null
  entity_id: string | null
  sent_at: string | null
  created_at: string
}

/* -------------------------------------------------------------------------- */
/* Website content (CMS) — migration 0016                                      */
/* -------------------------------------------------------------------------- */

export type TestimonialRow = {
  id: string
  quote: string
  author_name: string
  author_role: string | null
  company: string | null
  avatar_path: string | null
  rating: number | null
  sort_order: number
  is_published: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ClientRow = {
  id: string
  name: string
  logo_path: string | null
  website_url: string | null
  industry: string | null
  sort_order: number
  is_published: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type AccreditationRow = {
  id: string
  name: string
  issuer: string | null
  reference_no: string | null
  valid_until: string | null
  logo_path: string | null
  description: string | null
  sort_order: number
  is_published: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type NewsPostRow = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body: string | null
  cover_path: string | null
  category: string | null
  published_at: string | null
  is_published: boolean
  author_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SiteMediaRow = {
  key: string
  label: string
  description: string | null
  bucket_id: string
  storage_path: string | null
  alt_text: string | null
  width: number | null
  height: number | null
  sort_order: number
  updated_by: string | null
  created_at: string
  updated_at: string
}

/* -------------------------------------------------------------------------- */
/* View shapes                                                                 */
/* -------------------------------------------------------------------------- */

export type ApplicantSummaryView = {
  id: string
  reference_no: string
  first_name: string
  middle_name: string | null
  last_name: string
  full_name: string
  email: string
  phone: string
  sex: SexType
  birth_date: string
  age: number
  position_id: string
  position_code: string
  position_name: string
  position_tone: ToneToken
  status: ApplicantStatus
  is_licensed: boolean
  years_experience: number
  rating: number | null
  interview_at: string | null
  preferred_branch_id: string | null
  preferred_branch_name: string | null
  preferred_branch_code: string | null
  reviewed_by: string | null
  reviewed_by_name: string | null
  created_at: string
  status_changed_at: string
  document_count: number
  verified_document_count: number
}

export type ActiveDeploymentView = {
  id: string
  personnel_id: string
  employee_no: string
  personnel_name: string
  position_id: string
  position_code: string
  position_name: string
  position_tone: ToneToken
  rank_name: string | null
  employment_status: EmploymentStatus
  photo_path: string | null
  branch_id: string
  branch_code: string
  branch_name: string
  city_municipality: string
  region: string | null
  shift: ShiftType
  post_assignment: string | null
  start_date: string
  end_date: string | null
  status: DeploymentStatus
  daily_rate: number | null
  days_deployed: number
  assigned_by: string | null
  created_at: string
}

export type BranchStaffingView = {
  branch_id: string
  code: string
  name: string
  city_municipality: string
  region: string | null
  is_active: boolean
  required_headcount: number
  coordinator_id: string | null
  coordinator_name: string | null
  deployed_count: number
  vacancy_count: number
  fill_rate_pct: number | null
}

export type PersonnelRosterView = {
  id: string
  employee_no: string
  full_name: string
  first_name: string
  last_name: string
  position_id: string
  position_code: string
  position_name: string
  position_tone: ToneToken
  rank_id: string | null
  rank_name: string | null
  rank_level: number | null
  employment_status: EmploymentStatus
  date_hired: string
  phone: string | null
  email: string | null
  photo_path: string | null
  security_license_no: string | null
  security_license_expiry: string | null
  license_expiring_soon: boolean
  current_deployment_id: string | null
  current_branch_id: string | null
  current_branch_name: string | null
  current_shift: ShiftType | null
  current_start_date: string | null
}

export type RecruitmentFunnelRow = {
  period_month: string
  position_id: string
  position_code: string
  position_name: string
  preferred_branch_id: string | null
  total: number
  pending: number
  screening: number
  interview: number
  hired: number
  rejected: number
  archived: number
  avg_days_to_decision: number | null
}

/* -------------------------------------------------------------------------- */
/* RPC payloads                                                                */
/* -------------------------------------------------------------------------- */

export type ApplicationStatusResult = {
  reference_no: string
  first_name: string
  last_name: string
  position_name: string
  status: ApplicantStatus
  submitted_at: string
  status_changed_at: string
  interview_at: string | null
  timeline: { status: ApplicantStatus; at: string }[]
}

/**
 * All `submit_application` gives back. Anonymous submitters have no read path
 * into `applicants`, so the receipt is deliberately just the two values the
 * confirmation screen and the upload step need.
 */
export type ApplicationReceipt = {
  id: string
  reference_no: string
}

/**
 * One row from `check_email_eligibility` (0023). `state` is 'available',
 * 'hired', or the existing application's status; `message` is the sentence to
 * show the applicant and is null only when they may proceed.
 */
export type EmailEligibility = {
  eligible: boolean
  state: string
  message: string | null
}

export type DashboardStats = {
  applicants: {
    total: number
    pending: number
    screening: number
    interview: number
    hired: number
    rejected: number
    new_this_month: number
  }
  personnel: {
    total: number
    active: number
    deployed: number
    license_expiring: number
  }
  branches: { total: number; active: number; vacancies: number }
  deployments: { active: number; ending_soon: number; new_this_month: number }
}

/* -------------------------------------------------------------------------- */
/* Database - the generic parameter for createClient<Database>()               */
/* -------------------------------------------------------------------------- */

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<ProfileRow, Omit<ProfileRow, 'created_at' | 'updated_at'>>
      roles: TableDef<RoleRow>
      permissions: TableDef<PermissionRow>
      role_permissions: TableDef<RolePermissionRow, RolePermissionRow>
      user_roles: TableDef<UserRoleRow, Omit<UserRoleRow, 'id' | 'granted_at'>>
      branches: TableDef<
        BranchRow,
        Omit<BranchRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      applicants: TableDef<
        ApplicantRow,
        Omit<
          ApplicantRow,
          | 'id'
          | 'reference_no'
          | 'created_at'
          | 'updated_at'
          | 'status_changed_at'
          | 'archived_at'
          | 'purge_after'
          | 'submission_id'
        > & { id?: string; reference_no?: string }
      >
      applicant_documents: TableDef<
        ApplicantDocumentRow,
        Omit<ApplicantDocumentRow, 'id' | 'created_at' | 'updated_at'> & {
          id?: string
        }
      >
      applicant_status_history: TableDef<ApplicantStatusHistoryRow>
      personnel: TableDef<
        PersonnelRow,
        Omit<PersonnelRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      deployments: TableDef<
        DeploymentRow,
        Omit<DeploymentRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      positions: TableDef<
        PositionRow,
        Omit<PositionRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      ranks: TableDef<
        RankRow,
        Omit<RankRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      position_ranks: TableDef<PositionRankRow, PositionRankRow>
      deployment_history: TableDef<DeploymentHistoryRow>
      audit_logs: TableDef<AuditLogRow>
      activity_logs: TableDef<ActivityLogRow, Omit<ActivityLogRow, 'id' | 'created_at'>>
      notifications: TableDef<NotificationRow>
      settings: TableDef<SettingRow>
      email_logs: TableDef<EmailLogRow>

      testimonials: TableDef<
        TestimonialRow,
        Omit<TestimonialRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      clients: TableDef<
        ClientRow,
        Omit<ClientRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      accreditations: TableDef<
        AccreditationRow,
        Omit<AccreditationRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      news_posts: TableDef<
        NewsPostRow,
        Omit<NewsPostRow, 'id' | 'created_at' | 'updated_at'> & { id?: string }
      >
      site_media: TableDef<
        SiteMediaRow,
        Omit<SiteMediaRow, 'created_at' | 'updated_at'>
      >
    }
    Views: {
      v_applicant_summary: { Row: ApplicantSummaryView; Relationships: [] }
      v_active_deployments: { Row: ActiveDeploymentView; Relationships: [] }
      v_branch_staffing: { Row: BranchStaffingView; Relationships: [] }
      v_personnel_roster: { Row: PersonnelRosterView; Relationships: [] }
      mv_recruitment_funnel: { Row: RecruitmentFunnelRow; Relationships: [] }
    }
    Functions: {
      check_application_status: {
        Args: { p_reference_no: string; p_last_name: string }
        Returns: ApplicationStatusResult[]
      }
      submit_application: {
        Args: { p_payload: Json; p_submission_id?: string | null }
        Returns: ApplicationReceipt[]
      }
      check_email_eligibility: {
        Args: { p_email: string }
        Returns: EmailEligibility[]
      }
      get_dashboard_stats: { Args: Record<string, never>; Returns: DashboardStats }
      promote_applicant_to_personnel: {
        Args: { p_applicant_id: string; p_date_hired?: string; p_rank_id?: string }
        Returns: PersonnelRow
      }
      separate_personnel: {
        Args: {
          p_personnel_id: string
          p_status: string
          p_date?: string
          p_note?: string | null
        }
        Returns: PersonnelRow
      }
      ranks_for_position: { Args: { p_position_id: string }; Returns: RankRow[] }
      end_deployment: {
        Args: { p_deployment_id: string; p_end_date?: string; p_reason?: string }
        Returns: DeploymentRow
      }
      transfer_deployment: {
        Args: {
          p_deployment_id: string
          p_target_branch: string
          p_effective_date?: string
          p_shift?: ShiftType
          p_reason?: string
        }
        Returns: DeploymentRow
      }
      mark_all_notifications_read: {
        Args: Record<string, never>
        Returns: number
      }
      has_permission: { Args: { p_key: string }; Returns: boolean }
      my_permissions: { Args: Record<string, never>; Returns: string[] }
      refresh_analytics: { Args: Record<string, never>; Returns: void }
    }
    Enums: {
      app_role: AppRole
      applicant_status: ApplicantStatus
      employment_status: EmploymentStatus
      deployment_status: DeploymentStatus
      shift_type: ShiftType
      document_type: DocumentType
      notification_type: NotificationType
      civil_status: CivilStatus
      sex_type: SexType
      audit_action: AuditAction
    }
    CompositeTypes: Record<string, never>
  }
}
