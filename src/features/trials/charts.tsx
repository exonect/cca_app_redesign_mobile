/** Mini SVG charts for the phone, as on the approved boards (326 wide viewBox,
 * red line for this trial, grey dashed band for limits, green target box). */
import { Text, View } from 'react-native'
import Svg, { Circle, G, Line, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg'

import { color, font } from '@/ui/theme'

import { num } from './format'

const W = 326

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
  const pts = GRADING_AXIS.flatMap(([k], i) => (k in by ? [[x(i), y(by[k])] as [number, number]] : []))
  const described = points.length
    ? `Combined grading: ${GRADING_AXIS.filter(([k]) => k in by).map(([k, l]) => `${l} ${num(by[k])}% passing`).join(', ')}.`
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
          <G fill={color.surface} stroke={color.action} strokeWidth={2}>
            {pts.map(([cx, cy]) => <Circle key={`${cx}`} cx={cx} cy={cy} r={3} />)}
          </G>
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text style={cap}>150 µm</Text>
        {caption ? <Text style={[cap, { flexShrink: 1, textAlign: 'center' }]} numberOfLines={1}>{caption}</Text> : null}
        <Text style={cap}>20 mm</Text>
      </View>
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
  const xTicks = [0, 30, 60, 90, 120, 150, 180, 210, 240].filter((m) => m <= lastMinute && (lastMinute <= 120 || m % 60 === 0))
  const described = readings.length
    ? `${label} readings: ${readings.map((r) => `${r.mm} mm at ${r.minutes} min`).join(', ')}.${target ? ` Target ${target.mm - target.tolerance} to ${target.mm + target.tolerance} mm at ${target.minutes} min.` : ''}`
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
          <G fill={color.surface} stroke={color.action} strokeWidth={2.5}>
            {pts.map(([cx, cy]) => <Circle key={`${cx}`} cx={cx} cy={cy} r={4} />)}
          </G>
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
      </View>
    </View>
  )
}

function Legend({ kind, label }: { kind: 'line' | 'target'; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Svg width={20} height={10}>
        {kind === 'line'
          ? <Line x1={0} y1={5} x2={20} y2={5} stroke={color.action} strokeWidth={3} />
          : <Rect x={1} y={1} width={18} height={8} rx={2} fill={color.met.bg} stroke={color.met.solid} strokeDasharray="3 2" />}
      </Svg>
      <Text style={{ fontFamily: font.regular, fontSize: 13, color: color.subtle }}>{label}</Text>
    </View>
  )
}
