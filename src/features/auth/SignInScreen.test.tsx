// Sign in screen: the options the server allows, the temporary ID and password
// form (checks, server errors, no double submit) and the fallback when the
// options cannot be read.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { SignInScreen } from './SignInScreen'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

type Auth = Record<string, unknown>
let mockAuth: Auth = {}
jest.mock('@/auth/AuthProvider', () => ({ DEV_LOGIN: false, useAuth: () => mockAuth }))

const base = (over: Auth = {}): Auth => ({
  signInWithMicrosoft: jest.fn(), devSignIn: jest.fn(), signInWithPassword: jest.fn(async () => null), reloadOptions: jest.fn(async () => undefined),
  error: null, busy: false, microsoftConfigured: true, options: { microsoft: true, password: true }, optionsState: 'ready', ...over,
})

it('shows Microsoft and the ID and password form when both are on', async () => {
  mockAuth = base()
  await render(<SignInScreen />)
  expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeTruthy()
  expect(screen.getByText('Sign in with ID and password')).toBeTruthy()
  expect(screen.getByLabelText('Email or employee ID')).toBeTruthy()
})

it('hides the password form when the server has it off, and Microsoft when that is off', async () => {
  mockAuth = base({ options: { microsoft: true, password: false } })
  const view = await render(<SignInScreen />)
  expect(screen.queryByText('Sign in with ID and password')).toBeNull()
  mockAuth = base({ options: { microsoft: false, password: true } })
  await view.rerender(<SignInScreen />)
  expect(screen.queryByRole('button', { name: 'Sign in with Microsoft' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy()
})

it('shows loading while the options are checked', async () => {
  mockAuth = base({ options: null, optionsState: 'loading' })
  await render(<SignInScreen />)
  expect(screen.getByText('Checking how you can sign in…')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Sign in with Microsoft' })).toBeNull()
})

it('still offers both ways with a plain error and Try again when the options cannot be read', async () => {
  const reloadOptions = jest.fn(async () => undefined)
  mockAuth = base({ options: null, optionsState: 'error', reloadOptions })
  await render(<SignInScreen />)
  expect(screen.getByText('Could not check how you can sign in. Check your connection and try again.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeTruthy()
  expect(screen.getByText('Sign in with ID and password')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'Check sign in options again' }))
  expect(reloadOptions).toHaveBeenCalled()
})

it('shows field messages and the server sentence under the form', async () => {
  const signInWithPassword = jest.fn()
    .mockResolvedValueOnce({ fields: { login: 'Enter your email or employee ID.', password: 'Enter your password.' } })
    .mockResolvedValueOnce({ message: 'The ID or password is not correct.', fields: {} })
  mockAuth = base({ signInWithPassword })
  await render(<SignInScreen />)
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Enter your email or employee ID.')).toBeTruthy()
  expect(screen.getByText('Enter your password.')).toBeTruthy()

  await fireEvent.changeText(screen.getByLabelText('Email or employee ID'), 'E1007')
  expect(screen.queryByText('Enter your email or employee ID.')).toBeNull()
  await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-one')
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('The ID or password is not correct.')).toBeTruthy()
  expect(signInWithPassword).toHaveBeenLastCalledWith('E1007', 'wrong-one')
})

it('sends once however often Sign in or the keyboard Go key is pressed while it runs', async () => {
  let finish: (v: null) => void = () => undefined
  const signInWithPassword = jest.fn(() => new Promise<null>((resolve) => { finish = resolve }))
  mockAuth = base({ signInWithPassword })
  await render(<SignInScreen />)
  await fireEvent.changeText(screen.getByLabelText('Email or employee ID'), 'sneha@thermaxglobal.com')
  await fireEvent.changeText(screen.getByLabelText('Password'), 'Secret#123')
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  await fireEvent(screen.getByLabelText('Password'), 'submitEditing')
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
  expect(signInWithPassword).toHaveBeenCalledTimes(1)
  finish(null)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy())
})

it('shows and hides the password', async () => {
  mockAuth = base()
  await render(<SignInScreen />)
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true)
  await fireEvent.press(screen.getByRole('button', { name: 'Show password' }))
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false)
  await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }))
  expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true)
})
