import { useLocalSearchParams } from 'expo-router'

import { RequireAccess } from '@/auth/RequireAccess'
import { ProjectFormScreen } from '@/features/projects/ProjectFormScreen'

/** New project, or edit one with ?id=. */
export default function ProjectFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  return (
    <RequireAccess screen={id ? 'project-edit' : 'project-new'}>
      <ProjectFormScreen key={id ?? 'new'} id={id || undefined} />
    </RequireAccess>
  )
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
