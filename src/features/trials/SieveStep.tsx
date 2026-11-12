/** Step 1, sieve analysis: material segmented control with ticks, a sieve
 * table fitted to phone width, total and FM, proportions and the mini all in
 * grading chart against the IS 383 band. */
import { useQuery } from '@tanstack/react-query'
import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { Text, View } from 'react-native'

import { gradingLimitsQuery } from '@/api/hooks'
import { analyse, combine, f2, GRADING_SIEVES, gradingAverage, n as toNumber, passingMap, SIEVE_LABEL } from '@/shared/calc'
import { trialNumberFilter } from '@/shared/inputFilters'
import type { Trial } from '@/shared/types'
import { Banner, Screen, Small } from '@/ui/kit'
import { color, font, radius } from '@/ui/theme'

import { GradingChart } from './charts'
import { num } from './format'
import { liveAnalyse, LIMITS, outOfRange, proportionTotal, ZERO, SIEVE_MATERIAL_LABEL, SIEVE_MATERIAL_SHORT, SIEVE_MATERIALS, sieveForm, sievePayload, sieveProblems, type SieveForm, type SieveMaterial } from './forms'
import { CellInput, cell, Section, Segmented, SourceNote, StepActions, TableHead, Verdict } from './parts'
import { useStepForm, useWorkspace } from './workspace'

type Analysis = ReturnType<typeof analyse>

/** The server's sieve result in the same shape as the live preview. */
export function serverAnalysis(r: Trial['results']['sieves'][string] | undefined): Analysis | null {
  if (!r) return null
  const x = (v: string | null) => (v === null || v === undefined ? null : Number(v))
  return {
    rows: r.rows.map((row) => ({ sieve: row.sieve, retained: x(row.retained), cum: x(row.cumulative_retained), cumPct: x(row.cumulative_percent), passing: x(row.passing_percent) })),
    total: Number(r.total), complete: r.complete, fm: x(r.fineness_modulus),
  }
}

export function useGradingLimits() {
  return useQuery({
    ...gradingLimitsQuery(),
    select: (rows) => Object.fromEntries(rows.map((r) => [r.sieve, [Number(r.lower), Number(r.upper)] as [number, number]])),
  })
}

const COLS: (number | 'flex')[] = [76, 'flex', 'flex']
const SHOWN = ['sieves', 'proportions'] as const

export function SieveStep({ readOnly, banners }: { readOnly: boolean; banners: ReactNode }) {
  const { trial, header } = useWorkspace()
  const { form, setForm, errors, dirty } = useStepForm<SieveForm>('sieve', sieveForm, sievePayload, sieveProblems, SHOWN)
  return (
    <Screen header={header} footer={<StepActions canSave={!readOnly} label="Sieve analysis" />}>
      {banners}
      {trial.sieves_copied_from && trial.status === 'draft' ? (
        <Banner tone="info">Sieve analysis copied from {trial.sieves_copied_from}. Change it if this trial used other material.</Banner>
      ) : null}
      <SieveEditor form={form} setForm={setForm} errors={errors} readOnly={readOnly} results={!dirty ? trial.results ?? null : null} />
    </Screen>
  )
}

type SieveResults = Pick<Trial['results'], 'sieves' | 'grading' | 'errors'>

/** The sieve tables, proportions and all in grading of a trial or of the
 * project's sieve data. `results`: the server's figures when nothing is
 * unsaved, else null for the live preview. */
export function SieveEditor({ form, setForm, errors, readOnly, results }: {
  form: SieveForm; setForm: Dispatch<SetStateAction<SieveForm>>; errors: Record<string, string>; readOnly: boolean; results: SieveResults | null
}) {
  // Open on the first material step 1 still needs: 20 mm, 10 mm, then a sand (only one sand is needed).
  const [material, setMaterial] = useState<SieveMaterial>(() => {
    const done = (m: SieveMaterial) => !!results?.sieves?.[m]?.complete
    return (['20mm', '10mm'] as const).find((m) => !done(m)) ?? (done('river_sand') || done('crushed_sand') ? '20mm' : 'river_sand')
  })
  const limits = useGradingLimits()

  // Live preview while typing; once saved (nothing pending) show what the server calculated.
  const fromServer = !!results?.sieves
  const live = Object.fromEntries(SIEVE_MATERIALS.map((m) => [m, liveAnalyse(form.sieves[m])])) as Record<SieveMaterial, Analysis>
  const analyses = fromServer
    ? Object.fromEntries(SIEVE_MATERIALS.map((m) => [m, serverAnalysis(results.sieves[m]) ?? live[m]])) as Record<SieveMaterial, Analysis>
    : live
  const passing = Object.fromEntries(SIEVE_MATERIALS.map((m) => [m, passingMap(live[m])]))
  // Same exact 2 decimal total as the server check (blank counts as 0).
  const totalText = proportionTotal(form)
  const total = Number(totalText)
  const anyProportion = SIEVE_MATERIALS.some((m) => (toNumber(form.proportions[m]) ?? 0) > 0)
  const combined = fromServer && (results.grading?.length ?? 0) > 0
    ? { points: results.grading.map((g) => ({ sieve: g.sieve, combined: Number(g.combined), within: g.within })), error: null }
    : anyProportion ? combine(form.proportions, passing, limits.data) : { points: [], error: null }
  const outside = combined.points.filter((p) => p.within === false)
  const checked = combined.points.filter((p) => p.within !== null)

  const setRetained = (i: number, value: string) => setForm((f) => ({
    ...f, sieves: { ...f.sieves, [material]: f.sieves[material].map((r, j) => (j === i ? { ...r, retained: value } : r)) },
  }))
  const setProportion = (m: SieveMaterial, value: string) => setForm((f) => ({ ...f, proportions: { ...f.proportions, [m]: value } }))

  const a = analyses[material]
  const serverErrors = (results?.errors ?? []).filter((e) => /^(20mm|10mm|river_sand|crushed_sand):|Proportions/.test(e))
  const fieldError = [errors.sieves, errors.proportions].filter(Boolean).join(' ')

  return (
    <>
      <Segmented label="Material" value={material} onChange={setMaterial}
        options={SIEVE_MATERIALS.map((m) => ({ value: m, label: SIEVE_MATERIAL_SHORT[m], done: analyses[m].complete }))} />

      <Section flush label={`${SIEVE_MATERIAL_LABEL[material]} sieve analysis`}>
        <TableHead cols={['IS sieve', 'Retained, kg', 'Passing, %']} template={COLS} />
        {form.sieves[material].map((row, i) => {
          const out = a.rows.find((r) => r.sieve === row.sieve)
          const invalid = outOfRange(row.retained, LIMITS.retained) || !!errors[`sieves.${material}.${i}.retained`] || !!errors[`sieves.${material}.${i}.sieve`]
          return (
            <View key={row.sieve} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 2, borderTopWidth: 1, borderColor: color.divider }}>
              <Text style={[{ fontFamily: font.medium, fontSize: 15, color: color.ink }, cell(76)]}>{SIEVE_LABEL[row.sieve]}</Text>
              <View style={cell('flex')}>
                <CellInput accessibilityLabel={`Weight retained on ${SIEVE_LABEL[row.sieve]}, kilograms`} value={row.retained} editable={!readOnly}
                  invalid={invalid} onChangeText={(v) => setRetained(i, trialNumberFilter('retained', v))} selectTextOnFocus
                  onBlur={() => { if (row.retained.trim() === '') setRetained(i, ZERO) }} />
              </View>
              <Text testID={`pass-${row.sieve}`} style={[{ fontFamily: font.semibold, fontSize: 16, color: color.ink, textAlign: 'right', fontVariant: ['tabular-nums'] }, cell('flex')]}>
                {f2(out?.passing) || '–'}
              </Text>
            </View>
          )
        })}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, borderTopWidth: 2, borderColor: color.line, backgroundColor: color.head }}>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: color.subtle }}>
            Total <Text style={{ fontFamily: font.semibold, color: color.ink }}>{num(a.total)} kg</Text>
          </Text>
          <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.semibold, fontSize: 15, color: a.fm !== null ? color.ink : color.muted, flexShrink: 1, textAlign: 'right' }}>
            {a.fm !== null ? `FM ${f2(a.fm)}` : a.complete ? 'Complete' : 'Enter the weight retained on each sieve'}
          </Text>
        </View>
        <View style={{ paddingTop: 8 }}><SourceNote fromServer={fromServer} /></View>
      </Section>
      {(fieldError || serverErrors.length > 0) ? <Banner tone="error">{fieldError || serverErrors.join(' ')}</Banner> : null}

      <Section title="Proportions">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {SIEVE_MATERIALS.map((m) => (
            <View key={m} style={{ width: '47%', flexGrow: 1, gap: 4 }}>
              <Small>{SIEVE_MATERIAL_LABEL[m]}, %</Small>
              <CellInput accessibilityLabel={`${SIEVE_MATERIAL_LABEL[m]} proportion, percent`} value={form.proportions[m]} editable={!readOnly}
                invalid={outOfRange(form.proportions[m], LIMITS.percent) || !!errors[`proportions.${m}`]} onChangeText={(v) => setProportion(m, trialNumberFilter('proportion', v))} selectTextOnFocus
                onBlur={() => { if (form.proportions[m].trim() === '') setProportion(m, ZERO) }} />
            </View>
          ))}
        </View>
        <View accessibilityLiveRegion="polite" style={{
          minHeight: 40, borderRadius: radius.field, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: !anyProportion ? color.head : total === 100 ? color.met.bg : '#FBECEB',
        }}>
          <Text style={{ fontFamily: font.regular, fontSize: 14, color: color.subtle }}>Total</Text>
          <Text style={{ fontFamily: font.bold, fontSize: 15, color: !anyProportion ? color.muted : total === 100 ? color.met.fg : color.error }}>
            {anyProportion ? `${num(total)}%` : '–'}
          </Text>
        </View>
        {anyProportion && total !== 100 ? <Text style={{ fontFamily: font.regular, fontSize: 13, color: color.error }}>Proportions must total 100%. They total {totalText}%.</Text> : null}
      </Section>

      <Section title="All in grading" aside={checked.length > 0 ? (
        <Verdict ok={!outside.length}>
          {outside.length ? `${outside.length} of ${checked.length} sieves outside limits` : `All ${checked.length} sieves within limits`}
        </Verdict>
      ) : undefined}>
        {outside.length > 0 ? <Small>Outside: {outside.map((p) => SIEVE_LABEL[p.sieve]).join(', ')}.</Small> : null}
        {limits.isError ? <Banner tone="warn">The IS 383 limits could not be loaded, so the chart shows this trial only.</Banner> : null}
        {limits.isSuccess && Object.keys(limits.data).length === 0 ? <Banner tone="info">No IS 383 limits for 20 mm are set up yet. An Admin can add them in Master data.</Banner> : null}
        <GradingChart points={combined.points} limits={limits.data ?? {}}
          caption={anyProportion ? `Proportions ${SIEVE_MATERIALS.map((m) => num(form.proportions[m]) || '0').join(', ')}` : undefined} />
        {anyProportion && total === 100 && combined.points.length === 0
          ? <Small>The curve appears once every material with a proportion has all its sieves entered.</Small> : null}
        <GradingTable points={combined.points} limits={limits.data ?? {}} />
      </Section>
    </>
  )
}

const GRADING_COLS: (number | 'flex')[] = [64, 'flex', 'flex', 'flex', 'flex']

/** Legacy "All in Grading" table: per sieve the combined passing %, and the limits as Avg ((min + max) / 2), Max and Min. */
export function GradingTable({ points, limits }: { points: { sieve: string; combined: number }[]; limits: Record<string, [number, number]> }) {
  const sieves = GRADING_SIEVES.filter((x) => limits[x] || points.some((p) => p.sieve === x))
  if (sieves.length === 0) return null
  const fig = { fontFamily: font.regular, fontSize: 15, color: color.ink, textAlign: 'right' as const, fontVariant: ['tabular-nums' as const] }
  return (
    <View accessibilityLabel="All in grading with limits" style={{ borderWidth: 1, borderColor: color.line, borderRadius: radius.field, overflow: 'hidden' }}>
      <TableHead cols={['Sieve', 'All in %', 'Avg', 'Max', 'Min']} template={GRADING_COLS} />
      {sieves.map((x) => {
        const p = points.find((g) => g.sieve === x)
        const lim = limits[x]
        return (
          <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: color.divider }}>
            <Text style={[{ fontFamily: font.medium, fontSize: 15, color: color.ink }, cell(64)]}>{SIEVE_LABEL[x]}</Text>
            <Text testID={`grading-${x}`} style={[fig, { fontFamily: font.semibold }, cell('flex')]}>{p ? f2(p.combined) : '–'}</Text>
            <Text testID={`grading-avg-${x}`} style={[fig, cell('flex')]}>{lim ? num(gradingAverage(lim)) : '–'}</Text>
            <Text style={[fig, { color: color.subtle }, cell('flex')]}>{lim ? num(lim[1]) : '–'}</Text>
            <Text style={[fig, { color: color.subtle }, cell('flex')]}>{lim ? num(lim[0]) : '–'}</Text>
          </View>
        )
      })}
    </View>
  )
}
