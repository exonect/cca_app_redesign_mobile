/**
 * The project's sieve data without a trial (legacy "Add sieve data" after a
 * project is created): the sieve analysis and proportions every new trial of
 * the project starts from. Saving a trial's sieve step updates it too.
 * Reached from the project screen; saving needs a connection.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams, usePreventRemove } from 'expo-router'
import { useState, type ReactNode } from 'react'
import { Alert, Text, View } from 'react-native'

import { api, ApiError } from '@/api/client'
import { statusOf } from '@/api/errors'
import { NotOnPhone } from '@/offline/ui'
import type { Project, SieveData } from '@/shared/types'
import { Banner, Button, ErrorState, Header, Loading, Screen } from '@/ui/kit'
import { color, font } from '@/ui/theme'

import { shortDateTime } from './format'
import { sieveForm, sievePayload, sieveProblems, stepErrors, type SieveForm } from './forms'
import { SieveEditor } from './SieveStep'
import { saveError } from './workspace'

function back(projectId: string) {
  if (router.canGoBack()) router.back()
  else router.replace({ pathname: '/project/[id]', params: { id: projectId } })
}

export function SieveDataScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const id = String(params.id ?? '')
  const data = useQuery({ queryKey: ['sieve-data', id], queryFn: () => api<SieveData>(`/trials/sieve-data/${id}/`), enabled: !!id })
  const project = useQuery({ queryKey: ['project', id], queryFn: () => api<Project>(`/projects/${id}/`), enabled: !!id })
  const header = <Header title="Sieve data" subtitle={project.data?.project_name} back={{ label: project.data?.project_name ?? 'project', onPress: () => back(id) }} />
  if (!data.data) {
    return (
      <Screen header={header}>
        {data.isError
          ? (data.error instanceof ApiError && data.error.status === 404
            ? <Banner tone="error">This project was not found, or you cannot see it.</Banner>
            : <ErrorState error={data.error} onRetry={() => data.refetch()} />)
          // Offline the query waits: say so instead of loading for ever.
          : data.fetchStatus === 'paused' ? <NotOnPhone what="sieve data" /> : <Loading label="Loading sieve data" />}
      </Screen>
    )
  }
  // Keyed by project only: a save resets the form itself and keeps its message on screen.
  return <SieveDataForm key={data.data.project} data={data.data} header={header} />
}

export function SieveDataForm({ data, header }: { data: SieveData; header: ReactNode }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<SieveForm>(() => sieveForm(data))
  const [baseline, setBaseline] = useState(form)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const dirty = JSON.stringify(sievePayload(form)) !== JSON.stringify(sievePayload(baseline))
  const readOnly = !data.can_edit

  const save = useMutation({
    mutationFn: () => api<SieveData>(`/trials/sieve-data/${data.project}/`, { method: 'PUT', body: sievePayload(form) }),
  })
  async function onSave() {
    const local = sieveProblems(form)
    setErrors(local)
    if (Object.keys(local).length) { setNotice({ tone: 'error', text: 'Not saved. Fix the highlighted fields and save again.' }); return false }
    try {
      const saved = await save.mutateAsync()
      qc.setQueryData(['sieve-data', data.project], saved)
      const next = sieveForm(saved)
      setForm(next)
      setBaseline(next)
      setNotice({ tone: 'ok', text: 'Sieve data saved. New trials of this project start from it.' })
      return true
    } catch (e) {
      const f = stepErrors(e, sievePayload(form))
      setErrors(f)
      setNotice({ tone: 'error', text: saveError(e, f, ['sieves', 'proportions']) })
      // No longer allowed (the project moved on, or access changed): reload so the page turns read only.
      const status = statusOf(e)
      if (status === 403 || status === 404 || status === 409) void qc.invalidateQueries({ queryKey: ['sieve-data', data.project] })
      return false
    }
  }

  usePreventRemove(dirty, ({ repeat }) => {
    Alert.alert('Leave without saving?', 'The sieve data has changes that are not saved yet.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave without saving', style: 'destructive', onPress: repeat },
      { text: 'Save and leave', onPress: async () => { if (await onSave()) repeat() } },
    ])
  })

  const from = data.source && data.source !== "the project's sieve data"
    ? `This is the sieve analysis last saved with ${data.source.startsWith('a ') ? data.source : `trial ${data.source}`}. ` : ''
  return (
    <Screen header={header} footer={!readOnly ? (
      <Button variant="primary" title="Save sieve data" onPress={() => { void onSave() }} busy={save.isPending} disabled={!dirty} />
    ) : undefined}>
      <Banner tone="info">{from}New trials of this project start from this sieve analysis and these proportions.</Banner>
      {data.updated_at ? (
        <Text style={{ fontFamily: font.regular, fontSize: 13, color: color.muted }}>
          Saved {shortDateTime(data.updated_at)}{data.updated_by ? ` by ${data.updated_by}` : ''}
        </Text>
      ) : null}
      {notice ? <View accessibilityLiveRegion="polite"><Banner tone={notice.tone}>{notice.text}</Banner></View> : null}
      <SieveEditor form={form} setForm={setForm} errors={errors} readOnly={readOnly} results={!dirty ? data.results : null} />
    </Screen>
  )
}
