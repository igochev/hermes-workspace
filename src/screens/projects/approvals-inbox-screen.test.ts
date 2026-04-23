import { describe, expect, it } from 'vitest'

import {
  APPROVALS_INBOX_EMPTY_COPY,
  APPROVALS_INBOX_PANEL_CLASS,
  APPROVALS_INBOX_QUERY_KEY,
} from './approvals-inbox-screen'

describe('approvals inbox screen constants', () => {
  it('uses a dedicated mission control approvals query namespace', () => {
    expect(APPROVALS_INBOX_QUERY_KEY).toEqual(['mission-control', 'approvals'])
  })

  it('uses theme-card surfaces for readable approvals inbox panels in dark mode', () => {
    expect(APPROVALS_INBOX_PANEL_CLASS).toContain('bg-[var(--theme-card)]')
    expect(APPROVALS_INBOX_PANEL_CLASS).toContain('border-[var(--theme-border)]')
    expect(APPROVALS_INBOX_PANEL_CLASS).not.toContain('bg-white/80')
  })

  it('keeps empty copy focused on review operations', () => {
    expect(APPROVALS_INBOX_EMPTY_COPY).toContain('No pending approvals')
  })
})
