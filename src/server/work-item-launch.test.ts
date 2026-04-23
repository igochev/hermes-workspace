import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { launchConductorMission, buildMissionLink } = vi.hoisted(() => ({
  launchConductorMission: vi.fn(),
  buildMissionLink: (jobId: string) => `/jobs?jobId=${encodeURIComponent(jobId)}`,
}))

vi.mock('./conductor-launch', () => ({
  launchConductorMission,
  buildMissionLink,
}))

import { createProject } from './projects-store'
import {
  createWorkItem,
  getWorkItem,
} from './work-items-store'
import {
  buildWorkItemLaunchGoal,
  launchWorkItemIntoConductor,
} from './work-item-launch'

describe('work-item-launch', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-work-item-launch-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    launchConductorMission.mockReset()
  })

  afterEach(async () => {
    const fs = await import('node:fs')
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('builds a grounded launch goal with project and work item context', () => {
    const goal = buildWorkItemLaunchGoal({
      project: {
        id: 'project-1',
        name: 'Mission Control',
        slug: 'mission-control',
        repoPath: '/repos/mission-control',
        repoUrl: 'https://github.com/example/mission-control',
        defaultBranch: 'main',
        description: 'workspace evolution',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      workItem: {
        id: 'work-item-1',
        projectId: 'project-1',
        title: 'Launch conductor from work item',
        description: 'Connect tracked work items to Conductor.',
        status: 'ready',
        phase: 'build',
        priority: 'high',
        repoPathSnapshot: '/repos/mission-control',
        sessionKeys: [],
        artifactPaths: [],
        acceptanceCriteria: ['Launch API exists', 'Mission metadata is stored'],
        notes: ['User approved Phase 2'],
        history: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      phase: 'build',
      profile: 'builder',
    })

    expect(goal).toContain('Launch phase: build')
    expect(goal).toContain('Preferred Hermes profile for this phase: builder')
    expect(goal).toContain('Launch API exists')
    expect(goal).toContain('User approved Phase 2')
  })

  it('uses planning-oriented launch guidance for research-phase work items', () => {
    const goal = buildWorkItemLaunchGoal({
      project: {
        id: 'project-1',
        name: 'Mission Control',
        slug: 'mission-control',
        repoPath: '/repos/mission-control',
        repoUrl: 'https://github.com/example/mission-control',
        defaultBranch: 'main',
        description: 'workspace evolution',
        phaseProfiles: {
          research: 'researcher',
          build: 'builder',
          review: 'reviewer',
          deploy: 'deployer',
        },
        reviewAutoApproval: {
          enabled: false,
          maxPriority: 'low',
        },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      workItem: {
        id: 'work-item-2',
        projectId: 'project-1',
        title: 'Turn operator idea into a plan',
        description: 'Capture the idea, clarify it, and prepare a build-ready plan.',
        status: 'inbox',
        phase: 'research',
        priority: 'medium',
        repoPathSnapshot: '/repos/mission-control',
        sessionKeys: [],
        artifactPaths: [],
        acceptanceCriteria: [],
        notes: ['Started as an idea-capture request.'],
        history: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      phase: 'research',
      profile: 'researcher',
    })

    expect(goal).toContain('Launch phase: research')
    expect(goal).toContain('Primary outcome for this research/planning launch:')
    expect(goal).toContain('draft acceptance criteria')
    expect(goal).toContain('If acceptance criteria are incomplete, propose them explicitly')
  })

  it('launches a work item into conductor and records mission linkage history', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      repoUrl: 'https://github.com/example/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Wire Conductor launch from work item',
      description: 'Connect work-item launch API to existing Conductor spawn flow.',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      acceptanceCriteria: ['Launch creates a mission', 'Work item stores mission metadata'],
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-123_pending',
      sessionKeyPrefix: 'cron_job-123_',
      jobId: 'job-123',
      jobName: 'work-item-build-demo',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'builder' },
      maxParallel: 2,
      supervised: false,
    })

    expect(launchConductorMission).toHaveBeenCalledTimes(1)
    expect(launchConductorMission).toHaveBeenCalledWith(
      expect.objectContaining({
        phaseProfiles: expect.objectContaining({ build: 'builder' }),
      }),
    )
    expect(result.launch.jobId).toBe('job-123')
    expect(result.launch.profile).toBe('builder')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.missionId).toBe('job-123')
    expect(result.workItem.missionJobId).toBe('job-123')
    expect(result.workItem.missionJobName).toBe('work-item-build-demo')
    expect(result.workItem.missionSessionKeyPrefix).toBe('cron_job-123_')
    expect(result.workItem.missionLink).toBe('/jobs?jobId=job-123')
    expect(result.workItem.missionState).toBe('scheduled')
    expect(result.workItem.sessionKeys).toContain('cron_job-123_pending')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'launch',
      phase: 'build',
      status: 'active',
      missionId: 'job-123',
      sessionKey: 'cron_job-123_pending',
      sessionKeyPrefix: 'cron_job-123_',
      profile: 'builder',
    })

    const persisted = getWorkItem(workItem.id)
    expect(persisted?.missionId).toBe('job-123')
    expect(persisted?.missionJobId).toBe('job-123')
    expect(persisted?.missionJobName).toBe('work-item-build-demo')
    expect(persisted?.missionSessionKeyPrefix).toBe('cron_job-123_')
    expect(persisted?.missionLink).toBe('/jobs?jobId=job-123')
    expect(persisted?.missionState).toBe('scheduled')
    expect(persisted?.history.at(-1)?.action).toBe('launch')
  })

  it('prefers project phase routing over global defaults when the work item has no explicit profile', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
      phaseProfiles: {
        build: 'project-builder',
        review: 'project-reviewer',
      },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Use project-level build routing',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-456_pending',
      sessionKeyPrefix: 'cron_job-456_',
      jobId: 'job-456',
      jobName: 'work-item-build-demo-project-routing',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'global-builder' },
    })

    expect(launchConductorMission).toHaveBeenCalledWith(
      expect.objectContaining({
        phaseProfiles: expect.objectContaining({
          build: 'project-builder',
          review: 'project-reviewer',
        }),
      }),
    )
    expect(result.launch.profile).toBe('project-builder')
    expect(result.workItem.history.at(-1)?.profile).toBe('project-builder')
  })

  it('passes research routing through to the conductor spawn path', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Plan the next implementation slice',
      status: 'ready',
      phase: 'research',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-789_pending',
      sessionKeyPrefix: 'cron_job-789_',
      jobId: 'job-789',
      jobName: 'work-item-research-demo-routing',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'research',
      phaseProfiles: { research: 'researcher', build: 'builder' },
    })

    expect(launchConductorMission).toHaveBeenCalledWith(
      expect.objectContaining({
        phaseProfiles: expect.objectContaining({
          research: 'researcher',
        }),
      }),
    )
    expect(result.launch.profile).toBe('researcher')
    expect(result.workItem.history.at(-1)?.profile).toBe('researcher')
  })
})
