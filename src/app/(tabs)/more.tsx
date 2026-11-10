import { RequireAccess } from '@/auth/RequireAccess'
import { MoreScreen } from '@/features/more/MoreScreen'

export default function More() {
  return <RequireAccess screen="more"><MoreScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
