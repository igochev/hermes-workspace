import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getHermesJobById, listHermesJobs, getHermesJobRuns } = vi.hoisted(() => ({
  getHermesJobById: vi.fn(),
  listHermesJobs: vi.fn(),
  getHermesJobRuns: vi.fn(),
}))

vi.mock('./hermes-jobs', () => ({
  getHermesJobById,
  listHermesJobs,
  getHermesJobRuns,
}))

import { createProject } from './projects-store'
import { createWorkItem, getWorkItem, type WorkItemRecord } from './work-items-store'
import { listWorkItemApprovals } from './work-item-approvals'
import { syncWorkItemExecutionState } from './work-item-execution'
import { listExecutionRuns } from './execution-runs-store'

describe('work-item-execution', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-work-item-execution-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    getHermesJobById.mockReset()
    listHermesJobs.mockReset()
    getHermesJobRuns.mockReset()
  })
  afterEach(async () => {
    const fs = await import('node:fs')
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('resolves legacy mission names to job ids and advances build work into review after successful execution', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Phase 3 execution sync',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionId: 'work-item-build-demo',
      missionLink: '/jobs?jobId=work-item-build-demo',
      missionState: 'scheduled',
      sessionKeys: ['cron_work-item-build-demo_pending'],
    })

    getHermesJobById.mockResolvedValue(null)
    listHermesJobs.mockResolvedValue([
      {
        id: 'job-123',
        name: 'work-item-build-demo',
        state: 'scheduled',
        last_status: 'ok',
        last_run_at: '2026-04-21T21:35:00Z',
        last_error: null,
        next_run_at: null,
      },
    ])
    getHermesJobRuns.mockResolvedValue([
      {
        id: 'run-123',
        status: 'success',
        startedAt: '2026-04-21T21:35:00Z',
        finishedAt: '2026-04-21T21:36:00Z',
        chatSessionKey: 'cron_job-123_20260421_213500',
      },
    ])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.job?.id).toBe('job-123')
    expect(result.execution.state).toBe('succeeded')
    expect(result.execution.transitionApplied).toBe('build->review')
    expect(result.workItem.missionId).toBe('job-123')
    expect(result.workItem.missionJobId).toBe('job-123')
    expect(result.workItem.missionJobName).toBe('work-item-build-demo')
    expect(result.workItem.missionSessionKeyPrefix).toBe('cron_job-123_')
    expect(result.workItem.missionLink).toBe('/jobs?jobId=job-123')
    expect(result.workItem.missionState).toBe('succeeded')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('review')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      phase: 'review',
      status: 'active',
      missionId: 'job-123',
    })
    expect(listWorkItemApprovals(workItem.id)).toMatchObject([
      {
        workItemId: workItem.id,
        phase: 'review',
        status: 'pending',
      },
    ])

    const persisted = getWorkItem(workItem.id)
    expect(persisted?.phase).toBe('review')
    expect(persisted?.missionId).toBe('job-123')
    expect(persisted?.missionJobId).toBe('job-123')
    expect(persisted?.missionJobName).toBe('work-item-build-demo')
    expect(persisted?.missionSessionKeyPrefix).toBe('cron_job-123_')
    expect(listExecutionRuns({ workItemId: workItem.id, role: 'mission' })).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: project.id,
        role: 'mission',
        phase: 'build',
        engine: 'conductor',
        jobId: 'job-123',
        jobName: 'work-item-build-demo',
        runId: 'run-123',
        state: 'succeeded',
        sessionKey: 'cron_job-123_20260421_213500',
        sessionKeyPrefix: 'cron_job-123_',
        startedAt: '2026-04-21T21:35:00Z',
        finishedAt: '2026-04-21T21:36:00Z',
        lastRunAt: '2026-04-21T21:35:00Z',
      },
    ])
  })

  it('blocks a work item and records error details when the mission fails', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Handle failed execution',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-999',
      missionLink: '/jobs?jobId=job-999',
      missionState: 'running',
    })

    getHermesJobById.mockResolvedValue({
      id: 'job-999',
      name: 'work-item-build-demo',
      state: 'scheduled',
      last_status: 'error',
      last_run_at: '2026-04-21T21:36:00Z',
      last_error: 'Worker failed verification',
      next_run_at: null,
    })
    listHermesJobs.mockResolvedValue([])
    getHermesJobRuns.mockResolvedValue([
      {
        id: 'run-999',
        status: 'error',
        startedAt: '2026-04-21T21:36:00Z',
        finishedAt: '2026-04-21T21:37:00Z',
        error: 'Worker failed verification',
        chatSessionKey: 'cron_job-999_20260421_213600',
      },
    ])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('failed')
    expect(result.execution.transitionApplied).toBe('active->blocked')
    expect(result.workItem.status).toBe('blocked')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.missionJobId).toBe('job-999')
    expect(result.workItem.missionJobName).toBe('work-item-build-demo')
    expect(result.workItem.missionState).toBe('failed')
    expect(result.workItem.missionLastError).toBe('Worker failed verification')
    expect(result.workItem.blockedReason).toBe('mission_failed')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'blocked',
      phase: 'build',
      missionId: 'job-999',
    })
    expect(result.workItem.history.at(-1)?.note).toContain('Run Resume Build before relaunching the build mission.')
  })

  it('extracts branch, pr, and artifact evidence from the latest Hermes run output', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Persist execution evidence',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-222',
      missionState: 'running',
    })

    getHermesJobById.mockResolvedValue({
      id: 'job-222',
      name: 'work-item-build-demo-evidence',
      state: 'running',
      last_status: null,
      last_run_at: '2026-04-22T00:01:00Z',
      last_error: null,
      next_run_at: null,
    })
    listHermesJobs.mockResolvedValue([])
    getHermesJobRuns.mockResolvedValue([
      {
        id: 'run-222',
        status: 'running',
        startedAt: '2026-04-22T00:01:00Z',
        finishedAt: null,
        chatSessionKey: 'cron_job-222_20260422_000100',
        output: {
          branchName: 'feature/phase6-tracing',
          prUrl: 'https://github.com/igochev/hermes-workspace/pull/42',
          artifactPaths: ['/tmp/phase6/report.md', '/tmp/phase6/summary.json'],
        },
      },
    ])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.latestSessionKey).toBe('cron_job-222_20260422_000100')
    expect(result.workItem.branchName).toBe('feature/phase6-tracing')
    expect(result.workItem.prUrl).toBe('https://github.com/igochev/hermes-workspace/pull/42')
    expect(result.workItem.artifactPaths).toEqual([
      '/tmp/phase6/report.md',
      '/tmp/phase6/summary.json',
    ])
    expect(result.workItem.sessionKeys).toContain('cron_job-222_20260422_000100')

    const persisted = getWorkItem(workItem.id)
    expect(persisted?.branchName).toBe('feature/phase6-tracing')
    expect(persisted?.prUrl).toBe('https://github.com/igochev/hermes-workspace/pull/42')
    expect(persisted?.artifactPaths).toEqual([
      '/tmp/phase6/report.md',
      '/tmp/phase6/summary.json',
    ])
  })

  it('keeps enabled lane build active when succeeded Builder output lacks product/test evidence', async () => {
    const project = createProject({
      name: 'Single Lane Evidence Demo',
      repoPath: '/repos/single-lane-evidence-demo',
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Require product evidence',
      status: 'active',
      phase: 'build',
      priority: 'high',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-docs-only',
      missionState: 'running',
      laneState: 'building',
    })

    getHermesJobById.mockResolvedValue({
      id: 'job-docs-only',
      name: 'builder-docs-only',
      state: 'scheduled',
      last_status: 'ok',
      last_run_at: '2026-04-27T20:00:00Z',
      last_error: null,
      next_run_at: null,
    })
    listHermesJobs.mockResolvedValue([])
    getHermesJobRuns.mockResolvedValue([
      {
        id: 'run-docs-only',
        status: 'success',
        startedAt: '2026-04-27T20:00:00Z',
        finishedAt: '2026-04-27T20:01:00Z',
        output: {
          finalResponse: JSON.stringify({
            workItemId: workItem.id,
            phase: 'build',
            status: 'succeeded',
            changedFiles: ['docs/notes.md'],
            testPassed: true,
          }),
        },
      },
    ])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('failed')
    expect(result.execution.transitionApplied).toBe('active->blocked')
    expect(result.workItem.status).toBe('blocked')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.laneState).toBe('blocked')
    expect(result.workItem.laneBlockedReason).toContain('product or test')
  })

  it('advances enabled lane build only after matching structured Builder evidence', async () => {
    const project = createProject({
      name: 'Single Lane Success Demo',
      repoPath: '/repos/single-lane-success-demo',
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Ingest Builder evidence',
      status: 'active',
      phase: 'build',
      priority: 'high',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-structured-success',
      missionState: 'running',
      laneState: 'building',
      branchName: 'mission/structured-success',
      baseBranch: 'main',
    })

    getHermesJobById.mockResolvedValue({
      id: 'job-structured-success',
      name: 'builder-structured-success',
      state: 'scheduled',
      last_status: 'ok',
      last_run_at: '2026-04-27T20:05:00Z',
      last_error: null,
      next_run_at: null,
    })
    listHermesJobs.mockResolvedValue([])
    getHermesJobRuns.mockResolvedValue([
      {
        id: 'run-structured-success',
        status: 'success',
        startedAt: '2026-04-27T20:05:00Z',
        finishedAt: '2026-04-27T20:06:00Z',
        chatSessionKey: 'cron_job-structured-success_run',
        output: {
          finalResponse: JSON.stringify({
            workItemId: workItem.id,
            phase: 'build',
            status: 'succeeded',
            repoPath: project.repoPath,
            branchName: 'mission/structured-success',
            baseBranch: 'main',
            headCommit: 'abc1234',
            changedFiles: ['src/app.ts', 'src/app.test.ts'],
            testCommand: 'pnpm test src/app.test.ts',
            testPassed: true,
            testSummary: '2 passed',
            artifactPaths: ['/tmp/builder-report.md'],
          }),
        },
      },
    ])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('succeeded')
    expect(result.execution.transitionApplied).toBe('build->review')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('review')
    expect(result.workItem.laneState).toBe('reviewing')
    expect(result.workItem.branchName).toBe('mission/structured-success')
    expect(result.workItem.artifactPaths).toContain('/tmp/builder-report.md')
    expect(listExecutionRuns({ workItemId: workItem.id, role: 'mission' })[0]).toMatchObject({
      state: 'succeeded',
      branchName: 'mission/structured-success',
      artifactPaths: ['/tmp/builder-report.md'],
    })
  })

  it('advances enabled lane build from local cron output when dashboard job index is unavailable', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const project = createProject({
      name: 'Single Lane Local Cron Demo',
      repoPath: '/repos/single-lane-local-cron-demo',
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Ingest local Builder output',
      status: 'active',
      phase: 'build',
      priority: 'high',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-local-output',
      missionJobId: 'job-local-output',
      missionJobName: 'work-item-build-local-output',
      missionState: 'unknown',
      laneState: 'building',
      branchName: 'mission/local-output',
      baseBranch: 'main',
    })
    const evidenceDir = path.join(tempHome, 'dispatch-local-output')
    fs.mkdirSync(evidenceDir, { recursive: true })
    const evidencePath = path.join(evidenceDir, 'evidence.json')
    fs.writeFileSync(
      evidencePath,
      JSON.stringify({
        workItemId: workItem.id,
        phase: 'build',
        repository: project.repoPath,
        baseBranch: 'main',
        branch: 'mission/local-output',
        commit: 'abc1234',
        productFilesChanged: ['lib/feature.ts'],
        testFilesChanged: ['tests/feature.test.ts'],
        testsPassed: true,
        testLog: path.join(evidenceDir, 'test.log'),
        commands: [{ command: 'npm test', exitCode: 0, summary: '2 passed' }],
      }),
    )
    const outputDir = path.join(process.env.HERMES_HOME!, 'cron', 'output', 'job-local-output')
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(
      path.join(outputDir, '2026-04-27_21-48-26.md'),
      `✅ Mission complete\nEvidence: ${evidencePath}`,
    )

    getHermesJobById.mockRejectedValue(new Error('Dashboard unavailable'))
    listHermesJobs.mockRejectedValue(new Error('Dashboard unavailable'))
    getHermesJobRuns.mockResolvedValue([])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('succeeded')
    expect(result.execution.transitionApplied).toBe('build->review')
    expect(result.execution.job?.id).toBe('job-local-output')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('review')
    expect(result.workItem.laneState).toBe('reviewing')
    expect(result.workItem.branchName).toBe('mission/local-output')
    expect(result.workItem.artifactPaths).toContain(evidencePath)
    expect(listExecutionRuns({ workItemId: workItem.id, role: 'mission' })[0]).toMatchObject({
      state: 'succeeded',
      branchName: 'mission/local-output',
    })
  })

  it('recovers a previously blocked enabled lane build when local Builder evidence becomes parseable', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const project = createProject({
      name: 'Single Lane Blocked Recovery Demo',
      repoPath: '/repos/single-lane-blocked-recovery-demo',
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Recover Builder evidence',
      status: 'blocked',
      phase: 'build',
      priority: 'high',
      riskLevel: 'low',
      blockedReason: 'mission_failed',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-blocked-local-output',
      missionJobId: 'job-blocked-local-output',
      missionJobName: 'work-item-build-blocked-local-output',
      missionState: 'failed',
      laneState: 'blocked',
      laneParkedAt: '2026-04-27T22:09:08.000Z',
      laneBlockedReason: 'Builder output did not contain parseable structured JSON.',
      branchName: 'mission/blocked-local-output',
      baseBranch: 'main',
    })
    const evidenceDir = path.join(tempHome, 'dispatch-blocked-local-output')
    fs.mkdirSync(evidenceDir, { recursive: true })
    const evidencePath = path.join(evidenceDir, 'evidence.json')
    fs.writeFileSync(
      evidencePath,
      JSON.stringify({
        workItemId: workItem.id,
        phase: 'build',
        repository: project.repoPath,
        baseBranch: 'main',
        branch: 'mission/blocked-local-output',
        commit: 'abc1234',
        productFilesChanged: ['lib/feature.ts'],
        testFilesChanged: ['tests/feature.test.ts'],
        testsPassed: true,
        commands: [{ command: 'npm test', exitCode: 0, summary: '2 passed' }],
      }),
    )
    const outputDir = path.join(process.env.HERMES_HOME!, 'cron', 'output', 'job-blocked-local-output')
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(path.join(outputDir, '2026-04-27_22-10-00.md'), `Evidence: \`${evidencePath}\``)

    getHermesJobById.mockRejectedValue(new Error('Dashboard unavailable'))
    listHermesJobs.mockRejectedValue(new Error('Dashboard unavailable'))
    getHermesJobRuns.mockResolvedValue([])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('succeeded')
    expect(result.execution.transitionApplied).toBe('build->review')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('review')
    expect(result.workItem.laneState).toBe('reviewing')
    expect(result.workItem.blockedReason).toBeUndefined()
    expect(result.workItem.laneBlockedReason).toBeUndefined()
  })

  it('marks enabled lane running Builder jobs as stale when heartbeat is old and no output exists', async () => {
    const project = createProject({
      name: 'Single Lane Stale Demo',
      repoPath: '/repos/single-lane-stale-demo',
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Detect stale Builder',
      status: 'active',
      phase: 'build',
      priority: 'high',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-stale-builder',
      missionState: 'running',
      laneState: 'building',
    })

    getHermesJobById.mockResolvedValue({
      id: 'job-stale-builder',
      name: 'builder-stale',
      state: 'running',
      last_status: null,
      last_run_at: '2000-01-01T00:00:00Z',
      last_error: null,
      next_run_at: null,
    })
    listHermesJobs.mockResolvedValue([])
    getHermesJobRuns.mockResolvedValue([])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('stale')
    expect(result.execution.transitionApplied).toBeNull()
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')
    expect(listExecutionRuns({ workItemId: workItem.id, role: 'mission' })[0]).toMatchObject({
      state: 'stale',
    })
  })

  it('degrades to unknown execution state when Hermes dashboard index lookup fails', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Handle sync index outage',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-outage',
      missionState: 'running',
    })

    getHermesJobById.mockRejectedValue(new Error('Dashboard index failed: 500'))
    listHermesJobs.mockResolvedValue([])
    getHermesJobRuns.mockResolvedValue([])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('unknown')
    expect(result.execution.job).toBeNull()
    expect(result.execution.transitionApplied).toBeNull()
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')

    const persisted = getWorkItem(workItem.id)
    expect(persisted?.id).toBe(workItem.id)
    expect(persisted?.status).toBe('active')
  })

  it('falls back to dashboard job list lookup when direct job-id lookup fails', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Handle direct lookup outage',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionId: 'job-direct-fail',
      missionState: 'unknown',
    })

    getHermesJobById.mockRejectedValue(new Error('Dashboard index failed: 500'))
    listHermesJobs.mockResolvedValue([
      {
        id: 'job-direct-fail',
        name: 'work-item-build-demo-fallback',
        state: 'running',
        last_status: null,
        last_run_at: '2026-04-24T22:10:00Z',
        last_error: null,
        next_run_at: null,
      },
    ])
    getHermesJobRuns.mockResolvedValue([])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('running')
    expect(result.execution.job?.id).toBe('job-direct-fail')
    expect(result.workItem.missionState).toBe('running')
    expect(listHermesJobs).toHaveBeenCalledTimes(1)
  })

  describe('structured review decision auto-resolution', () => {
    it('resolves approved decision with passing quality gates and advances to deploy', async () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
        defaultBranch: 'main',
        reviewAutoApproval: { enabled: true, maxPriority: 'medium' },
      })
      // Create work item in review phase with reviewJobId
      let workItem = createWorkItem({
        projectId: project.id,
        title: 'Approved gate passes',
        status: 'active',
        phase: 'review',
        priority: 'medium',
        riskLevel: 'medium',
        repoPathSnapshot: project.repoPath,
        reviewJobId: 'review-job-1',
      })

      getHermesJobById.mockImplementation((id: string) => {
        if (id === workItem.reviewJobId) {
          return Promise.resolve({
            id: 'review-job-1',
            name: 'planner-review-1',
            state: 'scheduled',
            last_status: 'ok',
            last_run_at: '2026-04-26T01:00:00Z',
            last_error: null,
            next_run_at: null,
          })
        }
        return Promise.resolve(null)
      })
      listHermesJobs.mockResolvedValue([])
      // No mission runs — the review output from job runs
      getHermesJobRuns.mockImplementation((id: string) => {
        if (id === 'review-job-1') {
          return Promise.resolve([
            {
              id: 'review-run-1',
              status: 'success',
              startedAt: '2026-04-26T01:00:00Z',
              finishedAt: '2026-04-26T01:05:00Z',
              chatSessionKey: 'cron_review-job-1_run',
              output: {
                reviewOutput: `REVIEW_DECISION_JSON: ${JSON.stringify({
                  decision: 'approved',
                  confidence: 'high',
                  summary: 'All criteria met with evidence.',
                  criteria: [{ text: 'Feature A', met: true, evidence: 'Detected in codebase' }],
                  evidence: {
                    testCommands: ['pnpm vitest run'],
                    testResults: [{ command: 'pnpm vitest run', status: 'passed', summary: 'All passing' }],
                    filesReviewed: ['src/server/work-item-execution.ts'],
                    planReviewed: true,
                  },
                  blockers: [],
                  risks: [],
                })}`,
              },
            },
          ])
        }
        return Promise.resolve([])
      })

      // Need to create a pending review approval first for the auto-resolve to find
      const { requestWorkItemReviewApproval } = await import('./work-item-approvals')
      requestWorkItemReviewApproval(workItem.id, {
        requestedBy: 'system',
        notes: 'Awaiting Planner review.',
      })

      const result = await syncWorkItemExecutionState(workItem.id)

      expect(result.workItem.reviewDecision).toBe('approved')
      expect(result.workItem.reviewDecisionConfidence).toBe('high')
      expect(result.workItem.reviewDecisionSource).toBe('json')
      expect(result.workItem.reviewQualityGateStatus).toBe('pass')
      expect(result.workItem.status).toBe('active')
      expect(result.workItem.phase).toBe('deploy')
      expect(listExecutionRuns({ workItemId: workItem.id, role: 'review' })).toMatchObject([
        {
          workItemId: workItem.id,
          projectId: project.id,
          role: 'review',
          phase: 'review',
          engine: 'conductor',
          jobId: 'review-job-1',
          jobName: 'planner-review-1',
          runId: 'review-run-1',
          state: 'succeeded',
          sessionKey: 'cron_review-job-1_run',
          sessionKeyPrefix: 'cron_review-job-1_',
          startedAt: '2026-04-26T01:00:00Z',
          finishedAt: '2026-04-26T01:05:00Z',
          lastRunAt: '2026-04-26T01:00:00Z',
        },
      ])
    })

    it('resolves changes_requested decision with failing gates and returns to build', async () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
        defaultBranch: 'main',
      })
      let workItem = createWorkItem({
        projectId: project.id,
        title: 'Changes requested gate',
        status: 'active',
        phase: 'review',
        priority: 'medium',
        riskLevel: 'medium',
        repoPathSnapshot: project.repoPath,
        reviewJobId: 'review-job-2',
      })

      getHermesJobById.mockImplementation((id: string) => {
        if (id === workItem.reviewJobId) {
          return Promise.resolve({
            id: 'review-job-2',
            name: 'planner-review-2',
            state: 'scheduled',
            last_status: 'ok',
            last_run_at: '2026-04-26T01:00:00Z',
            last_error: null,
            next_run_at: null,
          })
        }
        return Promise.resolve(null)
      })
      listHermesJobs.mockResolvedValue([])
      getHermesJobRuns.mockImplementation((id: string) => {
        if (id === 'review-job-2') {
          return Promise.resolve([
            {
              id: 'review-run-2',
              status: 'success',
              startedAt: '2026-04-26T01:00:00Z',
              finishedAt: '2026-04-26T01:05:00Z',
              output: {
                reviewOutput: `DECISION: CHANGES_REQUESTED`,
              },
            },
          ])
        }
        return Promise.resolve([])
      })

      const { requestWorkItemReviewApproval } = await import('./work-item-approvals')
      requestWorkItemReviewApproval(workItem.id, {
        requestedBy: 'system',
      })

      const result = await syncWorkItemExecutionState(workItem.id)

      expect(result.workItem.reviewDecision).toBe('changes_requested')
      expect(result.workItem.reviewQualityGateStatus).toBe('fail')
      expect(result.workItem.status).toBe('active')
      expect(result.workItem.phase).toBe('build')
    })

    it('marks review as manual_review when review output has no valid structured decision', async () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
        defaultBranch: 'main',
        reviewAutoApproval: { enabled: false, maxPriority: 'low' },
      })
      let workItem = createWorkItem({
        projectId: project.id,
        title: 'Manual review needed',
        status: 'active',
        phase: 'review',
        priority: 'medium',
        riskLevel: 'medium',
        repoPathSnapshot: project.repoPath,
        reviewJobId: 'review-job-3',
      })

      getHermesJobById.mockImplementation((id: string) => {
        if (id === workItem.reviewJobId) {
          return Promise.resolve({
            id: 'review-job-3',
            name: 'planner-review-3',
            state: 'scheduled',
            last_status: 'ok',
            last_run_at: '2026-04-26T01:00:00Z',
            last_error: null,
            next_run_at: null,
          })
        }
        return Promise.resolve(null)
      })
      listHermesJobs.mockResolvedValue([])
      getHermesJobRuns.mockImplementation((id: string) => {
        if (id === 'review-job-3') {
          return Promise.resolve([
            {
              id: 'review-run-3',
              status: 'success',
              startedAt: '2026-04-26T01:00:00Z',
              finishedAt: '2026-04-26T01:05:00Z',
              output: {
                reviewOutput: 'Looks good to me.',
              },
            },
          ])
        }
        return Promise.resolve([])
      })

      const { requestWorkItemReviewApproval } = await import('./work-item-approvals')
      requestWorkItemReviewApproval(workItem.id, {
        requestedBy: 'system',
      })

      const result = await syncWorkItemExecutionState(workItem.id)

      expect(result.workItem.reviewDecision).toBe('manual_review')
      expect(result.workItem.reviewQualityGateStatus).toBe('manual_review')
      expect(result.workItem.reviewParserError).toBeTruthy()
      // Approval remains pending
      const { listWorkItemApprovals } = await import('./work-item-approvals')
      const approvals = listWorkItemApprovals(workItem.id)
      expect(approvals[0]?.status).toBe('pending')
    })

    it('high-risk approved output remains in manual review state', async () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
        defaultBranch: 'main',
        reviewAutoApproval: { enabled: true, maxPriority: 'medium' },
      })
      let workItem = createWorkItem({
        projectId: project.id,
        title: 'High risk manual',
        status: 'active',
        phase: 'review',
        priority: 'high',
        riskLevel: 'high',
        repoPathSnapshot: project.repoPath,
        reviewJobId: 'review-job-4',
      })

      getHermesJobById.mockImplementation((id: string) => {
        if (id === workItem.reviewJobId) {
          return Promise.resolve({
            id: 'review-job-4',
            name: 'planner-review-4',
            state: 'scheduled',
            last_status: 'ok',
            last_run_at: '2026-04-26T01:00:00Z',
            last_error: null,
            next_run_at: null,
          })
        }
        return Promise.resolve(null)
      })
      listHermesJobs.mockResolvedValue([])
      getHermesJobRuns.mockImplementation((id: string) => {
        if (id === 'review-job-4') {
          return Promise.resolve([
            {
              id: 'review-run-4',
              status: 'success',
              startedAt: '2026-04-26T01:00:00Z',
              finishedAt: '2026-04-26T01:05:00Z',
              output: {
                reviewOutput: `REVIEW_DECISION_JSON: ${JSON.stringify({
                  decision: 'approved',
                  confidence: 'high',
                  summary: 'Looks good.',
                  criteria: [{ text: 'All good', met: true }],
                  evidence: { planReviewed: true },
                  blockers: [],
                  risks: [],
                })}
DECISION: APPROVED`,
              },
            },
          ])
        }
        return Promise.resolve([])
      })

      const { requestWorkItemReviewApproval } = await import('./work-item-approvals')
      requestWorkItemReviewApproval(workItem.id, { requestedBy: 'system' })

      const result = await syncWorkItemExecutionState(workItem.id)

      // High-risk should stay manual_review
      expect(result.workItem.reviewDecision).toBe('manual_review')
      expect(result.workItem.reviewQualityGateStatus).toBe('manual_review')
      const { listWorkItemApprovals } = await import('./work-item-approvals')
      const approvals = listWorkItemApprovals(workItem.id)
      expect(approvals[0]?.status).toBe('pending')
    })

    it('dedups history notes on repeated sync cycle', async () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
        defaultBranch: 'main',
      })
      let workItem = createWorkItem({
        projectId: project.id,
        title: 'Dedup test',
        status: 'active',
        phase: 'review',
        priority: 'medium',
        riskLevel: 'low',
        repoPathSnapshot: project.repoPath,
        reviewJobId: 'review-job-5',
      })

      getHermesJobById.mockImplementation((id: string) => {
        if (id === workItem.reviewJobId) {
          return Promise.resolve({
            id: 'review-job-5',
            name: 'planner-review-5',
            state: 'scheduled',
            last_status: 'ok',
            last_run_at: '2026-04-26T01:00:00Z',
            last_error: null,
            next_run_at: null,
          })
        }
        return Promise.resolve(null)
      })
      listHermesJobs.mockResolvedValue([])
      getHermesJobRuns.mockImplementation((id: string) => {
        if (id === 'review-job-5') {
          return Promise.resolve([
            {
              id: 'review-run-5',
              status: 'success',
              startedAt: '2026-04-26T01:00:00Z',
              finishedAt: '2026-04-26T01:05:00Z',
              output: {
                reviewOutput: `DECISION: CHANGES_REQUESTED`,
              },
            },
          ])
        }
        return Promise.resolve([])
      })

      const { requestWorkItemReviewApproval } = await import('./work-item-approvals')
      requestWorkItemReviewApproval(workItem.id, { requestedBy: 'system' })

      // First sync adds: 1) approval request note, 2) approval-resolution note,
      // 3) structured review auto-resolution note.
      const result1 = await syncWorkItemExecutionState(workItem.id)
      expect(result1.workItem.history.length).toBe(3)
      expect(result1.workItem.history[0]?.note).toContain('Review approval requested')
      expect(result1.workItem.history[1]?.note).toContain('Review requested changes')
      expect(result1.workItem.history[2]?.note).toContain('Planner review requested changes')

      // Second sync — should not add duplicate history entry
      const result2 = await syncWorkItemExecutionState(workItem.id)
      expect(result2.workItem.history.length).toBe(result1.workItem.history.length)
    })

    it('failed review job without parseable decision keeps approval pending', async () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
        defaultBranch: 'main',
        reviewAutoApproval: { enabled: false, maxPriority: 'low' },
      })
      let workItem = createWorkItem({
        projectId: project.id,
        title: 'Failed review no output',
        status: 'active',
        phase: 'review',
        priority: 'medium',
        riskLevel: 'low',
        repoPathSnapshot: project.repoPath,
        reviewJobId: 'review-job-6',
      })

      getHermesJobById.mockImplementation((id: string) => {
        if (id === workItem.reviewJobId) {
          return Promise.resolve({
            id: 'review-job-6',
            name: 'planner-review-6',
            state: 'scheduled',
            last_status: 'error',
            last_run_at: '2026-04-26T01:00:00Z',
            last_error: 'Review worker crashed with timeout',
            next_run_at: null,
          })
        }
        return Promise.resolve(null)
      })
      listHermesJobs.mockResolvedValue([])
      getHermesJobRuns.mockImplementation((id: string) => {
        if (id === 'review-job-6') {
          return Promise.resolve([])
        }
        return Promise.resolve([])
      })

      const { requestWorkItemReviewApproval } = await import('./work-item-approvals')
      requestWorkItemReviewApproval(workItem.id, { requestedBy: 'system' })

      const result = await syncWorkItemExecutionState(workItem.id)

      // Failed job without parseable structured decision = manual_review
      expect(result.workItem.reviewDecision).toBe('manual_review')
      expect(result.workItem.reviewQualityGateStatus).toBe('manual_review')
      const { listWorkItemApprovals } = await import('./work-item-approvals')
      const approvals = listWorkItemApprovals(workItem.id)
      expect(approvals[0]?.status).toBe('pending')
    })
  })
})
