// Set password (Admin) and Change password: client checks, server field
// errors on the right inputs, a switched off feature, and success.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'

import type { User } from '@/shared/types'

import { ChangePasswordSheet, SetPasswordSheet } from './PasswordSheets'

const mockApi = jest.fn()
jest.mock('@/api/client', () => ({ api: (...a: unknown[]) => mockApi(...a) }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)
const mockReload = jest.fn(async () => undefined)
jest.mock('@/auth/AuthProvider', () => ({ useAuth: () => ({ reloadOptions: mockReload }) }))

const err = (status: number, code: string, message: string, fields: Record<string, string[]> = {}) => Object.assign(new Error(message), { status, code, fields })
const ravi = { id: 2, full_name: 'Ravi Kumar', emp_id: 'E1002' } as User
const wrap = async (node: ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}
const type = async (label: string, text: string) => fireEvent.changeText(screen.getByLabelText(label), text)

beforeEach(() => { mockApi.mockReset(); mockReload.mockClear() })

describe('Set password', () => {
  it('checks length and the confirmation before sending', async () => {
    await wrap(<SetPasswordSheet user={ravi} onClose={jest.fn()} onDone={jest.fn()} />)
    await type('New password', 'short')
    await fireEvent.press(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy()
    await type('New password', 'Longer#123')
    await type('Confirm password', 'Longer#124')
    await fireEvent.press(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByText('The two passwords do not match.')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalled()
  })

  it('shows the server password rules by the input and confirms success by name', async () => {
    mockApi.mockRejectedValueOnce(err(400, 'validation_error', 'Some fields need attention.', { password: ['This password is too common.'] }))
    mockApi.mockResolvedValueOnce(undefined)
    const onDone = jest.fn()
    await wrap(<SetPasswordSheet user={ravi} onClose={jest.fn()} onDone={onDone} />)
    await type('New password', 'password1')
    await type('Confirm password', 'password1')
    await fireEvent.press(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByText('This password is too common.')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/users/2/set-password/', { body: { password: 'password1' } })

    await type('New password', 'Kiln#Batch42')
    await type('Confirm password', 'Kiln#Batch42')
    await fireEvent.press(screen.getByRole('button', { name: 'Set password' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Password set for Ravi Kumar'))
  })

  it('says passwords are off and checks the options again when the server answers 404', async () => {
    mockApi.mockRejectedValueOnce(err(404, 'not_found', 'Not found.'))
    await wrap(<SetPasswordSheet user={ravi} onClose={jest.fn()} onDone={jest.fn()} />)
    await type('New password', 'Kiln#Batch42')
    await type('Confirm password', 'Kiln#Batch42')
    await fireEvent.press(screen.getByRole('button', { name: 'Set password' }))
    expect(await screen.findByText('Passwords are turned off on the server. Ask your CCA admin.')).toBeTruthy()
    expect(mockReload).toHaveBeenCalled()
  })
})

describe('Change password', () => {
  it('needs the current password and maps a wrong one to its input', async () => {
    mockApi.mockRejectedValueOnce(err(400, 'validation_error', 'Some fields need attention.', { current_password: ['The current password is not correct.'] }))
    await wrap(<ChangePasswordSheet onClose={jest.fn()} onDone={jest.fn()} />)
    await type('New password', 'Kiln#Batch42')
    await type('Confirm new password', 'Kiln#Batch42')
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('Enter your current password.')).toBeTruthy()
    expect(mockApi).not.toHaveBeenCalled()

    await type('Current password', 'Old#Pass99')
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('The current password is not correct.')).toBeTruthy()
    expect(mockApi).toHaveBeenCalledWith('/auth/change-password/', { body: { current_password: 'Old#Pass99', new_password: 'Kiln#Batch42' } })
  })

  it('shows the server sentence when the person has no password yet', async () => {
    mockApi.mockRejectedValueOnce(err(400, 'validation_error', 'Some fields need attention.', { current_password: ['You do not have a password yet. Ask an Admin to set one.'] }))
    await wrap(<ChangePasswordSheet onClose={jest.fn()} onDone={jest.fn()} />)
    await type('Current password', 'anything1')
    await type('New password', 'Kiln#Batch42')
    await type('Confirm new password', 'Kiln#Batch42')
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('You do not have a password yet. Ask an Admin to set one.')).toBeTruthy()
  })

  it('shows new password rules from the server by the new password input, then confirms', async () => {
    mockApi.mockRejectedValueOnce(err(400, 'validation_error', 'Some fields need attention.', { new_password: ['This password is entirely numeric.'] }))
    mockApi.mockResolvedValueOnce(undefined)
    const onDone = jest.fn()
    await wrap(<ChangePasswordSheet onClose={jest.fn()} onDone={onDone} />)
    await type('Current password', 'Old#Pass99')
    await type('New password', '12345678')
    await type('Confirm new password', '12345678')
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }))
    expect(await screen.findByText('This password is entirely numeric.')).toBeTruthy()
    await type('New password', 'Kiln#Batch42')
    await type('Confirm new password', 'Kiln#Batch42')
    await fireEvent.press(screen.getByRole('button', { name: 'Change password' }))
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Password changed'))
  })
})
