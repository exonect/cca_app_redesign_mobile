// Master data value editor: one save however often it is submitted (audit round 2).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { ValueEditor } from './MasterDataScreen'

jest.mock('@/api/client', () => ({ api: jest.fn(async () => []), ApiError: class extends Error {}, fieldErrors: () => ({}), session: {} }))
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true } }))
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

it('saves once when the keyboard Done key is pressed again while saving', async () => {
  let finish: (v: { id: number; value: string }) => void = () => undefined
  const onSave = jest.fn(() => new Promise<{ id: number; value: string }>((resolve) => { finish = resolve }))
  const onSaved = jest.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  await render(
    <QueryClientProvider client={qc}>
      <ValueEditor category="cement_brand" label="New cement brand" numeric={false} isCity={false} submitLabel="Add value"
        onSave={onSave as never} onSaved={onSaved} onCancel={jest.fn()} />
    </QueryClientProvider>,
  )
  const input = screen.getByLabelText('New cement brand')
  await fireEvent.changeText(input, 'Ultratech')
  await fireEvent(input, 'submitEditing')
  await fireEvent(input, 'submitEditing')
  await fireEvent.press(screen.getByRole('button', { name: 'Add value' }))
  expect(onSave).toHaveBeenCalledTimes(1)
  finish({ id: 9, value: 'Ultratech' })
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
})
