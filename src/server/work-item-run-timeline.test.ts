import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPlanningDraft } from './planning-drafts-store'
import { createProject } from './projects-store'
import { upsertExecutionRun } from './execution-runs-store'
import {  createWorkItem } from './work-items-store'
import {
  buildExecutionTraceHref,
  buildWorkItemRunTimeline,
} from './work-item-run-timeline'
import type {WorkItemRecord} from './work-items-store';

describe('work-item-run-timeline', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'hermes-workspace-run-timeline-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = join(tempHome, '.hermes')
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
      name: 'Timeline Demo',
      repoPath: '/repos/timeline-demo',
      defaultBranch: 'main',
    })
    return createWorkItem({
      projectId: project.id,
      title: input.title ?? 'Timeline work item',
      description: input.description ?? 'Expose run timeline evidence',
      status: input.status ?? 'inbox',
      phase: input.phase ?? 'research',
      priority: input.priority ?? 'medium',
      riskLevel: input.riskLevel ?? 'low',
      repoPathSnapshot: project.repoPath,
      planFilePath: input.planFilePath,
      missionJobId: input.missionJobId,
      missionJobName: input.missionJobName,
      missionSessionKeyPrefix: input.missionSessionKeyPrefix,
      missionLink: input.missionLink,
      missionState: input.missionState,
      missionLastRunAt: input.missionLastRunAt,
      missionLastError: input.missionLastError,
      artifactPaths: input.artifactPaths,
      branchName: input.branchName,
      prUrl: input.prUrl,
      laneState: input.laneState,
      laneParkedAt: input.laneParkedAt,
      laneBlockedReason: input.laneBlockedReason,
      mergeState: input.mergeState,
      mergeCommit: input.mergeCommit,
      mergeBaseCommit: input.mergeBaseCommit,
      mergeTargetBranch: input.mergeTargetBranch,
      mergeConflictFiles: input.mergeConflictFiles,
      mergeTestCommand: input.mergeTestCommand,
      mergeTestPassed: input.mergeTestPassed,
      mergeArtifactPaths: input.mergeArtifactPaths,
    })
  }

  it('returns four phase rows for a fresh inbox item with no jobs launched', () => {
    const workItem = createDemoWorkItem({ status: 'inbox', phase: 'research' })

    const timeline = buildWorkItemRunTimeline(workItem)

    expect(timeline.rows.map((row) => row.phase)).toEqual([
      'research',
      'build',
      'review',
      'deploy',
    ])
    expect(timeline.rows[0]).toMatchObject({
      phase: 'research',
      profileRole: 'planner',
      state: 'not_started',
      summary: 'No job launched',
      nextExpectedAction:
        'Orchestrator should launch Planner for inbox research.',
    })
  })

  it('shows a running planning draft as the research Planner row with job evidence', () => {
    const workItem = createDemoWorkItem({ status: 'active', phase: 'research' })
    createPlanningDraft({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      status: 'running',
      plannerJobId: 'job-planner-1',
      plannerJobName: 'Planner: Timeline work item',
      plannerProfile: 'planner',
      plannerSessionKey: 'session-planner-1',
      plannerLink: 'http://localhost:3000/jobs/job-planner-1',
    })

    const timeline = buildWorkItemRunTimeline(workItem)

    expect(timeline.rows[0]).toMatchObject({
      phase: 'research',
      profileRole: 'planner',
      profileName: 'planner',
      state: 'running',
      jobId: 'job-planner-1',
      jobName: 'Planner: Timeline work item',
      sessionKey: 'session-planner-1',
      link: 'http://localhost:3000/jobs/job-planner-1',
      summary: 'Planner is running.',
    })
  })

  it('shows active build execution run with job id, session key, and heartbeat label', () => {
    const workItem = createDemoWorkItem({
      status: 'active',
      phase: 'build',
      missionJobId: 'job-builder-1',
    })
    const run = upsertExecutionRun({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      role: 'mission',
      phase: 'build',
      engine: 'hermes-cron',
      jobId: 'job-builder-1',
      jobName: 'Builder: Timeline work item',
      runId: 'run-builder-1',
      state: 'running',
      sessionKey: 'session-builder-1',
      lastObservedAt: '2026-04-27T18:00:00.000Z',
      artifactPaths: ['dogfood-output/build-report.md'],
    })

    const timeline = buildWorkItemRunTimeline(workItem)

    expect(timeline.rows[1]).toMatchObject({
      phase: 'build',
      profileRole: 'builder',
      executionRunId: run.id,
      state: 'running',
      jobId: 'job-builder-1',
      runId: 'run-builder-1',
      sessionKey: 'session-builder-1',
      heartbeatLabel: 'Last observed 2026-04-27T18:00:00.000Z',
      artifacts: ['dogfood-output/build-report.md'],
      summary: 'Builder is running.',
    })
  })

  it('shows stale Builder heartbeat as stale with recovery guidance', () => {
    const workItem = createDemoWorkItem({
      status: 'active',
      phase: 'build',
      missionJobId: 'job-builder-stale',
    })
    upsertExecutionRun({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      role: 'mission',
      phase: 'build',
      engine: 'hermes-cron',
      jobId: 'job-builder-stale',
      jobName: 'Builder: Timeline work item',
      state: 'stale',
      lastObservedAt: '2026-04-27T18:00:00.000Z',
    })

    const timeline = buildWorkItemRunTimeline(workItem)

    expect(timeline.rows[1]).toMatchObject({
      phase: 'build',
      profileRole: 'builder',
      state: 'stale',
      summary: 'Builder is stale.',
      nextExpectedAction:
        'Inspect the run heartbeat and recover or retry if needed.',
      heartbeatLabel: 'Last observed 2026-04-27T18:00:00.000Z',
    })
  })

  it('shows failed mission error and next expected recovery action', () => {
    const workItem = createDemoWorkItem({
      status: 'active',
      phase: 'build',
      missionJobId: 'job-builder-failed',
      missionState: 'failed',
      missionLastError: 'Tests failed',
    })
    upsertExecutionRun({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      role: 'mission',
      phase: 'build',
      engine: 'hermes-cron',
      jobId: 'job-builder-failed',
      state: 'failed',
      error: 'Tests failed',
      lastObservedAt: '2026-04-27T18:05:00.000Z',
    })

    const timeline = buildWorkItemRunTimeline(workItem)

    expect(timeline.rows[1]).toMatchObject({
      phase: 'build',
      state: 'failed',
      error: 'Tests failed',
      summary: 'Builder failed: Tests failed',
      nextExpectedAction:
        'Review the error, then retry or unblock the work item.',
    })
  })

  it('shows accepted planning draft on ready build as waiting for Builder launch', () => {
    const workItem = createDemoWorkItem({
      status: 'ready',
      phase: 'build',
      planFilePath: 'docs/plans/timeline-demo.md',
    })
    createPlanningDraft({
      workItemId: workItem.id,
      projectId: workItem.projectId,
      status: 'accepted',
      planFilePath: 'docs/plans/timeline-demo.md',
      acceptedAt: '2026-04-27T18:10:00.000Z',
    })

    const timeline = buildWorkItemRunTimeline(workItem)

    expect(timeline.rows[0]).toMatchObject({
      phase: 'research',
      state: 'succeeded',
      summary: 'Planner output accepted.',
      artifacts: ['docs/plans/timeline-demo.md'],
    })
    expect(timeline.rows[1]).toMatchObject({
      phase: 'build',
      state: 'scheduled',
      summary: 'Builder launch pending.',
      nextExpectedAction: 'Orchestrator should launch Builder for ready build.',
    })
  })

  it('shows parked blocked Builder evidence with recovery guidance on the build row', () => {
    const workItem = createDemoWorkItem({
      status: 'blocked',
      phase: 'build',
      missionJobId: 'job-invalid-builder-evidence',
      missionJobName: 'Builder: invalid evidence',
      missionState: 'failed',
      missionLastError:
        'Builder evidence workItemId did not match this work item.',
      laneState: 'blocked',
      laneParkedAt: '2026-04-27T21:00:00.000Z',
      laneBlockedReason:
        'Builder evidence workItemId did not match this work item.',
      artifactPaths: ['/tmp/invalid-builder-evidence.json'],
    })

    const timeline = buildWorkItemRunTimeline(workItem)

    expect(timeline.rows[1]).toMatchObject({
      phase: 'build',
      profileRole: 'builder',
      state: 'failed',
      jobId: 'job-invalid-builder-evidence',
      summary:
        'Builder parked: Builder evidence workItemId did not match this work item.',
      nextExpectedAction:
        'Review Builder evidence, clean or stash the repo, then retry or unpark this work item.',
      artifacts: ['/tmp/invalid-builder-evidence.json'],
      error: 'Builder evidence workItemId did not match this work item.',
    })
  })

  it('builds execution trace hrefs with durable execution IDs taking priority over legacy job data', () => {
    expect(
      buildExecutionTraceHref({
        executionRunId: 'run/id with spaces',
        jobId: 'legacy-job-1',
        workItemId: 'work-item-1',
      }),
    ).toBe('/executions/run%2Fid%20with%20spaces')
  })

  it('builds legacy execution trace hrefs from job and work-item context', () => {
    expect(
      buildExecutionTraceHref({ jobId: 'job 1/2', workItemId: 'work item 3' }),
    ).toBe('/executions?jobId=job+1%2F2&workItemId=work+item+3')
  })

  it('does not emit an execution trace href when no execution or job data exists', () => {
    expect(buildExecutionTraceHref({ workItemId: 'work-item-1' })).toBeNull()
  })

  it('shows Merge-Healer merge and conflict evidence on the deploy row', () => {
    const merged = createDemoWorkItem({
      status: 'done',
      phase: 'deploy',
      laneState: 'done',
      branchName: 'mission/84bfe2c2-cleanup-ready',
      mergeState: 'merged',
      mergeCommit: 'abc123def456',
      mergeTargetBranch: 'main',
      mergeTestCommand: 'pnpm test',
      mergeTestPassed: true,
    })
    const conflict = createDemoWorkItem({
      status: 'blocked',
      phase: 'deploy',
      laneState: 'blocked',
      mergeState: 'conflict',
      mergeTargetBranch: 'main',
      mergeConflictFiles: ['shared.txt'],
      mergeTestPassed: false,
      mergeArtifactPaths: ['.hermes/merge-healer/test.log'],
    })

    expect(buildWorkItemRunTimeline(merged).rows[3]).toMatchObject({
      phase: 'deploy',
      profileRole: 'deployer',
      state: 'succeeded',
      summary:
        'Merge-Healer merged into main at abc123de. Cleanup dry-run recommended for mission/84bfe2c2-cleanup-ready after retention policy review.',
      nextExpectedAction:
        'Review branch/stash cleanup recommendations; deletion is dry-run/non-destructive unless explicitly enabled by policy.',
      artifacts: [],
    })
    expect(buildWorkItemRunTimeline(conflict).rows[3]).toMatchObject({
      phase: 'deploy',
      profileRole: 'deployer',
      state: 'failed',
      summary: 'Merge-Healer blocked by conflicts: shared.txt',
      nextExpectedAction:
        'Resolve merge conflicts, reset/clean the repo, then retry Merge-Healer.',
      artifacts: ['.hermes/merge-healer/test.log'],
    })
  })
})
