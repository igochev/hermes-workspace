import { useEffect, useMemo, useState } from 'react'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

export type SessionEventsRefreshStatus = 'live' | 'reconnecting' | 'polling'

type UseSessionEventsRefreshOptions = {
  queryClient: QueryClient
  queryKey: QueryKey
  debounceMs?: number
}

const SESSION_REFRESH_EVENTS = new Set([
  'connected',
  'user_message',
  'message',
  'assistant_message',
  'done',
  'error',
  'session_updated',
])

function parseEventData(raw: MessageEvent['data']): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function shouldRefreshSessionsForChatEvent(
  eventName: string,
  data: unknown,
): boolean {
  if (!SESSION_REFRESH_EVENTS.has(eventName)) return false
  return isRecord(data)
}

export function useSessionEventsRefresh({
  queryClient,
  queryKey,
  debounceMs = 750,
}: UseSessionEventsRefreshOptions): { status: SessionEventsRefreshStatus } {
  const [status, setStatus] = useState<SessionEventsRefreshStatus>('polling')
  const stableQueryKey = useMemo(() => queryKey, [queryKey])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.EventSource !== 'function'
    ) {
      setStatus('polling')
      return undefined
    }

    let closed = false
    let invalidateTimer: ReturnType<typeof window.setTimeout> | null = null
    const eventSource = new window.EventSource('/api/chat-events')

    const scheduleInvalidate = () => {
      if (invalidateTimer !== null) {
        window.clearTimeout(invalidateTimer)
      }
      invalidateTimer = window.setTimeout(() => {
        invalidateTimer = null
        void queryClient.invalidateQueries({ queryKey: stableQueryKey })
      }, debounceMs)
    }

    const handleRefreshEvent = (eventName: string) => (event: MessageEvent) => {
      const data = parseEventData(event.data)
      if (!shouldRefreshSessionsForChatEvent(eventName, data)) return
      setStatus('live')
      scheduleInvalidate()
    }

    const listeners = Array.from(SESSION_REFRESH_EVENTS, (eventName) => {
      const listener = handleRefreshEvent(eventName)
      eventSource.addEventListener(eventName, listener)
      return { eventName, listener }
    })

    eventSource.onerror = () => {
      if (closed) return
      setStatus('reconnecting')
      eventSource.close()
      window.setTimeout(() => {
        if (!closed) setStatus('polling')
      }, 500)
    }

    return () => {
      closed = true
      if (invalidateTimer !== null) {
        window.clearTimeout(invalidateTimer)
      }
      listeners.forEach(({ eventName, listener }) => {
        eventSource.removeEventListener(eventName, listener)
      })
      eventSource.close()
    }
  }, [debounceMs, queryClient, stableQueryKey])

  return { status }
}
