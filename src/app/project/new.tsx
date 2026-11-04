import { useLocalSearchParams } from 'expo-router'

import { ProjectFormScreen } from '@/features/projects/ProjectFormScreen'

/** New project, or edit one with ?id=. */
export default function ProjectFormRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  return <ProjectFormScreen key={id ?? 'new'} id={id || undefined} />
}
