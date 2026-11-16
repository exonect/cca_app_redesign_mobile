/** Mini SVG charts for the phone, as on the approved boards (326 wide viewBox,
 * red line for this trial, grey dashed band for limits, green target box).
 * Tapping a point shows its exact value and how it compares with the limit or
 * target in a readout under the chart (UAT, 16 Nov 2026); points outside are
 * filled amber. Screen readers get the same words in the chart's label. */
import { useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { Circle, G, Line, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg'

import { color, font } from '@/ui/theme'

import { num } from './format'

const W = 326

/** One point: where it is (viewBox units), what it is and how it compares. */
export type Tip = { x: number; y: number; title: string; lines: string[]; tone?: 'ok' | 'out' }

/** "Above the limit by 2.2" or null when within [lo, hi]. */
const outside = (v: number, lo: number, hi: number, unit: string, what = 'limit') =>
  v > hi + 1e-9 ? `Above the ${what} by ${num(v - hi)}${unit}` : v < lo - 1e-9 ? `Below the ${what} by ${num(lo - v)}${unit}` : null

const say = (t: Tip) => [t.title, ...t.lines].join(', ')

/** Dots, amber when outside, a ring on the tapped one, and a large tap target on each. */
function Points({ tips, r, active, onPick }: { tips: Tip[]; r: number; active: number | null; onPick: (i: number) => void }) {
  return (
    <>
      {tips.map((t, i) => (
        <Circle key={`d${i}`} cx={t.x} cy={t.y} r={t.tone === 'out' ? r + 1 : r} strokeWidth={2.5}
          fill={t.tone === 'out' ? color.amber : color.surface} stroke={t.tone === 'out' ? color.below.fg : color.action} />
      ))}
      {active !== null && tips[active] ? (
        <Circle cx={tips[active].x} cy={tips[active].y} r={r + 5} fill="none" strokeWidth={2} strokeOpacity={0.45}
          stroke={tips[active].tone === 'out' ? color.below.fg : color.action} />
      ) : null}
      {tips.map((t, i) => (
        <Circle key={`h${i}`} testID={`point-${t.title}`} cx={t.x} cy={t.y} r={16} fill="transparent" onPress={() => onPick(i)} />
      ))}
    </>
  )
}

/** What the tapped point shows; a hint until one is tapped. */
function Readout({ tip, any }: { tip: Tip | null; any: boolean }) {
  if (!any) return null
  if (!tip) return <Text style={[cap, { fontSize: 13 }]}>Tap a point to see its value.</Text>
  return (
    <View accessibilityLiveRegion="polite" style={{ backgroundColor: color.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 1 }}>
      <Text style={{ fontFamily: font.bold, fontSize: 14, color: '#FFFFFF' }}>{tip.title}</Text>
      {tip.lines.map((l, i) => {
        const verdict = i === tip.lines.length - 1 && tip.tone
        return (
          <Text key={l} style={{ fontFamily: verdict ? font.semibold : font.regular, fontSize: 13,
            color: verdict === 'out' ? color.amber : verdict === 'ok' ? '#7FD6B4' : '#FFFFFF' }}>{l}</Text>
        )
      })}
    </View>
  )
}

// --- Combined grading ----------------------------------------------------------------------
export const GRADING_AXIS: [string, string][] = [
  ['0.15', '150 µm'], ['0.3', '300 µm'], ['0.6', '600 µm'], ['1.18', '1.18'], ['2.36', '2.36'], ['4.75', '4.75'], ['10', '10'], ['20', '20 mm'],
]

export function GradingChart({ points, limits, caption }: {
  points: { sieve: string; combined: number }[]; limits: Record<string, [number, number]>; caption?: string
}) {
  const H = 80, top = 6, bottom = 74, left = 6, right = 320
  const y = (v: number) => bottom - (Math.max(0, Math.min(100, v)) / 100) * (bottom - top)
  const x = (i: number) => left + (i * (right - left)) / (GRADING_AXIS.length - 1)
  const band = GRADING_AXIS.map(([k], i) => ({ i, lim: limits[k] })).filter((b) => b.lim)
  const by = Object.fromEntries(points.map((p) => [p.sieve, p.combined]))
  const [active, setActive] = useState<number | null>(null)
  const tips: Tip[] = GRADING_AXIS.map(([k, l], i) => ({ k, l, i })).filter((p) => p.k in by).map((p) => {
    const v = by[p.k]
    const lim = limits[p.k]
    const off = lim ? outside(v, lim[0], lim[1], '%') : null
    return {
      x: x(p.i), y: y(v), title: `${p.l.endsWith('m') ? p.l : `${p.l} mm`} sieve`,
      lines: [`${num(v)}% passing`, ...(lim ? [`IS 383 limit ${num(lim[0])} to ${num(lim[1])}%`, off ?? 'Within the limit'] : [])],
      tone: lim ? (off ? 'out' : 'ok') : undefined,
    }
  })
  const pts = tips.map((t) => [t.x, t.y] as [number, number])
  const described = points.length
    ? `Combined grading: ${tips.map(say).join('. ')}.`
    : 'Combined grading appears once every sieve weight and the proportions are entered.'
  return (
    <View style={{ gap: 4 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={described}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {band.length > 1 && (
            <Polygon
              points={[...band.map((b) => `${x(b.i)},${y(b.lim[1])}`), ...[...band].reverse().map((b) => `${x(b.i)},${y(b.lim[0])}`)].join(' ')}
              fill={color.concrete} stroke={color.field} strokeWidth={1} strokeDasharray="4 3" />
          )}
          {pts.length > 1 && <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color.action} strokeWidth={2.5} strokeLinejoin="round" />}
          <Points tips={tips} r={3} active={active} onPick={(i) => setActive((a) => (a === i ? null : i))} />
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={cap}>150 µm</Text>
        {caption ? <Text style={[cap, { flexShrink: 1, textAlign: 'center' }]} numberOfLines={1}>{caption}</Text> : null}
        <Text style={cap}>20 mm</Text>
      </View>
      <Readout tip={active !== null ? tips[active] ?? null : null} any={tips.length > 0} />
    </View>
  )
}
const cap = { fontFamily: font.regular, fontSize: 13, color: color.muted } as const

// --- Slump or flow retention ------------------------------------------------------------------
export function RetentionChart({ readings, label, target }: {
  readings: { minutes: number; mm: number }[]; label: string
  target: { minutes: number; hours: string; mm: number; tolerance: number } | null
}) {
  const H = 96, top = 8, bottom = 74, left = 36, right = 314
  const lastMinute = Math.max(120, ...readings.map((r) => r.minutes), target?.minutes ?? 0)
  const peak = Math.max(...readings.map((r) => r.mm), target ? target.mm + target.tolerance : 0, 50)
  const floor = Math.max(0, Math.min(...readings.map((r) => r.mm), target ? target.mm - target.tolerance : peak) - 30)
  const lo = Math.floor(floor / 50) * 50
  const hi = Math.ceil((peak + 10) / 50) * 50
  const y = (v: number) => bottom - ((v - lo) / Math.max(1, hi - lo)) * (bottom - top)
  const x = (m: number) => left + (m / lastMinute) * (right - left)
  const ticks = [hi, (hi + lo) / 2, lo]
  const pts = readings.map((r) => [x(r.minutes), y(r.mm)] as [number, number])
  const [active, setActive] = useState<number | null>(null)
  const initial = readings.find((r) => r.minutes === 0)
  const tLo = target ? target.mm - target.tolerance : 0
  const tHi = target ? target.mm + target.tolerance : 0
  const tips: Tip[] = readings.map((r) => {
    const atCheck = !!target && r.minutes === target.minutes
    const off = atCheck ? outside(r.mm, tLo, tHi, ' mm', 'target') : null
    const change = initial && r.minutes > 0 ? r.mm - initial.mm : null
    return {
      x: x(r.minutes), y: y(r.mm), title: r.minutes === 0 ? 'Initial' : `${r.minutes} min`,
      lines: [
        `${label} ${num(r.mm)} mm`,
        ...(change !== null ? [change === 0 ? 'Same as initial' : `${change < 0 ? 'Lost' : 'Gained'} ${num(Math.abs(change))} mm since initial`] : []),
        ...(atCheck ? [`Target ${num(tLo)} to ${num(tHi)} mm at ${target!.hours} h`, off ?? 'Within the target'] : []),
      ],
      tone: atCheck ? (off ? 'out' : 'ok') : undefined,
    }
  })
  const xTicks = [0, 30, 60, 90, 120, 150, 180, 210, 240].filter((m) => m <= lastMinute && (lastMinute <= 120 || m % 60 === 0))
  const described = readings.length
    ? `${label} readings: ${tips.map(say).join('. ')}.`
    : `No ${label.toLowerCase()} readings yet.`
  return (
    <View style={{ gap: 4 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={described}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          <G stroke={color.divider} strokeWidth={1}>
            {ticks.map((t) => <Line key={t} x1={left} x2={right} y1={y(t)} y2={y(t)} />)}
          </G>
          {ticks.map((t) => (
            <SvgText key={t} x={28} y={y(t) + 4} fontSize={12} fill={color.muted} textAnchor="end" fontFamily={font.regular}>{String(t)}</SvgText>
          ))}
          {target && (
            <Rect x={x(target.minutes) - 12} y={y(target.mm + target.tolerance)} width={24}
              height={Math.max(2, y(target.mm - target.tolerance) - y(target.mm + target.tolerance))} rx={3}
              fill={color.met.bg} stroke={color.met.solid} strokeWidth={1} strokeDasharray="3 2" />
          )}
          {pts.length > 1 && <Polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color.action} strokeWidth={3} strokeLinejoin="round" />}
          <Points tips={tips} r={4} active={active} onPick={(i) => setActive((a) => (a === i ? null : i))} />
          {xTicks.map((m, i) => (
            <SvgText key={m} x={x(m)} y={92} fontSize={12} fill={color.subtle} textAnchor="middle" fontFamily={font.regular}>
              {i === xTicks.length - 1 ? `${m} min` : String(m)}
            </SvgText>
          ))}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        <Legend kind="line" label="This trial" />
        {target ? <Legend kind="target" label={`Target at ${target.hours} h`} /> : null}
        {tips.some((t) => t.tone === 'out') ? <Legend kind="out" label="Outside the target" /> : null}
      </View>
      <Readout tip={active !== null ? tips[active] ?? null : null} any={tips.length > 0} />
    </View>
  )
}

function Legend({ kind, label }: { kind: 'line' | 'target' | 'out'; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Svg width={20} height={10}>
        {kind === 'line' ? <Line x1={0} y1={5} x2={20} y2={5} stroke={color.action} strokeWidth={3} />
          : kind === 'out' ? <Circle cx={10} cy={5} r={4} fill={color.amber} stroke={color.below.fg} strokeWidth={2} />
            : <Rect x={1} y={1} width={18} height={8} rx={2} fill={color.met.bg} stroke={color.met.solid} strokeDasharray="3 2" />}
      </Svg>
      <Text style={{ fontFamily: font.regular, fontSize: 13, color: color.subtle }}>{label}</Text>
    </View>
  )
}
