/**
 * Every screen opens through RequireAccess: a role the server would refuse
 * sees "no access" instead of the screen, so none of its requests fire. The
 * same views show a record the server answers 403 or 404 for.
 */
import { router } from 'expo-router'
import type { ReactNode } from 'react'

import { useAuth } from '@/auth/AuthProvider'
import { Body, Button, Header, Screen } from '@/ui/kit'
import { color } from '@/ui/theme'

import { canOpen, SCREEN_TITLE, type ScreenKey } from './access'

export const NO_ACCESS_TITLE = "You don't have access to this page"
export const NOT_FOUND_TITLE = 'Page not found'

function backOrHome() {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}

/** A screen or record this person may not open. */
export function NoAccess({ title, body }: { title?: string; body?: string }) {
  return (
    <Screen header={<Header title={title ?? 'No access'} back={{ label: 'back', onPress: backOrHome }} />}>
      <Body accessibilityRole="header" style={{ fontSize: 18 }}>{NO_ACCESS_TITLE}</Body>
      <Body style={{ color: color.muted }}>{body ?? 'Your role cannot open this. Ask your CCA Admin if you need access.'}</Body>
      <Button title="Go to My work" variant="primary" onPress={() => router.replace('/')} />
    </Screen>
  )
}

/** A link to something the app does not have, or a record that is gone or hidden. */
export function NotFound({ title, body }: { title?: string; body?: string }) {
  return (
    <Screen header={<Header title={title ?? NOT_FOUND_TITLE} back={{ label: 'back', onPress: backOrHome }} />}>
      {title ? <Body accessibilityRole="header" style={{ fontSize: 18 }}>{NOT_FOUND_TITLE}</Body> : null}
      <Body style={{ color: color.muted }}>{body ?? 'The link may be old or mistyped.'}</Body>
      <Button title="Go to My work" variant="primary" onPress={() => router.replace('/')} />
    </Screen>
  )
}

/** Record level: the server answered 404 (gone, or not yours to see) or 403. */
export function RecordUnavailable({ status, what }: { status: number | null; what: string }) {
  if (status === 403) return <NoAccess title={what} body={`You cannot open this ${what.toLowerCase()}. Ask your CCA Admin if you need access.`} />
  return <NotFound title={what} body={`This ${what.toLowerCase()} was not found. It may have been deleted, or you may not have access to it.`} />
}

export function RequireAccess({ screen, children }: { screen: ScreenKey; children: ReactNode }) {
  const { user } = useAuth()
  if (canOpen(user?.role, screen)) return <>{children}</>
  return <NoAccess title={SCREEN_TITLE[screen]} />
}
