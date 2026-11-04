/** Building blocks for the trial steps, drawn as on the approved mobile boards. */
import { type ReactNode } from 'react'
import { Pressable, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'
import Svg, { Path, Polyline } from 'react-native-svg'

import { Button, Small } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { useWorkspace } from './workspace'

/** Compact right aligned numeric cell for lab tables (44 high, 6 px radius, decimal pad). */
export function CellInput({ invalid, editable = true, style, ...rest }: TextInputProps & { invalid?: boolean }) {
  return (
    <TextInput keyboardType="decimal-pad" inputMode="decimal" placeholderTextColor={color.muted} editable={editable}
      accessibilityState={{ disabled: !editable }}
      style={[{
        height: TOUCH, borderWidth: invalid ? 2 : 1, borderColor: invalid ? color.error : color.field, borderRadius: 6,
        paddingHorizontal: invalid ? 9 : 10, textAlign: 'right', fontFamily: font.medium, fontSize: 16, color: color.ink,
        backgroundColor: editable ? color.surface : color.head, fontVariant: ['tabular-nums'],
      }, !editable && { borderStyle: 'dashed', color: color.subtle }, style]}
      {...rest} />
  )
}

/** White card with an optional title row, as on the boards (10 px radius, 1 px line). */
export function Section({ title, aside, children, style, flush, label }: {
  title?: string; aside?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>; flush?: boolean; label?: string
}) {
  return (
    <View accessibilityLabel={label} style={[{ backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, overflow: 'hidden' }, style]}>
      {title ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: flush ? 10 : 0 }}>
          <Text accessibilityRole="header" style={{ fontFamily: font.cond, fontSize: 17, color: color.ink }}>{title}</Text>
          {aside}
        </View>
      ) : null}
      <View style={flush ? undefined : { padding: 16, paddingTop: title ? 10 : 16, gap: 10 }}>{children}</View>
    </View>
  )
}

/** Grey table header row. */
export function TableHead({ cols, template }: { cols: string[]; template: (number | 'flex')[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: color.head }}>
      {cols.map((c, i) => (
        <Text key={c || i} style={[{ fontFamily: font.cond, fontSize: 13, color: color.subtle }, cell(template[i]), i > 0 && { textAlign: 'right' }]}>{c}</Text>
      ))}
    </View>
  )
}
export const cell = (w: number | 'flex'): ViewStyle => (w === 'flex' ? { flex: 1, minWidth: 0 } : { width: w })

/** Segmented control with an optional tick per segment (sieve materials, slump or flow). */
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string; done?: boolean }[]; onChange: (v: T) => void
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 4, backgroundColor: color.status.draft.bg, padding: 3, borderRadius: radius.card }}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label}${o.done ? ', complete' : ''}`} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: TOUCH, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color.surface : 'transparent', paddingHorizontal: 4 }}>
            <Text numberOfLines={1} style={{ fontFamily: on ? font.bold : font.semibold, fontSize: 14, color: on ? color.ink : color.subtle }}>
              {o.label}{o.done ? <Text style={{ color: color.met.solid }}> ✓</Text> : null}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function TickIcon({ size = 15, stroke = color.met.solid }: { size?: number; stroke?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="4 12 10 18 20 6" />
    </Svg>
  )
}

export function WarnIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color.below.fg} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3 2 21h20L12 3z" /><Path d="M12 10v4" /><Path d="M12 17.5v.01" />
    </Svg>
  )
}

/** Tick or warning with a short statement, e.g. "All 8 sieves within limits". */
export function Verdict({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}>
      {ok ? <TickIcon /> : <WarnIcon />}
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: ok ? color.met.fg : color.below.fg, flexShrink: 1 }}>{children}</Text>
    </View>
  )
}

/** Calculated value in a grey dashed box ("grey fields are calculated"). */
export function Output({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <View style={{ gap: 6, flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${label}, calculated: ${typeof value === 'string' ? value : ''}`}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.ink }}>{label}</Text>
      <View style={{ minHeight: TOUCH, borderRadius: radius.field, borderWidth: 1, borderStyle: 'dashed', borderColor: color.field, backgroundColor: color.head, paddingHorizontal: 12, justifyContent: 'center' }}>
        <Text accessibilityLiveRegion="polite" style={{ fontFamily: font.semibold, fontSize: 16, color: color.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      </View>
      {hint ? (typeof hint === 'string' ? <Small>{hint}</Small> : hint) : null}
    </View>
  )
}

/** Live preview or server figures, said plainly under a table. */
export function SourceNote({ fromServer }: { fromServer: boolean }) {
  return (
    <Small style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
      {fromServer ? 'Figures as calculated by the server on the last save.' : 'Live preview. Save to have the server confirm the figures.'}
    </Small>
  )
}

/** Sticky footer content: the save state or last message, then the actions. */
export function StepFooter({ children, note }: { children: ReactNode; note?: string }) {
  const { notice, dirty, saving } = useWorkspace()
  const line = saving ? { tone: 'info' as const, text: 'Saving…' }
    : notice ?? (dirty ? { tone: 'info' as const, text: 'Unsaved changes' } : null)
  const fg = !line ? color.muted : line.tone === 'error' ? color.error : line.tone === 'ok' ? color.met.fg : color.muted
  return (
    <View style={{ flex: 1, gap: 8 }}>
      {note ? <Small>{note}</Small> : null}
      {line ? (
        <Text accessibilityLiveRegion="polite" accessibilityRole={line.tone === 'error' ? 'alert' : undefined}
          style={{ fontFamily: line.tone === 'error' ? font.semibold : font.regular, fontSize: 13, color: fg }}>{line.text}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>{children}</View>
    </View>
  )
}

/**
 * Footer actions for steps 1 to 3: Save (this step's fields only) and the
 * one primary action, Start trial on a draft that can be started,
 * otherwise Next (which saves first).
 */
export function StepActions({ canSave, label }: { canSave: boolean; label: string }) {
  const { trial, step, dirty, saving, saveAll, next, startTrial, starting, notify } = useWorkspace()
  async function save() {
    if (await saveAll()) notify({ tone: 'ok', text: `${label} saved` })
  }
  const nextTitle = ['Next: mix design', 'Next: fresh concrete', 'Next: cube strength', 'Next: conclusion'][step - 1]
  return (
    <StepFooter>
      {canSave && <Button title="Save" onPress={save} busy={saving && !starting} disabled={!dirty} style={{ flex: 1 }} />}
      {trial.actions.start
        ? <Button variant="primary" title="Start trial" onPress={startTrial} busy={starting} style={{ flex: 1.4 }} />
        : nextTitle ? <Button variant="primary" title={nextTitle} onPress={next} busy={saving} style={{ flex: 1.4 }} /> : null}
    </StepFooter>
  )
}

/** Radio card, used for Met / Below expectation. */
export function RadioCard({ title, body, selected, onPress, disabled, invalid }: {
  title: string; body?: string; selected: boolean; onPress: () => void; disabled?: boolean; invalid?: boolean
}) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} accessibilityLabel={title}
      accessibilityHint={body} disabled={disabled} onPress={onPress}
      style={{
        flex: 1, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.card,
        borderWidth: selected || invalid ? 2 : 1, borderColor: selected ? color.ink : invalid ? color.error : color.field,
        backgroundColor: selected ? color.head : color.surface, opacity: disabled ? 0.6 : 1,
      }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? color.action : color.field, alignItems: 'center', justifyContent: 'center' }}>
        {selected ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: color.action }} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 15, color: color.ink }}>{title}</Text>
        {body ? <Small>{body}</Small> : null}
      </View>
    </Pressable>
  )
}
