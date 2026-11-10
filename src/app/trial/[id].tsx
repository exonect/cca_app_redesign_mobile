import { RequireAccess } from '@/auth/RequireAccess'
import { TrialScreen } from '@/features/trials/TrialScreen'

export default function TrialRoute() {
  return <RequireAccess screen="trial"><TrialScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
