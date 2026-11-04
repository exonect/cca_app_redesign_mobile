import { useLocalSearchParams } from 'expo-router'

import { RecipesOnly } from '@/features/recipes/RecipeGate'
import { RecipeScreen } from '@/features/recipes/RecipeScreen'

/** Recipe detail and edit; "new" as the id adds a recipe. Sales Admins reach these from a trial. */
export default function RecipeRoute() {
  const { id, for_trial, sfdc_no, customer_name, project_name } = useLocalSearchParams<{
    id: string; for_trial?: string; sfdc_no?: string; customer_name?: string; project_name?: string
  }>()
  // From a trial's "New formulation": prefilled from the project, back to the trial on save.
  return (
    <RecipesOnly roles={['AD', 'SAD', 'CT']}>
      <RecipeScreen key={id} id={id} forTrial={for_trial || undefined} prefill={for_trial ? { sfdc_no, customer_name, project_name } : undefined} />
    </RecipesOnly>
  )
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
