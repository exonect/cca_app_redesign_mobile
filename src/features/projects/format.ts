/** Display formatting for the app screens. Every date shows in IST, the business time zone. */
const TZ = 'Asia/Kolkata'

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...o })
const valid = (v: string | Date | null | undefined): v is string | Date => Boolean(v) && !Number.isNaN(new Date(v as string).getTime())

/** "4 Nov 2026" */
export function date(v: string | Date | null | undefined) {
  return valid(v) ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(v)) : ''
}

/** "4 Nov" */
export function shortDate(v: string | Date | null | undefined) {
  return valid(v) ? fmt({ day: 'numeric', month: 'short' }).format(new Date(v)) : ''
}

/** "9:40 am" */
export function time(v: string | Date | null | undefined) {
  return valid(v) ? fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(v)).toLowerCase() : ''
}

export function dateTime(v: string | Date | null | undefined) {
  return valid(v) ? `${date(v)}, ${time(v)}` : ''
}

/** The IST calendar day as "YYYY-MM-DD", for "is it today" checks. */
export function istDay(v: string | Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(v))
}

export function relative(v: string | null | undefined, now = Date.now()) {
  if (!valid(v)) return ''
  const mins = Math.round((now - new Date(v).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days < 7 ? `${days} ${days === 1 ? 'day' : 'days'} ago` : date(v)
}

/** "6.75" -> "6.75", "6" -> "6", null -> "" */
export function num(v: string | number | null | undefined, digits = 2) {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return Number.isInteger(n) ? String(n) : n.toFixed(digits)
}

/** Project potential in Cr: like num, but a legacy potential with 3 or 4 decimals keeps them ("0.0025"). */
export function crore(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === '') return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return String(v)
  return Math.abs(Number(n.toFixed(2)) - n) < 1e-9 ? num(n) : String(Number(n.toFixed(4)))
}

export function initials(name: string | null | undefined) {
  return (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'CCA'
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
