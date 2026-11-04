import { fireEvent, render, screen } from '@testing-library/react-native'

import { ScreenErrorBoundary } from './ErrorFallback'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a) } }))

it('offers a way back after a screen crashes', async () => {
  const retry = jest.fn(async () => undefined)
  await render(<ScreenErrorBoundary error={new Error('boom')} retry={retry} />)
  expect(screen.getByText('This screen stopped working')).toBeTruthy()
  expect(screen.queryByText('boom')).toBeNull()
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalledTimes(1)
  await fireEvent.press(screen.getByRole('button', { name: 'Go to My work' }))
  expect(mockReplace).toHaveBeenCalledWith('/')
})
