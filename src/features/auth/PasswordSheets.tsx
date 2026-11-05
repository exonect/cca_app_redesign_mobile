/** Temporary passwords (UAT): an Admin sets one for a user; a signed in person changes their own. */
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { api } from '@/api/client'
import { errorMessage, fieldErrors, isApiError } from '@/api/errors'
import { useAuth } from '@/auth/AuthProvider'
import type { User } from '@/shared/types'
import { Banner, Body, Button, Field } from '@/ui/kit'

import { Sheet } from '@/features/projects/Sheet'

import { checkNewPassword, PASSWORD_HINT, PASSWORD_MESSAGES, type NewPasswordFields } from './password'
import { PasswordField } from './PasswordField'

type Errors = NewPasswordFields

/** Server answer to inputs: `server` maps the API field names to this form's. */
function useErrors(server: Record<string, keyof Errors>) {
  const { reloadOptions } = useAuth()
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string>()
  const clear = (k: keyof Errors) => setErrors((e) => ({ ...e, [k]: undefined }))
  const onError = (e: unknown, fallback: string) => {
    if (isApiError(e) && e.status === 404) {
      // The switch was turned off on the server: hide the password actions too.
      void reloadOptions()
      setErrors({})
      setFormError(PASSWORD_MESSAGES.passwordsOff)
      return
    }
    const f = fieldErrors(e)
    const mapped: Errors = {}
    const other: string[] = []
    for (const [k, v] of Object.entries(f)) {
      if (server[k]) mapped[server[k]] ??= v
      else other.push(v)
    }
    setErrors(mapped)
    setFormError(other[0] ?? (Object.keys(mapped).length ? undefined : errorMessage(e, fallback)))
  }
  return { errors, setErrors, formError, setFormError, clear, onError }
}

export function SetPasswordSheet({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: (msg: string) => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const { errors, setErrors, formError, setFormError, clear, onError } = useErrors({ password: 'password' })
  const save = useMutation({
    mutationFn: () => api<void>(`/users/${user.id}/set-password/`, { body: { password } }),
    onSuccess: () => onDone(`Password set for ${user.full_name}`),
    onError: (e) => onError(e, 'The password could not be set. Try again.'),
  })
  const submit = () => {
    if (save.isPending) return
    setFormError(undefined)
    const e = checkNewPassword(password, confirm)
    setErrors(e)
    if (Object.keys(e).length) return
    save.mutate()
  }
  return (
    <Sheet open onClose={onClose} title={`Set password for ${user.full_name}`}
      footer={<>
        <Button title="Cancel" onPress={onClose} />
        <Button title="Set password" variant="primary" busy={save.isPending} onPress={submit} />
      </>}>
      <Body>{`They can sign in with their email or employee ID (${user.emp_id}) and this password. This is for testing only and stops working when ID and password sign in is turned off.`}</Body>
      {formError ? <Banner tone="error">{formError}</Banner> : null}
      <Field label="New password" required error={errors.password} hint={PASSWORD_HINT}>
        <PasswordField label="New password" value={password} invalid={Boolean(errors.password)} autoComplete="new-password" textContentType="newPassword"
          onChangeText={(t) => { setPassword(t); clear('password') }} />
      </Field>
      <Field label="Confirm password" required error={errors.confirm}>
        <PasswordField label="Confirm password" value={confirm} invalid={Boolean(errors.confirm)} autoComplete="new-password" textContentType="newPassword"
          onChangeText={(t) => { setConfirm(t); clear('confirm') }} onSubmitEditing={submit} returnKeyType="done" />
      </Field>
    </Sheet>
  )
}

export function ChangePasswordSheet({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const { errors, setErrors, formError, setFormError, clear, onError } = useErrors({ current_password: 'current_password', new_password: 'password' })
  const save = useMutation({
    mutationFn: () => api<void>('/auth/change-password/', { body: { current_password: current, new_password: password } }),
    onSuccess: () => onDone('Password changed'),
    onError: (e) => onError(e, 'The password could not be changed. Try again.'),
  })
  const submit = () => {
    if (save.isPending) return
    setFormError(undefined)
    const e: Errors = { ...(current ? {} : { current_password: 'Enter your current password.' }), ...checkNewPassword(password, confirm, 'Enter a new password.') }
    setErrors(e)
    if (Object.keys(e).length) return
    save.mutate()
  }
  return (
    <Sheet open onClose={onClose} title="Change password"
      footer={<>
        <Button title="Cancel" onPress={onClose} />
        <Button title="Change password" variant="primary" busy={save.isPending} onPress={submit} />
      </>}>
      <Body>This is the password for ID and password sign in, which is on for testing. Microsoft sign in does not change.</Body>
      {formError ? <Banner tone="error">{formError}</Banner> : null}
      <Field label="Current password" required error={errors.current_password}>
        <PasswordField label="Current password" value={current} invalid={Boolean(errors.current_password)} autoComplete="current-password" textContentType="password"
          onChangeText={(t) => { setCurrent(t); clear('current_password') }} />
      </Field>
      <Field label="New password" required error={errors.password} hint={PASSWORD_HINT}>
        <PasswordField label="New password" value={password} invalid={Boolean(errors.password)} autoComplete="new-password" textContentType="newPassword"
          onChangeText={(t) => { setPassword(t); clear('password') }} />
      </Field>
      <Field label="Confirm new password" required error={errors.confirm}>
        <PasswordField label="Confirm new password" value={confirm} invalid={Boolean(errors.confirm)} autoComplete="new-password" textContentType="newPassword"
          onChangeText={(t) => { setConfirm(t); clear('confirm') }} onSubmitEditing={submit} returnKeyType="done" />
      </Field>
    </Sheet>
  )
}
