import { describe, expect, it } from 'vitest'
import { shouldRefreshSessionsForChatEvent } from './use-session-events-refresh'

describe('shouldRefreshSessionsForChatEvent', () => {
  it.each([
    'connected',
    'user_message',
    'message',
    'assistant_message',
    'done',
    'error',
    'session_updated',
  ])('refreshes sessions for %s events', (eventName) => {
    expect(
      shouldRefreshSessionsForChatEvent(eventName, { sessionKey: 'main' }),
    ).toBe(true)
  })

  it.each(['heartbeat', 'token', 'unknown', ''])(
    'ignores %s events',
    (eventName) => {
      expect(
        shouldRefreshSessionsForChatEvent(eventName, { sessionKey: 'main' }),
      ).toBe(false)
    },
  )

  it('ignores malformed events without metadata', () => {
    expect(shouldRefreshSessionsForChatEvent('message', null)).toBe(false)
    expect(shouldRefreshSessionsForChatEvent('message', undefined)).toBe(false)
  })
})
