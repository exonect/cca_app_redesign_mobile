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
  /** Where the manager comes from: set by an Admin in CCA ("app", wins), taken from Entra ID, or none. */
  manager_source: ManagerSource
  /** The Entra ID manager's email when that person is not a CCA user (so `manager` stays empty). */
  entra_manager_email: string | null
}

export type ManagerSource = 'app' | 'entra' | 'none'

/**
 * The record's current value for a flag that covers a whole object, null for a flag on one value:
 * trial `proportions` {material: percent} (all four sieve materials, null when not entered),
 * recipe `components` {RM code: percent} (sorted, J000 balance last), project `cementitious_contents` [number].
 */
export type FlagValueJson = Record<string, string | number | null> | (string | number | null)[] | null

/** An open data flag as embedded in project, trial and recipe detail responses. */
export type FlagBrief = {
  id: number; field: string; field_label: string; value: string; reason: string
  /** Structured value of an object flag (see FlagValueJson); correct such a flag by sending the same shape. */
  value_json?: FlagValueJson
  /** Plain labels per key of value_json ({"river_sand": "River sand"}, {"J000": "J000 (balance)"}), null for lists and scalars. */
  value_labels?: Record<string, string> | null
}
export type FlagTarget = 'project' | 'trial' | 'recipe'
export type FlagStatus = 'open' | 'accepted' | 'corrected'

/** A value that breaks the current validation rules (from the legacy import or a check), as listed by /data-flags/. */
export type DataFlag = FlagBrief & {
  target: FlagTarget; object_id: string; record_label: string; project_id: string | null; trial_id: string | null
  status: FlagStatus; note: string; created_at: string; resolved_by: Person | null; resolved_at: string | null
}

export type DataFlagSummary = { open: number; by_target: Partial<Record<FlagTarget, number>> }

export type ProjectStatus =
  | 'draft' | 'created' | 'support_requested' | 'assigned_to_ct' | 'trial_in_progress' | 'trials_closed' | 'completed'

export type ProjectActions = {
  edit: boolean; submit: boolean; request_support: boolean; assign_ct: boolean; start_trial: boolean
  complete: boolean; reopen: boolean; delete: boolean
}

export type ProjectListItem = {
  id: string; status: ProjectStatus; status_label: string; project_name: string; customer_name: string
  sfdc_no: string; region: Ref | null; city: Ref | null; sales_person: Person | null; ct: Person | null
  trial_count: number; potential_cr: string | null; created_at: string; updated_at: string
}

export type Project = ProjectListItem & {
  contact_person_name: string; contact_email: string; contact_phone: string; selling_basic_price: string | null
  bulk_and_barrel: string | null; remarks: string
  cement_brands: Ref[]; cement_grades: Ref[]; mineral_admixtures: Ref[]; grades_of_concrete: Ref[]
  wc_ratios_ssd: Ref[]; compressive_strengths: Ref[]; wc_ratio_corrected: Ref | null; cementitious_contents: number[]
  requirement_type: '' | 'slump' | 'flow'; retention_time: Ref | null; slump_flow: Ref | null; strength_age: Ref | null
  sand_type: Ref | null; fine_aggregate_source: Ref | null; coarse_aggregate_source: Ref | null; sand_zone: Ref | null
  admixture_base: Ref | null; created_at: string; created_by: Person | null; actions: ProjectActions
  /** Open data flags on this project (detail responses). */
  flags?: FlagBrief[]
}

export type ProjectEvent = {
  id: number; kind: string; kind_label: string; actor: Person | null; from_status: string; to_status: string
  note: string; data: Record<string, unknown>; created_at: string
}

/** Dashboard trial figures (legacy tiles): `trials` non draft, `total` closed with a conclusion (the % base). */
export type TrialSummary = { trials: number; total: number; met: number; below: number; open: number; met_percent: number; below_percent: number }
export type Pipeline = {
  stages: { status: ProjectStatus; label: string; count: number }[]; projects: number; potential_cr: string | number
  /** Trials on the same filtered projects (absent on servers before the parity release). */
  trial_summary?: TrialSummary
}

export type TrialStatus = 'draft' | 'in_progress' | 'closed'
export type Outcome = '' | 'met' | 'below'

export type TrialListItem = {
  id: string; code: string | null; project: string; project_name: string; customer_name: string
  status: TrialStatus; status_label: string; outcome: Outcome; outcome_label: string; product: string | null
  grade: string | null; cast_at: string | null; free_wc: string | null; strength_28d: string | null
  created_by_name: string | null; created_at: string; updated_at: string
}

export type SieveRow = { sieve: string; retained: string | number | null }
export type MaterialInput = { ssd?: string | number | null; absorption?: string | number | null; moisture?: string | number | null; source?: string; cement_type?: string
  /** The Mineral Admixture master name a mineral row was added under. */
  name?: string }

export type CheckStatus = 'met' | 'not_met' | 'pending'
export type TrialResults = {
  sieves: Record<string, { rows: { sieve: string; retained: string | null; cumulative_retained: string | null; cumulative_percent: string | null; passing_percent: string | null }[]; total: string; complete: boolean; fineness_modulus: string | null }>
  grading: { sieve: string; combined: string; lower: string | null; upper: string | null; within: boolean | null }[]
  mix: { lines: { material: string; ssd: string | null; absorption: string | null; moisture: string | null; difference: string | null; correction: string | null; design_adjusted: string | null; batch_weight: string | null }[]; total_ssd: string | null; total_adjusted: string | null; total_batch: string | null; free_wc: string | null; total_wc: string | null; cementitious: string | null } | null
  cubes: Record<string, { rows: { weight: string | null; load: string | null; strength: string | null }[]; average: string | null; due_at: string | null }>
  checks: { key: string; label: string; target: string; achieved: string | null; status: CheckStatus }[]
  errors: string[]
}

/** `delete`: Admin only, any status (legacy). `change_conclusion`: Admin or Sales Admin on a closed trial. */
export type TrialActions = {
  edit: boolean; start: boolean; close: boolean; edit_cubes: boolean; delete: boolean; attach: boolean; change_conclusion?: boolean
}
/** A field path ("dosage_1", "materials.cement.source", "cubes.28d.0.weight") and a plain message. */
export type FieldNote = { field: string; message: string }
/** Reading time of the fresh concrete table: "0" (initial) to "240" minutes. */
export type ReadingMinute = '0' | '30' | '60' | '90' | '120' | '150' | '180' | '210' | '240'
/** The project's sieve analysis without a trial (legacy "Add sieve data"); new trials start from it. */
export type SieveData = {
  project: string; sieves: Record<string, SieveRow[]>; proportions: Record<string, string | number>; source: string
  results: Pick<TrialResults, 'sieves' | 'grading' | 'errors'>; updated_at: string | null; updated_by: string | null; can_edit: boolean
}

export type Trial = TrialListItem & {
  grade_of_concrete: Ref | null; sieves: Record<string, SieveRow[]>; proportions: Record<string, string | number>
  batch_size: string | null; admixture_1: Ref | null; dosage_1: string | null; admixture_2: Ref | null; dosage_2: string | null
  materials: Record<string, MaterialInput>; fresh_test: '' | 'slump' | 'flow'; fresh_readings: Record<string, string | number | null>
  fresh_density: string | null; bleeding: Ref | null; setting: Ref | null
  /** SCC readings per time: {v_funnel|t500|l_box|u_box: {minutes: value}} (older data may hold one value per test). */
  scc: Record<string, Record<string, string | number | null> | string | number | null>
  /** Site temperature, °C. */
  site_temp?: string | null
  /** Where the sieve analysis of a new trial was copied from ("WEST202611123456-01", "the project's sieve data"), or "". */
  sieves_copied_from?: string
  /** Values outside the usual ranges, saved as entered (amber). */
  warnings?: FieldNote[]
  /** What the legacy app required before In progress that is still missing; Start refuses while any are listed. */
  completeness?: FieldNote[]
  remarks: string; signatory_sales: string; signatory_site_qc: string; signatory_rd: string
  /** PNG data URIs drawn on a phone or tablet. */
  signature_sales: string; signature_site_qc: string; signature_rd: string
  started_at: string | null; closed_at: string | null; results: TrialResults; cementitious_kg: string | null
  cube_sets: { age: string; age_label: string; cubes: { weight: string | null; load: string | null }[]; average: string | null; tested_on: string | null }[]
  attachments: {
    id: number; original_name: string; size: number; content_type: string; reading?: ReadingMinute | ''; uploaded_by: string; created_at: string
    /** Photos and videos are made smaller on the server: the size as uploaded (null for files never processed). */
    original_size?: number | null
    kind?: 'image' | 'video' | 'file'
    /** A thumbnail is at attachments/<id>/thumbnail/. */
    has_thumbnail?: boolean
    /** pending: a video being made smaller; failed: kept as uploaded. */
    processing?: '' | 'pending' | 'failed'
  }[]
  actions: TrialActions
  /** Open data flags on this trial (detail responses). */
  flags?: FlagBrief[]
}

export type Lookup = { id: number; category: string; category_label: string; value: string; parent: number | null; sort_order: number; is_active: boolean }

export type Recipe = {
  id: number; family: 'neutrol' | 'tecnos' | 'plastard' | 'other'; family_label: string; product_name: string; version: number
  label: string; formulation_name: string; sfdc_no: string; formulator: number | null; formulator_name: string | null
  location: number; location_name: string; customer_name: string; project_name: string; status: 'active' | 'on_hold'
  status_label: string; components: Record<string, string>; total: string; created_at: string; updated_at: string
  /** Used by a trial that is in progress or closed: only `status` can change; other changes go into a new version. */
  locked: boolean
  /** Number of in progress or closed trials that use this recipe. */
  trial_count: number
  /** Open data flags on this recipe (detail responses). */
  flags?: FlagBrief[]
}

export type Notification = {
  id: number; event: string; title: string; message: string; project: string | null; project_name: string | null
  trial_id: string | null; link: string; actor_name: string | null; is_read: boolean; read_at: string | null; created_at: string
}

export type SearchGroup = {
  product: string; family: string; recipe: number | null; trials: number; met: number; best_28d: string | null
  typical_dosage: string | null
  matches: {
    id: number; source: 'trial' | 'legacy'; trial: string | null; label: string; date: string | null; project: string; customer: string
    free_wc: string | null; cementitious: string | null; dosage: string | null; strength_28d: string | null
    /** True when the trial is outside the projects you can see: project, customer and trial are left out. */
    restricted?: boolean
  }[]
}
