import { useLocalSearchParams } from 'expo-router'

import { RecipesOnly } from '@/features/recipes/RecipeGate'
import { RecipeScreen } from '@/features/recipes/RecipeScreen'

/** Recipe detail and edit; "new" as the id adds a recipe. Sales Admins reach these from a trial. */
export default function RecipeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <RecipesOnly roles={['AD', 'SAD', 'CT']}><RecipeScreen key={id} id={id} /></RecipesOnly>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
