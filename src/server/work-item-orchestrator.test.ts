import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createPlanningDraft,
  getLatestPlanningDraftForWorkItem,
} from './planning-drafts-store'
import { createProject } from './projects-store'
import { upsertExecutionRun } from './execution-runs-store'
import {

  createWorkItem,
  getWorkItem,
  updateWorkItem
} from './work-items-store'
import { requestWorkItemReviewApproval } from './work-item-approvals'
import {
  reconcileAllWorkItemAutonomy,
  reconcileWorkItemAutonomy,
} from './work-item-orchestrator'
import type * as WorkItemPlanningModule from './work-item-planning'
import type {WorkItemRecord} from './work-items-store';

const {
  getLatestHermesJobOutput,
  launchWorkItemIntoConductor,
  prepareWorkItemWithPlanner,
  syncWorkItemExecutionState,
} = vi.hoisted(() => ({
  getLatestHermesJobOutput: vi.fn(),
  launchWorkItemIntoConductor: vi.fn(),
  prepareWorkItemWithPlanner: vi.fn(),
  syncWorkItemExecutionState: vi.fn(),
}))

vi.mock('./hermes-job-output', () => ({
  getLatestHermesJobOutput,
}))

vi.mock('./work-item-planning', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkItemPlanningModule>()),
  prepareWorkItemWithPlanner,
}))

vi.mock('./work-item-launch', () => ({
  launchWorkItemIntoConductor,
}))

vi.mock('./work-item-execution', () => ({
  syncWorkItemExecutionState,
}))

describe('work-item-orchestrator', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'hermes-workspace-orchestrator-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = join(tempHome, '.hermes')
    getLatestHermesJobOutput.mockReset()
    launchWorkItemIntoConductor.mockReset()
    prepareWorkItemWithPlanner.mockReset()
    syncWorkItemExecutionState.mockReset()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  function createDemoWorkItem(
    input: Partial<WorkItemRecord> = {},
  ): WorkItemRecord {
    const project = createProject({
      name: 'Autonomous Demo',
      repoPath: '/repos/autonomous-demo',
      defaultBranch: 'main',
    })
    return createWorkItem({
      projectId: project.id,
      title: input.title ?? 'Autonomous work item',
      description: input.description ?? 'Implement autonomous workflow',
      status: input.status ?? 'active',
      phase: input.phase ?? 'research',
      priority: input.priority ?? 'medium',
      riskLevel: input.riskLevel ?? 'low',
      repoPathSnapshot: input.repoPathSnapshot ?? project.repoPath,
      planFilePath: input.planFilePath,
      missionJobId: input.missionJobId,
      missionState: input.missionState,
    })
  }

  it('auto-launches Planner for a new inbox research item with no planning draft', async () => {
    const workItem = createDemoWorkItem({ status: 'inbox', phase: 'research' })
    prepareWorkItemWithPlanner.mockResolvedValue({})

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(prepareWorkItemWithPlanner).toHaveBeenCalledWith(
      workItem.id,
      expect.any(Object),
    )
    expect(result.changed).toBe(true)
    expect(result.events).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: workItem.projectId,
        action: 'launch_planner',
      },
    ])
  })

  it('does not launch a duplicate Planner when an active planning draft already exists', async () => {
    const workItem = createDemoWorkItem({ status: 'inbox', phase: 'research' })
    createPlanningDraft({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      status: 'running',
      plannerJobId: 'job-planner-existing',
    })
    getLatestHermesJobOutput.mockResolvedValue(null)

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(prepareWorkItemWithPlanner).not.toHaveBeenCalled()
    expect(result.changed).toBe(false)
    expect(result.events[0]?.action).toBe('noop')
  })

  it('ingests a Planner markdown artifact when the job output stream is unavailable', async () => {
    const repoPath = join(tempHome, 'candidate-repo')
    const workItem = createDemoWorkItem({
      status: 'active',
      phase: 'research',
      repoPathSnapshot: repoPath,
    })
    const planFilePath = `docs/plans/autonomous-demo-${workItem.id.slice(0, 8)}-planner-draft.md`
    mkdirSync(join(repoPath, 'docs', 'plans'), { recursive: true })
    writeFileSync(
      join(repoPath, planFilePath),
      [
        '# Planner draft',
        '',
        `Work item ID: ${workItem.id}`,
        '## implementation approach',
        'Make one small Builder change with matching tests.',
        '## acceptance criteria rationale',
        'Proceed to build after this planning artifact is present.',
      ].join('\n'),
      'utf8',
    )
    const draft = createPlanningDraft({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      status: 'running',
      plannerJobId: 'job-planner-artifact',
    })
    getLatestHermesJobOutput.mockResolvedValue(null)

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(result.changed).toBe(true)
    expect(result.events[0]).toMatchObject({
      action: 'ingest_planner_output',
      draftId: draft.id,
      jobId: 'job-planner-artifact',
    })
    expect(getLatestPlanningDraftForWorkItem(workItem.id)).toMatchObject({
      id: draft.id,
      status: 'structured_ready',
      planFilePath,
      structuredOutput: expect.objectContaining({
        planFilePath,
        suggestedPhase: 'build',
      }),
    })
  })

  it('auto-accepts a build-ready structured planning draft to ready build', async () => {
    const workItem = createDemoWorkItem({ status: 'active', phase: 'research' })
    const draft = createPlanningDraft({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      status: 'structured_ready',
      structuredOutput: {
        title: 'Prepared title',
        description: 'Prepared description',
        priority: 'medium',
        riskLevel: 'low',
        labels: ['planner'],
        acceptanceCriteria: ['Criterion one'],
        notes: ['Planner note'],
        planFilePath: 'docs/plans/prepared.md',
        openQuestions: [],
        suggestedPhase: 'build',
      },
      planFilePath: 'docs/plans/prepared.md',
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(result.changed).toBe(true)
    expect(result.events).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: workItem.projectId,
        action: 'accept_planning_draft',
        draftId: draft.id,
        statusAfter: 'ready',
        phaseAfter: 'build',
      },
    ])
    expect(getLatestPlanningDraftForWorkItem(workItem.id)).toMatchObject({
      id: draft.id,
      status: 'accepted',
    })
    expect(getWorkItem(workItem.id)).toMatchObject({
      status: 'ready',
      phase: 'build',
      planFilePath: 'docs/plans/prepared.md',
    })
  })

  it('does not auto-accept a structured planning draft that asks for more research', async () => {
    const workItem = createDemoWorkItem({ status: 'active', phase: 'research' })
    createPlanningDraft({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      status: 'structured_ready',
      structuredOutput: {
        title: 'Research title',
        description: 'Research description',
        priority: 'medium',
        riskLevel: 'low',
        labels: ['planner'],
        acceptanceCriteria: ['Criterion one'],
        notes: ['Needs more research'],
        planFilePath: 'docs/plans/research.md',
        openQuestions: ['What is the target API?'],
        suggestedPhase: 'research',
      },
      planFilePath: 'docs/plans/research.md',
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(result.changed).toBe(false)
    expect(result.events[0]).toMatchObject({ action: 'noop' })
    expect(result.events[0]?.message).toContain('more research')
    expect(getWorkItem(workItem.id)).toMatchObject({
      status: 'active',
      phase: 'research',
    })
  })

  it('auto-launches Builder for a ready build work item with an accepted plan', async () => {
    const workItem = createDemoWorkItem({
      status: 'ready',
      phase: 'build',
      planFilePath: 'docs/plans/prepared.md',
    })
    launchWorkItemIntoConductor.mockResolvedValue({
      workItem: {
        ...workItem,
        status: 'active',
        phase: 'build',
        missionJobId: 'job-builder-1',
      },
      launch: {
        jobId: 'job-builder-1',
        runId: 'run-builder-1',
        phase: 'build',
      },
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(launchWorkItemIntoConductor).toHaveBeenCalledWith(
      workItem.id,
      expect.objectContaining({ phase: 'build' }),
    )
    expect(result.changed).toBe(true)
    expect(result.events).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: workItem.projectId,
        action: 'launch_builder',
        jobId: 'job-builder-1',
        runId: 'run-builder-1',
        statusAfter: 'active',
        phaseAfter: 'build',
      },
    ])
  })

  it('prepares a canonical repo feature branch before Builder launch for enabled project lanes', async () => {
    const repoPath = join(tempHome, 'lane-repo')
    mkdirSync(repoPath, { recursive: true })
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.email', 'hermes@example.test'], {
      cwd: repoPath,
    })
    execFileSync('git', ['config', 'user.name', 'Hermes Test'], {
      cwd: repoPath,
    })
    writeFileSync(join(repoPath, 'README.md'), '# Lane repo\n', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoPath })
    const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
    }).trim()
    const project = createProject({
      name: 'Branch Lane Demo',
      repoPath,
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true, branchPrefix: 'mission' },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Add product test coverage',
      status: 'ready',
      phase: 'build',
      priority: 'medium',
      riskLevel: 'low',
      repoPathSnapshot: repoPath,
      planFilePath: 'docs/plans/prepared.md',
    })
    launchWorkItemIntoConductor.mockImplementation((workItemId: string) => {
      const prepared = getWorkItem(workItemId)
      return Promise.resolve({
        workItem: {
          ...prepared,
          status: 'active',
          phase: 'build',
          missionJobId: 'job-builder-branch',
        },
        launch: {
          jobId: 'job-builder-branch',
          runId: 'run-builder-branch',
          phase: 'build',
        },
      })
    })

    const result = await reconcileAllWorkItemAutonomy()

    expect(result.events).toMatchObject([
      { workItemId: workItem.id, action: 'launch_builder' },
    ])
    expect(launchWorkItemIntoConductor).toHaveBeenCalledWith(
      workItem.id,
      expect.objectContaining({ phase: 'build' }),
    )
    expect(getWorkItem(workItem.id)).toMatchObject({
      branchName: `mission/${workItem.id.slice(0, 8)}-add-product-test-coverage`,
      baseBranch: 'main',
      laneState: 'building',
      mergeBaseCommit: baseCommit,
    })
    expect(
      execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: repoPath,
        encoding: 'utf8',
      }).trim(),
    ).toBe(`mission/${workItem.id.slice(0, 8)}-add-product-test-coverage`)
  })

  it('does not auto-launch duplicate Builder when a mission job is already active', async () => {
    const workItem = createDemoWorkItem({
      status: 'ready',
      phase: 'build',
      planFilePath: 'docs/plans/prepared.md',
      missionJobId: 'job-builder-existing',
      missionState: 'scheduled',
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(launchWorkItemIntoConductor).not.toHaveBeenCalled()
    expect(result.changed).toBe(false)
    expect(result.events[0]).toMatchObject({
      action: 'noop',
      jobId: 'job-builder-existing',
    })
  })

  it('does not auto-launch duplicate Builder when a build execution run is already active', async () => {
    const workItem = createDemoWorkItem({
      status: 'ready',
      phase: 'build',
      planFilePath: 'docs/plans/prepared.md',
    })
    upsertExecutionRun({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-builder-run-existing',
      state: 'running',
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(launchWorkItemIntoConductor).not.toHaveBeenCalled()
    expect(result.changed).toBe(false)
    expect(result.events[0]).toMatchObject({
      action: 'noop',
      jobId: 'job-builder-run-existing',
    })
  })

  it('blocks Builder auto-launch for ready build work items without a plan file', async () => {
    const workItem = createDemoWorkItem({ status: 'ready', phase: 'build' })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(launchWorkItemIntoConductor).not.toHaveBeenCalled()
    expect(result.changed).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.events[0]).toMatchObject({ action: 'noop' })
    expect(result.events[0]?.message).toContain('plan')
  })

  it('syncs active build items with mission jobs and records returned transition state', async () => {
    const workItem = createDemoWorkItem({
      status: 'active',
      phase: 'build',
      missionJobId: 'job-builder-1',
      missionState: 'running',
    })
    const syncedWorkItem = {
      ...workItem,
      status: 'active' as const,
      phase: 'review' as const,
    }
    syncWorkItemExecutionState.mockResolvedValue({
      workItem: syncedWorkItem,
      execution: {
        transitionApplied: 'build->review',
        latestRun: { id: 'run-builder-1' },
      },
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(syncWorkItemExecutionState).toHaveBeenCalledWith(workItem.id)
    expect(result.changed).toBe(true)
    expect(result.events).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: workItem.projectId,
        action: 'sync_execution',
        jobId: 'job-builder-1',
        runId: 'run-builder-1',
        statusAfter: 'active',
        phaseAfter: 'review',
      },
    ])
  })

  it('reports execution sync errors without crashing reconcile', async () => {
    const workItem = createDemoWorkItem({
      status: 'active',
      phase: 'build',
      missionJobId: 'job-builder-1',
      missionState: 'running',
    })
    syncWorkItemExecutionState.mockRejectedValue(
      new Error('dashboard unavailable'),
    )

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(syncWorkItemExecutionState).toHaveBeenCalledWith(workItem.id)
    expect(result.changed).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.events[0]).toMatchObject({
      action: 'sync_execution',
      jobId: 'job-builder-1',
    })
    expect(result.events[0]?.message).toContain('dashboard unavailable')
  })

  it('prepares the canonical branch and launches Planner with current HEAD context at lane entry', async () => {
    const repoPath = join(tempHome, 'planner-lane-repo')
    mkdirSync(repoPath, { recursive: true })
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.email', 'hermes@example.test'], {
      cwd: repoPath,
    })
    execFileSync('git', ['config', 'user.name', 'Hermes Test'], {
      cwd: repoPath,
    })
    writeFileSync(join(repoPath, 'README.md'), '# Planner lane repo\n', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoPath })
    const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
    }).trim()
    const project = createProject({
      name: 'Lane Demo',
      repoPath,
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true, branchPrefix: 'mission' },
    })
    const high = createWorkItem({
      projectId: project.id,
      title: 'High priority lane work',
      status: 'inbox',
      phase: 'research',
      priority: 'high',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
    })
    const low = createWorkItem({
      projectId: project.id,
      title: 'Low priority lane work',
      status: 'inbox',
      phase: 'research',
      priority: 'low',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
    })
    prepareWorkItemWithPlanner.mockResolvedValue({})

    const result = await reconcileAllWorkItemAutonomy()

    expect(result.checked).toBe(1)
    expect(prepareWorkItemWithPlanner).toHaveBeenCalledTimes(1)
    expect(prepareWorkItemWithPlanner).toHaveBeenCalledWith(
      high.id,
      expect.objectContaining({
        laneContext: expect.objectContaining({
          currentBranch: `mission/${high.id.slice(0, 8)}-high-priority-lane-work`,
          baseBranch: 'main',
          headCommit: baseCommit,
        }),
      }),
    )
    expect(getWorkItem(high.id)).toMatchObject({
      laneState: 'preparing',
      branchName: `mission/${high.id.slice(0, 8)}-high-priority-lane-work`,
      baseBranch: 'main',
      mergeBaseCommit: baseCommit,
    })
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      workItemId: high.id,
      action: 'launch_planner',
    })
    expect(result.events.some((event) => event.workItemId === low.id)).toBe(
      false,
    )
  })

  it('does not plan a second queued lane item while another item is building', async () => {
    const project = createProject({
      name: 'Lane Busy Demo',
      repoPath: '/repos/lane-busy-demo',
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const active = createWorkItem({
      projectId: project.id,
      title: 'Active lane build',
      status: 'active',
      phase: 'build',
      laneState: 'building',
      priority: 'medium',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-active-build',
      missionState: 'running',
    })
    const queued = createWorkItem({
      projectId: project.id,
      title: 'Queued lane research',
      status: 'inbox',
      phase: 'research',
      priority: 'high',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
    })
    syncWorkItemExecutionState.mockResolvedValue({
      workItem: active,
      execution: { transitionApplied: null, latestRun: { id: 'run-active' } },
    })

    const result = await reconcileAllWorkItemAutonomy()

    expect(result.checked).toBe(1)
    expect(syncWorkItemExecutionState).toHaveBeenCalledWith(active.id)
    expect(prepareWorkItemWithPlanner).not.toHaveBeenCalled()
    expect(result.events.some((event) => event.workItemId === queued.id)).toBe(
      false,
    )
  })

  it('plans the next queued lane item after the prior item is done and merged', async () => {
    const repoPath = join(tempHome, 'planner-next-lane-repo')
    mkdirSync(repoPath, { recursive: true })
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.email', 'hermes@example.test'], {
      cwd: repoPath,
    })
    execFileSync('git', ['config', 'user.name', 'Hermes Test'], {
      cwd: repoPath,
    })
    writeFileSync(join(repoPath, 'README.md'), '# Planner next lane repo\n', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoPath })
    const project = createProject({
      name: 'Lane Next Demo',
      repoPath,
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    createWorkItem({
      projectId: project.id,
      title: 'Prior merged item',
      status: 'done',
      phase: 'deploy',
      laneState: 'done',
      mergeState: 'merged',
      priority: 'medium',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
    })
    const queued = createWorkItem({
      projectId: project.id,
      title: 'Next queued item',
      status: 'inbox',
      phase: 'research',
      priority: 'medium',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
    })
    prepareWorkItemWithPlanner.mockResolvedValue({})

    const result = await reconcileAllWorkItemAutonomy()

    expect(result.checked).toBe(1)
    expect(prepareWorkItemWithPlanner).toHaveBeenCalledWith(
      queued.id,
      expect.objectContaining({
        laneContext: expect.objectContaining({
          previousCompletedSummary: expect.stringContaining('Prior merged item'),
        }),
      }),
    )
    expect(result.events[0]).toMatchObject({
      workItemId: queued.id,
      action: 'launch_planner',
    })
  })

  it('runs Merge-Healer after lane review approval and marks the item done with merge evidence', async () => {
    const repoPath = join(tempHome, 'merge-healer-lane-repo')
    mkdirSync(repoPath, { recursive: true })
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.email', 'hermes@example.test'], {
      cwd: repoPath,
    })
    execFileSync('git', ['config', 'user.name', 'Hermes Test'], {
      cwd: repoPath,
    })
    writeFileSync(join(repoPath, 'README.md'), '# Merge lane repo\n', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoPath })
    const baseCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8',
    }).trim()
    execFileSync('git', ['checkout', '-b', 'mission/merge-approved'], { cwd: repoPath })
    writeFileSync(join(repoPath, 'feature.ts'), 'export const merged = true\n', 'utf8')
    execFileSync('git', ['add', 'feature.ts'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'feature'], { cwd: repoPath })
    execFileSync('git', ['checkout', 'main'], { cwd: repoPath })
    const project = createProject({
      name: 'Merge Healer Demo',
      repoPath,
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Reviewed item ready to merge',
      status: 'active',
      phase: 'deploy',
      laneState: 'reviewing',
      reviewDecision: 'approved',
      priority: 'medium',
      riskLevel: 'low',
      repoPathSnapshot: repoPath,
      branchName: 'mission/merge-approved',
      baseBranch: 'main',
      mergeBaseCommit: baseCommit,
      mergeTargetBranch: 'main',
      mergeState: 'not_started',
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)
    const updated = getWorkItem(workItem.id)

    expect(result.changed).toBe(true)
    expect(result.events[0]).toMatchObject({
      workItemId: workItem.id,
      action: 'run_merge_healer',
      statusAfter: 'done',
      phaseAfter: 'deploy',
    })
    expect(updated).toMatchObject({
      status: 'done',
      phase: 'deploy',
      laneState: 'done',
      mergeState: 'merged',
      mergeTargetBranch: 'main',
      mergeBaseCommit: baseCommit,
      mergeTestPassed: true,
      mergeConflictFiles: [],
    })
    expect(updated?.mergeCommit).toMatch(/^[a-f0-9]{40}$/)
  })

  it('runs Merge-Healer when review approval record is already approved by policy', async () => {
    const repoPath = join(tempHome, 'merge-healer-approved-approval-repo')
    mkdirSync(repoPath, { recursive: true })
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.email', 'hermes@example.test'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.name', 'Hermes Test'], { cwd: repoPath })
    writeFileSync(join(repoPath, 'README.md'), '# Merge lane repo\n', 'utf8')
    execFileSync('git', ['add', 'README.md'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoPath })
    execFileSync('git', ['checkout', '-b', 'mission/approval-approved'], { cwd: repoPath })
    writeFileSync(join(repoPath, 'feature.ts'), 'export const merged = true\n', 'utf8')
    execFileSync('git', ['add', 'feature.ts'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'feature'], { cwd: repoPath })
    execFileSync('git', ['checkout', 'main'], { cwd: repoPath })
    const project = createProject({
      name: 'Merge Healer Approval Demo',
      repoPath,
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Approved approval ready to merge',
      status: 'active',
      phase: 'review',
      laneState: 'reviewing',
      priority: 'medium',
      riskLevel: 'low',
      repoPathSnapshot: repoPath,
      missionJobId: 'completed-builder-job',
      branchName: 'mission/approval-approved',
      baseBranch: 'main',
      mergeTargetBranch: 'main',
      mergeState: 'not_started',
    })
    requestWorkItemReviewApproval(workItem.id, { requestedBy: 'system' })
    updateWorkItem(workItem.id, { phase: 'deploy' })

    const result = await reconcileWorkItemAutonomy(workItem.id)
    const updated = getWorkItem(workItem.id)

    expect(result.changed).toBe(true)
    expect(result.events[0]?.action).toBe('run_merge_healer')
    expect(updated).toMatchObject({
      status: 'done',
      laneState: 'done',
      mergeState: 'merged',
    })
  })

  it('parks the lane when Merge-Healer hits a merge conflict', async () => {
    const repoPath = join(tempHome, 'merge-healer-conflict-repo')
    mkdirSync(repoPath, { recursive: true })
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.email', 'hermes@example.test'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.name', 'Hermes Test'], { cwd: repoPath })
    writeFileSync(join(repoPath, 'shared.txt'), 'base\n', 'utf8')
    execFileSync('git', ['add', 'shared.txt'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: repoPath })
    execFileSync('git', ['checkout', '-b', 'mission/conflict'], { cwd: repoPath })
    writeFileSync(join(repoPath, 'shared.txt'), 'feature\n', 'utf8')
    execFileSync('git', ['commit', '-am', 'feature'], { cwd: repoPath })
    execFileSync('git', ['checkout', 'main'], { cwd: repoPath })
    writeFileSync(join(repoPath, 'shared.txt'), 'main\n', 'utf8')
    execFileSync('git', ['commit', '-am', 'main'], { cwd: repoPath })
    const project = createProject({
      name: 'Merge Healer Conflict Demo',
      repoPath,
      defaultBranch: 'main',
      autonomyLanePolicy: { enabled: true },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Reviewed item with conflict',
      status: 'active',
      phase: 'deploy',
      laneState: 'reviewing',
      reviewDecision: 'approved',
      priority: 'medium',
      riskLevel: 'low',
      repoPathSnapshot: repoPath,
      branchName: 'mission/conflict',
      baseBranch: 'main',
      mergeTargetBranch: 'main',
      mergeState: 'not_started',
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)
    const updated = getWorkItem(workItem.id)

    expect(result.changed).toBe(true)
    expect(result.blocked).toBe(true)
    expect(updated).toMatchObject({
      status: 'blocked',
      laneState: 'blocked',
      mergeState: 'conflict',
      mergeConflictFiles: ['shared.txt'],
      mergeTestPassed: false,
    })
    expect(updated?.laneBlockedReason).toMatch(/conflict/i)
  })

  it('ingests completed planner output for a running planning draft', async () => {
    const workItem = createDemoWorkItem({ status: 'active', phase: 'research' })
    const draft = createPlanningDraft({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      status: 'running',
      plannerJobId: 'job-planner-1',
    })
    getLatestHermesJobOutput.mockResolvedValue({
      jobId: 'job-planner-1',
      latestRunId: 'run-planner-1',
      latestStatus: 'success',
      latestOutputText: JSON.stringify({
        title: 'Prepared title',
        description: 'Prepared description',
        priority: 'medium',
        riskLevel: 'low',
        labels: ['planner'],
        acceptanceCriteria: ['Criterion one'],
        notes: ['Planner note'],
        planFilePath: 'docs/plans/prepared.md',
        openQuestions: [],
        suggestedPhase: 'build',
      }),
      lastObservedAt: '2026-04-27T17:31:00.000Z',
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(result.changed).toBe(true)
    expect(result.events).toMatchObject([
      {
        workItemId: workItem.id,
        projectId: workItem.projectId,
        action: 'ingest_planner_output',
        draftId: draft.id,
        jobId: 'job-planner-1',
        runId: 'run-planner-1',
      },
    ])
    const latestDraft = getLatestPlanningDraftForWorkItem(workItem.id)
    expect(latestDraft).toMatchObject({
      id: draft.id,
      status: 'structured_ready',
      planFilePath: 'docs/plans/prepared.md',
      structuredOutput: {
        title: 'Prepared title',
        suggestedPhase: 'build',
      },
    })
  })
})
