import type { ReactNode } from 'react'
import { View } from 'react-native'

import { useAuth } from '@/auth/AuthProvider'
import type { Role } from '@/shared/types'
import { Body } from '@/ui/kit'
import { color } from '@/ui/theme'

import { AdminHeader } from '@/features/admin/AdminGate'

/** Recipe master is for Admins and CTs (legacy menus); Sales Admins open a recipe only from a trial.
 * The server refuses others too. */
export function RecipesOnly({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useAuth()
  if (hasRole(...roles)) return <>{children}</>
  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <AdminHeader title="Recipe master" />
      <View style={{ padding: 16 }}><Body style={{ color: color.muted }}>Recipe master is for Admins and CTs. Ask your CCA Admin if you need access.</Body></View>
    </View>
  )
}
