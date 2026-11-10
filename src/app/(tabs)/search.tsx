import { RequireAccess } from '@/auth/RequireAccess'
import { SearchScreen } from '@/features/search/SearchScreen'

export default function Search() {
  return <RequireAccess screen="search"><SearchScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
