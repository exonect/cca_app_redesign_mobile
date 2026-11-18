/**
 * A project's workability requirement type. "Flow + slump" is the legacy master value "Flow+slump"
 * (UAT, 18 Nov 2026): the customer checks both, and each trial records one of them, slump or flow.
 * The same file is in the web app (src/lib/workability.ts).
 */
export type RequirementType = '' | 'slump' | 'flow' | 'flow_slump'

export const REQUIREMENT_TYPES = [
  { value: 'slump', label: 'Slump' }, { value: 'flow', label: 'Flow' }, { value: 'flow_slump', label: 'Flow + slump' },
] as const

/** A target of 300 mm or more is a flow (the same rule the legacy import uses). */
export const FLOW_FROM_MM = 300

export function requirementLabel(type: string | undefined): string {
  return REQUIREMENT_TYPES.find((t) => t.value === type)?.label ?? ''
}

/** What trials check, in a sentence: "slump", "flow" or "slump or flow". */
export function workabilityNoun(type: string | undefined): string {
  return type === 'flow' ? 'flow' : type === 'flow_slump' ? 'slump or flow' : 'slump'
}

/** The test a new trial starts on: the project's type, or for Flow + slump the one its target suggests. */
export function defaultFreshTest(type: string | undefined, targetMm: unknown): 'slump' | 'flow' {
  if (type === 'slump' || type === 'flow') return type
  const mm = Number(targetMm)
  return type === 'flow_slump' && Number.isFinite(mm) && mm >= FLOW_FROM_MM ? 'flow' : 'slump'
}
