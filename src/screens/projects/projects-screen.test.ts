import { describe, expect, it } from 'vitest'

import {
  PROJECTS_CARD_CLASS,
  PROJECTS_CLICKABILITY_AUDIT,
  PROJECTS_PANEL_CLASS,
  PROJECTS_QUERY_KEY,
} from './projects-screen'

describe('projects screen constants', () => {
  it('uses the mission control projects query key namespace', () => {
    expect(PROJECTS_QUERY_KEY).toEqual(['mission-control', 'projects'])
  })

  it('uses theme-card surfaces for readable project panels in dark mode', () => {
    expect(PROJECTS_PANEL_CLASS).toContain('bg-[var(--theme-card)]')
    expect(PROJECTS_PANEL_CLASS).toContain('border-[var(--theme-border)]')
    expect(PROJECTS_PANEL_CLASS).not.toContain('bg-primary-50/85')
  })

  it('uses theme-card surfaces for readable project cards in dark mode', () => {
    expect(PROJECTS_CARD_CLASS).toContain('bg-[var(--theme-card)]')
    expect(PROJECTS_CARD_CLASS).toContain('border-[var(--theme-border)]')
    expect(PROJECTS_CARD_CLASS).not.toContain('bg-white/80')
  })

  it('documents projects list clickability for all button-like surfaces', () => {
    expect(PROJECTS_CLICKABILITY_AUDIT).toEqual([
      { surface: 'refresh', label: 'Refresh', kind: 'button', target: 'projectsQuery.refetch' },
      { surface: 'approvals-inbox', label: 'Approvals Inbox', kind: 'link', target: '/projects/approvals' },
      { surface: 'autopilot-inbox', label: 'Autopilot Inbox', kind: 'link', target: '/projects/autopilot' },
      { surface: 'new-project', label: 'New Project', kind: 'button', target: 'toggle-create-project-form' },
      { surface: 'project-card', label: 'Open Project', kind: 'link', target: '/projects/:projectId' },
      { surface: 'status-pill', label: 'Project status counts', kind: 'static', target: null },
    ])
  })
})
