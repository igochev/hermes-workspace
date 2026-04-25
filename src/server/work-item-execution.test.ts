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
})
