/**
 * Is the CCA server reachable? Two signals combined:
 *  - the phone's own network state (expo-network): no network, or a network
 *    the OS says has no internet, is offline;
 *  - what requests actually see: a request that could not reach the server
 *    at all marks the app offline until a later request (or a probe) gets
 *    any answer from the server, or the network changes.
 * The second catches site Wi-Fi without internet and dead mobile data that
 * the OS still calls connected. TanStack Query follows this state, so
 * queries pause (showing what is cached) instead of failing while offline.
 */
import { onlineManager } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

type Listener = () => void
const listeners = new Set<Listener>()

let network: boolean | null = null // null: not known yet, treated as online
let unreachable = false

function emit() {
  onlineManager.setOnline(isOnline())
  listeners.forEach((l) => l())
}

export function isOnline() {
  return network !== false && !unreachable
}

export function subscribe(l: Listener) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** From the phone's network state. A change of network clears the request based signal. */
export function setNetwork(state: { isConnected?: boolean; isInternetReachable?: boolean } | null) {
  const next = state ? state.isConnected !== false && state.isInternetReachable !== false : null
  if (next === network) return
  unreachable = false
  network = next
  emit()
}

/** Called by the API client after every request. */
export function reportRequest(reached: boolean) {
  const was = isOnline()
  unreachable = !reached
  if (was !== isOnline()) emit()
}

/** Whether the phone's own network state says there is no connection (so probing is pointless). */
export const networkDown = () => network === false

export function useOnline() {
  return useSyncExternalStore(subscribe, isOnline, isOnline)
}

/** Test helper: back to the initial state. */
export function resetConnectivity() {
  network = null
  unreachable = false
  emit()
}
