/** Round 2 additions to the API shapes (recipe lock, manager source, data
 * flags, offline ids). src/shared/types.ts is a synced copy of the web
 * file, so mobile only additions live here. */
import type { Project, Recipe, Trial, User } from './types'

// --- Contract A: recipe lock --------------------------------------------------------
export type RecipeWithLock = Recipe & {
  /** Used by a trial that is in progress or closed: only is_active may change. */
  locked?: boolean
  /** Number of trials (not drafts) that use this recipe. */
  trial_count?: number
  flags?: RecordFlag[]
}

// --- Contract B: manager from the app or Entra ID ---------------------------------------
export type ManagerSource = 'app' | 'entra' | 'none'
export type UserWithManagerSource = User & {
  manager_source?: ManagerSource
  /** The Entra manager's email when that person is not a CCA user. */
  entra_manager_email?: string | null
}

// --- Contract C: flagged data ------------------------------------------------------------
export type FlagTarget = 'project' | 'trial' | 'recipe'
export type FlagStatus = 'open' | 'accepted' | 'corrected'
/** An open flag as listed on a project, trial or recipe detail response. */
export type RecordFlag = {
  id: number; field: string; field_label: string; value: string; reason: string
  /** For a flag on a whole object (proportions, a recipe composition, cementitious contents), its value; null for one value. */
  value_json?: Record<string, string | number | null> | (string | number)[] | null
  /** Plain labels per key of value_json ({"river_sand": "River sand"}), null for lists and single values. */
  value_labels?: Record<string, string> | null
}
/** What Correct sends: text for one value, an object or list for a whole object. */
export type CorrectedValue = string | Record<string, string> | string[]
export type DataFlag = RecordFlag & {
  target: FlagTarget; object_id: string; record_label: string; project_id: string | null; trial_id: string | null
  status: FlagStatus; note: string; created_at: string; resolved_by: { id: number; name: string } | null; resolved_at: string | null
}
export type FlagSummary = { open: number; by_target: Partial<Record<FlagTarget, number>> }

export type ProjectWithFlags = Project & { flags?: RecordFlag[] }

// --- Contract D: offline trials ------------------------------------------------------------
export type Attachment = Trial['attachments'][number] & { client_id?: string | null }
export type TrialWithFlags = Trial & { flags?: RecordFlag[] }
