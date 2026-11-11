import { useState, type ReactNode } from 'react'
import {
  ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import { errorMessage, statusOf } from '@/api/errors'
import { matchOptions } from '@/shared/matchOptions'
import type { CheckStatus, Outcome, ProjectStatus, TrialStatus } from '@/shared/types'

import { color, font, radius, TOUCH } from './theme'

// --- Text -------------------------------------------------------------------------
type TProps = { children: ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number; accessibilityRole?: 'header' }
export const H1 = (p: TProps) => <Text accessibilityRole="header" {...p} style={[s.h1, p.style]} />
export const H2 = (p: TProps) => <Text accessibilityRole="header" {...p} style={[s.h2, p.style]} />
export const Body = (p: TProps) => <Text {...p} style={[s.body, p.style]} />
export const Small = (p: TProps) => <Text {...p} style={[s.small, p.style]} />
export const Strong = (p: TProps) => <Text {...p} style={[s.strong, p.style]} />

// --- Layout -------------------------------------------------------------------------
/** A screen: optional fixed header, scrolling body, optional sticky footer actions. */
export function Screen({ header, children, footer, scroll = true, padded = true }: {
  header?: ReactNode; children: ReactNode; footer?: ReactNode; scroll?: boolean; padded?: boolean
}) {
  const insets = useSafeAreaInsets()
  const body = padded ? [s.body16] : undefined
  return (
    <View style={s.screen}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView contentContainerStyle={[body, { gap: 12, paddingBottom: 24 }]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        ) : <View style={[{ flex: 1 }, body]}>{children}</View>}
        {footer && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>{footer}</View>}
      </KeyboardAvoidingView>
    </View>
  )
}

/** Light header with optional back action, as on the approved project and trial screens. */
export function Header({ title, subtitle, back, right, dark }: {
  title: string; subtitle?: string; back?: { label: string; onPress: () => void }; right?: ReactNode; dark?: boolean
}) {
  return (
    <SafeAreaView edges={['top']} style={[s.header, dark && { backgroundColor: color.ink, borderBottomWidth: 0 }]}>
      {back && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${back.label}`} onPress={back.onPress} style={s.back} hitSlop={8}>
          <Text style={[s.backText, dark && { color: '#DCE7F2' }]}>‹ {back.label}</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <H1 style={dark ? { color: '#fff' } : undefined}>{title}</H1>
          {subtitle ? <Small style={dark ? { color: color.line } : undefined}>{subtitle}</Small> : null}
        </View>
        {right}
      </View>
    </SafeAreaView>
  )
}

export function Card({ children, style, title, right }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string; right?: ReactNode }) {
  return (
    <View style={[s.card, style]}>
      {title && <View style={s.cardHead}><H2 style={{ flex: 1 }}>{title}</H2>{right}</View>}
      {children}
    </View>
  )
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>
}

// --- Actions ---------------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger'
export function Button({ title, onPress, variant = 'secondary', busy, disabled, style, accessibilityLabel }: {
  title: string; onPress?: () => void; variant?: Variant; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string
}) {
  const v = {
    primary: { bg: color.action, fg: '#fff', border: color.action },
    secondary: { bg: color.surface, fg: color.ink, border: color.ink },
    tertiary: { bg: 'transparent', fg: color.link, border: 'transparent' },
    danger: { bg: color.surface, fg: color.error, border: color.error },
  }[variant]
  const off = disabled || busy
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: off, busy }}
      disabled={off} onPress={onPress}
      style={({ pressed }) => [s.button, { backgroundColor: v.bg, borderColor: v.border, opacity: off ? 0.5 : pressed ? 0.85 : 1 }, style]}>
      {busy ? <ActivityIndicator color={v.fg} /> : <Text style={[s.buttonText, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  )
}

// --- Inputs -------------------------------------------------------------------------------
export function Field({ label, error, hint, children, required }: { label: string; error?: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}{required ? <Text style={s.muted}> (required)</Text> : null}</Text>
      {children}
      {error ? <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text> : hint ? <Small>{hint}</Small> : null}
    </View>
  )
}

export function TextField({ unit, invalid, style, ...rest }: TextInputProps & { unit?: string; invalid?: boolean }) {
  return (
    <View style={[s.input, invalid && s.inputInvalid, rest.editable === false && { backgroundColor: color.head }]}>
      <TextInput placeholderTextColor={color.muted} style={[s.inputText, style]} {...rest} />
      {unit ? <Text style={s.muted}>{unit}</Text> : null}
    </View>
  )
}

export function NumberField(props: TextInputProps & { unit?: string; invalid?: boolean }) {
  return <TextField keyboardType="decimal-pad" inputMode="decimal" {...props} style={[{ textAlign: 'right' }, props.style]} />
}

/** Opens a full screen list to choose one value. */
export function Picker<T extends string | number>({ label, value, options, onChange, placeholder = 'Choose', invalid, disabled }: {
  label: string; value: T | null | undefined; options: { value: T; label: string }[]; onChange: (v: T | null) => void
  placeholder?: string; invalid?: boolean; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? 'not chosen'}`} disabled={disabled}
        onPress={() => setOpen(true)} style={[s.input, invalid && s.inputInvalid, disabled && { backgroundColor: color.head }]}>
        <Text style={[s.inputText, !current && { color: color.muted }]} numberOfLines={1}>{current?.label ?? placeholder}</Text>
        <Text style={s.muted}>⌄</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
          <Row style={{ padding: 16, borderBottomWidth: 1, borderColor: color.divider }}>
            <H2 style={{ flex: 1 }}>{label}</H2>
            <Button title="Close" variant="tertiary" onPress={() => setOpen(false)} />
          </Row>
          <FlatList data={options} keyExtractor={(o) => String(o.value)}
            ListEmptyComponent={<EmptyState title="No values yet" body="An Admin can add them in Master data." />}
            renderItem={({ item }) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: item.value === value }}
                onPress={() => { onChange(item.value); setOpen(false) }} style={s.option}>
                <Body style={{ flex: 1, fontFamily: item.value === value ? font.semibold : font.regular }}>{item.label}</Body>
                {item.value === value ? <Text style={{ color: color.action }}>✓</Text> : null}
              </Pressable>
            )} />
        </SafeAreaView>
      </Modal>
    </>
  )
}

export function Chips<T extends string | number>({ options, value, onChange, label, single }: {
  options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; label: string; single?: boolean
}) {
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value.includes(o.value)
        return (
          <Pressable key={String(o.value)} accessibilityRole={single ? 'radio' : 'checkbox'} accessibilityState={{ checked: on }}
            onPress={() => onChange(single ? [o.value] : on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            style={[s.chip, on && { backgroundColor: color.ink, borderColor: color.ink }]}>
            <Text style={[s.chipText, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/**
 * Searchable multi select for long master lists (cement brands, grades of concrete, cementitious
 * content...). The field shows the chosen values as tags (tap × to remove one); tapping the field
 * opens a full screen list with a search box and a tick per value.
 */
export function MultiPicker<T extends string | number>({ label, value, options, onChange, invalid, max, loading, placeholder = 'Choose' }: {
  label: string; value: T[]; options: { value: T; label: string }[]; onChange: (v: T[]) => void
  invalid?: boolean; max?: number; loading?: boolean; placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const byValue = new Map(options.map((o) => [o.value, o]))
  const chosen = value.map((v) => byValue.get(v) ?? { value: v, label: String(v) })
  const shown = matchOptions(options, query)
  const full = max !== undefined && value.length >= max
  const close = () => { setOpen(false); setQuery('') }
  const toggle = (v: T) => {
    const on = value.includes(v)
    if (!on && full) return
    onChange(on ? value.filter((x) => x !== v) : [...value, v])
  }
  const summary = chosen.length ? chosen.map((o) => o.label).join(', ') : 'none chosen'
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${summary}`} accessibilityHint="Opens a searchable list"
        disabled={loading} onPress={() => setOpen(true)}
        style={[s.input, { paddingVertical: 6, flexWrap: 'wrap' }, invalid && s.inputInvalid]}>
        {loading ? <Text style={[s.inputText, { color: color.muted }]}>Loading…</Text>
          : chosen.length === 0 ? <Text style={[s.inputText, { color: color.muted }]}>{placeholder}</Text>
            : (
              <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {chosen.map((o) => (
                  <View key={String(o.value)} style={s.tag}>
                    <Text style={s.tagText} numberOfLines={1}>{o.label}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${o.label}`} hitSlop={10}
                      onPress={() => onChange(value.filter((x) => x !== o.value))} style={s.tagX}>
                      <Text style={s.tagXText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
        <Text style={s.muted}>⌄</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={{ flex: 1, backgroundColor: color.surface }}>
          <Row style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: color.divider }}>
            <H2 style={{ flex: 1 }}>{label}</H2>
            <Button title="Done" variant="tertiary" onPress={close} />
          </Row>
          <View style={{ padding: 16, paddingBottom: 8 }}>
            <TextField accessibilityLabel={`Search ${label}`} placeholder="Search" value={query} onChangeText={setQuery}
              autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" returnKeyType="search" />
          </View>
          <FlatList data={shown} keyExtractor={(o) => String(o.value)} keyboardShouldPersistTaps="handled" initialNumToRender={30}
            ListEmptyComponent={options.length
              ? <View style={{ padding: 16 }}><Body>{`Nothing matches "${query}".`}</Body></View>
              : <EmptyState title="No values yet" body="An Admin can add them in Master data." />}
            renderItem={({ item }) => {
              const on = value.includes(item.value)
              const off = !on && full
              return (
                <Pressable accessibilityRole="checkbox" accessibilityLabel={item.label} accessibilityState={{ checked: on, disabled: off }}
                  disabled={off} onPress={() => toggle(item.value)} style={[s.option, { gap: 12 }, off && { opacity: 0.45 }]}>
                  <View style={[s.box, on && { backgroundColor: color.ink, borderColor: color.ink }]}>
                    {on ? <Text style={{ color: '#fff', fontSize: 14, lineHeight: 16 }}>✓</Text> : null}
                  </View>
                  <Body style={{ flex: 1, fontFamily: on ? font.semibold : font.regular }}>{item.label}</Body>
                </Pressable>
              )
            }} />
          <Row style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderColor: color.divider, backgroundColor: color.head }}>
            <Small style={{ flex: 1 }}>{value.length} selected{max !== undefined ? `, up to ${max}` : ''}</Small>
            {value.length > 0 ? <Button title="Clear" variant="tertiary" onPress={() => onChange([])} /> : null}
          </Row>
        </SafeAreaView>
      </Modal>
    </>
  )
}

// --- Status --------------------------------------------------------------------------------
const PROJECT_LABEL: Record<ProjectStatus, string> = {
  draft: 'Draft', created: 'Created', support_requested: 'Support requested', assigned_to_ct: 'Assigned to CT',
  trial_in_progress: 'Trial in progress', trials_closed: 'Trials closed', completed: 'Completed',
}
export function Pill({ text, bg, fg, border }: { text: string; bg: string; fg: string; border?: string }) {
  return <View style={[s.pill, { backgroundColor: bg }, border ? { borderWidth: 1, borderColor: border } : null]}><Text style={[s.pillText, { color: fg }]}>{text}</Text></View>
}
export const ProjectStatusChip = ({ status }: { status: ProjectStatus }) => {
  const c = color.status[status] as { bg: string; fg: string; border?: string }
  return <Pill text={PROJECT_LABEL[status]} bg={c.bg} fg={c.fg} border={c.border} />
}
export const TrialStatusChip = ({ status }: { status: TrialStatus }) => ({
  draft: <Pill text="Draft" bg={color.status.draft.bg} fg={color.status.draft.fg} />,
  in_progress: <Pill text="In progress" bg={color.status.trial_in_progress.bg} fg="#fff" />,
  closed: <Pill text="Closed" bg="#fff" fg={color.ink} border={color.ink} />,
})[status]
export const OutcomeChip = ({ outcome }: { outcome: Outcome }) => outcome === 'met'
  ? <Pill text="Met expectation" bg={color.met.bg} fg={color.met.fg} />
  : outcome === 'below' ? <Pill text="Below expectation" bg={color.below.bg} fg={color.below.fg} />
    : <Pill text="Not concluded" bg={color.head} fg={color.subtle} />
export const CheckChip = ({ status }: { status: CheckStatus }) => ({
  met: <Pill text="Met" bg={color.met.bg} fg={color.met.fg} />,
  not_met: <Pill text="Not met" bg={color.below.bg} fg={color.below.fg} />,
  pending: <Pill text="Pending" bg={color.head} fg={color.subtle} />,
})[status]
export const PROJECT_STATUS_LABEL = PROJECT_LABEL

// --- States --------------------------------------------------------------------------------
export function Loading({ label = 'Loading' }: { label?: string }) {
  return <View style={{ padding: 32, alignItems: 'center', gap: 10 }} accessibilityLiveRegion="polite"><ActivityIndicator color={color.ink} /><Small>{label}…</Small></View>
}
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return <View style={{ padding: 24, gap: 8 }}><Strong>{title}</Strong>{body ? <Body style={s.muted}>{body}</Body> : null}{action}</View>
}
/** A failed load or action in plain words. Not found and no access cannot be
 * fixed by trying again, so they get no Try again button. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = statusOf(error)
  const final = status === 403 || status === 404
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.errorBox}>
      <Body style={{ color: '#7A1A14', flex: 1 }}>{errorMessage(error)}</Body>
      {onRetry && !final ? <Button title="Try again" onPress={onRetry} /> : null}
    </View>
  )
}
export function Banner({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const t = { info: ['#DCE7F2', '#1F4568'], warn: ['#FCEBD7', '#5A3104'], error: ['#FBECEB', '#7A1A14'], ok: ['#D8EFE5', '#0B5C43'] }[tone]
  return <View accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion={tone === 'error' ? 'polite' : undefined} style={[s.banner, { backgroundColor: t[0] }]}><Text style={[s.body, { color: t[1] }]}>{children}</Text></View>
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.concrete },
  body16: { padding: 16 },
  h1: { fontFamily: font.condBold, fontSize: 26, lineHeight: 30, color: color.ink },
  h2: { fontFamily: font.cond, fontSize: 18, lineHeight: 22, color: color.ink },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: color.ink },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18, color: color.muted },
  strong: { fontFamily: font.semibold, fontSize: 15, color: color.ink },
  muted: { fontFamily: font.regular, fontSize: 14, color: color.muted },
  header: { backgroundColor: color.surface, borderBottomWidth: 1, borderColor: color.line, paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  back: { minHeight: TOUCH, justifyContent: 'center' },
  backText: { fontFamily: font.semibold, fontSize: 15, color: color.link },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: color.surface, borderTopWidth: 1, borderColor: color.line },
  card: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { minHeight: 48, borderRadius: radius.field, borderWidth: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  buttonText: { fontFamily: font.semibold, fontSize: 15 },
  label: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  error: { fontFamily: font.regular, fontSize: 13, color: color.error },
  input: { minHeight: TOUCH, borderRadius: radius.field, borderWidth: 1, borderColor: color.field, backgroundColor: color.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputInvalid: { borderWidth: 2, borderColor: color.error, paddingHorizontal: 11 },
  inputText: { flex: 1, fontFamily: font.medium, fontSize: 16, color: color.ink, paddingVertical: 10, fontVariant: ['tabular-nums'] },
  option: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: color.divider },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: color.field, backgroundColor: color.surface, justifyContent: 'center' },
  chipText: { fontFamily: font.semibold, fontSize: 14, color: color.ink },
  tag: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%', minHeight: 30, borderRadius: 15, borderWidth: 1, borderColor: color.line, backgroundColor: color.head, paddingLeft: 10, paddingRight: 2 },
  tagText: { flexShrink: 1, fontFamily: font.semibold, fontSize: 14, color: color.ink },
  tagX: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  tagXText: { fontSize: 18, lineHeight: 20, color: color.subtle },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: color.field, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface },
  pill: { alignSelf: 'flex-start', height: 24, paddingHorizontal: 9, borderRadius: 12, justifyContent: 'center' },
  pillText: { fontFamily: font.semibold, fontSize: 12 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: radius.card, backgroundColor: '#FBECEB' },
  banner: { padding: 12, borderRadius: radius.card },
})
