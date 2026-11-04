/** Step 4, cube strength: age chips with due dates, three cubes (weight and
 * load) with live strength, average and % of the project target, Save per
 * age (PUT /trials/:id/cubes/:age/), Add test age, and results so far.
 * Standard ages are 1, 3, 7 and 28 days; 12, 16, 18, 20 h and 5 days are
 * added on demand. Test dates count from the cast date. */
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

import { fieldErrors } from '@/api/client'
import { saveCubes } from '@/offline/trialActions'
import { AGES, cubeAverage, f2, n, STANDARD_AGES, strength, testDue } from '@/shared/calc'
import type { Trial } from '@/shared/types'
import { Banner, Button, Screen, Small } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { istDay, shortDate } from './format'
import { badCubeLoad, badCubeWeight, cubePayload, cubeProblem, cubeRows, pct, requirementTargets, sortAges, type CubeEntry } from './forms'
import { CellInput, cell, StepFooter, TableHead } from './parts'
import { queuedNote, saveError, useReloadTrial, useSaver, useWorkspace } from './workspace'

const OPTIONAL_AGES = Object.keys(AGES).filter((a) => !STANDARD_AGES.includes(a))
const COLS: (number | 'flex')[] = [44, 'flex', 'flex', 'flex']

type AgeState = 'saved' | 'today' | 'overdue' | 'pending'

export function ageState(trial: Trial, age: string, today = istDay(new Date())): AgeState {
  if (trial.results?.cubes?.[age]?.average) return 'saved'
  if (!trial.cast_at) return 'pending'
  const due = istDay(testDue(trial.cast_at, age))
  return due === today ? 'today' : due < today ? 'overdue' : 'pending'
}

/** Chip text: "1 day ✓", "7 days, today", "28 days, 25 Nov". */
export function chipLabel(trial: Trial, age: string, state: AgeState) {
  const label = AGES[age][0]
  if (state === 'saved') return `${label} ✓`
  if (state === 'today') return `${label}, today`
  if (state === 'overdue') return `${label}, due`
  return trial.cast_at ? `${label}, ${shortDate(testDue(trial.cast_at, age))}` : label
}


type AgeForm = { rows: CubeEntry[]; baseline: CubeEntry[] }
const isDirty = (f: AgeForm | undefined) => !!f && JSON.stringify(cubePayload(f.rows)) !== JSON.stringify(cubePayload(f.baseline))

export function CubesStep({ canEdit, banners }: { canEdit: boolean; banners: ReactNode }) {
  const { trial, project, header, accept, notify, startTrial, starting, next, saving: savingAll } = useWorkspace()
  const [added, setAdded] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const saved = trial.cube_sets.map((c) => c.age)
  const ages = sortAges([...STANDARD_AGES, ...saved, ...added])
  const [today] = useState(() => istDay(new Date()))
  const [selected, setSelected] = useState<string>(() =>
    ages.find((a) => ageState(trial, a, today) === 'today') ?? ages.find((a) => ageState(trial, a, today) !== 'saved') ?? ages[ages.length - 1])
  const [forms, setForms] = useState<Record<string, AgeForm>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const reload = useReloadTrial(trial.id)
  const target = requirementTargets(project).strength
  const targetLabel = target ? `${target.value} N/mm² at ${AGES[target.age]?.[0] ?? '28 days'}` : null

  const formFor = (a: string): AgeForm => forms[a] ?? { rows: cubeRows(trial, a), baseline: cubeRows(trial, a) }
  const dirtyAges = ages.filter((a) => isDirty(forms[a]))

  const qc = useQueryClient()
  const [savingAge, setSavingAge] = useState<string | null>(null)

  async function saveAge(age: string) {
    const f = forms[age]
    if (!f) return true
    setErrors((e) => ({ ...e, [age]: '' }))
    const local = cubeProblem(f.rows)
    if (local) {
      setErrors((x) => ({ ...x, [age]: local }))
      notify({ tone: 'error', text: `${AGES[age][0]}: ${local}` })
      setSelected(age)
      return false
    }
    setSavingAge(age)
    try {
      // Online: PUT now. Offline: kept on the phone and synced later.
      const { trial: t, queued } = await saveCubes(qc, trial.id, age, cubePayload(f.rows))
      if (!queued) accept(t)
      const fresh = cubeRows(t, age)
      setForms((x) => ({ ...x, [age]: { rows: fresh, baseline: fresh } }))
      notify(queued ? { tone: 'info', text: queuedNote(`${AGES[age][0]} cube results saved`) } : { tone: 'ok', text: `${AGES[age][0]} cube results saved` })
      return true
    } catch (e) {
      const fe = fieldErrors(e)
      const msg = Object.values(fe)[0] ?? saveError(e, fe)
      setErrors((x) => ({ ...x, [age]: msg }))
      reload(e)
      notify({ tone: 'error', text: `${AGES[age][0]}: ${msg}` })
      setSelected(age)
      return false
    } finally {
      setSavingAge(null)
    }
  }

  // One saver for every age with unsaved results, so Next and the leave guard cover them all.
  useSaver('cubes', dirtyAges.length > 0, async () => {
    for (const a of dirtyAges) if (!(await saveAge(a))) return false
    return true
  })

  const setRow = (age: string, i: number, k: keyof CubeEntry, v: string) => setForms((x) => {
    const f = x[age] ?? formFor(age)
    return { ...x, [age]: { ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) } }
  })

  const label = AGES[selected][0]
  const selDirty = dirtyAges.includes(selected)

  return (
    <Screen header={header} footer={(
      <StepFooter>
        {trial.actions.start
          ? <Button variant="primary" title="Start trial" onPress={startTrial} busy={starting} style={{ flex: 1 }} />
          : canEdit
            ? (
              <>
                <Button title="Next" accessibilityLabel="Next: conclusion" onPress={next} busy={savingAll} style={{ flex: 0.7 }} />
                <Button variant="primary" title={`Save ${label.replace(/s$/, '')} results`} disabled={!selDirty}
                  busy={savingAge === selected} onPress={() => saveAge(selected)} style={{ flex: 1.3 }} />
              </>
            )
            : <Button variant="primary" title="Next: conclusion" onPress={next} style={{ flex: 1 }} />}
      </StepFooter>
    )}>
      {banners}
      <Small>
        {trial.cast_at
          ? `150 mm cubes, cast ${shortDate(trial.cast_at)}${targetLabel ? `, target ${targetLabel}` : ''}. Test dates count from the cast date.`
          : 'Enter the trial date and time in Mix design; test dates count from it.'}
      </Small>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="Cube age"
        contentContainerStyle={{ gap: 6, paddingRight: 8 }} keyboardShouldPersistTaps="handled">
        {ages.map((a) => {
          const st = ageState(trial, a, today)
          const on = a === selected
          const dirty = dirtyAges.includes(a)
          return (
            <Pressable key={a} accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={`${chipLabel(trial, a, st).replace(' ✓', ', saved')}${dirty ? ', unsaved changes' : ''}`}
              onPress={() => setSelected(a)}
              style={{
                minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center',
                borderWidth: on ? 0 : 1, borderStyle: on || st !== 'pending' ? 'solid' : 'dashed',
                borderColor: st === 'pending' ? color.field : color.line,
                backgroundColor: on ? color.ink : st === 'pending' ? 'transparent' : color.surface,
              }}>
              <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? '#fff' : st === 'saved' ? color.met.fg : st === 'overdue' ? color.below.fg : color.subtle }}>
                {chipLabel(trial, a, st)}{dirty ? ' •' : ''}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {canEdit && (
        <View style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: adding }} onPress={() => setAdding((x) => !x)}
            style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.link }}>{adding ? 'Close test ages' : 'Add test age'}</Text>
          </Pressable>
          {adding && (
            <View accessibilityLabel="Optional test ages" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {OPTIONAL_AGES.map((a) => {
                const on = ages.includes(a)
                return (
                  <Pressable key={a} accessibilityRole="button" accessibilityState={{ disabled: on }} disabled={on}
                    accessibilityLabel={`${AGES[a][0]}${on ? ', added' : ''}`}
                    onPress={() => { setAdded((x) => [...x, a]); setSelected(a); setAdding(false) }}
                    style={{ minHeight: 44, paddingHorizontal: 14, paddingVertical: 4, borderRadius: radius.field, borderWidth: 1, borderColor: color.field, justifyContent: 'center', backgroundColor: on ? color.head : color.surface }}>
                    <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? color.muted : color.ink }}>{AGES[a][0]}</Text>
                    <Small>{on ? 'Added' : trial.cast_at ? `Due ${shortDate(testDue(trial.cast_at, a))}` : ''}</Small>
                  </Pressable>
                )
              })}
            </View>
          )}
        </View>
      )}

      <AgeCard age={selected} form={formFor(selected)} dirty={selDirty} canEdit={canEdit} target={target} error={errors[selected]}
        onChange={(i, k, v) => setRow(selected, i, k, v)}
        onRemove={added.includes(selected) && !saved.includes(selected) ? () => {
          setAdded((x) => x.filter((y) => y !== selected))
          setForms((x) => { const { [selected]: _, ...rest } = x; return rest })
          setSelected(STANDARD_AGES[0])
        } : undefined} />

      <Small>Strength is load in kN divided by 22.5, for a 150 mm cube. Leave a cube blank if it was not tested; the average skips it.</Small>

      <View accessibilityLabel="Results so far" style={{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card }}>
        {ages.map((a, i) => {
          const avg = trial.results?.cubes?.[a]?.average
          return (
            <View key={a} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: color.divider }}>
              <Text style={{ fontFamily: font.regular, fontSize: 15, color: avg ? color.ink : color.muted }}>{AGES[a][0]}</Text>
              {avg
                ? <Text style={{ fontFamily: font.bold, fontSize: 15, color: color.ink, fontVariant: ['tabular-nums'] }}>{f2(n(avg))}</Text>
                : <Text style={{ fontFamily: font.regular, fontSize: 15, color: color.muted }}>{trial.cast_at ? `Due ${shortDate(testDue(trial.cast_at, a))}` : 'Not tested'}</Text>}
            </View>
          )
        })}
      </View>
    </Screen>
  )
}

function AgeCard({ age, form, dirty, canEdit, target, error, onChange, onRemove }: {
  age: string; form: AgeForm; dirty: boolean; canEdit: boolean; target: { value: number; age: string } | null; error?: string
  onChange: (i: number, k: keyof CubeEntry, v: string) => void; onRemove?: () => void
}) {
  const { trial } = useWorkspace()
  const label = AGES[age][0]
  const due = trial.cast_at ? testDue(trial.cast_at, age) : null
  const serverAvg = trial.results?.cubes?.[age]?.average
  const avg = dirty ? cubeAverage(form.rows) : serverAvg ? Number(serverAvg) : cubeAverage(form.rows)
  const targetAge = target ? (AGES[target.age]?.[0] ?? '28 days').replace(/s$/, '') : ''

  return (
    <View accessibilityLabel={`${label} cubes`} style={{ backgroundColor: color.surface, borderWidth: 1, borderColor: dirty ? color.ink : color.line, borderRadius: radius.card, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: color.divider }}>
        <Text accessibilityRole="header" style={{ fontFamily: font.cond, fontSize: 18, color: color.ink, flexShrink: 1 }}>
          {label.replace(/s$/, '')} test{due ? `, ${shortDate(due)}` : ''}
        </Text>
        {onRemove ? <Button title="Remove" variant="tertiary" accessibilityLabel={`Remove ${label}`} onPress={onRemove} style={{ flexGrow: 0, paddingHorizontal: 4 }} /> : null}
      </View>
      <TableHead cols={['Cube', 'Weight, kg', 'Load, kN', 'N/mm²']} template={COLS} />
      {form.rows.slice(0, 3).map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderColor: color.divider }}>
          <Text style={[{ fontFamily: font.semibold, fontSize: 15, color: color.ink }, cell(44)]}>{i + 1}</Text>
          <View style={cell('flex')}>
            <CellInput accessibilityLabel={`${label}, cube ${i + 1} weight in kilograms`} value={r.weight} editable={canEdit}
              invalid={badCubeWeight(r.weight)} onChangeText={(v) => onChange(i, 'weight', v)} />
          </View>
          <View style={cell('flex')}>
            <CellInput accessibilityLabel={`${label}, cube ${i + 1} load in kilonewtons`} value={r.load} editable={canEdit}
              invalid={badCubeLoad(r.load)} onChangeText={(v) => onChange(i, 'load', v)} />
          </View>
          <Text testID={`str-${age}-${i}`} style={[{ fontFamily: font.semibold, fontSize: 16, color: color.ink, textAlign: 'right', fontVariant: ['tabular-nums'] }, cell('flex')]}>
            {f2(strength(r.load)) || '–'}
          </Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 2, borderColor: color.line, backgroundColor: color.head }}>
        <View style={{ gap: 2, flexShrink: 1 }}>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: color.subtle }}>Average strength</Text>
          {target && avg !== null ? (
            <Text testID={`pct-${age}`} style={{ fontFamily: font.semibold, fontSize: 13, color: avg >= target.value ? color.met.fg : color.subtle }}>
              {pct(avg, target.value)} of the {targetAge} target
            </Text>
          ) : null}
        </View>
        <Text testID={`avg-${age}`} accessibilityLiveRegion="polite" style={{ fontFamily: font.bold, fontSize: 30, color: color.ink, fontVariant: ['tabular-nums'] }}>
          {avg !== null ? f2(avg) : '–'}
        </Text>
      </View>
      {error ? <View style={{ padding: 12 }}><Banner tone="error">{error}</Banner></View> : null}
    </View>
  )
}
