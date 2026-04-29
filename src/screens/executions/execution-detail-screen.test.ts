import { describe, expect, it } from 'vitest'

import type { ExecutionRunRecord } from '../../server/execution-runs-store'
import {
  buildExecutionDetailScreenViewModel,
  EXECUTION_DETAIL_BACK_TO_WORK_ITEM_LABEL,
  EXECUTION_DETAIL_JOB_SECTION_TITLE,
  EXECUTION_DETAIL_OPEN_SCHEDULED_JOB_LABEL,
  EXECUTION_DETAIL_SCREEN_TITLE,
  EXECUTION_DETAIL_SESSION_SECTION_TITLE,
} from './execution-detail-screen'

describe('execution detail screen view model', () => {
  it('renders one execution as operator trace evidence, not a Scheduled Jobs page', () => {
    const viewModel = buildExecutionDetailScreenViewModel(
      makeRun({
        id: 'exec-build-1',
        workItemId: 'work-1',
        projectId: 'project-1',
        role: 'mission',
        phase: 'build',
        state: 'failed',
        engine: 'conductor',
        jobId: 'job-build-123',
        jobName: 'Builder attempt',
        runId: 'run-abc',
        sessionKey: 'session-full-key',
        sessionKeyPrefix: 'session-prefix',
        startedAt: '2026-04-29T10:00:00.000Z',
        finishedAt: '2026-04-29T10:05:00.000Z',
        lastObservedAt: '2026-04-29T10:06:00.000Z',
        branchName: 'mission/work-1',
        prUrl: 'https://example.test/pr/1',
        artifactPaths: ['reports/build.md'],
        error: 'Tests failed',
      }),
    )

    expect(EXECUTION_DETAIL_SCREEN_TITLE).toBe('Execution trace')
    expect(EXECUTION_DETAIL_SESSION_SECTION_TITLE).toBe(
      'Session / engine evidence',
    )
    expect(EXECUTION_DETAIL_JOB_SECTION_TITLE).toBe('Job definition evidence')
    expect(EXECUTION_DETAIL_BACK_TO_WORK_ITEM_LABEL).toBe('Back to Work Item')
    expect(EXECUTION_DETAIL_OPEN_SCHEDULED_JOB_LABEL).toBe(
      'Open Scheduled Job definition',
    )
    expect(viewModel.header).toMatchObject({
      title: 'Execution trace',
      executionId: 'exec-build-1',
      state: 'failed',
      phase: 'build',
      role: 'mission',
      workItemHref: '/projects/project-1/work-items/work-1',
      projectHref: '/projects/project-1',
    })
    expect(viewModel.sections.session.items).toEqual([
      { label: 'Session key', value: 'session-full-key' },
      { label: 'Session prefix', value: 'session-prefix' },
      { label: 'Engine', value: 'conductor' },
    ])
    expect(viewModel.sections.job.items).toEqual([
      { label: 'Job ID', value: 'job-build-123' },
      { label: 'Job name', value: 'Builder attempt' },
    ])
    expect(viewModel.sections.run.items).toContainEqual({
      label: 'Run ID',
      value: 'run-abc',
    })
    expect(viewModel.sections.evidence.items).toEqual([
      { label: 'Branch', value: 'mission/work-1' },
      { label: 'Pull request', value: 'https://example.test/pr/1' },
      { label: 'Artifact', value: 'reports/build.md' },
      { label: 'Error', value: 'Tests failed' },
    ])
    expect(viewModel.actions).toEqual([
      {
        label: 'Back to Work Item',
        href: '/projects/project-1/work-items/work-1',
        tone: 'primary',
      },
      {
        label: 'Open Scheduled Job definition',
        href: '/jobs?jobId=job-build-123',
        tone: 'secondary',
      },
    ])
    const visibleCopy = JSON.stringify(viewModel)
    expect(visibleCopy).not.toMatch(
      /Mission Link|Hermes Job ID|Scheduled Jobs page/,
    )
  })

  it('uses unknown placeholders and omits unavailable actions when optional evidence is absent', () => {
    const viewModel = buildExecutionDetailScreenViewModel(
      makeRun({
        id: 'exec-minimal',
        workItemId: '',
        projectId: '',
        role: 'supervisor',
        engine: 'hermes-cron',
        jobId: '',
        jobName: undefined,
        state: 'unknown',
        sessionKey: undefined,
        sessionKeyPrefix: undefined,
        lastObservedAt: '2026-04-29T10:06:00.000Z',
        artifactPaths: [],
      }),
    )

    expect(viewModel.header.workItemHref).toBeNull()
    expect(viewModel.header.projectHref).toBeNull()
    expect(viewModel.sections.session.items).toEqual([
      { label: 'Session key', value: '—' },
      { label: 'Session prefix', value: '—' },
      { label: 'Engine', value: 'hermes-cron' },
    ])
    expect(viewModel.sections.job.items).toEqual([
      { label: 'Job ID', value: '—' },
      { label: 'Job name', value: '—' },
    ])
    expect(viewModel.sections.evidence.items).toEqual([
      { label: 'Branch', value: '—' },
      { label: 'Pull request', value: '—' },
      { label: 'Artifact', value: '—' },
      { label: 'Error', value: '—' },
    ])
    expect(viewModel.actions).toEqual([])
  })
})

function makeRun(overrides: Partial<ExecutionRunRecord>): ExecutionRunRecord {
  return {
    id: 'exec-1',
    workItemId: 'work-1',
    projectId: 'project-1',
    role: 'mission',
    phase: 'build',
    engine: 'conductor',
    jobId: 'job-1',
    jobName: 'Job 1',
    runId: 'run-1',
    state: 'running',
    sessionKey: 'session-key',
    sessionKeyPrefix: 'session-prefix',
    lastObservedAt: '2026-04-29T10:00:00.000Z',
    artifactPaths: [],
    createdAt: '2026-04-29T09:00:00.000Z',
    updatedAt: '2026-04-29T10:00:00.000Z',
    ...overrides,
  }
}
