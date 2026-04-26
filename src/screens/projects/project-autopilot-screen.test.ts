import { describe, expect, it } from 'vitest'

import {
  PROJECT_AUTOPILOT_DELEGATION_POLICY_COPY,
  PROJECT_AUTOPILOT_SAFETY_COPY,
  PROJECT_AUTOPILOT_SCHEDULE_OPTIONS,
  PROJECT_AUTOPILOT_SCOUT_SOURCES,
  PROJECT_AUTOPILOT_SAVE_BUTTON_LABEL,
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
})
