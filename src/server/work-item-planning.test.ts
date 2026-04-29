
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProject } from './projects-store'
import { createPlanningDraft, getPlanningDraft } from './planning-drafts-store'
import { createWorkItem, getWorkItem, updateWorkItem } from './work-items-store'
import {
  applyPlanningDraftToWorkItem,
  buildPlannerEnrichmentGoal,
  prepareWorkItemWithPlanner,
  recordPlannerOutput,
} from './work-item-planning'

const { launchConductorMission } = vi.hoisted(() => ({
  launchConductorMission: vi.fn(),
}))

vi.mock('./conductor-launch', () => ({
  launchConductorMission,
}))

describe('work-item-planning', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-work-item-planning-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    launchConductorMission.mockReset()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('prepare creates draft and launches planner/research only', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      phaseProfiles: { research: 'researcher' },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Rough idea',
      description: 'Improve project board insighting.',
      status: 'inbox',
      phase: 'research',
      repoPathSnapshot: project.repoPath,
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-200_pending',
      sessionKeyPrefix: 'cron_job-200_',
      jobId: 'job-200',
      jobName: 'planner-enrich-job',
      runId: null,
    })

    const result = await prepareWorkItemWithPlanner(workItem.id, {})

    expect(launchConductorMission).toHaveBeenCalledTimes(1)
    expect(launchConductorMission).toHaveBeenCalledWith(
      expect.objectContaining({
        deliver: 'local',
        phaseProfiles: expect.objectContaining({ research: 'researcher' }),
      }),
    )
    expect(result.draft.status).toBe('running')
    expect(result.draft.plannerJobId).toBe('job-200')
    expect(result.launch.profile).toBe('researcher')
  })

  it('planner goal includes schema and strict planner-only constraints', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Prepare new idea',
      description: 'Need richer plan quality.',
      status: 'inbox',
      phase: 'research',
      repoPathSnapshot: project.repoPath,
    })

    const goal = buildPlannerEnrichmentGoal({
      project,
      workItem,
      plannerProfile: 'planner',
      planFilePath: `docs/plans/${project.slug}-${workItem.id.slice(0, 8)}-planner-draft.md`,
    })

    expect(goal).toContain('Do NOT modify source code files')
    expect(goal).toContain('Do NOT launch Builder')
    expect(goal).toContain('output final JSON')
    expect(goal).toContain('acceptanceCriteria')
    expect(goal).toContain('openQuestions')
  })

  it('planner goal includes lane-entry branch and current HEAD context when provided', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Prepare lane item',
      description: 'Need a fresh plan against current code.',
      status: 'inbox',
      phase: 'research',
      repoPathSnapshot: project.repoPath,
    })

    const goal = buildPlannerEnrichmentGoal({
      project,
      workItem,
      plannerProfile: 'planner',
      planFilePath: `docs/plans/${project.slug}-${workItem.id.slice(0, 8)}-planner-draft.md`,
      laneContext: {
        currentBranch: 'mission/abc12345-prepare-lane-item',
        baseBranch: 'main',
        headCommit: 'abcdef1234567890',
        previousCompletedSummary: 'Previous item merged API cleanup.',
      },
    })

    expect(goal).toContain('Lane-entry current code context:')
    expect(goal).toContain('Current branch: mission/abc12345-prepare-lane-item')
    expect(goal).toContain('Base branch: main')
    expect(goal).toContain('Current HEAD commit: abcdef1234567890')
    expect(goal).toContain(
      'Previous completed work item summary: Previous item merged API cleanup.',
    )
    expect(goal).toContain('Plan against the current code/docs at the HEAD commit above')
  })

  it('prepare does not mutate work-item planning fields', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Original title',
      description: 'Original description',
      status: 'inbox',
      phase: 'research',
      priority: 'low',
      riskLevel: 'high',
      labels: ['rough-idea'],
      acceptanceCriteria: ['Existing criterion'],
      notes: ['Existing note'],
      repoPathSnapshot: project.repoPath,
    })

    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-201_pending',
      sessionKeyPrefix: 'cron_job-201_',
      jobId: 'job-201',
      jobName: 'planner-enrich-job-2',
      runId: null,
    })

    await prepareWorkItemWithPlanner(workItem.id, {})

    const persisted = getWorkItem(workItem.id)
    expect(persisted?.title).toBe('Original title')
    expect(persisted?.description).toBe('Original description')
    expect(persisted?.priority).toBe('low')
    expect(persisted?.riskLevel).toBe('high')
    expect(persisted?.labels).toEqual(['rough-idea'])
    expect(persisted?.acceptanceCriteria).toEqual(['Existing criterion'])
  })

  it('recordPlannerOutput stores structured_ready for valid output', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Need planner enrichment',
      status: 'inbox',
      phase: 'research',
      repoPathSnapshot: project.repoPath,
    })
    const draft = createPlanningDraft({
      workItemId: workItem.id,
      projectId: project.id,
      status: 'running',
    })

    const updated = recordPlannerOutput(
      draft.id,
      JSON.stringify({
        title: 'Prepared title',
        description: 'Prepared description',
        priority: 'medium',
        riskLevel: 'low',
        labels: ['planner'],
        acceptanceCriteria: ['Criterion one'],
        notes: ['note'],
        planFilePath: 'docs/plans/demo-planner.md',
        openQuestions: ['Question one'],
        suggestedPhase: 'build',
      }),
    )

    expect(updated.status).toBe('structured_ready')
    expect(updated.structuredOutput?.title).toBe('Prepared title')
    expect(updated.planFilePath).toBe('docs/plans/demo-planner.md')
    expect(updated.parseError).toBeUndefined()
  })

  it('recordPlannerOutput stores parse_failed and keeps work item unchanged on invalid output', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Idea title',
      description: 'Idea description',
      status: 'inbox',
      phase: 'research',
      repoPathSnapshot: project.repoPath,
    })
    const before = getWorkItem(workItem.id)
    const draft = createPlanningDraft({
      workItemId: workItem.id,
      projectId: project.id,
      status: 'running',
    })

    const updated = recordPlannerOutput(draft.id, '{invalid-json')

    expect(updated.status).toBe('parse_failed')
    expect(updated.parseError).toContain('Invalid JSON')
    expect(updated.structuredOutput).toBeUndefined()

    const after = getWorkItem(workItem.id)
    expect(after).toEqual(before)
  })

  it('accepting a valid draft mutates work item to ready/build while preserving execution fields', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Idea title',
      description: 'Idea description',
      status: 'inbox',
      phase: 'research',
      priority: 'low',
      riskLevel: 'high',
      labels: ['idea'],
      acceptanceCriteria: [],
      notes: [],
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-existing',
      missionState: 'failed',
      branchName: 'feature/existing',
      prUrl: 'https://example.com/pr/1',
      artifactPaths: ['artifacts/log.txt'],
    })
    updateWorkItem(workItem.id, { reviewJobId: 'review-1' })

    const draft = createPlanningDraft({
      workItemId: workItem.id,
      projectId: project.id,
      status: 'structured_ready',
      structuredOutput: {
        title: 'Prepared title',
        description: 'Prepared description',
        priority: 'high',
        riskLevel: 'medium',
        labels: ['planner', 'prepared'],
        acceptanceCriteria: ['Criterion one', 'Criterion two'],
        notes: ['Plan note'],
        planFilePath: 'docs/plans/prepared.md',
        openQuestions: ['Question one'],
        suggestedPhase: 'build',
      },
    })

    const accepted = applyPlanningDraftToWorkItem(draft.id)

    expect(accepted.workItem.status).toBe('ready')
    expect(accepted.workItem.phase).toBe('build')
    expect(accepted.workItem.title).toBe('Prepared title')
    expect(accepted.workItem.planFilePath).toBe('docs/plans/prepared.md')
    expect(accepted.workItem.missionJobId).toBe('job-existing')
    expect(accepted.workItem.reviewJobId).toBe('review-1')
    expect(accepted.workItem.branchName).toBe('feature/existing')
    expect(accepted.workItem.prUrl).toBe('https://example.com/pr/1')
    expect(accepted.workItem.artifactPaths).toEqual(['artifacts/log.txt'])

    const persistedDraft = getPlanningDraft(draft.id)
    expect(persistedDraft?.status).toBe('accepted')
    expect(persistedDraft?.acceptedAt).toBeTruthy()
  })

  it('accepting an invalid draft state throws', () => {
    const draft = createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-1',
      status: 'parse_failed',
    })

    expect(() => applyPlanningDraftToWorkItem(draft.id)).toThrow(
      'Planning draft is not ready for acceptance',
    )
  })
})
