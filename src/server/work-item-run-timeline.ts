import { listExecutionRuns } from './execution-runs-store'
import { getLatestPlanningDraftForWorkItem } from './planning-drafts-store'
import { listWorkItemApprovals } from './work-item-approvals'
import type {
  ExecutionRunRecord,
  ExecutionRunState,
} from './execution-runs-store'
import type { PlanningDraftRecord } from './planning-drafts-store'
import type { WorkItemPhase, WorkItemRecord } from './work-items-store'

export type WorkItemRunTimelineState =
  | 'not_started'
  | 'scheduled'
  | 'running'
  | 'output_ready'
  | 'succeeded'
  | 'failed'
  | 'stale'
  | 'waiting'

export type WorkItemRunProfileRole =
  | 'planner'
  | 'builder'
  | 'reviewer'
  | 'deployer'

export type WorkItemRunTimelineRow = {
  phase: WorkItemPhase
  phaseLabel: string
  profileRole: WorkItemRunProfileRole
  profileName?: string
  profileSource?: string
  state: WorkItemRunTimelineState
  summary: string
  nextExpectedAction?: string
  executionRunId?: string
  jobId?: string
  jobName?: string
  runId?: string
  sessionKey?: string
  sessionKeyPrefix?: string
  link?: string
  heartbeatLabel?: string
  lastObservedAt?: string
  startedAt?: string
  finishedAt?: string
  artifacts: Array<string>
  error?: string
}

export type WorkItemRunTimeline = {
  workItemId: string
  rows: Array<WorkItemRunTimelineRow>
}

const PHASES: Array<{
  phase: WorkItemPhase
  phaseLabel: string
  profileRole: WorkItemRunProfileRole
}> = [
  { phase: 'research', phaseLabel: 'Research', profileRole: 'planner' },
  { phase: 'build', phaseLabel: 'Build', profileRole: 'builder' },
  { phase: 'review', phaseLabel: 'Review', profileRole: 'reviewer' },
  { phase: 'deploy', phaseLabel: 'Deploy', profileRole: 'deployer' },
]

const RUN_STATE_TO_TIMELINE_STATE: Record<
  ExecutionRunState,
  WorkItemRunTimelineState
> = {
  scheduled: 'scheduled',
  running: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  stale: 'stale',
  unknown: 'scheduled',
}

export function buildExecutionTraceHref(input: {
  executionRunId?: string
  jobId?: string
  workItemId?: string
}): string | null {
  if (input.executionRunId)
    return `/executions/${encodeURIComponent(input.executionRunId)}`
  if (input.jobId) {
    const params = new URLSearchParams({ jobId: input.jobId })
    if (input.workItemId) params.set('workItemId', input.workItemId)
    return `/executions?${params.toString()}`
  }
  return null
}

function heartbeatLabel(lastObservedAt?: string): string | undefined {
  return lastObservedAt ? `Last observed ${lastObservedAt}` : undefined
}

function newestRunForPhase(
  runs: Array<ExecutionRunRecord>,
  phase: WorkItemPhase,
): ExecutionRunRecord | null {
  return (
    runs
      .filter((run) => run.phase === phase)
      .sort(
        (a, b) =>
          b.lastObservedAt.localeCompare(a.lastObservedAt) ||
          b.updatedAt.localeCompare(a.updatedAt),
      )[0] ?? null
  )
}

function rowFromRun(
  workItem: WorkItemRecord,
  phase: WorkItemPhase,
  phaseLabel: string,
  profileRole: WorkItemRunProfileRole,
  run: ExecutionRunRecord,
): WorkItemRunTimelineRow {
  const state = RUN_STATE_TO_TIMELINE_STATE[run.state]
  const error =
    run.error ?? (phase === 'build' ? workItem.missionLastError : undefined)
  const summary = buildRunSummary(profileRole, state, error)

  return {
    phase,
    phaseLabel,
    profileRole,
    profileName: profileRole,
    profileSource: 'execution-run',
    state,
    summary,
    nextExpectedAction: nextActionForState(profileRole, state),
    executionRunId: run.id,
    jobId: run.jobId,
    jobName: run.jobName,
    runId: run.runId,
    sessionKey: run.sessionKey,
    sessionKeyPrefix: run.sessionKeyPrefix,
    link: buildExecutionTraceHref({ executionRunId: run.id, jobId: run.jobId, workItemId: workItem.id }) ?? undefined,
    heartbeatLabel: heartbeatLabel(run.lastObservedAt),
    lastObservedAt: run.lastObservedAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    artifacts: run.artifactPaths,
    error,
  }
}

function buildRunSummary(
  profileRole: WorkItemRunProfileRole,
  state: WorkItemRunTimelineState,
  error?: string,
): string {
  const actor = profileRoleLabel(profileRole)
  if (state === 'failed') return `${actor} failed${error ? `: ${error}` : '.'}`
  if (state === 'stale') return `${actor} is stale.`
  if (state === 'running') return `${actor} is running.`
  if (state === 'scheduled') return `${actor} job scheduled.`
  if (state === 'succeeded') return `${actor} completed.`
  if (state === 'output_ready') return `${actor} output ready for ingestion.`
  return 'No job launched'
}

function profileRoleLabel(role: WorkItemRunProfileRole): string {
  if (role === 'planner') return 'Planner'
  if (role === 'builder') return 'Builder'
  if (role === 'reviewer') return 'Reviewer'
  return 'Deploy'
}

function nextActionForState(
  profileRole: WorkItemRunProfileRole,
  state: WorkItemRunTimelineState,
): string | undefined {
  if (state === 'failed')
    return 'Review the error, then retry or unblock the work item.'
  if (state === 'stale')
    return 'Inspect the run heartbeat and recover or retry if needed.'
  if (state === 'output_ready')
    return 'Orchestrator should ingest the agent output.'
  if (state === 'not_started' && profileRole === 'planner')
    return 'Orchestrator should launch Planner for inbox research.'
  if (state === 'scheduled' && profileRole === 'builder')
    return 'Orchestrator should launch Builder for ready build.'
  return undefined
}

function researchRowFromDraft(
  base: WorkItemRunTimelineRow,
  draft: PlanningDraftRecord | null,
): WorkItemRunTimelineRow {
  if (!draft) return base

  if (draft.status === 'accepted') {
    return {
      ...base,
      state: 'succeeded',
      summary: 'Planner output accepted.',
      nextExpectedAction: undefined,
      jobId: draft.plannerJobId,
      jobName: draft.plannerJobName,
      sessionKey: draft.plannerSessionKey,
      sessionKeyPrefix: draft.plannerSessionKeyPrefix,
      profileName: draft.plannerProfile ?? 'planner',
      profileSource: 'planning-draft',
      link: draft.plannerLink,
      artifacts: [draft.planFilePath].filter((item): item is string =>
        Boolean(item),
      ),
    }
  }

  const state: WorkItemRunTimelineState =
    draft.status === 'structured_ready'
      ? 'output_ready'
      : draft.status === 'parse_failed'
        ? 'failed'
        : draft.status === 'requested'
          ? 'scheduled'
          : draft.status === 'running'
            ? 'running'
            : 'waiting'

  return {
    ...base,
    state,
    summary:
      state === 'output_ready'
        ? 'Planner output ready for ingestion.'
        : state === 'failed'
          ? `Planner failed${draft.parseError ? `: ${draft.parseError}` : '.'}`
          : state === 'scheduled'
            ? 'Planner job scheduled.'
            : state === 'running'
              ? 'Planner is running.'
              : 'Planner is waiting.',
    nextExpectedAction: nextActionForState('planner', state),
    jobId: draft.plannerJobId,
    jobName: draft.plannerJobName,
    sessionKey: draft.plannerSessionKey,
    sessionKeyPrefix: draft.plannerSessionKeyPrefix,
    profileName: draft.plannerProfile ?? 'planner',
    profileSource: 'planning-draft',
    link: draft.plannerLink,
    artifacts: [draft.planFilePath].filter((item): item is string =>
      Boolean(item),
    ),
    error: draft.parseError,
  }
}

function baseRow(
  phase: WorkItemPhase,
  phaseLabel: string,
  profileRole: WorkItemRunProfileRole,
): WorkItemRunTimelineRow {
  return {
    phase,
    phaseLabel,
    profileRole,
    profileName: profileRole,
    state: 'not_started',
    summary: 'No job launched',
    nextExpectedAction: nextActionForState(profileRole, 'not_started'),
    artifacts: [],
  }
}

function applyReadyBuildHint(
  row: WorkItemRunTimelineRow,
  workItem: WorkItemRecord,
): WorkItemRunTimelineRow {
  if (row.phase !== 'build') return row
  if (workItem.status !== 'ready' || workItem.phase !== 'build') return row
  if (row.state !== 'not_started') return row
  return {
    ...row,
    state: 'scheduled',
    summary: 'Builder launch pending.',
    nextExpectedAction: 'Orchestrator should launch Builder for ready build.',
    artifacts: [workItem.planFilePath].filter((item): item is string =>
      Boolean(item),
    ),
  }
}

function applyWorkItemMissionFallback(
  row: WorkItemRunTimelineRow,
  workItem: WorkItemRecord,
): WorkItemRunTimelineRow {
  if (
    row.phase !== 'build' ||
    row.state !== 'not_started' ||
    !workItem.missionJobId
  )
    return row
  const state: WorkItemRunTimelineState =
    workItem.missionState === 'failed'
      ? 'failed'
      : workItem.missionState === 'running'
        ? 'running'
        : 'scheduled'
  const error =
    workItem.laneState === 'blocked' && workItem.laneBlockedReason
      ? workItem.laneBlockedReason
      : workItem.missionLastError
  const isParkedLaneBlocker =
    workItem.status === 'blocked' &&
    workItem.laneState === 'blocked' &&
    Boolean(workItem.laneParkedAt)
  return {
    ...row,
    state,
    summary:
      isParkedLaneBlocker && state === 'failed'
        ? `Builder parked: ${error ?? 'lane blocker evidence recorded.'}`
        : buildRunSummary('builder', state, error),
    nextExpectedAction:
      isParkedLaneBlocker && state === 'failed'
        ? 'Review Builder evidence, clean or stash the repo, then retry or unpark this work item.'
        : nextActionForState('builder', state),
    jobId: workItem.missionJobId,
    jobName: workItem.missionJobName,
    sessionKeyPrefix: workItem.missionSessionKeyPrefix,
    link: buildExecutionTraceHref({ jobId: workItem.missionJobId, workItemId: workItem.id }) ?? undefined,
    heartbeatLabel: heartbeatLabel(workItem.missionLastRunAt),
    lastObservedAt: workItem.missionLastRunAt,
    artifacts: workItem.artifactPaths,
    error,
  }
}

function applyApprovalHint(
  row: WorkItemRunTimelineRow,
  workItem: WorkItemRecord,
): WorkItemRunTimelineRow {
  const latestApproval = listWorkItemApprovals(workItem.id)
    .filter((approval) => approval.phase === row.phase)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .at(0)
  if (!latestApproval) return row
  return {
    ...row,
    state:
      latestApproval.status === 'pending'
        ? 'waiting'
        : latestApproval.status === 'approved'
          ? 'succeeded'
          : 'failed',
    summary:
      latestApproval.status === 'pending'
        ? `${row.phaseLabel} approval pending.`
        : `${row.phaseLabel} approval ${latestApproval.status}.`,
    nextExpectedAction:
      latestApproval.status === 'pending'
        ? `Resolve ${row.phase} approval.`
        : undefined,
    lastObservedAt: latestApproval.updatedAt,
    heartbeatLabel: heartbeatLabel(latestApproval.updatedAt),
    error:
      latestApproval.status === 'approved' ||
      latestApproval.status === 'pending'
        ? undefined
        : latestApproval.resolutionNotes,
  }
}

function applyMergeHealerHint(
  row: WorkItemRunTimelineRow,
  workItem: WorkItemRecord,
): WorkItemRunTimelineRow {
  if (row.phase !== 'deploy') return row
  if (!workItem.mergeState || workItem.mergeState === 'not_started') return row

  if (workItem.mergeState === 'merged') {
    const cleanupSummary = workItem.branchName
      ? ` Cleanup dry-run recommended for ${workItem.branchName} after retention policy review.`
      : ''
    return {
      ...row,
      state: 'succeeded',
      summary: `Merge-Healer merged into ${workItem.mergeTargetBranch ?? 'target'}${workItem.mergeCommit ? ` at ${workItem.mergeCommit.slice(0, 8)}` : ''}.${cleanupSummary}`,
      nextExpectedAction: workItem.branchName
        ? 'Review branch/stash cleanup recommendations; deletion is dry-run/non-destructive unless explicitly enabled by policy.'
        : undefined,
      artifacts: workItem.mergeArtifactPaths ?? [],
    }
  }

  const conflictFiles = workItem.mergeConflictFiles ?? []
  const conflictSummary =
    conflictFiles.length > 0 ? `: ${conflictFiles.join(', ')}` : '.'
  return {
    ...row,
    state: workItem.mergeState === 'running' ? 'running' : 'failed',
    summary:
      workItem.mergeState === 'running'
        ? 'Merge-Healer is running.'
        : workItem.mergeState === 'conflict'
          ? `Merge-Healer blocked by conflicts${conflictSummary}`
          : 'Merge-Healer failed.',
    nextExpectedAction:
      workItem.mergeState === 'conflict'
        ? 'Resolve merge conflicts, reset/clean the repo, then retry Merge-Healer.'
        : 'Review Merge-Healer evidence, reset/clean the repo if needed, then retry.',
    artifacts: workItem.mergeArtifactPaths ?? [],
    error: workItem.laneBlockedReason,
  }
}

export function buildWorkItemRunTimeline(
  workItem: WorkItemRecord,
): WorkItemRunTimeline {
  const draft = getLatestPlanningDraftForWorkItem(workItem.id)
  const runs = listExecutionRuns({ workItemId: workItem.id })

  const rows = PHASES.map(({ phase, phaseLabel, profileRole }) => {
    const run = newestRunForPhase(runs, phase)
    let row = run
      ? rowFromRun(workItem, phase, phaseLabel, profileRole, run)
      : baseRow(phase, phaseLabel, profileRole)

    if (phase === 'research') row = researchRowFromDraft(row, draft)
    row = applyReadyBuildHint(row, workItem)
    row = applyWorkItemMissionFallback(row, workItem)
    row = applyApprovalHint(row, workItem)
    row = applyMergeHealerHint(row, workItem)
    return row
  })

  return {
    workItemId: workItem.id,
    rows,
  }
}
