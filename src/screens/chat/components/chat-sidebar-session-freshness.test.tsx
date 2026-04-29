import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CHAT_SIDEBAR_CLICKABILITY_AUDIT, SessionFreshnessBadge, areSidebarPropsEqual } from './chat-sidebar'

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

describe('chat sidebar clickability audit', () => {
  it('documents session sidebar controls and marks freshness/stale indicators static', () => {
    expect(CHAT_SIDEBAR_CLICKABILITY_AUDIT).toEqual([
      { surface: 'new-chat', label: 'New chat', kind: 'button', target: 'create session' },
      { surface: 'collapse-sidebar', label: 'Collapse sidebar', kind: 'button', target: 'toggle sidebar collapsed state' },
      { surface: 'session-search', label: 'Search conversations', kind: 'button', target: 'open search modal' },
      { surface: 'session-row', label: 'Open session', kind: 'link', target: '/chat/:sessionKey' },
      { surface: 'session-menu', label: 'Session actions', kind: 'button', target: 'rename/delete session menu' },
      { surface: 'session-refresh-retry', label: 'Retry', kind: 'button', target: 'refetch sessions after sidebar error' },
      { surface: 'session-freshness-badge', label: 'Session refresh status', kind: 'static', target: null },
      { surface: 'session-stale-indicator', label: 'Stale session indicator', kind: 'static', target: null },
    ])
  })
})

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
