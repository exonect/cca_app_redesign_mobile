/** Response shapes as the CCA API returns them (lookups and people are
 * expanded to {id, value} and {id, name}). Generated request types for
 * every endpoint live in schema.d.ts. */

export type Role = 'AD' | 'SAD' | 'SP' | 'CT'
export type Ref = { id: number; value: string }
export type Person = { id: number; name: string }

export type User = {
  id: number; email: string; emp_id: string; first_name: string; last_name: string; full_name: string
  role: Role; role_label: string; region: number | null; region_name: string | null
  manager: number | null; manager_name: string | null; is_active: boolean; last_login: string | null
}

export type ProjectStatus =
  | 'draft' | 'created' | 'support_requested' | 'assigned_to_ct' | 'trial_in_progress' | 'trials_closed' | 'completed'

export type ProjectActions = {
  edit: boolean; submit: boolean; request_support: boolean; assign_ct: boolean; start_trial: boolean
  complete: boolean; reopen: boolean; delete: boolean
}

export type ProjectListItem = {
  id: string; status: ProjectStatus; status_label: string; project_name: string; customer_name: string
  sfdc_no: string; region: Ref | null; city: Ref | null; sales_person: Person | null; ct: Person | null
  trial_count: number; potential_cr: string | null; updated_at: string
}

export type Project = ProjectListItem & {
  contact_person_name: string; contact_email: string; contact_phone: string; selling_basic_price: string | null
  bulk_and_barrel: string | null; remarks: string
  cement_brands: Ref[]; cement_grades: Ref[]; mineral_admixtures: Ref[]; grades_of_concrete: Ref[]
  wc_ratios_ssd: Ref[]; compressive_strengths: Ref[]; wc_ratio_corrected: Ref | null; cementitious_contents: number[]
  requirement_type: '' | 'slump' | 'flow'; retention_time: Ref | null; slump_flow: Ref | null; strength_age: Ref | null
  sand_type: Ref | null; fine_aggregate_source: Ref | null; coarse_aggregate_source: Ref | null; sand_zone: Ref | null
  admixture_base: Ref | null; created_at: string; created_by: Person | null; actions: ProjectActions
}

export type ProjectEvent = {
  id: number; kind: string; kind_label: string; actor: Person | null; from_status: string; to_status: string
  note: string; data: Record<string, unknown>; created_at: string
}

export type Pipeline = { stages: { status: ProjectStatus; label: string; count: number }[]; projects: number; potential_cr: string | number }

export type TrialStatus = 'draft' | 'in_progress' | 'closed'
export type Outcome = '' | 'met' | 'below'

export type TrialListItem = {
  id: string; code: string | null; project: string; project_name: string; customer_name: string
  status: TrialStatus; status_label: string; outcome: Outcome; outcome_label: string; product: string | null
  grade: string | null; cast_at: string | null; free_wc: string | null; strength_28d: string | null
  created_by_name: string | null; created_at: string; updated_at: string
}

export type SieveRow = { sieve: string; retained: string | number | null }
export type MaterialInput = { ssd?: string | number | null; absorption?: string | number | null; moisture?: string | number | null; source?: string; cement_type?: string }

export type CheckStatus = 'met' | 'not_met' | 'pending'
export type TrialResults = {
  sieves: Record<string, { rows: { sieve: string; retained: string | null; cumulative_retained: string | null; cumulative_percent: string | null; passing_percent: string | null }[]; total: string; complete: boolean; fineness_modulus: string | null }>
  grading: { sieve: string; combined: string; lower: string | null; upper: string | null; within: boolean | null }[]
  mix: { lines: { material: string; ssd: string | null; absorption: string | null; moisture: string | null; difference: string | null; correction: string | null; design_adjusted: string | null; batch_weight: string | null }[]; total_ssd: string | null; total_adjusted: string | null; total_batch: string | null; free_wc: string | null; total_wc: string | null; cementitious: string | null } | null
  cubes: Record<string, { rows: { weight: string | null; load: string | null; strength: string | null }[]; average: string | null; due_at: string | null }>
  checks: { key: string; label: string; target: string; achieved: string | null; status: CheckStatus }[]
  errors: string[]
}

export type TrialActions = { edit: boolean; start: boolean; close: boolean; edit_cubes: boolean; delete: boolean; attach: boolean }

export type Trial = TrialListItem & {
  grade_of_concrete: Ref | null; sieves: Record<string, SieveRow[]>; proportions: Record<string, string | number>
  batch_size: string | null; admixture_1: Ref | null; dosage_1: string | null; admixture_2: Ref | null; dosage_2: string | null
  materials: Record<string, MaterialInput>; fresh_test: '' | 'slump' | 'flow'; fresh_readings: Record<string, string | number | null>
  fresh_density: string | null; bleeding: Ref | null; setting: Ref | null; scc: Record<string, string | number | null>
  remarks: string; signatory_sales: string; signatory_site_qc: string; signatory_rd: string
  /** PNG data URIs drawn on a phone or tablet. */
  signature_sales: string; signature_site_qc: string; signature_rd: string
  started_at: string | null; closed_at: string | null; results: TrialResults; cementitious_kg: string | null
  cube_sets: { age: string; age_label: string; cubes: { weight: string | null; load: string | null }[]; average: string | null; tested_on: string | null }[]
  attachments: { id: number; original_name: string; size: number; content_type: string; uploaded_by: string; created_at: string }[]
  actions: TrialActions
}

export type Lookup = { id: number; category: string; category_label: string; value: string; parent: number | null; sort_order: number; is_active: boolean }

export type Recipe = {
  id: number; family: 'neutrol' | 'tecnos' | 'plastard' | 'other'; family_label: string; product_name: string; version: number
  label: string; formulation_name: string; sfdc_no: string; formulator: number | null; formulator_name: string | null
  location: number; location_name: string; customer_name: string; project_name: string; status: 'active' | 'on_hold'
  status_label: string; components: Record<string, string>; total: string; created_at: string; updated_at: string
}

export type Notification = {
  id: number; event: string; title: string; message: string; project: string | null; project_name: string | null
  trial_id: string | null; link: string; actor_name: string | null; is_read: boolean; read_at: string | null; created_at: string
}

export type SearchGroup = {
  product: string; family: string; recipe: number | null; trials: number; met: number; best_28d: string | null
  typical_dosage: string | null
  matches: { id: number; source: 'trial' | 'legacy'; trial: string | null; label: string; date: string | null; project: string; customer: string; free_wc: string | null; cementitious: string | null; dosage: string | null; strength_28d: string | null }[]
}
