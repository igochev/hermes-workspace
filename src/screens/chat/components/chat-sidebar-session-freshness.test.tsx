import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { areSidebarPropsEqual, SessionFreshnessBadge } from './chat-sidebar'

type ChatSidebarProps = Parameters<typeof areSidebarPropsEqual>[0]

function baseSidebarProps(): ChatSidebarProps {
  return {
    sessions: [],
    activeFriendlyId: 'main',
    creatingSession: false,
    onCreateSession: () => undefined,
    isCollapsed: false,
    onToggleCollapse: () => undefined,
    sessionsLoading: false,
    sessionsFetching: false,
    sessionsError: null,
    onRetrySessions: () => undefined,
    sessionRefreshStatus: 'polling',
  }
}

describe('SessionFreshnessBadge', () => {
  it.each([
    ['live', 'Live'],
    ['reconnecting', 'Reconnecting'],
    ['polling', 'Polling'],
  ] as const)('renders %s session freshness status', (status, label) => {
    const markup = renderToStaticMarkup(
      <SessionFreshnessBadge status={status} />,
    )

    expect(markup).toContain(label)
    expect(markup).toContain(`Session refresh: ${label}`)
  })
})

describe('areSidebarPropsEqual', () => {
  it('re-renders when only the session freshness status changes', () => {
    const prevProps = baseSidebarProps()
    const nextProps = {
      ...prevProps,
      sessionRefreshStatus: 'live' as const,
    }

    expect(areSidebarPropsEqual(prevProps, nextProps)).toBe(false)
  })
})
