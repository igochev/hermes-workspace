import { describe, expect, it } from 'vitest'

import {
  PROJECT_AUTOPILOT_CLICKABILITY_AUDIT,
  PROJECT_AUTOPILOT_DELEGATION_POLICY_COPY,
  PROJECT_AUTOPILOT_SAFETY_COPY,
  PROJECT_AUTOPILOT_SAVE_BUTTON_LABEL,
  PROJECT_AUTOPILOT_SCHEDULE_OPTIONS,
  PROJECT_AUTOPILOT_SCOUT_SOURCES,
} from './project-autopilot-screen'

describe('project autopilot screen constants', () => {
  it('includes explicit suggestions-only safety copy', () => {
    expect(PROJECT_AUTOPILOT_SAFETY_COPY).toContain('suggestions only')
    expect(PROJECT_AUTOPILOT_SAFETY_COPY).toContain('no direct code changes')
  })

  it('includes manual/daily/weekly schedule options', () => {
    expect(PROJECT_AUTOPILOT_SCHEDULE_OPTIONS).toEqual([
      ['manual', 'Manual'],
      ['daily', 'Daily (9:00)'],
      ['weekly', 'Weekly (Monday 9:00)'],
    ])
  })

  it('includes scout-source checkbox options and save CTA label', () => {
    expect(PROJECT_AUTOPILOT_SCOUT_SOURCES).toContain('repo-health-scout')
    expect(PROJECT_AUTOPILOT_SCOUT_SOURCES).toContain('stale-docs-scout')
    expect(PROJECT_AUTOPILOT_SCOUT_SOURCES).toContain('architecture-debt-scout')
    expect(PROJECT_AUTOPILOT_SAVE_BUTTON_LABEL).toBe('Save Autopilot Schedule')
  })

  it('summarizes delegation policy and safety boundary for project autopilot', () => {
    expect(PROJECT_AUTOPILOT_DELEGATION_POLICY_COPY).toContain('Convert + Plan')
    expect(PROJECT_AUTOPILOT_DELEGATION_POLICY_COPY).toContain('accepted planner draft')
    expect(PROJECT_AUTOPILOT_DELEGATION_POLICY_COPY).toContain('No code is launched')
  })

  it('documents project autopilot clickability and marks suggestion previews static', () => {
    expect(PROJECT_AUTOPILOT_CLICKABILITY_AUDIT).toEqual([
      { surface: 'back-to-project', label: 'Back to Project', kind: 'link', target: '/projects/:projectId' },
      { surface: 'save-schedule', label: 'Save Autopilot Schedule', kind: 'button', target: 'saveProjectAutopilotSchedule' },
      { surface: 'disable-schedule', label: 'Disable schedule', kind: 'button', target: 'disableProjectAutopilotSchedule' },
      { surface: 'project-suggestion-preview', label: 'Suggestion preview', kind: 'static', target: null },
      { surface: 'global-suggestions-copy', label: 'Convert + Plan is available from the global suggestions inbox.', kind: 'static', target: null },
    ])
  })
})
