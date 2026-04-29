import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem, getWorkItem } from './work-items-store'
import { launchWorkItemIntoConductor } from './work-item-launch'
import { syncWorkItemExecutionState } from './work-item-execution'

const { launchConductorMission, buildMissionLink, getHermesJobById, listHermesJobs, getHermesJobRuns } = vi.hoisted(() => ({
  launchConductorMission: vi.fn(),
  buildMissionLink: (jobId: string) => `/jobs?jobId=${encodeURIComponent(jobId)}`,
  getHermesJobById: vi.fn(),
  listHermesJobs: vi.fn(),
  getHermesJobRuns: vi.fn(),
}))

vi.mock('./conductor-launch', () => ({
  launchConductorMission,
  buildMissionLink,
}))

vi.mock('./hermes-jobs', () => ({
  getHermesJobById,
  listHermesJobs,
  getHermesJobRuns,
}))

describe('work-item phase 5 execution linkage', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-work-item-phase5-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    launchConductorMission.mockReset()
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

  it('stores canonical Hermes job fields immediately on launch', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Persist canonical Hermes job linkage',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-321_pending',
      sessionKeyPrefix: 'cron_job-321_',
      jobId: 'job-321',
      jobName: 'work-item-build-mission-control-demo-1234abcd',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'builder' },
    })

    expect(result.workItem.missionId).toBe('job-321')
    expect(result.workItem.missionJobId).toBe('job-321')
    expect(result.workItem.missionJobName).toBe('work-item-build-mission-control-demo-1234abcd')
    expect(result.workItem.missionSessionKeyPrefix).toBe('cron_job-321_')
    expect(result.workItem.missionState).toBe('scheduled')

    const persisted = getWorkItem(workItem.id)
    expect(persisted?.missionJobId).toBe('job-321')
    expect(persisted?.missionJobName).toBe('work-item-build-mission-control-demo-1234abcd')
    expect(persisted?.missionSessionKeyPrefix).toBe('cron_job-321_')
  })

  it('returns enriched execution details including canonical job identity and latest run', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Show richer execution state',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionId: 'legacy-name',
      missionJobName: 'work-item-build-mission-control-demo-1234abcd',
      missionSessionKeyPrefix: 'cron_job-654_',
      missionState: 'running',
      sessionKeys: ['cron_job-654_pending'],
    })

    getHermesJobById.mockResolvedValue(null)
    listHermesJobs.mockResolvedValue([
      {
        id: 'job-654',
        name: 'work-item-build-mission-control-demo-1234abcd',
        state: 'running',
        last_status: null,
        last_run_at: '2026-04-21T22:20:00Z',
        last_error: null,
        next_run_at: '2026-04-21T22:25:00Z',
      },
    ])
    getHermesJobRuns.mockResolvedValue([
      {
        id: 'run-1',
        status: 'running',
        startedAt: '2026-04-21T22:20:00Z',
        finishedAt: null,
        durationMs: undefined,
        error: undefined,
        deliverySummary: 'local',
        chatSessionKey: 'cron_job-654_20260421_222000',
        output: null,
      },
    ])

    const result = await syncWorkItemExecutionState(workItem.id)

    expect(result.execution.state).toBe('running')
    expect(result.execution.job?.id).toBe('job-654')
    expect(result.execution.jobRuns).toHaveLength(1)
    expect(result.execution.jobRuns[0]?.chatSessionKey).toBe('cron_job-654_20260421_222000')
    expect(result.execution.latestSessionKey).toBe('cron_job-654_20260421_222000')
    expect(result.execution.latestRun?.id).toBe('run-1')
    expect(result.workItem.missionJobId).toBe('job-654')
    expect(result.workItem.missionJobName).toBe('work-item-build-mission-control-demo-1234abcd')
    expect(result.workItem.missionSessionKeyPrefix).toBe('cron_job-654_')
  })
})
