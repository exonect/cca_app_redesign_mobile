import { NotFound } from '@/auth/RequireAccess'

/** A link or path the app does not have (signed in only; signed out shows sign in). */
export default function NotFoundRoute() {
  return <NotFound />
}
