import { useState, type Ref } from 'react'
import { Pressable, Text, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native'

import { s } from '@/ui/kit'
import { color, font } from '@/ui/theme'

/** A password input in the kit's field style, with Show and Hide. */
export function PasswordField({ invalid, label, style, ref, ...rest }: TextInputProps & { invalid?: boolean; label: string; ref?: Ref<TextInputInstance> }) {
  const [shown, setShown] = useState(false)
  const name = label.toLowerCase()
  return (
    <View style={[s.input, invalid && s.inputInvalid, { paddingRight: 0 }]}>
      <TextInput ref={ref} placeholderTextColor={color.muted} style={[s.inputText, style]} accessibilityLabel={label}
        secureTextEntry={!shown} autoCapitalize="none" autoCorrect={false} spellCheck={false} {...rest} />
      <Pressable accessibilityRole="button" accessibilityLabel={shown ? `Hide ${name}` : `Show ${name}`}
        onPress={() => setShown((x) => !x)} hitSlop={4}
        style={{ minHeight: 44, minWidth: 64, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: font.semibold, fontSize: 14, color: color.link }}>{shown ? 'Hide' : 'Show'}</Text>
      </Pressable>
    </View>
  )
}
