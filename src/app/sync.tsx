import { RequireAccess } from '@/auth/RequireAccess'
import { SyncScreen } from '@/features/sync/SyncScreen'

export default function SyncRoute() {
  return <RequireAccess screen="sync"><SyncScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
