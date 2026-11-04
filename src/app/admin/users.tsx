import { AdminOnly } from '@/features/admin/AdminGate'
import { UsersScreen } from '@/features/admin/UsersScreen'

export default function UsersRoute() {
  return <AdminOnly title="Users"><UsersScreen /></AdminOnly>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
