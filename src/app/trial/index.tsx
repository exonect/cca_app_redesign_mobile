import { RequireAccess } from '@/auth/RequireAccess'
import { TrialsListScreen } from '@/features/trials/TrialsListScreen'

export default function TrialsRoute() {
  return <RequireAccess screen="trials"><TrialsListScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
