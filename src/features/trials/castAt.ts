/**
 * Trial date and time entry without a native date picker: the person types
 * the date as dd/mm/yyyy and the time as hh:mm (24 hour), or uses the day
 * step and Now buttons. Everything is in IST (fixed +05:30, no daylight
 * saving), so the conversion is plain arithmetic and needs no Intl support.
 */
const IST_MS = 330 * 60_000
const pad = (n: number) => String(n).padStart(2, '0')

export type CastParts = { date: string; time: string }

/** ISO instant -> IST "dd/mm/yyyy" and "hh:mm". */
export function castParts(iso: string | null | undefined): CastParts {
  if (!iso) return { date: '', time: '' }
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return { date: '', time: '' }
  const d = new Date(t + IST_MS)
  return {
    date: `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  }
}

export const nowParts = (now = new Date()): CastParts => castParts(now.toISOString())

type Ymd = { y: number; m: number; d: number }

function parseDate(text: string): Ymd | 'format' | 'invalid' {
  const m = /^\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})\s*$/.exec(text)
  if (!m) return 'format'
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (y < 2000 || y > 2100 || probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return 'invalid'
  return { y, m: mo, d }
}

function parseTime(text: string): { h: number; mi: number } | null {
  const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*$/.exec(text)
  if (!m) return null
  const [h, mi] = [Number(m[1]), Number(m[2])]
  return h < 24 && mi < 60 ? { h, mi } : null
}

export const CAST_ERRORS = {
  dateFormat: 'Enter the date as dd/mm/yyyy, for example 04/11/2026.',
  dateInvalid: 'That date does not exist. Check the day, month and year.',
  timeFormat: 'Enter the time as hh:mm in 24 hour format, for example 14:30.',
  needTime: 'Enter the time as well as the date.',
  needDate: 'Enter the date as well as the time.',
  future: 'The trial date cannot be in the future.',
  cleared: 'The trial date and time is needed once the trial has started.',
} as const

/** Today in IST as yyyy-mm-dd. */
export function istToday(now = new Date()) {
  const n = new Date(now.getTime() + IST_MS)
  return `${n.getUTCFullYear()}-${pad(n.getUTCMonth() + 1)}-${pad(n.getUTCDate())}`
}

/** True when the typed date (dd/mm/yyyy) is after today in IST. The server
 * compares days only, so a later time today is fine. */
export function isFutureDay(date: string, now = new Date()) {
  const d = parseDate(date)
  if (typeof d !== 'object') return false
  return `${d.y}-${pad(d.m)}-${pad(d.d)}` > istToday(now)
}

/**
 * Typed date and time -> ISO string with +05:30 (what the API stores), or
 * the problem to show. Both blank means "no trial date yet" (null).
 */
export function castIso(date: string, time: string): { iso: string | null; error: string | null } {
  const hasDate = date.trim() !== ''
  const hasTime = time.trim() !== ''
  if (!hasDate && !hasTime) return { iso: null, error: null }
  if (!hasDate) return { iso: null, error: CAST_ERRORS.needDate }
  const d = parseDate(date)
  if (d === 'format') return { iso: null, error: CAST_ERRORS.dateFormat }
  if (d === 'invalid') return { iso: null, error: CAST_ERRORS.dateInvalid }
  if (!hasTime) return { iso: null, error: CAST_ERRORS.needTime }
  const t = parseTime(time)
  if (!t) return { iso: null, error: CAST_ERRORS.timeFormat }
  return { iso: `${d.y}-${pad(d.m)}-${pad(d.d)}T${pad(t.h)}:${pad(t.mi)}:00+05:30`, error: null }
}

/** Typing mask for the number pad: digits become dd/mm/yyyy as they are typed. */
export function maskDate(text: string) {
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(text.trim())) return text.trim().replace(/[.-]/g, '/')
  const d = text.replace(/\D/g, '').slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join('/')
}

/** Typing mask for the number pad: digits become hh:mm. */
export function maskTime(text: string) {
  if (/^\d{1,2}[:.]\d{2}$/.test(text.trim())) return text.trim().replace('.', ':')
  const d = text.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d
}

/** A typed day (dd/mm/yyyy) as yyyy-mm-dd; '' when blank, else why it cannot be read. */
export function dayIso(text: string): string | 'format' | 'invalid' {
  if (text.trim() === '') return ''
  const d = parseDate(text)
  return typeof d === 'object' ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : d
}

/** yyyy-mm-dd as dd/mm/yyyy for typing; '' when blank or unreadable. */
export function dayText(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

/** Move the typed date by whole days; an empty or unreadable date starts from today (IST). */
export function shiftDay(date: string, days: number, now = new Date()): string {
  const parsed = parseDate(date)
  const base = typeof parsed === 'object'
    ? Date.UTC(parsed.y, parsed.m - 1, parsed.d)
    : Date.UTC(...((): [number, number, number] => { const n = new Date(now.getTime() + IST_MS); return [n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()] })())
  const d = new Date(base + (typeof parsed === 'object' ? days : 0) * 86_400_000)
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}
