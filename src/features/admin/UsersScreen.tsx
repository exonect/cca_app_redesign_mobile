import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from 'react-native'
import { z } from 'zod'

import { api, fieldErrors, type Page } from '@/api/client'
import { errorMessage, otherErrors } from '@/api/errors'
import { useLookups } from '@/api/hooks'
import { useAuth } from '@/auth/AuthProvider'
import type { Role, User } from '@/shared/types'
import type { UserWithManagerSource } from '@/shared/typesExt'
import { Banner, Body, Button, EmptyState, ErrorState, Field, Loading, Picker, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { usePaged } from '@/features/projects/api'
import { date, plural } from '@/features/projects/format'
import { useDebounced, useNotice, useRefresh } from '@/features/projects/hooks'
import { ConfirmSheet, Notice, Sheet } from '@/features/projects/Sheet'
import { DarkSegmented } from '@/features/projects/TabHeader'

import { AdminHeader } from './AdminGate'

export const ROLE_LABEL: Record<Role, string> = { SP: 'Sales Person', SAD: 'Sales Admin', CT: 'CT', AD: 'Admin' }
const ROLE_ORDER: Role[] = ['SP', 'CT', 'SAD', 'AD']
const ROLE_DESC: Record<Role, string> = {
  SP: 'Creates projects, requests CT support and sees their own projects and trials.',
  CT: 'Runs trials on projects assigned to them and keeps lab recipes.',
  SAD: 'Sees all projects, assigns CTs, marks projects completed and exports.',
  AD: 'Everything above, plus users, master data and recipe deletion.',
}

export function UsersScreen() {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  const [role, setRole] = useState<Role | ''>('')
  const [text, setText] = useState('')
  const search = useDebounced(text.trim(), 300)
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [toggling, setToggling] = useState<User | null>(null)
  const [notice, setNotice, clearNotice] = useNotice()

  const query = { search: search || undefined, role: role || undefined, is_active: status === 'active', ordering: 'first_name' }
  const list = usePaged<User>(['users', 'infinite', query], '/users/', query)
  const counts = useQuery({
    queryKey: ['users', 'counts'],
    queryFn: async () => {
      const [a, i] = await Promise.all([true, false].map((is_active) => api<Page<User>>('/users/', { query: { is_active, page_size: 1 } })))
      return { active: a.count, inactive: i.count }
    },
  })
  const { refreshing, onRefresh } = useRefresh(() => Promise.all([list.refetch(), counts.refetch()]))

  const toggle = useMutation({
    mutationFn: (u: User) => api<User>(`/users/${u.id}/`, { method: 'PATCH', body: { is_active: !u.is_active } }),
    onSuccess: (u) => {
      void qc.invalidateQueries({ queryKey: ['users'] })
      setToggling(null)
      setNotice(u.is_active ? `${u.full_name} reactivated` : `${u.full_name} deactivated`)
    },
  })

  return (
    <View style={{ flex: 1, backgroundColor: color.concrete }}>
      <AdminHeader title="Users" sub="Everyone signs in with their Thermax Microsoft account. Deactivated users keep their projects and trials."
        right={<Button title="Add user" variant="primary" onPress={() => setEditing('new')} style={{ flexGrow: 0, minHeight: 44 }} />}>
        <TextField accessibilityLabel="Search users" placeholder="Name, employee ID or email" value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} />
      </AdminHeader>

      <FlatList
        data={list.items}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage() }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Notice text={notice} onDone={clearNotice} />
            <View style={{ backgroundColor: color.ink, borderRadius: radius.card }}>
              <DarkSegmented label="User status" value={status} onChange={setStatus} options={[
                { value: 'active', label: `Active${counts.data ? ` ${counts.data.active}` : ''}` },
                { value: 'inactive', label: `Inactive${counts.data ? ` ${counts.data.inactive}` : ''}` },
              ]} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel="Filter by role">
              {([['', 'All roles'], ...ROLE_ORDER.map((r) => [r, ROLE_LABEL[r]])] as [Role | '', string][]).map(([value, label]) => {
                const on = value === role
                return (
                  <Pressable key={value || 'all'} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setRole(value)}
                    style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', borderWidth: on ? 0 : 1, borderColor: color.line, backgroundColor: on ? color.ink : color.surface }}>
                    <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? '#fff' : color.ink }}>{label}</Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            {list.isSuccess ? <Small>{plural(list.count, 'user')}</Small> : null}
          </View>
        }
        renderItem={({ item: u }) => (
          <View style={{ backgroundColor: u.is_active ? color.surface : color.head, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: 14, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Strong style={{ fontSize: 16, color: u.is_active ? color.ink : color.muted }}>{u.full_name}</Strong>
                <Small numberOfLines={1}>{u.email}</Small>
                <Small>{[ROLE_LABEL[u.role], u.region_name ?? 'All regions', `Emp ${u.emp_id}`].join(', ')}</Small>
                <Small>{u.manager_name ? `Manager ${u.manager_name}. ` : ''}Last sign in {u.last_login ? date(u.last_login) : 'never'}</Small>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Edit" onPress={() => setEditing(u)} accessibilityLabel={`Edit ${u.full_name}`} />
              {u.id !== me?.id ? (
                <Button title={u.is_active ? 'Deactivate' : 'Reactivate'} variant={u.is_active ? 'danger' : 'secondary'}
                  accessibilityLabel={`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.full_name}`} onPress={() => { toggle.reset(); setToggling(u) }} />
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          list.isLoading ? <Loading label="Loading users" />
            : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} />
              : search || role ? <EmptyState title="No users match" body="Check the spelling, or search by employee ID or email." />
                : status === 'inactive' ? <EmptyState title="No inactive users" body="Users you deactivate appear here. They keep their projects and trials, and can be reactivated." />
                  : <EmptyState title="No users yet" body="Add the people who will use CCA. They sign in with their Thermax Microsoft account." />
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={color.ink} accessibilityLabel="Loading more users" /> : list.isFetchNextPageError ? <ErrorState error={list.error} onRetry={() => { void list.fetchNextPage() }} /> : undefined}
      />

      <UserSheet key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id} user={editing} onClose={() => setEditing(null)} onDone={setNotice} />
      {toggling ? (
        <ConfirmSheet open danger={toggling.is_active} onClose={() => setToggling(null)}
          title={toggling.is_active ? `Deactivate ${toggling.full_name}?` : `Reactivate ${toggling.full_name}?`}
          body={toggling.is_active
            ? 'They will not be able to sign in. Their projects, trials and recipes stay as they are, and you can reactivate them at any time.'
            : 'They will be able to sign in again with their Thermax Microsoft account, with the same role.'}
          confirmLabel={toggling.is_active ? 'Deactivate' : 'Reactivate'} busy={toggle.isPending} error={toggle.error}
          onConfirm={() => toggle.mutate(toggling)} />
      ) : null}
    </View>
  )
}

/** Mirrors the server: email up to 254 and unique ignoring case (server), employee ID up to 20 and unique (server), names up to 150. */
export const userSchema = z.object({
  email: z.string().trim().toLowerCase().max(254, 'Use 254 characters or fewer.').email('Enter a full email address, for example name@thermaxglobal.com.'),
  // Legacy user form: first name, last name and employee ID required, at least 3 characters each.
  emp_id: z.string().trim().min(1, 'Enter the employee ID.').min(3, 'The employee ID needs at least 3 characters.').max(20, 'Use 20 characters or fewer.'),
  first_name: z.string().trim().min(1, 'Enter the first name.').min(3, 'The first name needs at least 3 characters.').max(150, 'Use 150 characters or fewer.'),
  last_name: z.string().trim().min(1, 'Enter the last name.').min(3, 'The last name needs at least 3 characters.').max(150, 'Use 150 characters or fewer.'),
  role: z.enum(['SP', 'CT', 'SAD', 'AD']),
  region: z.string(),
  manager: z.string(),
})
const schema = userSchema
type Form = z.infer<typeof schema>
type Key = keyof Form
const FIELDS = Object.keys(schema.shape) as Key[]

/** Where the manager comes from, read only (the web admin can switch back to Entra ID). */
export function managerSourceNote(u: UserWithManagerSource): string | null {
  const entraOnly = u.entra_manager_email ? ` Entra ID lists ${u.entra_manager_email}, who is not a CCA user.` : ''
  switch (u.manager_source) {
    case 'app': return 'Set in CCA by an Admin. Entra ID does not change it.'
    case 'entra': return 'From Entra ID, updated when they sign in and every night. Choosing a manager here sets it in CCA instead.'
    case 'none': return `No manager in CCA or Entra ID.${entraOnly}`
    default: return null
  }
}

function UserSheet({ user, onClose, onDone }: { user: User | 'new' | null; onClose: () => void; onDone: (msg: string) => void }) {
  const existing = user && user !== 'new' ? user as UserWithManagerSource : null
  const initialManager = existing?.manager ? String(existing.manager) : ''
  const { user: me } = useAuth()
  // The server refuses an Admin changing their own role or deactivating themselves.
  const isSelf = !!existing && existing.id === me?.id
  const qc = useQueryClient()
  const regions = useLookups('region')
  const managers = useQuery({
    queryKey: ['users', 'managers'],
    queryFn: () => api<Page<User>>('/users/', { query: { is_active: true, page_size: 200 } }),
    enabled: user !== null,
  })
  const [v, setV] = useState<Form>({
    email: existing?.email ?? '', emp_id: existing?.emp_id ?? '', first_name: existing?.first_name ?? '', last_name: existing?.last_name ?? '',
    role: existing?.role ?? 'SP', region: existing?.region ? String(existing.region) : '', manager: existing?.manager ? String(existing.manager) : '',
  })
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({})
  const [formError, setFormError] = useState<string>()
  const set = <K extends Key>(k: K, x: Form[K]) => { setV((s) => ({ ...s, [k]: x })); setErrors((e) => ({ ...e, [k]: undefined })) }

  const save = useMutation({
    mutationFn: (f: Form) => {
      const { role, manager, ...rest } = f
      // Sending manager makes it an app setting (overriding Entra ID), so it is only sent when it changed.
      const managerPart = !existing || manager !== initialManager ? { manager: manager ? Number(manager) : null } : {}
      const body = { ...rest, ...(isSelf ? {} : { role }), region: f.region ? Number(f.region) : null, ...managerPart }
      return existing ? api<User>(`/users/${existing.id}/`, { method: 'PATCH', body }) : api<User>('/users/', { method: 'POST', body })
    },
    onSuccess: (u) => { void qc.invalidateQueries({ queryKey: ['users'] }); onDone(existing ? `${u.full_name} saved` : `${u.full_name} added`); onClose() },
    onError: (e) => {
      const f = fieldErrors(e)
      const mapped = Object.fromEntries(Object.entries(f).filter(([k]) => (FIELDS as string[]).includes(k)))
      setErrors(mapped)
      const other = otherErrors(f, FIELDS)
      setFormError(other[0] ?? (Object.keys(mapped).length ? undefined : errorMessage(e, 'The user could not be saved. Try again.')))
    },
  })
  const submit = () => {
    setFormError(undefined)
    const r = schema.safeParse(v)
    if (!r.success) {
      const e: Partial<Record<Key, string>> = {}
      for (const i of r.error.issues) e[String(i.path[0]) as Key] ??= i.message
      setErrors(e)
      return
    }
    save.mutate(r.data)
  }
  const managerOptions = (managers.data?.results ?? []).filter((m) => m.id !== existing?.id).map((m) => ({ value: String(m.id), label: `${m.full_name}, ${ROLE_LABEL[m.role]}` }))
  if (existing?.manager && !managerOptions.some((m) => m.value === String(existing.manager))) managerOptions.push({ value: String(existing.manager), label: existing.manager_name ?? 'Current manager' })

  return (
    <Sheet open={user !== null} onClose={onClose} title={existing ? `Edit ${existing.full_name}` : 'Add user'} tall
      footer={<>
        <Button title="Cancel" onPress={onClose} />
        <Button title={existing ? 'Save user' : 'Add user'} variant="primary" busy={save.isPending} onPress={submit} />
      </>}>
      <Banner>No password is set here. The person signs in with their Thermax Microsoft account and gets access once you add them.</Banner>
      {formError ? <Banner tone="error">{formError}</Banner> : null}
      <Field label="Thermax email" required error={errors.email}>
        <TextField accessibilityLabel="Thermax email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} invalid={Boolean(errors.email)} maxLength={254}
          value={v.email} onChangeText={(t) => set('email', t)} />
      </Field>
      <Field label="First name" required error={errors.first_name}>
        <TextField accessibilityLabel="First name" invalid={Boolean(errors.first_name)} maxLength={150} value={v.first_name} onChangeText={(t) => set('first_name', t)} />
      </Field>
      <Field label="Last name" required error={errors.last_name}>
        <TextField accessibilityLabel="Last name" maxLength={150} invalid={Boolean(errors.last_name)} value={v.last_name} onChangeText={(t) => set('last_name', t)} />
      </Field>
      <Field label="Employee ID" required error={errors.emp_id}>
        <TextField accessibilityLabel="Employee ID" autoCapitalize="characters" invalid={Boolean(errors.emp_id)} maxLength={20} value={v.emp_id} onChangeText={(t) => set('emp_id', t)} />
      </Field>
      <Field label="Role" error={errors.role} hint={isSelf ? 'You cannot change your own role. Ask another Admin.' : undefined}>
        {isSelf ? (
          <TextField accessibilityLabel="Role, cannot be changed on your own account" value={ROLE_LABEL[v.role]} editable={false} />
        ) : (
        <View accessibilityRole="radiogroup" accessibilityLabel="Role" style={{ gap: 8 }}>
          {ROLE_ORDER.map((r) => {
            const on = v.role === r
            return (
              <Pressable key={r} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${ROLE_LABEL[r]}. ${ROLE_DESC[r]}`} onPress={() => set('role', r)}
                style={{ flexDirection: 'row', gap: 12, padding: on ? 11 : 12, borderRadius: radius.field, borderWidth: on ? 2 : 1, borderColor: on ? color.ink : color.field, backgroundColor: on ? color.head : color.surface }}>
                <View style={{ width: 20, height: 20, marginTop: 2, borderRadius: 10, borderWidth: 2, borderColor: on ? color.ink : color.muted, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.ink }} /> : null}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Strong>{ROLE_LABEL[r]}</Strong>
                  <Small>{ROLE_DESC[r]}</Small>
                </View>
              </Pressable>
            )
          })}
        </View>
        )}
      </Field>
      <Field label="Region" error={errors.region} hint="Leave empty for all regions.">
        <Picker label="Region" value={v.region || null} placeholder={regions.isLoading ? 'Loading…' : 'All regions'}
          options={[{ value: '', label: 'All regions' }, ...(regions.data ?? []).map((r) => ({ value: String(r.id), label: r.value }))]}
          onChange={(x) => set('region', x ?? '')} />
      </Field>
      <Field label="Manager" error={errors.manager} hint="Managers also see their team's projects.">
        <Picker label="Manager" value={v.manager || null} placeholder={managers.isLoading ? 'Loading…' : 'No manager'}
          options={[{ value: '', label: 'No manager' }, ...managerOptions]} onChange={(x) => set('manager', x ?? '')} />
      </Field>
      {existing && managerSourceNote(existing) ? (
        <Small>{`Manager source: ${managerSourceNote(existing)}`}</Small>
      ) : null}
      <Body style={{ color: color.muted, fontSize: 13 }}>Only an Admin can change a role later.</Body>
    </Sheet>
  )
}
