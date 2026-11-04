/**
 * Flagged data on a project, trial or recipe: values imported from the old
 * app (or found by a check) that break today's validation rules. Everyone
 * who can see the record sees the banner; Admins and Sales Admins can keep a
 * value as it is (Accept) or fix it (Correct, checked with the same rule on
 * the server). Both need a connection.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { View } from 'react-native'

import { api, fieldErrors } from '@/api/client'
import { errorMessage } from '@/api/errors'
import { useAuth } from '@/auth/AuthProvider'
import type { RecordFlag } from '@/shared/typesExt'
import { Banner, Body, Button, Field, Small, Strong, TextField } from '@/ui/kit'
import { color, radius } from '@/ui/theme'

import { Sheet } from '@/features/projects/Sheet'

type Props = {
  flags: RecordFlag[] | undefined
  /** Query keys to refresh after a flag is resolved (the record, its lists). */
  refresh: readonly (readonly unknown[])[]
  /** The record is a trial or recipe or project, in words: "trial". */
  what: string
}

/** Nothing at all when the record has no open flags (the usual case). */
export function FlagBanner(props: Props) {
  return props.flags?.length ? <FlagList {...props} flags={props.flags} /> : null
}

function FlagList({ flags, refresh, what }: Props & { flags: RecordFlag[] }) {
  const { hasRole } = useAuth()
  const qc = useQueryClient()
  const canResolve = hasRole('AD', 'SAD')
  const [correcting, setCorrecting] = useState<RecordFlag | null>(null)
  const [value, setValue] = useState('')
  const [valueError, setValueError] = useState<string>()
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const done = (text: string) => {
    setMessage({ tone: 'ok', text })
    refresh.forEach((key) => { void qc.invalidateQueries({ queryKey: key as unknown[] }) })
    void qc.invalidateQueries({ queryKey: ['data-flags'] })
  }

  const accept = useMutation({
    mutationFn: (f: RecordFlag) => api(`/data-flags/${f.id}/accept/`, { method: 'POST', body: {} }),
    onSuccess: (_, f) => done(`${f.field_label} kept as ${f.value}.`),
    onError: (e) => setMessage({ tone: 'error', text: errorMessage(e, 'The flag was not updated. Try again.') }),
  })
  const correct = useMutation({
    mutationFn: ({ f, v }: { f: RecordFlag; v: string }) => api(`/data-flags/${f.id}/correct/`, { method: 'POST', body: { value: v } }),
    onSuccess: (_, { f, v }) => { setCorrecting(null); done(`${f.field_label} corrected to ${v}.`) },
    onError: (e) => {
      const fe = fieldErrors(e)
      if (fe.value) setValueError(fe.value)
      else setValueError(undefined)
    },
  })

  return (
    <View style={{ gap: 8 }}>
      <Banner tone="warn">
        {flags.length === 1 ? `1 value on this ${what} is flagged` : `${flags.length} values on this ${what} are flagged`}
        {canResolve ? '. Keep each one as it is or correct it.' : '. An Admin or Sales Admin will check it.'}
      </Banner>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {flags.map((f) => (
        <View key={f.id} accessible={!canResolve} accessibilityLabel={`${f.field_label}, ${f.value}. ${f.reason}`}
          style={{ gap: 6, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: color.below.solid, backgroundColor: color.surface }}>
          <Strong>{f.field_label}: {f.value || 'blank'}</Strong>
          <Small style={{ color: color.subtle }}>{f.reason}</Small>
          {canResolve ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Accept" accessibilityLabel={`Accept ${f.field_label} as ${f.value}`} busy={accept.isPending && accept.variables?.id === f.id}
                onPress={() => { setMessage(null); accept.mutate(f) }} />
              <Button title="Correct" variant="primary" accessibilityLabel={`Correct ${f.field_label}`}
                onPress={() => { setMessage(null); setValue(f.value); setValueError(undefined); correct.reset(); setCorrecting(f) }} />
            </View>
          ) : null}
        </View>
      ))}
      <Sheet open={correcting !== null} onClose={() => setCorrecting(null)} title={`Correct ${correcting?.field_label ?? 'value'}`}
        footer={<>
          <Button title="Cancel" onPress={() => setCorrecting(null)} />
          <Button title="Save value" variant="primary" busy={correct.isPending}
            onPress={() => { if (correcting) correct.mutate({ f: correcting, v: value.trim() }) }} />
        </>}>
        <Body style={{ color: color.subtle }}>{correcting?.reason}</Body>
        {correct.isError && !valueError ? <Banner tone="error">{errorMessage(correct.error, 'The value was not corrected. Try again.')}</Banner> : null}
        <Field label={correcting?.field_label ?? 'Value'} error={valueError} hint={`Now ${correcting?.value || 'blank'}. The value is checked with the same rule as the form.`}>
          <TextField accessibilityLabel={correcting?.field_label ?? 'Value'} value={value} onChangeText={(t) => { setValue(t); setValueError(undefined) }}
            invalid={Boolean(valueError)} autoCapitalize="none" />
        </Field>
      </Sheet>
    </View>
  )
}
