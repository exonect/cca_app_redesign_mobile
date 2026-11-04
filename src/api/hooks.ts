import { useQuery } from '@tanstack/react-query'

import type { Lookup, Recipe, User } from '@/shared/types'

import { api } from './client'

/** Query options shared by the hooks and the offline warm up, so both use the same keys. */
export const lookupsQuery = (category: string, parent?: number | null) => ({
  queryKey: ['lookups', category, parent ?? null] as const,
  queryFn: () => api<Lookup[]>('/lookups/', { query: { category, parent: parent ?? undefined } }),
  staleTime: 10 * 60_000,
})

export const productsQuery = () => ({
  queryKey: ['recipes', 'products'] as const,
  queryFn: () => api<{ id: number; label: string; family: Recipe['family'] }[]>('/recipes/products/'),
  staleTime: 5 * 60_000,
})

export type GradingLimit = { id: number; standard: string; nominal_size_mm: string; sieve: string; lower: string; upper: string }
export const gradingLimitsQuery = () => ({
  queryKey: ['grading-limits', 'IS 383', '20'] as const,
  queryFn: () => api<GradingLimit[]>('/grading-limits/', { query: { standard: 'IS 383', nominal_size_mm: '20' } }),
  staleTime: 30 * 60_000,
})

export function useLookups(category: string, opts: { parent?: number | null } = {}) {
  return useQuery({ ...lookupsQuery(category, opts.parent), enabled: opts.parent !== null })
}

export const toOptions = (rows?: Lookup[]) => (rows ?? []).map((l) => ({ value: l.id, label: l.value }))

export function useProducts() {
  return useQuery(productsQuery())
}

export function useTechnicalUsers() {
  return useQuery({ queryKey: ['users', 'technical'], queryFn: () => api<(User & { open_trials: number })[]>('/users/technical/') })
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api<{ unread: number }>('/notifications/unread-count/'),
    refetchInterval: 60_000,
    enabled,
  })
}
