/**
 * Hand over a recipe made with "New formulation" from the recipe form back to
 * the trial's mix step that opened it (legacy: the new formulation becomes
 * the trial's product). The mix step stays mounted under the recipe screen,
 * so it listens; on mount it also takes anything left for its trial.
 */
const picked = new Map<string, number>()
const listeners = new Set<() => void>()

export function pickNewFormulation(trialId: string, recipeId: number) {
  picked.set(trialId, recipeId)
  listeners.forEach((l) => l())
}

/** The recipe made for this trial, once (null when there is none). */
export function takeNewFormulation(trialId: string): number | null {
  const id = picked.get(trialId)
  picked.delete(trialId)
  return id ?? null
}

export function onNewFormulation(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
