import { describe, expect, it } from 'vitest'

import {
  EXECUTIONS_DEFINITIONS_LINK_COPY,
  EXECUTIONS_LEGACY_NO_RECORD_TITLE,
  EXECUTIONS_NAVIGATION_COPY,
  EXECUTIONS_SCREEN_HELP_COPY,
  EXECUTIONS_SCREEN_SEARCH_PLACEHOLDER,
  EXECUTIONS_SCREEN_TITLE,
  buildExecutionsScreenViewModel,
} from './executions-screen'
import type { ExecutionRunRecord } from '../../server/execution-runs-store'

describe('executions screen operator copy and list model', () => {
  it('exports execution-focused copy without Scheduled Jobs terminology leakage', () => {
    expect(EXECUTIONS_SCREEN_TITLE).toBe('Executions')
    expect(EXECUTIONS_SCREEN_HELP_COPY).toBe(
      'Work-item execution attempts for Planner, Builder, Reviewer, and Merge-Healer.',
    )
    expect(EXECUTIONS_SCREEN_SEARCH_PLACEHOLDER).toBe(
      'Search execution, session, work item, or legacy job...',
    )
    expect(EXECUTIONS_NAVIGATION_COPY).toBe('Executions')
    expect(EXECUTIONS_DEFINITIONS_LINK_COPY).toBe(
      'Open reusable job definitions',
    )
    expect(EXECUTIONS_LEGACY_NO_RECORD_TITLE).toBe(
      'Execution trace not yet recorded',
    )
    expect(EXECUTIONS_SCREEN_HELP_COPY).not.toMatch(/Scheduled Jobs|Runs view/)
  })

  it('sorts durable execution runs by newest observed timestamp first', () => {
    const viewModel = buildExecutionsScreenViewModel(
      [
        makeRun('older', '2026-04-29T10:00:00.000Z'),
        makeRun('newer', '2026-04-29T11:00:00.000Z'),
      ],
      {
        filters: {},
        legacyLookup: null,
      },
    )

    expect(viewModel.runs.map((run) => run.id)).toEqual(['newer', 'older'])
    expect(viewModel.legacyLanding).toBeNull()
  })

  it('filters by state, phase, and free text over job/session/work-item fields', () => {
    const viewModel = buildExecutionsScreenViewModel(
      [
        makeRun('builder-run', '2026-04-29T11:00:00.000Z', {
          state: 'running',
          phase: 'build',
          jobId: 'job-builder-1',
          sessionKeyPrefix: 'session-builder',
        }),
        makeRun('review-run', '2026-04-29T11:05:00.000Z', {
          state: 'succeeded',
          phase: 'review',
          jobId: 'job-review-1',
          sessionKeyPrefix: 'session-review',
        }),
      ],
      {
        filters: { state: 'running', phase: 'build', q: 'builder' },
        legacyLookup: null,
      },
    )

    expect(viewModel.runs.map((run) => run.id)).toEqual(['builder-run'])
  })

  it('builds a scoped legacy trace work item link when project context is available', () => {
    const viewModel = buildExecutionsScreenViewModel([], {
      filters: {
        jobId: 'job-legacy-1',
        projectId: 'project-legacy-1',
        workItemId: 'work-legacy-1',
      },
      legacyLookup: {
        status: 'no_durable_run',
        jobId: 'job-legacy-1',
        projectId: 'project-legacy-1',
        workItemId: 'work-legacy-1',
        message:
          'Scheduled job job-legacy-1 was referenced by a work item, but no durable execution run record exists yet.',
      },
    })

    expect(viewModel.legacyLanding).toEqual({
      title: 'Execution trace not yet recorded',
      message:
        'Scheduled job job-legacy-1 was referenced by a work item, but no durable execution run record exists yet.',
      workItemHref: '/projects/project-legacy-1/work-items/work-legacy-1',
    })
  })

  it('does not expose an invalid unscoped work item link for legacy traces without project context', () => {
    const viewModel = buildExecutionsScreenViewModel([], {
      filters: { jobId: 'job-legacy-1', workItemId: 'work-legacy-1' },
      legacyLookup: {
        status: 'no_durable_run',
        jobId: 'job-legacy-1',
        workItemId: 'work-legacy-1',
        message:
          'Scheduled job job-legacy-1 was referenced by a work item, but no durable execution run record exists yet.',
      },
    })

    expect(viewModel.legacyLanding?.workItemHref).toBeNull()
    expect(viewModel.legacyLanding?.message).toContain(
      'Project context is required',
    )
  })
})

function makeRun(
  id: string,
  lastObservedAt: string,
  overrides: Partial<ExecutionRunRecord> = {},
): ExecutionRunRecord {
  return {
    id,
    workItemId: 'work-1',
    projectId: 'project-1',
    role: 'mission',
    phase: 'build',
    engine: 'conductor',
    jobId: `job-${id}`,
    jobName: `Job ${id}`,
    runId: `run-${id}`,
    state: 'running',
    sessionKey: `session-${id}`,
    sessionKeyPrefix: `session-${id}`,
    lastObservedAt,
    artifactPaths: [],
    createdAt: lastObservedAt,
    updatedAt: lastObservedAt,
    ...overrides,
  }
}
