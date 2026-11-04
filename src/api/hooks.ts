import { useQuery } from '@tanstack/react-query'

import type { Lookup, Recipe, User } from '@/shared/types'

import { api } from './client'

export function useLookups(category: string, opts: { parent?: number | null } = {}) {
  return useQuery({
    queryKey: ['lookups', category, opts.parent ?? null],
    queryFn: () => api<Lookup[]>('/lookups/', { query: { category, parent: opts.parent ?? undefined } }),
    staleTime: 10 * 60_000,
    enabled: opts.parent !== null,
  })
}

export const toOptions = (rows?: Lookup[]) => (rows ?? []).map((l) => ({ value: l.id, label: l.value }))

export function useProducts() {
  return useQuery({
    queryKey: ['recipes', 'products'],
    queryFn: () => api<{ id: number; label: string; family: Recipe['family'] }[]>('/recipes/products/'),
    staleTime: 5 * 60_000,
  })
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
