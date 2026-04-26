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
  buildPlannerReviewGoal,
  buildWorkItemLaunchGoal,
  launchWorkItemIntoConductor,
} from './work-item-launch'
import { listExecutionRuns } from './execution-runs-store'

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
        phaseProfiles: { research: '', build: '', review: '', deploy: '' },
        reviewAutoApproval: { enabled: false, maxPriority: 'low' },
        autopilotPolicy: {
          enabled: false,
          schedulePreset: 'manual' as const,
          suggestionLimit: 5,
          scoutSources: [],
        },
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
        riskLevel: 'medium',
        labels: [],
        repoPathSnapshot: '/repos/mission-control',
        sessionKeys: [],
        artifactPaths: [],
        acceptanceCriteria: ['Launch API exists', 'Mission metadata is stored'],
        criteriaStatus: [],
        reviewQualityGateReasons: [],
        reviewMissingEvidence: [],
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
          maxPriority: 'high',
        },
        autopilotPolicy: {
          enabled: false,
          schedulePreset: 'manual' as const,
          suggestionLimit: 5,
          scoutSources: [],
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
        riskLevel: 'medium',
        labels: [],
        repoPathSnapshot: '/repos/mission-control',
        sessionKeys: [],
        artifactPaths: [],
        acceptanceCriteria: [],
        criteriaStatus: [],
        reviewQualityGateReasons: [],
        reviewMissingEvidence: [],
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

  it('rejects build launch for unprepared rough ideas without planFilePath', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Rough idea without planner draft',
      status: 'inbox',
      phase: 'research',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
      planFilePath: undefined,
    })

    await expect(
      launchWorkItemIntoConductor(workItem.id, {
        phase: 'build',
        phaseProfiles: { build: 'builder' },
      }),
    ).rejects.toThrow('Work item must be prepared by Planner before Builder launch')

    expect(launchConductorMission).not.toHaveBeenCalled()
  })

  it('allows build launch for ready items with planFilePath', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Prepared for build',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      planFilePath: 'docs/plans/prepared-draft.md',
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-122_pending',
      sessionKeyPrefix: 'cron_job-122_',
      jobId: 'job-122',
      jobName: 'work-item-build-ready',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'builder', research: 'planner' },
    })

    expect(result.launch.jobId).toBe('job-122')
    expect(launchConductorMission).toHaveBeenCalledTimes(1)
    expect(listExecutionRuns({ workItemId: workItem.id })).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: project.id,
        role: 'mission',
        phase: 'build',
        engine: 'conductor',
        jobId: 'job-122',
        jobName: 'work-item-build-ready',
        state: 'scheduled',
        sessionKey: 'cron_job-122_pending',
        sessionKeyPrefix: 'cron_job-122_',
      },
    ])
  })

  it('still allows research launch for rough ideas', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
      phaseProfiles: {
        research: 'researcher',
      },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Rough idea with research launch',
      status: 'inbox',
      phase: 'research',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-1234_pending',
      sessionKeyPrefix: 'cron_job-1234_',
      jobId: 'job-1234',
      jobName: 'work-item-research-rough',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'research',
      phaseProfiles: { research: 'researcher' },
    })

    expect(result.launch.phase).toBe('research')
    expect(result.launch.profile).toBe('researcher')
    expect(launchConductorMission).toHaveBeenCalledTimes(1)
  })

  it('launches a work item into conductor as a two-phase pipeline when status is ready', async () => {
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
      phaseProfiles: { build: 'builder', research: 'planner' },
      maxParallel: 2,
      supervised: false,
    })

    expect(launchConductorMission).toHaveBeenCalledTimes(1)
    // Should pass both build and research profiles for two-phase
    expect(launchConductorMission).toHaveBeenCalledWith(
      expect.objectContaining({
        phaseProfiles: expect.objectContaining({ build: 'builder', research: 'planner' }),
      }),
    )
    // Goal should be two-phase format
    const callArgs = launchConductorMission.mock.calls[0][0]
    expect(callArgs.goal).toContain('TWO-PHASE')
    expect(callArgs.goal).toContain('Phase 1')
    expect(callArgs.goal).toContain('Phase 2')
    expect(callArgs.goal).toContain('docs/plans/')

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
    expect(result.workItem.planFilePath).toMatch(/^docs\/plans\/.*-plan\.md$/)
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'launch',
      phase: 'build',
      status: 'active',
      missionId: 'job-123',
      sessionKey: 'cron_job-123_pending',
      sessionKeyPrefix: 'cron_job-123_',
      profile: 'builder',
    })
    expect(result.workItem.history.at(-1)?.note).toContain('two-phase pipeline')

    const persisted = getWorkItem(workItem.id)
    expect(persisted?.missionId).toBe('job-123')
    expect(persisted?.missionJobId).toBe('job-123')
    expect(persisted?.missionJobName).toBe('work-item-build-demo')
    expect(persisted?.missionSessionKeyPrefix).toBe('cron_job-123_')
    expect(persisted?.missionLink).toBe('/jobs?jobId=job-123')
    expect(persisted?.missionState).toBe('scheduled')
    expect(persisted?.history.at(-1)?.action).toBe('launch')
    expect(persisted?.planFilePath).toMatch(/^docs\/plans\/.*-plan\.md$/)
  })

  it('records relaunch history when blocked failed build work is launched again', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Recover failed build launch',
      status: 'blocked',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionState: 'failed',
      missionLastError: 'verification failed',
      missionId: 'job-old',
      missionJobId: 'job-old',
      missionJobName: 'work-item-build-old',
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-777_pending',
      sessionKeyPrefix: 'cron_job-777_',
      jobId: 'job-777',
      jobName: 'work-item-build-relaunch',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'builder' },
    })

    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.missionState).toBe('scheduled')
    expect(result.workItem.missionLastError).toBeUndefined()
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'launch',
      note: 'Relaunched build via Conductor using profile builder after failure recovery.',
      missionId: 'job-777',
      profile: 'builder',
    })
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
      status: 'active',
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

describe('buildPlannerReviewGoal', () => {
  it('returns a goal string with plan path, acceptance criteria, and decision instructions', () => {
    const project = {
      id: 'project-1',
      name: 'Mission Control Demo',
      slug: 'mission-control-demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
      repoUrl: 'https://github.com/example/demo',
      phaseProfiles: { research: '', build: '', review: '', deploy: '' },
      reviewAutoApproval: { enabled: false, maxPriority: 'medium' as const },
      autopilotPolicy: {
        enabled: false,
        schedulePreset: 'manual' as const,
        suggestionLimit: 5,
        scoutSources: [],
      },
      createdAt: '2026-04-25T12:00:00Z',
      updatedAt: '2026-04-25T12:00:00Z',
    }
    const workItem = {
      id: 'work-item-1',
      projectId: 'project-1',
      title: 'Planner review test item',
      description: 'This is a test item for Planner review.',
      status: 'active' as const,
      phase: 'review' as const,
      priority: 'high' as const,
      riskLevel: 'medium' as const,
      labels: [],
      repoPathSnapshot: '/repos/mission-control-demo',
      planFilePath: 'docs/plans/phase-3-plan.md',
      reviewQualityGateReasons: [],
      reviewMissingEvidence: [],
      acceptanceCriteria: ['Feature A is implemented', 'Feature B passes all tests'],
      criteriaStatus: [
        { text: 'Feature A is implemented', met: true },
        { text: 'Feature B passes all tests', met: false },
      ],
      notes: ['Operator note: check edge cases'],
      sessionKeys: [],
      artifactPaths: [],
      history: [],
      createdAt: '2026-04-25T12:00:00Z',
      updatedAt: '2026-04-25T12:00:00Z',
    }

    const goal = buildPlannerReviewGoal(workItem, project)

    expect(goal).toContain('Reviewer')
    expect(goal).toContain('Planner review test item')
    expect(goal).toContain('docs/plans/phase-3-plan.md')
    expect(goal).toContain('Feature A is implemented')
    expect(goal).toContain('Feature B passes all tests')
    expect(goal).toContain('1/2 criteria met')
    expect(goal).toContain('DECISION: APPROVED')
    expect(goal).toContain('DECISION: CHANGES_REQUESTED')
    expect(goal).toContain('Operator note')
    expect(goal).toContain('REVIEW_DECISION_JSON')
    expect(goal).toContain('"confidence": "low | medium | high"')
    expect(goal).toContain('"testResults": [{ "command": "...", "status": "passed|failed|not_run|unknown", "summary": "..." }]')
    expect(goal).toContain('"blockers": []')
    expect(goal).toContain('Missing structured output will require manual CEO review')
  })

  it('handles items with no plan file path or criteria gracefully', () => {
    const project = {
      id: 'project-1',
      name: 'Mission Control Demo',
      slug: 'mission-control-demo',
      repoPath: '/repos/mission-control-demo',
      phaseProfiles: { research: '', build: '', review: '', deploy: '' },
      reviewAutoApproval: { enabled: false, maxPriority: 'medium' as const },
      autopilotPolicy: {
        enabled: false,
        schedulePreset: 'manual' as const,
        suggestionLimit: 5,
        scoutSources: [],
      },
      createdAt: '2026-04-25T13:00:00Z',
      updatedAt: '2026-04-25T13:00:00Z',
    }
    const workItem = {
      id: 'work-item-2',
      projectId: 'project-1',
      title: 'No plan item',
      description: '',
      status: 'active' as const,
      phase: 'build' as const,
      priority: 'medium' as const,
      riskLevel: 'low' as const,
      labels: [],
      repoPathSnapshot: '/repos/mission-control-demo',
      acceptanceCriteria: [],
      criteriaStatus: [],
      reviewQualityGateReasons: [],
      reviewMissingEvidence: [],
      notes: [],
      sessionKeys: [],
      artifactPaths: [],
      history: [],
      createdAt: '2026-04-25T13:00:00Z',
      updatedAt: '2026-04-25T13:00:00Z',
    }

    const goal = buildPlannerReviewGoal(workItem, project)

    expect(goal).toContain('no plan file recorded')
    expect(goal).toContain('none recorded')
    expect(goal).toContain('No criteria status tracked')
  })
})
