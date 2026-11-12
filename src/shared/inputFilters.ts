/**
 * Keystroke and paste filters for number fields (UAT finding, 11 Nov 2026):
 * mobile number and SFDC number take digits only; project potential takes
 * digits and one decimal point. Whatever is typed or pasted, only the allowed
 * characters stay in the field. The server still checks every value.
 */

/** Digits only, cut to `max` characters. Leading zeros are kept (SFDC numbers have them). */
export function digitsOnly(value: string, max?: number): string {
  const digits = value.replace(/\D/g, '')
  return max === undefined ? digits : digits.slice(0, max)
}

/**
 * Digits and a single "." (a "," from a phone keypad counts as the point),
 * at most `intDigits` before it and `decimals` after it.
 */
export function decimalOnly(value: string, intDigits: number, decimals: number): string {
  const cleaned = value.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  if (dot === -1) return cleaned.slice(0, intDigits)
  const whole = cleaned.slice(0, dot).slice(0, intDigits)
  const fraction = cleaned.slice(dot + 1).replace(/\./g, '').slice(0, decimals)
  return `${whole || '0'}.${fraction}`
}

/** Mobile number: 10 digits. A pasted "+91" country code is dropped first. */
export const phoneFilter = (value: string) => digitsOnly(value.replace(/^\s*\+\s*91[\s-]*/, ''), 10)

/** SFDC number: 6 digits, leading zeros kept. */
export const sfdcFilter = (value: string) => digitsOnly(value, 6)

/** Project potential, ₹ crore: up to 8 digits and 4 decimals (the server's limit). */
export const potentialFilter = (value: string) => decimalOnly(value, 8, 4)

/**
 * Trial number fields (UAT, 12 Nov 2026): digits and one decimal point only, never a sign, letters or
 * symbols. Digits before and after the point follow the server's limits (TrialWriteSerializer, the JSON
 * field ranges and CubeRowSerializer); where the server sets no decimal limit, 4 places are kept.
 */
export const TRIAL_NUMBER = {
  retained: [7, 4], // sieve analysis, kg retained (up to 1,000,000)
  proportion: [3, 2], // sieve analysis, % (up to 100)
  batch_size: [3, 4], // m³
  dosage: [2, 2], // % of binder, up to 99.99
  ssd: [6, 4], // kg/m³ (up to 100,000)
  percent: [3, 4], // absorption and moisture, %
  fresh_density: [5, 4], // kg/m³
  site_temp: [3, 4], // °C
  cube_weight: [6, 4], // kg (some users type grams)
  cube_load: [6, 4], // kN
} as const satisfies Record<string, readonly [number, number]>
export type TrialNumberField = keyof typeof TRIAL_NUMBER

export function trialNumberFilter(field: TrialNumberField, value: string): string {
  const [whole, decimals] = TRIAL_NUMBER[field]
  return decimalOnly(value, whole, decimals)
}

/**
 * A person's name (Thermax R&D and Site QC in charge signatories): letters in any script and spaces, plus
 * "." and "'" for initials and names such as D'Souza. Digits and other symbols are dropped.
 */
export const nameFilter = (value: string) => value.replace(/[^\p{L}\p{M} .']/gu, '').replace(/ {2,}/g, ' ').replace(/^ +/, '')
