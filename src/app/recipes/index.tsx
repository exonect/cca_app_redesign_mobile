import { RecipesOnly } from '@/features/recipes/RecipeGate'
import { RecipesScreen } from '@/features/recipes/RecipesScreen'

export default function RecipesRoute() {
  return <RecipesOnly roles={['AD', 'CT']}><RecipesScreen /></RecipesOnly>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
