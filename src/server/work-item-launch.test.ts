import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem, getWorkItem } from './work-items-store'
import {
  buildPlannerReviewGoal,
  buildWorkItemLaunchGoal,
  launchPlannerReview,
  launchWorkItemIntoConductor,
} from './work-item-launch'
import { listExecutionRuns } from './execution-runs-store'
import { upsertRoleCapacityRule } from './role-capacity-policy'
import { listAttentionQueueItems } from './attention-queue-store'

const { launchConductorMission, launchImmediateExecution, buildMissionLink, listProfiles } = vi.hoisted(
  () => ({
    launchConductorMission: vi.fn(),
    launchImmediateExecution: vi.fn(),
    buildMissionLink: (jobId: string) =>
      `/jobs?jobId=${encodeURIComponent(jobId)}`,
    listProfiles: vi.fn(),
  }),
)

vi.mock('./conductor-launch', () => ({
  launchConductorMission,
  buildMissionLink,
}))

vi.mock('./immediate-execution-launch', () => ({
  launchImmediateExecution,
}))

vi.mock('./profiles-browser', () => ({
  listProfiles,
}))

function projectFixture(overrides: Record<string, unknown> = {}) {
  return {
    runtimeProfiles: {},
    autonomyLanePolicy: {
      enabled: false,
      mode: 'single_lane' as const,
      isolation: 'branch' as const,
      maxActiveWorkItems: 1 as const,
      baseBranch: 'main',
      branchPrefix: 'mission',
      plannerTiming: 'on_lane_entry' as const,
      blockedBehavior: 'park_and_continue_when_repo_clean' as const,
      mergeHealerEnabled: true,
      allowParallelWorktrees: false as const,
      alwaysOn: {
        enabled: false,
        retry: {
          enabled: false,
          maxAttemptsPerPhase: 1,
          cooldownMinutes: 30,
          staleScheduledMinutes: 30,
          staleRunningMinutes: 240,
        },
        notifications: {
          enabled: true,
          digestOnly: true,
          notifyOn: [
            'blocked',
            'retry_exhausted',
            'unsafe_repo',
            'pr_ready',
            'cleanup_recommended',
          ] as Array<
            | 'blocked'
            | 'retry_exhausted'
            | 'unsafe_repo'
            | 'pr_ready'
            | 'cleanup_recommended'
          >,
          minRepeatMinutes: 60,
        },
        prPublishing: {
          enabled: false,
          mode: 'manual' as const,
          titlePrefix: '[Hermes Workspace]',
          requireCleanRepo: true,
          requirePassingMergeTests: true,
        },
        cleanup: {
          enabled: false,
          deleteMergedBranches: false,
          retainMergedBranchDays: 30,
          retainLaneStashes: true,
          retainLaneStashDays: 30,
          dryRun: true,
        },
      },
    },
    ...overrides,
  }
}

describe('work-item-launch', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    tempHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'hermes-workspace-work-item-launch-'),
    )
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    launchConductorMission.mockReset()
    launchImmediateExecution.mockReset()
    launchImmediateExecution.mockImplementation((input: { phase: string; workItemId: string }) => ({
      executionRunId: `execution-${input.phase}-${input.workItemId.slice(0, 8)}`,
      sessionKey: `session-${input.phase}-${input.workItemId.slice(0, 8)}`,
      state: 'running',
      link: `/executions/execution-${input.phase}-${input.workItemId.slice(0, 8)}`,
    }))
    listProfiles.mockReset()
    listProfiles.mockReturnValue([
      { name: 'researcher' },
      { name: 'planner' },
      { name: 'builder' },
      { name: 'reviewer' },
      { name: 'deployer' },
      { name: 'project-builder' },
      { name: 'project-reviewer' },
      { name: 'global-builder' },
    ])
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
        ...projectFixture(),
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
        sourceSuggestionEvidence: [],
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
        ...projectFixture(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      workItem: {
        id: 'work-item-2',
        projectId: 'project-1',
        title: 'Turn operator idea into a plan',
        description:
          'Capture the idea, clarify it, and prepare a build-ready plan.',
        status: 'inbox',
        phase: 'research',
        priority: 'medium',
        riskLevel: 'medium',
        labels: [],
        repoPathSnapshot: '/repos/mission-control',
        sourceSuggestionEvidence: [],
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
    expect(goal).toContain(
      'If acceptance criteria are incomplete, propose them explicitly',
    )
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
    ).rejects.toThrow(
      'Work item must be prepared by Planner before Builder launch',
    )

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

    expect(result.launch.executionRunId).toBeTruthy()
    expect(result.launch.link).toMatch(/^\/executions\//)
    expect(launchConductorMission).not.toHaveBeenCalled()
    expect(launchImmediateExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        workItemId: workItem.id,
        phase: 'build',
        role: 'builder',
        profile: 'builder',
        repoPath: project.repoPath,
      }),
    )
  })

  it('clears stale review decision fields when relaunching build after changes_requested', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
      phaseProfiles: { build: 'builder' },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Retry build after reviewer changes',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      planFilePath: 'docs/plans/retry-build.md',
      missionId: 'previous-builder-run',
      missionState: 'succeeded',
      reviewJobId: 'previous-review-run',
      reviewState: 'failed',
      reviewDecision: 'changes_requested',
      reviewDecisionSummary: 'Needs copy cleanup.',
      reviewDecisionConfidence: 'high',
      reviewDecisionSource: 'json',
      reviewParserError: 'old parser warning',
      reviewQualityGateStatus: 'fail',
      reviewQualityGateReasons: ['Reviewer requested changes.'],
      reviewMissingEvidence: ['Desktop screenshot missing.'],
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'builder' },
    })

    expect(result.workItem.missionId).toMatch(/^execution-build-/)
    expect(result.workItem.reviewJobId).toBeUndefined()
    expect(result.workItem.reviewState).toBeUndefined()
    expect(result.workItem.reviewDecision).toBeUndefined()
    expect(result.workItem.reviewQualityGateStatus).toBeUndefined()
    expect(result.workItem.reviewQualityGateReasons).toEqual([])
    expect(result.workItem.reviewMissingEvidence).toEqual([])
    expect(getWorkItem(workItem.id)?.reviewDecision).toBeUndefined()
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
    expect(launchImmediateExecution).toHaveBeenCalledTimes(1)
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
      description:
        'Connect work-item launch API to existing Conductor spawn flow.',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      acceptanceCriteria: [
        'Launch creates a mission',
        'Work item stores mission metadata',
      ],
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

    expect(launchImmediateExecution).toHaveBeenCalledTimes(1)
    expect(launchImmediateExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'build',
        role: 'builder',
        profile: 'builder',
      }),
    )
    // Goal should be two-phase format
    const callArgs = launchImmediateExecution.mock.calls[0][0]
    expect(callArgs.goal).toContain('TWO-PHASE')
    expect(callArgs.goal).toContain('Phase 1')
    expect(callArgs.goal).toContain('Phase 2')
    expect(callArgs.goal).toContain('docs/plans/')

    expect(result.launch.executionRunId).toBeTruthy()
    expect(result.launch.profile).toBe('builder')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.missionId).toBe(result.launch.executionRunId)
    expect(result.workItem.missionJobId).toBeUndefined()
    expect(result.workItem.missionJobName).toBeUndefined()
    expect(result.workItem.missionSessionKeyPrefix).toBe(result.launch.sessionKey)
    expect(result.workItem.missionLink).toBe(result.launch.link)
    expect(result.workItem.missionState).toBe('running')
    expect(result.workItem.sessionKeys).toContain(result.launch.sessionKey)
    expect(result.workItem.planFilePath).toMatch(/^docs\/plans\/.*-plan\.md$/)
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'launch',
      phase: 'build',
      status: 'active',
      missionId: result.launch.executionRunId,
      sessionKey: result.launch.sessionKey,
      sessionKeyPrefix: result.launch.sessionKey,
      profile: 'builder',
    })
    expect(result.workItem.history.at(-1)?.note).toContain('two-phase pipeline')

    const persisted = getWorkItem(workItem.id)
    expect(persisted?.missionId).toBe(result.launch.executionRunId)
    expect(persisted?.missionJobId).toBeUndefined()
    expect(persisted?.missionJobName).toBeUndefined()
    expect(persisted?.missionSessionKeyPrefix).toBe(result.launch.sessionKey)
    expect(persisted?.missionLink).toBe(result.launch.link)
    expect(persisted?.missionState).toBe('running')
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
    expect(result.workItem.missionState).toBe('running')
    expect(result.workItem.missionLastError).toBeUndefined()
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'launch',
      note: 'Relaunched build as immediate execution using profile builder after failure recovery.',
      missionId: result.launch.executionRunId,
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

    expect(launchImmediateExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'build',
        role: 'builder',
        profile: 'project-builder',
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

    expect(launchImmediateExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'research',
        role: 'planner',
        profile: 'researcher',
      }),
    )
    expect(result.launch.profile).toBe('researcher')
    expect(result.workItem.history.at(-1)?.profile).toBe('researcher')
  })

  it('includes an advisory capacity decision in the launch response without blocking over-capacity work', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
      phaseProfiles: { build: 'builder' },
    })
    upsertRoleCapacityRule({
      role: 'build',
      profile: 'builder',
      maxActive: 1,
      enabled: true,
    })
    createWorkItem({
      projectId: project.id,
      title: 'Already active build',
      status: 'active',
      phase: 'build',
      priority: 'medium',
      assignedProfile: 'builder',
      repoPathSnapshot: project.repoPath,
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Launch despite advisory capacity',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      planFilePath: 'docs/plans/advisory-capacity.md',
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-901_pending',
      sessionKeyPrefix: 'cron_job-901_',
      jobId: 'job-901',
      jobName: 'work-item-build-capacity',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'builder' },
    })

    expect(result.launch.executionRunId).toBeTruthy()
    expect(result.capacityDecision).toMatchObject({
      role: 'build',
      profile: 'builder',
      activeCount: 1,
      maxActive: 1,
      allowed: false,
      advisoryOnly: true,
      message:
        'build capacity is at 1/1 active work items; launch may proceed with operator awareness.',
    })
    expect(result.workItem.status).toBe('active')
  })

  it('includes profile readiness advisory without changing launch resolution order', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
      phaseProfiles: {
        build: 'project-builder',
      },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Assigned profile overrides project readiness mapping',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      assignedProfile: 'missing-specialist',
      repoPathSnapshot: project.repoPath,
      planFilePath: 'docs/plans/assigned-profile.md',
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-903_pending',
      sessionKeyPrefix: 'cron_job-903_',
      jobId: 'job-903',
      jobName: 'work-item-build-readiness',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'global-builder' },
    })

    expect(result.launch.profile).toBe('missing-specialist')
    expect(result.profileReadinessDecision).toMatchObject({
      role: 'build',
      mappedProfile: 'missing-specialist',
      source: 'work-item-assigned-profile',
      status: 'missing',
      severity: 'warning',
    })
    expect(
      result.profileReadinessReport.roles.find((role) => role.role === 'build'),
    ).toMatchObject({
      mappedProfile: 'missing-specialist',
      status: 'missing',
    })
    expect(result.workItem.history.at(-1)?.note).toContain(
      'Profile readiness advisory:',
    )
    expect(result.workItem.history.at(-1)?.note).toContain('missing-specialist')
    expect(launchImmediateExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'build',
        role: 'builder',
        profile: 'missing-specialist',
      }),
    )
  })

  it('keeps capacity advisory behavior while adding unknown readiness when profile discovery fails', async () => {
    listProfiles.mockImplementation(() => {
      throw new Error('profile browser unavailable')
    })
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
      phaseProfiles: { build: 'builder' },
    })
    upsertRoleCapacityRule({
      role: 'build',
      profile: 'builder',
      maxActive: 1,
      enabled: true,
    })
    createWorkItem({
      projectId: project.id,
      title: 'Already active build',
      status: 'active',
      phase: 'build',
      priority: 'medium',
      assignedProfile: 'builder',
      repoPathSnapshot: project.repoPath,
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Launch with capacity and readiness advisories',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      planFilePath: 'docs/plans/capacity-and-readiness.md',
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-904_pending',
      sessionKeyPrefix: 'cron_job-904_',
      jobId: 'job-904',
      jobName: 'work-item-build-capacity-readiness',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'builder' },
    })

    expect(result.launch.executionRunId).toBeTruthy()
    expect(result.capacityDecision.allowed).toBe(false)
    expect(result.capacityDecision.message).toContain(
      'build capacity is at 1/1',
    )
    expect(result.profileReadinessDecision).toMatchObject({
      role: 'build',
      mappedProfile: 'builder',
      status: 'unknown',
      severity: 'unknown',
    })
    expect(result.profileReadinessReport.overallStatus).toBe('unknown')
    expect(result.workItem.history.at(-1)?.note).toContain(
      'Capacity advisory: build capacity is at 1/1',
    )
    expect(result.workItem.history.at(-1)?.note).toContain(
      'Profile readiness advisory:',
    )
    expect(result.workItem.status).toBe('active')
  })

  it('records capacity advisory history and creates an attention item when launch is over capacity', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
      phaseProfiles: { build: 'builder' },
    })
    upsertRoleCapacityRule({
      role: 'build',
      profile: 'builder',
      maxActive: 1,
      enabled: true,
    })
    createWorkItem({
      projectId: project.id,
      title: 'Active build occupying capacity',
      status: 'active',
      phase: 'build',
      priority: 'medium',
      assignedProfile: 'builder',
      repoPathSnapshot: project.repoPath,
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Over capacity launch creates attention',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      planFilePath: 'docs/plans/over-capacity.md',
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-902_pending',
      sessionKeyPrefix: 'cron_job-902_',
      jobId: 'job-902',
      jobName: 'work-item-build-capacity-attention',
      runId: null,
    })

    const result = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
      phaseProfiles: { build: 'builder' },
    })

    expect(result.workItem.history.at(-1)?.note).toContain(
      'Capacity advisory: build capacity is at 1/1 active work items',
    )
    expect(listAttentionQueueItems({ status: 'open' })).toContainEqual(
      expect.objectContaining({
        dedupeKey: `capacity:launch:${workItem.id}:build`,
        kind: 'capacity_exceeded',
        severity: 'warning',
        source: 'capacity',
        projectId: project.id,
        workItemId: workItem.id,
        href: `/projects/${project.id}/work-items/${workItem.id}`,
      }),
    )
  })

  it('launches review phase through review fields without overwriting Builder mission evidence', async () => {
    const project = createProject({
      name: 'Review Field Routing',
      repoPath: '/repos/review-field-routing',
      phaseProfiles: { review: 'reviewer' },
      ...projectFixture(),
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Preserve Builder mission while reviewing',
      status: 'active',
      phase: 'review',
      priority: 'medium',
      riskLevel: 'medium',
      repoPathSnapshot: project.repoPath,
      missionId: 'builder-exec-123',
      missionLink: '/executions/builder-exec-123',
      missionState: 'succeeded',
      planFilePath: 'docs/plans/review.md',
      acceptanceCriteria: ['Review uses review fields'],
    })

    const result = await launchWorkItemIntoConductor(workItem.id, { phase: 'review' })

    expect(result.workItem.missionId).toBe('builder-exec-123')
    expect(result.workItem.missionLink).toBe('/executions/builder-exec-123')
    expect(result.workItem.missionState).toBe('succeeded')
    expect(result.workItem.reviewJobId).toBe(`execution-review-${workItem.id.slice(0, 8)}`)
    expect(result.workItem.reviewState).toBe('running')
    expect(launchImmediateExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: workItem.id,
        projectId: project.id,
        phase: 'review',
        role: 'reviewer',
        profile: 'reviewer',
      }),
    )
  })

  it('launches Planner review as an immediate execution instead of a Scheduled Job', async () => {
    const project = createProject({
      name: 'Review Immediate',
      repoPath: '/repos/review-immediate',
      phaseProfiles: { review: 'reviewer' },
      ...projectFixture(),
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Review without scheduled job',
      status: 'active',
      phase: 'review',
      priority: 'medium',
      riskLevel: 'medium',
      repoPathSnapshot: project.repoPath,
      planFilePath: 'docs/plans/review.md',
      acceptanceCriteria: ['Review uses immediate execution'],
    })

    const reviewLaunch = await launchPlannerReview(workItem, project)

    expect(reviewLaunch).toEqual(
      expect.objectContaining({
        reviewJobId: `execution-review-${workItem.id.slice(0, 8)}`,
        reviewState: 'running',
        reviewLink: `/executions/execution-review-${workItem.id.slice(0, 8)}`,
      }),
    )
    expect(launchConductorMission).not.toHaveBeenCalled()
    expect(launchImmediateExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: workItem.id,
        projectId: project.id,
        phase: 'review',
        role: 'reviewer',
        profile: 'reviewer',
        repoPath: project.repoPath,
      }),
    )
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
      ...projectFixture(),
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
      sourceSuggestionEvidence: [],
      reviewQualityGateReasons: [],
      reviewMissingEvidence: [],
      acceptanceCriteria: [
        'Feature A is implemented',
        'Feature B passes all tests',
      ],
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
    expect(goal).toContain(
      '"testResults": [{ "command": "...", "status": "passed|failed|not_run|unknown", "summary": "..." }]',
    )
    expect(goal).toContain('"blockers": []')
    expect(goal).toContain(
      'Missing structured output will require manual CEO review',
    )
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
      ...projectFixture(),
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
      sourceSuggestionEvidence: [],
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
