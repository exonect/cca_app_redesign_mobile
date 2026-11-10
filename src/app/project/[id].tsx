import { useLocalSearchParams } from 'expo-router'

import { RequireAccess } from '@/auth/RequireAccess'
import { ProjectScreen } from '@/features/projects/ProjectScreen'

export default function ProjectRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <RequireAccess screen="project"><ProjectScreen key={id} id={id} /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
