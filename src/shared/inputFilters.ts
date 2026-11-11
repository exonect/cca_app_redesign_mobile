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
