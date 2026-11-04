/** Bottom sheets: a panel that slides up over the screen, plus confirm and note variants. */
import { useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Banner, Body, Button, ErrorState, Field, H2, Row, TextField } from '@/ui/kit'
import { color } from '@/ui/theme'

export function Sheet({ open, onClose, title, children, footer, tall }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; tall?: boolean
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(35,31,32,0.45)' }} />
        <View accessibilityViewIsModal
          style={{ backgroundColor: color.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '92%', height: tall ? '92%' : undefined }}>
          <Row style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, borderBottomWidth: 1, borderColor: color.divider }}>
            <H2 style={{ flex: 1, fontSize: 20 }}>{title}</H2>
            <Button title="Close" variant="tertiary" onPress={onClose} style={{ flexGrow: 0 }} />
          </Row>
          <ScrollView style={tall ? { flex: 1 } : undefined} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12), borderTopWidth: 1, borderColor: color.line }}>
              {footer}
            </View>
          ) : <View style={{ height: Math.max(insets.bottom, 12) }} />}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/** Yes or no before a consequential action. */
export function ConfirmSheet({ open, onClose, title, body, confirmLabel, cancelLabel = 'Cancel', danger, busy, error, onConfirm }: {
  open: boolean; onClose: () => void; title: string; body: ReactNode; confirmLabel: string; cancelLabel?: string
  danger?: boolean; busy?: boolean; error?: unknown; onConfirm: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<>
        <Button title={cancelLabel} onPress={onClose} />
        <Button title={confirmLabel} variant={danger ? 'danger' : 'primary'} busy={busy} onPress={onConfirm} />
      </>}>
      {typeof body === 'string' ? <Body>{body}</Body> : body}
      {error ? <View accessibilityLiveRegion="polite"><ErrorState error={error} /></View> : null}
    </Sheet>
  )
}

/** An action with an optional note (Request support, Reopen). Remounts on open so the note starts empty. */
export function NoteSheet(props: {
  open: boolean; onClose: () => void; title: string; intro: string; noteLabel: string; confirmLabel: string
  busy?: boolean; error?: unknown; onConfirm: (note: string) => void
}) {
  return <NoteSheetBody key={props.open ? 'open' : 'closed'} {...props} />
}

function NoteSheetBody({ open, onClose, title, intro, noteLabel, confirmLabel, busy, error, onConfirm }: Parameters<typeof NoteSheet>[0]) {
  const [note, setNote] = useState('')
  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={<>
        <Button title="Cancel" onPress={onClose} />
        <Button title={confirmLabel} variant="primary" busy={busy} onPress={() => onConfirm(note.trim())} />
      </>}>
      <Body style={{ color: color.subtle }}>{intro}</Body>
      <Field label={noteLabel} hint="Optional">
        <TextField accessibilityLabel={noteLabel} value={note} onChangeText={setNote} multiline style={{ minHeight: 80, textAlignVertical: 'top' }} />
      </Field>
      {error ? <View accessibilityLiveRegion="polite"><ErrorState error={error} /></View> : null}
    </Sheet>
  )
}

/** A short confirmation shown after an action succeeds. */
export function Notice({ text, onDone }: { text: string | null; onDone?: () => void }) {
  if (!text) return null
  return (
    <View accessibilityLiveRegion="polite">
      <Pressable accessibilityRole="button" accessibilityLabel={`${text}. Dismiss`} onPress={onDone}>
        <Banner tone="ok">{text}</Banner>
      </Pressable>
    </View>
  )
}
