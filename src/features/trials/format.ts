/** Display helpers for the trial screens. Dates are always shown in IST. */
const TZ = 'Asia/Kolkata'

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: TZ })

/** "4 Nov 2026" */
export function date(value: string | Date | null | undefined) {
  if (!value) return ''
  return fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

/** "4 Nov" */
export function shortDate(value: string | Date | null | undefined) {
  if (!value) return ''
  return fmt({ day: 'numeric', month: 'short' }).format(new Date(value))
}

/** "4 Nov, 2:30 pm" */
export function shortDateTime(value: string | Date | null | undefined) {
  if (!value) return ''
  return `${shortDate(value)}, ${fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(value)).toLowerCase()}`
}

/** IST calendar day as YYYY-MM-DD, for "due today" comparisons. */
export function istDay(value: string | Date) {
  const d = new Date(new Date(value).getTime() + 330 * 60_000)
  return d.toISOString().slice(0, 10)
}

/** Whole numbers stay whole, others get two decimals. */
export function num(value: string | number | null | undefined, digits = 2) {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return Number.isInteger(n) ? String(n) : n.toFixed(digits)
}

export const fileSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
