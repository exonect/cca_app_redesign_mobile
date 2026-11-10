import { safeTarget } from '@/auth/redirect'

/** Map a notification link (web paths) to an app route, through the same
 * rules as links from outside (src/auth/redirect.ts).
 * /projects/<id> -> /project/<id>; /projects/<id>/trials/<tid> -> /trial/<tid>.
 * Null when the link names no screen of the app. */
export function appRoute(link: string | null | undefined, trialId?: string | null): string | null {
  const route = safeTarget(link)
  if (route && route !== '/') return route
  if (trialId) return safeTarget(`/trial/${trialId}`)
  return null
}
