import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getHermesJobById, listHermesJobs } = vi.hoisted(() => ({
  getHermesJobById: vi.fn(),
  listHermesJobs: vi.fn(),
}))

vi.mock('./hermes-jobs', () => ({
  getHermesJobById,
  listHermesJobs,
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

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.job?.id).toBe('job-123')
    expect(result.execution.state).toBe('succeeded')
    expect(result.execution.transitionApplied).toBe('build->review')
    expect(result.workItem.missionId).toBe('job-123')
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

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('failed')
    expect(result.execution.transitionApplied).toBe('active->blocked')
    expect(result.workItem.status).toBe('blocked')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.missionState).toBe('failed')
    expect(result.workItem.missionLastError).toBe('Worker failed verification')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'blocked',
      phase: 'build',
      missionId: 'job-999',
    })
  })
})
