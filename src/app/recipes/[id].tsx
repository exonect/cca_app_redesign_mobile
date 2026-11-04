import { useLocalSearchParams } from 'expo-router'

import { RecipeScreen } from '@/features/recipes/RecipeScreen'

/** Recipe detail and edit; "new" as the id adds a recipe. */
export default function RecipeRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <RecipeScreen key={id} id={id} />
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
