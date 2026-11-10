/**
 * Every URL that opens the app (com.thermex.app:// links, the Microsoft sign
 * in callback) passes here first. See src/auth/redirect.ts for the rules.
 */
import type { NativeIntent } from 'expo-router'

import { routeIncoming } from '@/auth/redirect'

export const redirectSystemPath: NonNullable<NativeIntent['redirectSystemPath']> = ({ path, initial }) => {
  try {
    return routeIncoming({ path, initial })
  } catch {
    // Never crash on a link: launch at My work, ignore it otherwise.
    return initial ? '/' : null
  }
}
