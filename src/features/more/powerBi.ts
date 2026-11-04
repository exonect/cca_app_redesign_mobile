import Constants from 'expo-constants'

/**
 * Address of the CCA Power BI report (legacy mobile "Power BI" screen, for
 * Admins), from EXPO_PUBLIC_POWERBI_URL at build time; the env templates
 * carry the old report. Only an https address is used.
 */
export function powerBiUrl(raw: unknown = Constants.expoConfig?.extra?.powerBiUrl) {
  const url = typeof raw === 'string' ? raw.trim() : ''
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null
}
