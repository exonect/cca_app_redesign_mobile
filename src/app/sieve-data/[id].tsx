import { RequireAccess } from '@/auth/RequireAccess'
import { SieveDataScreen } from '@/features/trials/SieveDataScreen'

export default function SieveDataRoute() {
  return <RequireAccess screen="sieve-data"><SieveDataScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
