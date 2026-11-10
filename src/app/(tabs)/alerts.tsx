import { RequireAccess } from '@/auth/RequireAccess'
import { AlertsScreen } from '@/features/alerts/AlertsScreen'

export default function Alerts() {
  return <RequireAccess screen="alerts"><AlertsScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
