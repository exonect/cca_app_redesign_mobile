/** Recipe list filters on the phone: status and created date (typed as dd/mm/yyyy). */

/** Typing mask for the number pad: digits become dd/mm/yyyy as they are typed. */
export function maskDate(text: string): string {
  const d = text.replace(/\D/g, '').slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 8)].filter(Boolean).join('/')
}

/** "04/11/2026" -> "2026-11-04"; "" -> ""; anything incomplete or impossible -> null. */
export function isoDate(text: string): string | null {
  const t = text.trim()
  if (!t) return ''
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const day = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)))
  if (day.getUTCFullYear() !== Number(yyyy) || day.getUTCMonth() !== Number(mm) - 1 || day.getUTCDate() !== Number(dd)) return null
  return `${yyyy}-${mm}-${dd}`
}

export type RecipeFilters = { search: string; family: string; status: string; from: string; to: string }

/** The list query: newest first (legacy), dates only once complete and valid. */
export function recipeQuery(f: RecipeFilters) {
  const from = isoDate(f.from)
  const to = isoDate(f.to)
  return {
    search: f.search || undefined, family: f.family || undefined, status: f.status || undefined,
    created_from: from || undefined, created_to: to || undefined, ordering: '-created_at',
  }
}
