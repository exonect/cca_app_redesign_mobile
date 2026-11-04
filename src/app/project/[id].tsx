import { useLocalSearchParams } from 'expo-router'

import { ProjectScreen } from '@/features/projects/ProjectScreen'

export default function ProjectRoute() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <ProjectScreen key={id} id={id} />
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
