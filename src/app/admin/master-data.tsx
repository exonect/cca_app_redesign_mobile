import { RequireAccess } from '@/auth/RequireAccess'
import { MasterDataScreen } from '@/features/admin/MasterDataScreen'

export default function MasterDataRoute() {
  return <RequireAccess screen="master-data"><MasterDataScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
