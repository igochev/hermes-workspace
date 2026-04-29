import { describe, expect, it } from 'vitest'

import {
  buildExecutionsViewModel,
  parseExecutionsRouteInput,
} from './executions-view-model'
import type { ExecutionRunRecord } from '../../server/execution-runs-store'

const RUNS: Array<ExecutionRunRecord> = [
  {
    id: 'run-build-1',
    workItemId: 'work-item-alpha',
    projectId: 'project-a',
    role: 'mission',
    phase: 'build',
    engine: 'hermes-cron',
    jobId: 'job-builder-1',
    jobName: 'Builder: Alpha',
    runId: 'engine-run-1',
    state: 'running',
    sessionKey: 'session-builder-alpha',
    sessionKeyPrefix: 'sess-builder',
    lastObservedAt: '2026-04-29T09:00:00.000Z',
    artifactPaths: [],
    createdAt: '2026-04-29T08:59:00.000Z',
    updatedAt: '2026-04-29T09:00:00.000Z',
  },
  {
    id: 'run-review-1',
    workItemId: 'work-item-beta',
    projectId: 'project-b',
    role: 'review',
    phase: 'review',
    engine: 'conductor',
    jobId: 'job-review-1',
    jobName: 'Reviewer: Beta',
    state: 'failed',
    sessionKey: 'session-review-beta',
    sessionKeyPrefix: 'sess-review',
    lastObservedAt: '2026-04-29T08:00:00.000Z',
    artifactPaths: ['reports/review.md'],
    createdAt: '2026-04-29T07:59:00.000Z',
    updatedAt: '2026-04-29T08:00:00.000Z',
  },
]

describe('executions-view-model', () => {
  it('parses detail route params and list search filters', () => {
    expect(
      parseExecutionsRouteInput({
        params: { executionId: 'run-build-1' },
        search: {
          jobId: 'job-builder-1',
          workItemId: 'work-item-alpha',
          projectId: 'project-a',
          state: 'running',
          phase: 'build',
          q: 'session-builder',
        },
      }),
    ).toEqual({
      executionId: 'run-build-1',
      filters: {
        jobId: 'job-builder-1',
        workItemId: 'work-item-alpha',
        projectId: 'project-a',
        state: 'running',
        phase: 'build',
        q: 'session-builder',
      },
    })
  })

  it('filters executions by job ID, session key, state, phase, and work-item ID', () => {
    expect(
      buildExecutionsViewModel(RUNS, {
        filters: { jobId: 'job-builder-1' },
      }).runs.map((run) => run.id),
    ).toEqual(['run-build-1'])
    expect(
      buildExecutionsViewModel(RUNS, {
        filters: { q: 'session-review-beta' },
      }).runs.map((run) => run.id),
    ).toEqual(['run-review-1'])
    expect(
      buildExecutionsViewModel(RUNS, { filters: { state: 'failed' } }).runs.map(
        (run) => run.id,
      ),
    ).toEqual(['run-review-1'])
    expect(
      buildExecutionsViewModel(RUNS, { filters: { phase: 'build' } }).runs.map(
        (run) => run.id,
      ),
    ).toEqual(['run-build-1'])
    expect(
      buildExecutionsViewModel(RUNS, {
        filters: { workItemId: 'work-item-alpha' },
      }).runs.map((run) => run.id),
    ).toEqual(['run-build-1'])
  })

  it('sorts executions by newest observed timestamp first', () => {
    expect(
      buildExecutionsViewModel(RUNS, { filters: {} }).runs.map((run) => run.id),
    ).toEqual(['run-build-1', 'run-review-1'])
  })
})
