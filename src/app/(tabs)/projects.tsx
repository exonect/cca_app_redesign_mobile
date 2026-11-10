import { RequireAccess } from '@/auth/RequireAccess'
import { ProjectsScreen } from '@/features/projects/ProjectsScreen'

export default function Projects() {
  return <RequireAccess screen="projects"><ProjectsScreen /></RequireAccess>
}

export { ScreenErrorBoundary as ErrorBoundary } from '@/ui/ErrorFallback'
