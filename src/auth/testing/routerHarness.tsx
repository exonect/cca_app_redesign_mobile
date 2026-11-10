/**
 * Test doubles for the routing tests (src/auth/*.test.tsx): feature screens
 * become stubs that record that they opened (standing in for their data
 * requests), and the session is a small store the tests drive. Not used by
 * the app.
 */
import { createElement, useEffect, useState, useSyncExternalStore } from 'react'
import { Pressable, Text, View } from 'react-native'

import type { Role, User } from '@/shared/types'

/** Screens that opened, in order: a refused screen must never appear here. */
export const opened: string[] = []

export function stubScreen(name: string) {
  const Stub = () => {
    opened.push(name)
    return createElement(Text, null, `SCREEN:${name}`)
  }
  Stub.displayName = `Stub(${name})`
  return Stub
}

type Status = 'loading' | 'unavailable' | 'signed_out' | 'signed_in'
type State = { status: Status; user: User | null; signOuts: number }
let state: State = { status: 'signed_out', user: null, signOuts: 0 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

export const userFor = (role: Role, id = { AD: 1, SAD: 2, SP: 3, CT: 4 }[role]): User => ({
  id, email: `${role.toLowerCase()}@thermaxglobal.com`, emp_id: `E${id}`, first_name: role, last_name: 'User', full_name: `${role} User`,
  role, role_label: role, region: null, region_name: null, manager: null, manager_name: null, is_active: true, last_login: null,
  manager_source: 'none', entra_manager_email: null,
} as User)

export const authDouble = {
  reset(status: Status = 'signed_out', role?: Role) {
    state = { status, user: role ? userFor(role) : null, signOuts: 0 }
    opened.length = 0
    emit()
  },
  signIn(role: Role) { state = { ...state, status: 'signed_in', user: userFor(role) }; emit() },
  /** Any way of ending the session: the More button, the server refusing it, signed out elsewhere. */
  end() { state = { ...state, status: 'signed_out', user: null, signOuts: state.signOuts + 1 }; emit() },
  set(status: Status) { state = { ...state, status }; emit() },
  get: () => state,
}

export function useAuthDouble() {
  const s = useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => state)
  return {
    ...s,
    error: null,
    offline: false,
    resume: async () => undefined,
    signOut: async () => authDouble.end(),
    hasRole: (...roles: Role[]) => Boolean(s.user && roles.includes(s.user.role)),
  }
}

/** Like the real offline runtime: the saved data comes back a moment after a person signs in. */
export function useOfflineRuntimeDouble(_qc: unknown, user: User | null) {
  const id = user?.id ?? null
  const [readyFor, setReadyFor] = useState<number | null>(null)
  useEffect(() => {
    if (id === null) return
    const t = setTimeout(() => setReadyFor(id), 0)
    return () => clearTimeout(t)
  }, [id])
  return id === null || readyFor === id
}

/** The sign in screen: one button per role. */
export function SignInDouble() {
  opened.push('SignIn')
  return createElement(View, null, createElement(Text, null, 'SCREEN:SignIn'),
    ...(['AD', 'SAD', 'SP', 'CT'] as Role[]).map((r) => createElement(Pressable, { key: r, accessibilityRole: 'button', accessibilityLabel: `Sign in as ${r}`, onPress: () => authDouble.signIn(r) })))
}
