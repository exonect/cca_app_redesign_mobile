import { RequireAccess } from '@/auth/RequireAccess'
import { RecipesScreen } from '@/features/recipes/RecipesScreen'

export default function RecipesRoute() {
  return <RequireAccess screen="recipes"><RecipesScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
