import { RequireAccess } from '@/auth/RequireAccess'
import { UsersScreen } from '@/features/admin/UsersScreen'

export default function UsersRoute() {
  return <RequireAccess screen="users"><UsersScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
