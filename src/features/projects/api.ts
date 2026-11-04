/** Projects data access: query keys, queries, paging and cache updates. Shared by My work and Search. */
import { useInfiniteQuery, useQuery, type QueryClient } from '@tanstack/react-query'

import { api, type Page, type Query } from '@/api/client'
import type { Pipeline, Project, ProjectEvent, ProjectListItem, TrialListItem, User } from '@/shared/types'

export const PAGE_SIZE = 25

export const projectKeys = {
  list: (q: Query) => ['projects', 'list', q] as const,
  infinite: (q: Query) => ['projects', 'infinite', q] as const,
  pipeline: (q: Query) => ['projects', 'pipeline', q] as const,
  detail: (id: string) => ['project', id] as const,
  events: (id: string) => ['project', id, 'events'] as const,
  trials: (id: string) => ['trials', 'list', { project: id }] as const,
}

export function useProjects(query: Query, enabled = true) {
  return useQuery({
    queryKey: projectKeys.list(query),
    queryFn: () => api<Page<ProjectListItem>>('/projects/', { query }),
    enabled,
  })
}

/** A DRF page list loaded page by page as the user scrolls. */
export function usePaged<T>(key: readonly unknown[], path: string, query: Query, enabled = true) {
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api<Page<T>>(path, { query: { ...query, page: pageParam, page_size: query.page_size ?? PAGE_SIZE } }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.next ? all.length + 1 : undefined),
    enabled,
  })
  const items = q.data?.pages.flatMap((p) => p.results) ?? []
  const count = q.data?.pages[0]?.count ?? 0
  return { ...q, items, count }
}

export function useProjectPages(query: Query) {
  return usePaged<ProjectListItem>(projectKeys.infinite(query), '/projects/', query)
}

export function usePipeline(query: Query = {}) {
  return useQuery({ queryKey: projectKeys.pipeline(query), queryFn: () => api<Pipeline>('/projects/pipeline/', { query }) })
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? ''),
    queryFn: () => api<Project>(`/projects/${id}/`),
    enabled: Boolean(id),
  })
}

export function useProjectEvents(id: string) {
  return useQuery({ queryKey: projectKeys.events(id), queryFn: () => api<ProjectEvent[]>(`/projects/${id}/events/`) })
}

export function useProjectTrials(id: string) {
  return useQuery({
    queryKey: projectKeys.trials(id),
    queryFn: () => api<Page<TrialListItem>>('/trials/', { query: { project: id, page_size: 100, ordering: '-created_at' } }),
  })
}

/** Active Sales Persons, for Admins and Sales Admins choosing a project owner. */
export function useSalesPersons(enabled: boolean) {
  return useQuery({ queryKey: ['users', 'sales'], queryFn: () => api<User[]>('/users/sales/'), enabled, staleTime: 5 * 60_000 })
}

/** After any project change: lists, pipeline, the project, its timeline and trial lists. */
export function invalidateProject(qc: QueryClient, id?: string) {
  void qc.invalidateQueries({ queryKey: ['projects'] })
  void qc.invalidateQueries({ queryKey: ['trials'] })
  if (id) void qc.invalidateQueries({ queryKey: ['project', id] })
}

export function storeProject(qc: QueryClient, p: Project) {
  qc.setQueryData(projectKeys.detail(p.id), p)
  invalidateProject(qc, p.id)
}
