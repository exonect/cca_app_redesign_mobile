// ErrorState: plain words for every failure; Try again only where it can help.
import { fireEvent, render, screen } from '@testing-library/react-native'

import { ErrorState } from './kit'

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default)

const apiError = (status: number, message: string) => Object.assign(new Error(message), { status, code: 'error', fields: {} })

describe('ErrorState', () => {
  it('says not found plainly and offers no retry', async () => {
    await render(<ErrorState error={apiError(404, 'Not found.')} onRetry={jest.fn()} />)
    expect(screen.getByText('This was not found. It may have been deleted, or you may not have access to it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('hides server text for a 5xx and offers retry', async () => {
    const retry = jest.fn()
    await render(<ErrorState error={apiError(503, '<html>Bad gateway</html>')} onRetry={retry} />)
    expect(screen.getByText('Something went wrong on the server. Try again.')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
  })

  it('never shows a programming error', async () => {
    await render(<ErrorState error={new TypeError('undefined is not an object')} />)
    expect(screen.getByText('Something went wrong. Try again.')).toBeTruthy()
  })
})
