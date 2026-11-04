import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

import { api, ApiError } from '@/api/client'
import { useTechnicalUsers } from '@/api/hooks'
import type { Person, Project, Ref } from '@/shared/types'
import { Banner, Button, EmptyState, ErrorState, Field, Loading, Small, Strong, TextField } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { storeProject } from './api'
import { plural } from './format'
import { Sheet } from './Sheet'
import { Avatar } from './TabHeader'

export type AssignTarget = {
  id: string; project_name: string; customer_name: string; status: Project['status']
  city: Ref | null; sales_person: Person | null; ct: Person | null
}

/** Assign or change the CT. Remounts per project so choices start fresh. */
export function AssignCtSheet({ project, open, onClose, onDone }: { project: AssignTarget | null; open: boolean; onClose: () => void; onDone?: (msg: string) => void }) {
  return <Body_ key={open && project ? project.id : 'closed'} project={project} open={open} onClose={onClose} onDone={onDone} />
}

function Body_({ project, open, onClose, onDone }: { project: AssignTarget | null; open: boolean; onClose: () => void; onDone?: (msg: string) => void }) {
  const [search, setSearch] = useState('')
  const [chosen, setChosen] = useState<number | null>(project?.ct?.id ?? null)
  const [note, setNote] = useState('')
  const cts = useTechnicalUsers()
  const qc = useQueryClient()

  const assign = useMutation({
    mutationFn: () => api<Project>(`/projects/${project!.id}/assign-ct/`, { body: { ct: chosen, note } }),
    onSuccess: (p) => { storeProject(qc, p); void qc.invalidateQueries({ queryKey: ['users', 'technical'] }); onDone?.('CT assigned'); onClose() },
  })

  type Ct = { id: number; full_name: string; email: string; region_name: string | null; open_trials: number; active_projects?: number }
  const all = (cts.data ?? []) as Ct[]
  const q = search.trim().toLowerCase()
  const list = q ? all.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : all
  const picked = all.find((u) => u.id === chosen)
  const pickedName = picked?.full_name ?? (chosen && chosen === project?.ct?.id ? project.ct.name : '')
  const reassign = Boolean(project?.ct)
  const movesStatus = project && (project.status === 'created' || project.status === 'support_requested')
  const ctError = assign.error instanceof ApiError ? assign.error.fields.ct?.[0] : undefined

  return (
    <Sheet open={open} onClose={onClose} title={reassign ? 'Change the CT' : 'Assign a CT'} tall
      footer={<>
        <Button title="Cancel" onPress={onClose} />
        <Button title={pickedName ? `Assign ${pickedName.split(' ')[0]}` : 'Assign CT'} variant="primary" busy={assign.isPending}
          accessibilityLabel={pickedName ? `Assign ${pickedName}` : 'Assign CT'}
          disabled={!chosen || (reassign && chosen === project?.ct?.id)} onPress={() => assign.mutate()} />
      </>}>
      {project ? (
        <>
          <View style={{ backgroundColor: color.head, borderRadius: radius.field, padding: 12, gap: 2 }}>
            <Strong>{project.project_name || 'Untitled project'}</Strong>
            <Small>{[project.customer_name, project.city?.value].filter(Boolean).join(', ')}</Small>
            {project.sales_person ? <Small>Sales Person {project.sales_person.name}</Small> : null}
            {project.ct ? <Small>Current CT {project.ct.name}</Small> : null}
          </View>
          <TextField accessibilityLabel="Search CTs by name or email" placeholder="Search CTs by name or email" value={search} onChangeText={setSearch}
            autoCapitalize="none" autoCorrect={false} />
          {cts.isLoading ? <Loading label="Loading CTs" /> : null}
          {cts.isError ? <ErrorState error={cts.error} onRetry={() => cts.refetch()} /> : null}
          {cts.isSuccess && list.length === 0 ? (
            <EmptyState title={q ? `No active CT matches "${search.trim()}"` : 'There are no active CTs'} body={q ? undefined : 'An Admin can add them in Users.'} />
          ) : null}
          <View accessibilityRole="radiogroup" accessibilityLabel="CTs, fewest open trials first" style={{ gap: 8 }}>
            {list.map((u) => {
              const on = u.id === chosen
              const load = [plural(u.open_trials, 'open trial'), u.active_projects !== undefined ? plural(u.active_projects, 'active project') : null].filter(Boolean).join(', ')
              return (
                <Pressable key={u.id} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  accessibilityLabel={`${u.full_name}${project.ct?.id === u.id ? ', current CT' : ''}. ${load}. ${u.region_name ?? 'No region'}`}
                  onPress={() => setChosen(u.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: on ? 13 : 14, paddingVertical: 10, borderRadius: radius.field, borderWidth: on ? 2 : 1, borderColor: on ? color.ink : color.line, backgroundColor: on ? color.head : color.surface }}>
                  <Avatar name={u.full_name} size={40} dark={on} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Strong>{u.full_name}{project.ct?.id === u.id ? ' (current)' : ''}</Strong>
                    <Small numberOfLines={1}>{u.region_name ?? 'No region'}, {u.email}</Small>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: font.bold, fontSize: 18, color: color.ink }}>{u.open_trials}</Text>
                    <Small>open trials</Small>
                    {u.active_projects !== undefined ? <Small>{plural(u.active_projects, 'project')}</Small> : null}
                  </View>
                </Pressable>
              )
            })}
          </View>
          {ctError ? <Text accessibilityLiveRegion="polite" style={{ color: color.error, fontFamily: font.regular, fontSize: 13 }}>{ctError}</Text> : null}
          <Field label={pickedName ? `Note to ${pickedName}` : 'Note to the CT'} hint="Optional">
            <TextField accessibilityLabel="Note to the CT" value={note} onChangeText={setNote} multiline style={{ minHeight: 72, textAlignVertical: 'top' }} />
          </Field>
          {pickedName ? (
            <Banner>
              {`${pickedName}${project.sales_person ? ` and Sales Person ${project.sales_person.name}` : ''} each get an email and an in app notification.${movesStatus ? ' The project moves to Assigned to CT.' : ''}`}
            </Banner>
          ) : null}
          {assign.isError && !ctError ? <ErrorState error={assign.error} /> : null}
        </>
      ) : null}
    </Sheet>
  )
}
