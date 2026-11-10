import { RequireAccess } from '@/auth/RequireAccess'
import { MyWorkScreen } from '@/features/home/MyWorkScreen'

export default function MyWork() {
  return <RequireAccess screen="home"><MyWorkScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
