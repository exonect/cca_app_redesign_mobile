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
import { errorMessage, statusOf } from '@/api/errors'
import { useAuth } from '@/auth/AuthProvider'
import type { CorrectedValue, RecordFlag } from '@/shared/typesExt'
import { Banner, Body, Button, Field, NumberField, Small, Strong, TextField } from '@/ui/kit'
import { color, radius } from '@/ui/theme'

import { Sheet } from '@/features/projects/Sheet'

import {
  CONTENTS_MAX, deepFieldErrors, initialRows, objectKind, payload, renumber, rowProblems, serverErrors, totals, unchanged,
  type ObjectKind, type ObjectRow,
} from './objectValue'

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
  const [rows, setRows] = useState<ObjectRow[]>([])
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [valueError, setValueError] = useState<string>()
  const kind = correcting ? objectKind(correcting) : null
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const reload = () => {
    refresh.forEach((key) => { void qc.invalidateQueries({ queryKey: key as unknown[] }) })
    void qc.invalidateQueries({ queryKey: ['data-flags'] })
  }
  const done = (text: string) => {
    setMessage({ tone: 'ok', text })
    reload()
  }
  /** Resolved by someone else meanwhile (409 not_open), or gone (404): show the record as it is now. */
  const stale = (e: unknown) => {
    const status = statusOf(e)
    if (status === 409 || status === 404) reload()
  }

  const accept = useMutation({
    mutationFn: (f: RecordFlag) => api(`/data-flags/${f.id}/accept/`, { method: 'POST', body: {} }),
    onSuccess: (_, f) => done(`${f.field_label} kept as ${f.value}.`),
    onError: (e) => { setMessage({ tone: 'error', text: errorMessage(e, 'The flag was not updated. Try again.') }); stale(e) },
  })
  const correct = useMutation({
    mutationFn: ({ f, v }: { f: RecordFlag; v: CorrectedValue }) => api(`/data-flags/${f.id}/correct/`, { method: 'POST', body: { value: v } }),
    onSuccess: (_, { f, v }) => { setCorrecting(null); done(typeof v === 'string' ? `${f.field_label} corrected to ${v}.` : `${f.field_label} corrected.`) },
    onError: (e) => {
      stale(e)
      const deep = deepFieldErrors(e)
      if (kind && Object.keys(deep).some((k) => k === 'value' || k.startsWith('value.'))) {
        // Per key ({"value": {"river_sand": [...]}}) on its row; whole value (100% total) above the rows.
        const { byKey, rest } = serverErrors(deep, rows)
        setRowErrors(byKey)
        setValueError(rest)
        return
      }
      setValueError(fieldErrors(e).value)
    },
  })

  function open(f: RecordFlag) {
    setMessage(null)
    setValue(f.value)
    const k = objectKind(f)
    setRows(k ? initialRows(f, k) : [])
    setRowErrors({})
    setValueError(undefined)
    correct.reset()
    setCorrecting(f)
  }

  /** What to send, or undefined after showing what to fix (same checks as the web dialog). */
  function corrected(f: RecordFlag): CorrectedValue | undefined {
    if (!kind) {
      const v = value.trim()
      if (!v) { setValueError('Enter the corrected value.'); return }
      if (v === f.value.trim()) { setValueError('Enter a different value, or accept the value as it is.'); return }
      return v
    }
    const problems = rowProblems(kind, rows)
    if (Object.keys(problems).length) { setRowErrors(problems); return }
    const t = totals(kind, rows)
    if (t?.problem) { setValueError(t.problem); return }
    if (kind !== 'list' && !rows.some((r) => !r.balance && r.value.trim())) { setValueError('Enter at least one value.'); return }
    if (unchanged(f, kind, rows)) { setValueError('Change a value, or accept the value as it is.'); return }
    return payload(kind, rows)
  }

  function submit() {
    if (!correcting) return
    setValueError(undefined)
    setRowErrors({})
    const v = corrected(correcting)
    if (v !== undefined) correct.mutate({ f: correcting, v })
  }

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
                onPress={() => open(f)} />
            </View>
          ) : null}
        </View>
      ))}
      <Sheet open={correcting !== null} onClose={() => setCorrecting(null)} title={`Correct ${correcting?.field_label ?? 'value'}`}
        footer={<>
          <Button title="Cancel" onPress={() => setCorrecting(null)} />
          <Button title="Save value" variant="primary" busy={correct.isPending}
            onPress={submit} />
        </>}>
        <Body style={{ color: color.subtle }}>{correcting?.reason}</Body>
        {correct.isError && !valueError && !Object.keys(rowErrors).length ? <Banner tone="error">{errorMessage(correct.error, 'The value was not corrected. Try again.')}</Banner> : null}
        {kind ? (
          <ObjectInputs kind={kind} rows={rows} rowErrors={rowErrors} error={valueError} recorded={correcting?.value ?? ''}
            onChange={(next, changedKey) => {
              setRows(next)
              setValueError(undefined)
              setRowErrors((e) => (changedKey === undefined ? {} : Object.fromEntries(Object.entries(e).filter(([k]) => k !== changedKey))))
            }} />
        ) : (
          <Field label={correcting?.field_label ?? 'Value'} error={valueError} hint={`Now ${correcting?.value || 'blank'}. The value is checked with the same rule as the form.`}>
            <TextField accessibilityLabel={correcting?.field_label ?? 'Value'} value={value} onChangeText={(t) => { setValue(t); setValueError(undefined) }}
              invalid={Boolean(valueError)} autoCapitalize="none" />
          </Field>
        )}
      </Sheet>
    </View>
  )
}

const UNIT: Record<ObjectKind, string | undefined> = { proportions: '%', components: '%', list: 'kg/m³', map: undefined }

/** One number field per key of an object flag, the live total where it must
 * reach 100.00%, and add or remove rows for cementitious contents. */
function ObjectInputs({ kind, rows, rowErrors, error, recorded, onChange }: {
  kind: ObjectKind; rows: ObjectRow[]; rowErrors: Record<string, string>; error?: string; recorded: string
  onChange: (rows: ObjectRow[], changedKey?: string) => void
}) {
  const t = totals(kind, rows)
  const set = (key: string, v: string) => onChange(rows.map((r) => (r.key === key ? { ...r, value: v } : r)), key)
  return (
    <View style={{ gap: 10 }}>
      <Small>{`Now ${recorded || 'blank'}. Each value is checked with the same rule as the form.`}</Small>
      {rows.map((r) => r.balance ? (
        <Field key={r.key} label={r.label} hint="Worked out from the others, so the composition totals 100%.">
          <NumberField accessibilityLabel={`${r.label}, worked out`} editable={false} unit="%" value={t?.balance ?? ''} />
        </Field>
      ) : (
        <View key={r.key} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field label={r.label} error={rowErrors[r.key]}>
              <NumberField accessibilityLabel={r.label} keyboardType={kind === 'list' ? 'number-pad' : 'decimal-pad'} unit={UNIT[kind]}
                invalid={Boolean(rowErrors[r.key])} value={r.value} onChangeText={(v) => set(r.key, v)} />
            </Field>
          </View>
          {kind === 'list' ? (
            <Button title="Remove" variant="tertiary" accessibilityLabel={`Remove ${r.label.toLowerCase()}`} disabled={rows.length <= 1}
              onPress={() => onChange(renumber(rows.filter((x) => x.key !== r.key)))} style={{ flexGrow: 0 }} />
          ) : null}
        </View>
      ))}
      {kind === 'list' && rows.length < CONTENTS_MAX ? (
        <Button title="Add content" variant="tertiary" onPress={() => onChange(renumber([...rows, { key: '', label: '', value: '' }]))} />
      ) : null}
      {t ? (
        <View accessible accessibilityLabel={`Total ${t.total} percent`} accessibilityLiveRegion="polite"
          style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 2, borderColor: color.ink, paddingTop: 6 }}>
          <Strong>Total</Strong>
          <Strong>{`${t.total}%`}</Strong>
        </View>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </View>
  )
}
