/**
 * Trial date and time entry. No date picker package is installed, so the
 * date and time are typed on the number pad (masked to dd/mm/yyyy and
 * hh:mm, 24 hour, IST) with one tap helpers: previous day, next day and
 * Now. The form turns the two texts into an ISO string with +05:30.
 */
import { Pressable, Text, View } from 'react-native'

import { Field, TextField } from '@/ui/kit'
import { color, font, radius, TOUCH } from '@/ui/theme'

import { castIso, maskDate, maskTime, nowParts, shiftDay } from './castAt'
import { shortDateTime } from './format'

export function CastAtField({ date, time, onChange, error, readOnly }: {
  date: string; time: string; onChange: (date: string, time: string) => void; error?: string | null; readOnly?: boolean
}) {
  const parsed = castIso(date, time)
  const hint = parsed.iso ? `${shortDateTime(parsed.iso)} IST. Cube test dates count from this.` : 'Cube test dates count from this.'
  return (
    <Field label="Trial date and time, IST" error={error ?? undefined} hint={hint}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1.3 }}>
          <TextField accessibilityLabel="Trial date, day month year" placeholder="dd/mm/yyyy" value={date} editable={!readOnly}
            keyboardType="number-pad" inputMode="numeric" maxLength={10} invalid={!!error}
            onChangeText={(v) => onChange(maskDate(v), time)} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField accessibilityLabel="Trial time, 24 hour hours and minutes" placeholder="hh:mm" value={time} editable={!readOnly}
            keyboardType="number-pad" inputMode="numeric" maxLength={5} invalid={!!error}
            onChangeText={(v) => onChange(date, maskTime(v))} />
        </View>
      </View>
      {!readOnly && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Step label="Previous day" text="− 1 day" onPress={() => onChange(shiftDay(date, -1), time)} />
          <Step label="Next day" text="+ 1 day" onPress={() => onChange(shiftDay(date, 1), time)} />
          <Step label="Set to now" text="Now" onPress={() => { const p = nowParts(); onChange(p.date, p.time) }} />
        </View>
      )}
    </Field>
  )
}

function Step({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: TOUCH, borderRadius: radius.field, borderWidth: 1, borderColor: color.field, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? color.head : color.surface })}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.ink }}>{text}</Text>
    </Pressable>
  )
}
