import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { syncWorkItemExecutionState } = vi.hoisted(() => ({
  syncWorkItemExecutionState: vi.fn(),
}))

vi.mock('./work-item-execution', () => ({
  syncWorkItemExecutionState,
}))

import { createProject, type ProjectRecord } from './projects-store'
import { createWorkItem, getWorkItem, type WorkItemRecord } from './work-items-store'
import { upsertExecutionRun } from './execution-runs-store'
import {
  DEFAULT_SUPERVISOR_THRESHOLDS,
  decideAlwaysOnLaneRecovery,
  detectStaleExecution,
  isWorkItemExecutionCandidate,
  reconcileAllWorkItemExecutions,
  reconcileWorkItemExecution,
} from './work-item-supervisor'

describe('work-item-supervisor', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-work-item-supervisor-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    syncWorkItemExecutionState.mockReset()
  })

  afterEach(async () => {
    const fs = await import('node:fs')
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  function createDemoWorkItem(input: Partial<WorkItemRecord> = {}): WorkItemRecord {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    return createWorkItem({
      projectId: project.id,
      title: input.title ?? 'Supervisor target',
      status: input.status ?? 'active',
      phase: input.phase ?? 'build',
      priority: input.priority ?? 'high',
      repoPathSnapshot: project.repoPath,
      missionId: input.missionId,
      missionJobId: input.missionJobId,
      missionState: input.missionState,
      missionLastRunAt: input.missionLastRunAt,
      missionLastError: input.missionLastError,
      reviewJobId: input.reviewJobId,
      reviewState: input.reviewState,
      reviewDecision: input.reviewDecision,
    })
  }

  it('ignores inactive done items with no execution state', () => {
    const done = createDemoWorkItem({ status: 'done', phase: 'deploy' })
    const inbox = createDemoWorkItem({ status: 'inbox', phase: 'research' })

    expect(isWorkItemExecutionCandidate(done)).toBe(false)
    expect(isWorkItemExecutionCandidate(inbox)).toBe(false)
    expect(detectStaleExecution({ workItem: done, runs: [] })).toEqual([])
  })

  it('detects stale scheduled mission runs without mutating status', () => {
    const workItem = createDemoWorkItem({
      missionJobId: 'job-scheduled',
      missionState: 'scheduled',
    })
    const observedAt = '2026-04-25T10:00:00.000Z'
    upsertExecutionRun({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-scheduled',
      state: 'scheduled',
      lastObservedAt: observedAt,
    })

    const findings = detectStaleExecution({
      workItem,
      runs: [],
      now: new Date('2026-04-25T10:31:00.000Z'),
    })

    expect(findings).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: workItem.projectId,
        kind: 'mission_stale',
        severity: 'warning',
        jobId: 'job-scheduled',
        role: 'mission',
      },
    ])
    expect(getWorkItem(workItem.id)?.status).toBe('active')
  })

  it('detects stale running mission runs after the running threshold', () => {
    const workItem = createDemoWorkItem({
      missionJobId: 'job-running',
      missionState: 'running',
    })
    const findings = detectStaleExecution({
      workItem,
      runs: [
        {
          id: 'run-1',
          workItemId: workItem.id,
          projectId: workItem.projectId,
          role: 'mission',
          phase: 'build',
          engine: 'conductor',
          jobId: 'job-running',
          state: 'running',
          lastObservedAt: '2026-04-25T10:00:00.000Z',
          artifactPaths: [],
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        },
      ],
      now: new Date('2026-04-25T14:01:00.000Z'),
    })

    expect(findings).toMatchObject([
      {
        kind: 'mission_stale',
        severity: 'warning',
        jobId: 'job-running',
        role: 'mission',
      },
    ])
  })

  it('detects failed mission as critical', () => {
    const workItem = createDemoWorkItem({
      status: 'blocked',
      missionJobId: 'job-failed',
      missionState: 'failed',
      missionLastError: 'Verification failed',
    })

    const findings = detectStaleExecution({ workItem, runs: [] })

    expect(findings).toMatchObject([
      {
        kind: 'mission_failed',
        severity: 'critical',
        jobId: 'job-failed',
        role: 'mission',
      },
    ])
    expect(findings[0]?.message).toContain('Verification failed')
  })

  it('detects stale and failed review separately from mission findings', () => {
    const staleReview = createDemoWorkItem({
      phase: 'review',
      missionJobId: 'job-mission-ok',
      missionState: 'succeeded',
      reviewJobId: 'job-review-stale',
      reviewState: 'running',
    })

    const staleFindings = detectStaleExecution({
      workItem: staleReview,
      runs: [
        {
          id: 'review-run-1',
          workItemId: staleReview.id,
          projectId: staleReview.projectId,
          role: 'review',
          phase: 'review',
          engine: 'conductor',
          jobId: 'job-review-stale',
          state: 'running',
          lastObservedAt: '2026-04-25T10:00:00.000Z',
          artifactPaths: [],
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        },
      ],
      now: new Date('2026-04-25T12:01:00.000Z'),
    })
    expect(staleFindings).toMatchObject([
      {
        kind: 'review_stale',
        severity: 'warning',
        jobId: 'job-review-stale',
        role: 'review',
      },
    ])

    const failedReview = createDemoWorkItem({
      phase: 'review',
      reviewJobId: 'job-review-failed',
      reviewState: 'failed',
    })
    expect(detectStaleExecution({ workItem: failedReview, runs: [] })).toMatchObject([
      {
        kind: 'review_failed',
        severity: 'critical',
        jobId: 'job-review-failed',
        role: 'review',
      },
    ])
  })

  it('converts sync errors into supervisor findings', async () => {
    const workItem = createDemoWorkItem({ missionJobId: 'job-sync-error', missionState: 'running' })
    syncWorkItemExecutionState.mockRejectedValue(new Error('dashboard unavailable'))

    const result = await reconcileWorkItemExecution(workItem.id)

    expect(result.checked).toBe(1)
    expect(result.findings).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: workItem.projectId,
        kind: 'sync_error',
        severity: 'warning',
        jobId: 'job-sync-error',
        role: 'mission',
      },
    ])
    expect(result.findings[0]?.message).toContain('dashboard unavailable')
  })

  it('reconciles all execution candidates only', async () => {
    const active = createDemoWorkItem({ missionJobId: 'job-active', missionState: 'running' })
    createDemoWorkItem({ status: 'done', phase: 'deploy' })
    const review = createDemoWorkItem({ status: 'ready', phase: 'review', reviewJobId: 'job-review', reviewState: 'scheduled' })

    syncWorkItemExecutionState.mockImplementation(async (workItemId: string) => ({
      workItem: getWorkItem(workItemId),
    }))

    const result = await reconcileAllWorkItemExecutions()

    expect(result.checked).toBe(2)
    expect(syncWorkItemExecutionState).toHaveBeenCalledWith(active.id)
    expect(syncWorkItemExecutionState).toHaveBeenCalledWith(review.id)
    expect(syncWorkItemExecutionState).not.toHaveBeenCalledWith(expect.stringContaining('done'))
  })

  it('exports the planned default supervisor thresholds', () => {
    expect(DEFAULT_SUPERVISOR_THRESHOLDS).toEqual({
      scheduledMs: 30 * 60 * 1000,
      runningMs: 4 * 60 * 60 * 1000,
      reviewRunningMs: 2 * 60 * 60 * 1000,
    })
  })

  function enabledAlwaysOnProject(overrides: Record<string, unknown> = {}): ProjectRecord {
    return createProject({
      name: 'Always-On Demo',
      repoPath: '/repos/always-on-demo',
      defaultBranch: 'main',
      autonomyLanePolicy: {
        enabled: true,
        alwaysOn: {
          enabled: true,
          retry: { enabled: true, maxAttemptsPerPhase: 2, cooldownMinutes: 15, ...overrides },
        },
      },
    })
  }

  it('keeps policy-disabled stale lane jobs as recommendations instead of automatic retries', () => {
    const project = createProject({ name: 'Supervised Demo', repoPath: '/repos/supervised-demo' })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Stale supervised build',
      status: 'active',
      phase: 'build',
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-stale',
      missionState: 'scheduled',
    })
    const [finding] = detectStaleExecution({
      workItem,
      runs: [
        {
          id: 'run-stale',
          workItemId: workItem.id,
          projectId: project.id,
          role: 'mission',
          phase: 'build',
          engine: 'conductor',
          jobId: 'job-stale',
          state: 'scheduled',
          lastObservedAt: '2026-04-25T10:00:00.000Z',
          artifactPaths: [],
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        },
      ],
      now: new Date('2026-04-25T10:31:00.000Z'),
    })

    const decision = decideAlwaysOnLaneRecovery({
      project,
      workItem,
      finding: finding!,
      repoSafety: { safe: true },
      now: new Date('2026-04-25T10:31:00.000Z'),
    })

    expect(decision).toMatchObject({
      type: 'recommend_retry',
      event: 'blocked',
      shouldRetry: false,
      retryPhase: 'build',
      reason: expect.stringContaining('Always-on retry policy is disabled'),
    })
  })

  it('schedules a bounded retry with cooldown evidence when policy allows and repo is clean', () => {
    const project = enabledAlwaysOnProject()
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Retry stale build',
      status: 'active',
      phase: 'build',
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-stale',
      missionState: 'scheduled',
    })
    const finding = detectStaleExecution({
      workItem,
      runs: [
        {
          id: 'run-stale',
          workItemId: workItem.id,
          projectId: project.id,
          role: 'mission',
          phase: 'build',
          engine: 'conductor',
          jobId: 'job-stale',
          state: 'scheduled',
          lastObservedAt: '2026-04-25T10:00:00.000Z',
          artifactPaths: [],
          createdAt: '2026-04-25T10:00:00.000Z',
          updatedAt: '2026-04-25T10:00:00.000Z',
        },
      ],
      now: new Date('2026-04-25T10:31:00.000Z'),
    })[0]!

    const decision = decideAlwaysOnLaneRecovery({
      project,
      workItem,
      finding,
      repoSafety: { safe: true },
      now: new Date('2026-04-25T10:31:00.000Z'),
    })

    expect(decision).toMatchObject({
      type: 'schedule_retry',
      event: 'retry_scheduled',
      shouldRetry: true,
      retryPhase: 'build',
      nextRetryCount: 1,
      maxAttempts: 2,
      cooldownUntil: '2026-04-25T10:46:00.000Z',
    })
    expect(decision.evidence).toEqual(
      expect.arrayContaining([
        'finding=mission_stale',
        'jobId=job-stale',
        'retryCount=0/2',
        'repo=safe',
      ]),
    )
  })

  it('exhausts retry attempts and emits retry_exhausted evidence', () => {
    const project = enabledAlwaysOnProject()
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Exhaust retry build',
      status: 'active',
      phase: 'build',
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-stale',
      missionState: 'running',
      laneRetryCount: 2,
    })

    const decision = decideAlwaysOnLaneRecovery({
      project,
      workItem,
      finding: {
        id: 'finding-1',
        workItemId: workItem.id,
        projectId: project.id,
        kind: 'mission_stale',
        severity: 'warning',
        message: 'Mission stale',
        jobId: 'job-stale',
        role: 'mission',
        observedAt: '2026-04-25T14:31:00.000Z',
      },
      repoSafety: { safe: true },
      now: new Date('2026-04-25T14:31:00.000Z'),
    })

    expect(decision).toMatchObject({
      type: 'retry_exhausted',
      event: 'retry_exhausted',
      shouldRetry: false,
      nextRetryCount: 2,
      maxAttempts: 2,
      reason: expect.stringContaining('Retry attempts exhausted'),
    })
  })

  it('refuses automatic retry when repo safety evidence is unsafe', () => {
    const project = enabledAlwaysOnProject()
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Unsafe retry build',
      status: 'active',
      phase: 'build',
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-stale',
      missionState: 'scheduled',
    })

    const decision = decideAlwaysOnLaneRecovery({
      project,
      workItem,
      finding: {
        id: 'finding-unsafe',
        workItemId: workItem.id,
        projectId: project.id,
        kind: 'mission_stale',
        severity: 'warning',
        message: 'Mission stale',
        jobId: 'job-stale',
        role: 'mission',
        observedAt: '2026-04-25T10:31:00.000Z',
      },
      repoSafety: { safe: false, reason: 'Repo has uncommitted files: src/app.ts' },
      now: new Date('2026-04-25T10:31:00.000Z'),
    })

    expect(decision).toMatchObject({
      type: 'unsafe_repo',
      event: 'unsafe_repo',
      shouldRetry: false,
      reason: expect.stringContaining('Repo has uncommitted files'),
    })
  })

  it('observes stale findings while retry cooldown has not elapsed', () => {
    const project = enabledAlwaysOnProject()
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Cooldown build',
      status: 'active',
      phase: 'build',
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-stale',
      missionState: 'scheduled',
      laneRetryCount: 1,
      laneLastRetryAt: '2026-04-25T10:20:00.000Z',
    })

    const decision = decideAlwaysOnLaneRecovery({
      project,
      workItem,
      finding: {
        id: 'finding-cooldown',
        workItemId: workItem.id,
        projectId: project.id,
        kind: 'mission_stale',
        severity: 'warning',
        message: 'Mission stale',
        jobId: 'job-stale',
        role: 'mission',
        observedAt: '2026-04-25T10:31:00.000Z',
      },
      repoSafety: { safe: true },
      now: new Date('2026-04-25T10:31:00.000Z'),
    })

    expect(decision).toMatchObject({
      type: 'observe',
      shouldRetry: false,
      cooldownUntil: '2026-04-25T10:35:00.000Z',
      reason: expect.stringContaining('Retry cooldown has not elapsed'),
    })
  })
})
