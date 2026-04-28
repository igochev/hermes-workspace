import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  getLatestPlanningDraftForWorkItem,
  listPlanningDrafts,
  type PlanningDraftRecord,
} from './planning-drafts-store'
import { getLatestHermesJobOutput } from './hermes-job-output'
import {
  listExecutionRuns,
  type ExecutionRunRecord,
} from './execution-runs-store'
import {
  buildWorkItemBranchName,
  ensureWorkItemBranch,
} from './project-branch-manager'
import { runWorkItemMergeHealer } from './work-item-merge-healer'
import { selectNextLaneWorkItem } from './project-autonomy-lane'
import { launchWorkItemIntoConductor } from './work-item-launch'
import { syncWorkItemExecutionState } from './work-item-execution'
import {
  applyPlanningDraftToWorkItem,
  type PlannerLaneContext,
  prepareWorkItemWithPlanner,
  recordPlannerOutput,
} from './work-item-planning'
import { listWorkItemApprovals } from './work-item-approvals'
import { getProject, listProjects } from './projects-store'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  listWorkItems,
  updateWorkItem,
  type WorkItemRecord,
} from './work-items-store'

export type WorkItemOrchestratorAction =
  | 'launch_planner'
  | 'ingest_planner_output'
  | 'accept_planning_draft'
  | 'launch_builder'
  | 'sync_execution'
  | 'request_review'
  | 'launch_review'
  | 'request_deploy_approval'
  | 'run_merge_healer'
  | 'mark_done'
  | 'noop'

export type WorkItemOrchestratorEvent = {
  workItemId: string
  projectId: string
  action: WorkItemOrchestratorAction
  statusBefore?: string
  phaseBefore?: string
  statusAfter?: string
  phaseAfter?: string
  jobId?: string
  draftId?: string
  runId?: string
  message: string
  observedAt: string
}

export type ReconcileWorkItemAutonomyResult = {
  workItemId: string
  events: Array<WorkItemOrchestratorEvent>
  changed: boolean
  blocked?: boolean
}

export type ReconcileAllWorkItemAutonomyResult = {
  checked: number
  changed: number
  events: Array<WorkItemOrchestratorEvent>
  findings: Array<unknown>
}

const ACTIVE_PLANNING_DRAFT_STATUSES = new Set<PlanningDraftRecord['status']>([
  'requested',
  'running',
  'structured_ready',
])
const ACTIVE_MISSION_STATES = new Set(['scheduled', 'running', 'unknown'])

function createEvent(params: {
  workItem: WorkItemRecord
  action: WorkItemOrchestratorAction
  message: string
  jobId?: string
  draftId?: string
  runId?: string
  statusAfter?: string
  phaseAfter?: string
}): WorkItemOrchestratorEvent {
  return {
    workItemId: params.workItem.id,
    projectId: params.workItem.projectId,
    action: params.action,
    statusBefore: params.workItem.status,
    phaseBefore: params.workItem.phase,
    statusAfter: params.statusAfter ?? params.workItem.status,
    phaseAfter: params.phaseAfter ?? params.workItem.phase,
    jobId: params.jobId,
    draftId: params.draftId,
    runId: params.runId,
    message: params.message,
    observedAt: new Date().toISOString(),
  }
}

function latestActivePlanningDraft(
  workItemId: string,
): PlanningDraftRecord | null {
  const latestDraft = getLatestPlanningDraftForWorkItem(workItemId)
  if (!latestDraft || !ACTIVE_PLANNING_DRAFT_STATUSES.has(latestDraft.status))
    return null
  return latestDraft
}

function shouldAutoAcceptPlanningDraft(draft: PlanningDraftRecord): boolean {
  return (
    draft.status === 'structured_ready' &&
    draft.structuredOutput?.suggestedPhase === 'build'
  )
}

function isPlannerAskingForMoreResearch(draft: PlanningDraftRecord): boolean {
  return (
    draft.status === 'structured_ready' &&
    draft.structuredOutput?.suggestedPhase === 'research'
  )
}

function hasActiveMission(workItem: WorkItemRecord): boolean {
  return Boolean(
    workItem.missionJobId &&
    ACTIVE_MISSION_STATES.has(workItem.missionState ?? 'unknown'),
  )
}

function getActiveBuildMissionRun(
  workItem: WorkItemRecord,
): ExecutionRunRecord | null {
  return (
    listExecutionRuns({ workItemId: workItem.id, role: 'mission' }).find(
      (run) => run.phase === 'build' && ACTIVE_MISSION_STATES.has(run.state),
    ) ?? null
  )
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function mergeHealerTestCommand(): string | undefined {
  return process.env.HERMES_WORKSPACE_MERGE_HEALER_TEST_COMMAND?.trim() || undefined
}

type LaneBranchPreparationPurpose = 'Planner' | 'Builder'

type LaneBranchPreparationResult = {
  state?: Awaited<ReturnType<typeof ensureWorkItemBranch>>
  baseBranch?: string
  branchName?: string
  blockedEvent?: WorkItemOrchestratorEvent
}

async function prepareLaneBranch(
  workItem: WorkItemRecord,
  params: { purpose: LaneBranchPreparationPurpose; laneState: 'preparing' | 'building' },
): Promise<LaneBranchPreparationResult> {
  const project = getProject(workItem.projectId)
  if (!project?.autonomyLanePolicy.enabled) return {}

  const repoPath = (workItem.repoPathSnapshot || project.repoPath || '').trim()
  if (!repoPath) {
    return {
      blockedEvent: createEvent({
        workItem,
        action: 'noop',
        message: `${params.purpose} auto-launch blocked: enabled project lane has no repo path.`,
      }),
    }
  }

  const baseBranch =
    workItem.baseBranch ||
    project.autonomyLanePolicy.baseBranch ||
    project.defaultBranch ||
    'main'
  const branchName =
    workItem.branchName ||
    buildWorkItemBranchName(workItem, project.autonomyLanePolicy.branchPrefix)

  try {
    const state = await ensureWorkItemBranch({
      repoPath,
      baseBranch,
      branchName,
    })
    updateWorkItem(workItem.id, {
      laneState: params.laneState,
      laneEnteredAt: workItem.laneEnteredAt ?? new Date().toISOString(),
      branchName,
      baseBranch,
      branchCreatedAt: workItem.branchCreatedAt ?? new Date().toISOString(),
      mergeBaseCommit: state.headCommit,
      mergeTargetBranch: baseBranch,
      mergeState: workItem.mergeState ?? 'not_started',
    })
    return { state, baseBranch, branchName }
  } catch (error) {
    return {
      blockedEvent: createEvent({
        workItem,
        action: 'noop',
        message: `${params.purpose} auto-launch blocked: ${readErrorMessage(error)}`,
      }),
    }
  }
}

async function prepareLaneBranchForBuilder(
  workItem: WorkItemRecord,
): Promise<{ blockedEvent?: WorkItemOrchestratorEvent }> {
  const prepared = await prepareLaneBranch(workItem, {
    purpose: 'Builder',
    laneState: 'building',
  })
  return { blockedEvent: prepared.blockedEvent }
}

function summarizePreviousCompletedWorkItem(workItem: WorkItemRecord): string | undefined {
  const previous = listWorkItems()
    .filter(
      (candidate) =>
        candidate.projectId === workItem.projectId &&
        candidate.id !== workItem.id &&
        candidate.status === 'done',
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]

  if (!previous) return undefined

  const mergeSummary = previous.mergeState
    ? ` mergeState=${previous.mergeState}${previous.mergeCommit ? ` mergeCommit=${previous.mergeCommit}` : ''}`
    : ''
  return `${previous.title} (${previous.id.slice(0, 8)}) completed.${mergeSummary}`
}

async function prepareLaneEntryForPlanner(
  workItem: WorkItemRecord,
): Promise<{
  request: { laneContext?: PlannerLaneContext }
  blockedEvent?: WorkItemOrchestratorEvent
}> {
  const prepared = await prepareLaneBranch(workItem, {
    purpose: 'Planner',
    laneState: 'preparing',
  })
  if (prepared.blockedEvent) return { request: {}, blockedEvent: prepared.blockedEvent }
  if (!prepared.state || !prepared.baseBranch) return { request: {} }

  return {
    request: {
      laneContext: {
        currentBranch: prepared.state.currentBranch,
        baseBranch: prepared.baseBranch,
        headCommit: prepared.state.headCommit,
        previousCompletedSummary: summarizePreviousCompletedWorkItem(workItem),
      },
    },
  }
}

function buildPlannerArtifactStructuredOutput(
  workItem: WorkItemRecord,
  draft: PlanningDraftRecord,
): { rawOutput: string; planFilePath: string; artifactPath: string } | null {
  const project = getProject(workItem.projectId)
  if (!project) return null
  const repoPath = (workItem.repoPathSnapshot || project.repoPath || '').trim()
  if (!repoPath) return null
  const planFilePath =
    draft.planFilePath ||
    `docs/plans/${project.slug}-${workItem.id.slice(0, 8)}-planner-draft.md`
  const artifactPath = join(repoPath, planFilePath)
  if (!existsSync(artifactPath)) return null

  const artifactText = readFileSync(artifactPath, 'utf8').trim()
  if (!artifactText || !artifactText.includes(workItem.id)) return null

  const rawOutput = JSON.stringify({
    title: workItem.title,
    description:
      workItem.description || `Planner artifact is ready at ${planFilePath}.`,
    priority: workItem.priority,
    riskLevel: workItem.riskLevel,
    labels: Array.from(
      new Set([...(workItem.labels || []), 'planner-artifact-ready']),
    ),
    acceptanceCriteria:
      workItem.acceptanceCriteria && workItem.acceptanceCriteria.length > 0
        ? workItem.acceptanceCriteria
        : [
            'Builder completes the implementation described by the Planner artifact.',
          ],
    notes: [
      `Planner markdown artifact detected at ${planFilePath}; proceeding to Builder.`,
    ],
    planFilePath,
    openQuestions: [],
    suggestedPhase: 'build',
  })

  return { rawOutput, planFilePath, artifactPath }
}

async function reconcilePlannerOutput(
  workItem: WorkItemRecord,
  draft: PlanningDraftRecord,
): Promise<WorkItemOrchestratorEvent | null> {
  if (draft.status !== 'running' || !draft.plannerJobId) return null

  const output = await getLatestHermesJobOutput(draft.plannerJobId)
  const artifactOutput = output?.latestOutputText?.trim()
    ? null
    : buildPlannerArtifactStructuredOutput(workItem, draft)
  const rawOutput =
    output?.latestOutputText?.trim() || artifactOutput?.rawOutput
  if (!rawOutput) return null

  const updatedDraft = recordPlannerOutput(draft.id, rawOutput)
  return createEvent({
    workItem,
    action: 'ingest_planner_output',
    draftId: updatedDraft.id,
    jobId: draft.plannerJobId,
    runId: output?.latestRunId,
    message:
      updatedDraft.status === 'structured_ready'
        ? `Ingested Planner output for draft ${updatedDraft.id.slice(0, 8)}.`
        : `Planner output for draft ${updatedDraft.id.slice(0, 8)} was ingested but did not parse cleanly.`,
  })
}

function hasApprovedReviewEvidence(workItem: WorkItemRecord): boolean {
  if (workItem.reviewDecision === 'approved') return true
  return listWorkItemApprovals(workItem.id).some(
    (approval) => approval.phase === 'review' && approval.status === 'approved',
  )
}

export async function reconcileWorkItemAutonomy(
  workItemId: string,
): Promise<ReconcileWorkItemAutonomyResult> {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')

  if (workItem.status === 'done' || workItem.status === 'cancelled') {
    return {
      workItemId,
      changed: false,
      events: [
        createEvent({
          workItem,
          action: 'noop',
          message: `Work item is terminal (${workItem.status}); no autonomous action taken.`,
        }),
      ],
    }
  }

  const activeDraft = latestActivePlanningDraft(workItem.id)

  if (
    workItem.status === 'inbox' &&
    workItem.phase === 'research' &&
    !activeDraft
  ) {
    const laneEntry = await prepareLaneEntryForPlanner(workItem)
    if (laneEntry.blockedEvent) {
      return {
        workItemId,
        changed: false,
        blocked: true,
        events: [laneEntry.blockedEvent],
      }
    }

    const prepared = await prepareWorkItemWithPlanner(
      workItem.id,
      laneEntry.request,
    )
    const launchedDraft = prepared?.draft as PlanningDraftRecord | undefined
    const launch = prepared?.launch as { jobId?: string } | undefined
    return {
      workItemId,
      changed: true,
      events: [
        createEvent({
          workItem,
          action: 'launch_planner',
          draftId: launchedDraft?.id,
          jobId: launch?.jobId ?? launchedDraft?.plannerJobId,
          message: 'Auto-launched Planner for inbox research work item.',
        }),
      ],
    }
  }

  if (
    (workItem.status === 'inbox' || workItem.status === 'active') &&
    workItem.phase === 'research' &&
    activeDraft
  ) {
    if (shouldAutoAcceptPlanningDraft(activeDraft)) {
      const accepted = applyPlanningDraftToWorkItem(activeDraft.id)
      return {
        workItemId,
        changed: true,
        events: [
          createEvent({
            workItem,
            action: 'accept_planning_draft',
            draftId: activeDraft.id,
            statusAfter: accepted.workItem.status,
            phaseAfter: accepted.workItem.phase,
            message: `Auto-accepted Planner draft ${activeDraft.id.slice(0, 8)} and prepared Builder launch.`,
          }),
        ],
      }
    }

    if (isPlannerAskingForMoreResearch(activeDraft)) {
      return {
        workItemId,
        changed: false,
        blocked: true,
        events: [
          createEvent({
            workItem,
            action: 'noop',
            draftId: activeDraft.id,
            message:
              'Planner requested more research; not auto-accepting draft.',
          }),
        ],
      }
    }

    const event = await reconcilePlannerOutput(workItem, activeDraft)
    if (event) {
      return { workItemId, changed: true, events: [event] }
    }
  }

  if (workItem.status === 'ready' && workItem.phase === 'build') {
    if (!workItem.planFilePath?.trim()) {
      return {
        workItemId,
        changed: false,
        blocked: true,
        events: [
          createEvent({
            workItem,
            action: 'noop',
            message:
              'Builder auto-launch blocked: ready/build work item is missing a plan file.',
          }),
        ],
      }
    }

    if (hasActiveMission(workItem)) {
      return {
        workItemId,
        changed: false,
        events: [
          createEvent({
            workItem,
            action: 'noop',
            jobId: workItem.missionJobId,
            message:
              'Builder auto-launch skipped: active mission job already exists.',
          }),
        ],
      }
    }

    const activeBuildRun = getActiveBuildMissionRun(workItem)
    if (activeBuildRun) {
      return {
        workItemId,
        changed: false,
        events: [
          createEvent({
            workItem,
            action: 'noop',
            jobId: activeBuildRun.jobId,
            runId: activeBuildRun.runId,
            message:
              'Builder auto-launch skipped: active build execution run already exists.',
          }),
        ],
      }
    }

    const branchPrepared = await prepareLaneBranchForBuilder(workItem)
    if (branchPrepared.blockedEvent) {
      return {
        workItemId,
        changed: false,
        blocked: true,
        events: [branchPrepared.blockedEvent],
      }
    }

    const launched = await launchWorkItemIntoConductor(workItem.id, {
      phase: 'build',
    })
    return {
      workItemId,
      changed: true,
      events: [
        createEvent({
          workItem,
          action: 'launch_builder',
          jobId: launched.launch.jobId,
          runId: launched.launch.runId,
          statusAfter: launched.workItem.status,
          phaseAfter: launched.workItem.phase,
          message: 'Auto-launched Builder for ready build work item.',
        }),
      ],
    }
  }

  const project = getProject(workItem.projectId)
  const reviewApproved = hasApprovedReviewEvidence(workItem)
  const isReadyForMergeHealer = workItem.status === 'active' && (workItem.phase === 'deploy' || reviewApproved) && reviewApproved

  if (workItem.status === 'active' && workItem.missionJobId && !isReadyForMergeHealer) {
    try {
      const synced = await syncWorkItemExecutionState(workItem.id)
      return {
        workItemId,
        changed:
          synced.workItem.status !== workItem.status ||
          synced.workItem.phase !== workItem.phase ||
          Boolean(synced.execution.transitionApplied),
        events: [
          createEvent({
            workItem,
            action: 'sync_execution',
            jobId: workItem.missionJobId,
            runId: synced.execution.latestRun?.id,
            statusAfter: synced.workItem.status,
            phaseAfter: synced.workItem.phase,
            message: synced.execution.transitionApplied
              ? `Synced execution and applied transition ${synced.execution.transitionApplied}.`
              : 'Synced execution state for active mission job.',
          }),
        ],
      }
    } catch (error) {
      return {
        workItemId,
        changed: false,
        blocked: true,
        events: [
          createEvent({
            workItem,
            action: 'sync_execution',
            jobId: workItem.missionJobId,
            message: `Execution sync failed: ${readErrorMessage(error)}`,
          }),
        ],
      }
    }
  }

  const shouldRunMergeHealer =
    project?.autonomyLanePolicy.enabled === true &&
    project.autonomyLanePolicy.mergeHealerEnabled !== false &&
    workItem.status === 'active' &&
    (workItem.phase === 'deploy' || reviewApproved) &&
    reviewApproved &&
    workItem.mergeState !== 'merged'

  if (project && shouldRunMergeHealer) {
    const repoPath = (workItem.repoPathSnapshot || project.repoPath || '').trim()
    if (!repoPath) {
      return {
        workItemId,
        changed: false,
        blocked: true,
        events: [
          createEvent({
            workItem,
            action: 'run_merge_healer',
            message: 'Merge-Healer blocked: enabled project lane has no repo path.',
          }),
        ],
      }
    }

    const merge = await runWorkItemMergeHealer({
      repoPath,
      workItem,
      testCommand: mergeHealerTestCommand(),
    })
    const mergeUpdates = {
      laneState: merge.mergeState === 'merged' ? ('done' as const) : ('blocked' as const),
      mergeState: merge.mergeState,
      mergeCommit: merge.mergeCommit,
      mergeBaseCommit: merge.mergeBaseCommit ?? workItem.mergeBaseCommit,
      mergeTargetBranch: merge.mergeTargetBranch,
      mergeConflictFiles: merge.mergeConflictFiles,
      mergeTestCommand: merge.mergeTestCommand,
      mergeTestPassed: merge.mergeTestPassed,
      mergeArtifactPaths: merge.mergeArtifactPaths,
      artifactPaths: Array.from(new Set([...workItem.artifactPaths, ...merge.mergeArtifactPaths])),
    }

    if (merge.mergeState === 'merged') {
      const updated = updateWorkItem(workItem.id, {
        ...mergeUpdates,
        status: 'done',
        phase: 'deploy',
      })
      if (!updated) throw new Error('Failed to persist Merge-Healer success')
      appendWorkItemHistoryEntry(updated.id, {
        action: 'status-change',
        status: 'done',
        phase: 'deploy',
        note: `Merge-Healer merged ${workItem.branchName ?? 'feature branch'} into ${merge.mergeTargetBranch}${merge.mergeCommit ? ` at ${merge.mergeCommit.slice(0, 8)}` : ''}.`,
      })
      return {
        workItemId,
        changed: true,
        events: [
          createEvent({
            workItem,
            action: 'run_merge_healer',
            statusAfter: 'done',
            phaseAfter: 'deploy',
            message: `Merge-Healer merged branch into ${merge.mergeTargetBranch}.`,
          }),
        ],
      }
    }

    const blockedReason = merge.mergeBlockedReason ?? 'Merge-Healer blocked autonomous completion.'
    const updated = updateWorkItem(workItem.id, {
      ...mergeUpdates,
      status: 'blocked',
      phase: workItem.phase,
      blockedReason: 'other',
      laneParkedAt: new Date().toISOString(),
      laneBlockedReason: blockedReason,
    })
    if (!updated) throw new Error('Failed to persist Merge-Healer blocker')
    appendWorkItemHistoryEntry(updated.id, {
      action: 'status-change',
      status: 'blocked',
      phase: updated.phase,
      note: blockedReason,
    })
    return {
      workItemId,
      changed: true,
      blocked: true,
      events: [
        createEvent({
          workItem,
          action: 'run_merge_healer',
          statusAfter: 'blocked',
          phaseAfter: workItem.phase,
          message: blockedReason,
        }),
      ],
    }
  }

  return {
    workItemId,
    changed: false,
    events: [
      createEvent({
        workItem,
        action: 'noop',
        message: 'No autonomous action available.',
      }),
    ],
  }
}

export async function reconcileAllWorkItemAutonomy(): Promise<ReconcileAllWorkItemAutonomyResult> {
  const allWorkItems = listWorkItems().filter(
    (workItem) => workItem.status !== 'done' && workItem.status !== 'cancelled',
  )
  const laneEnabledProjects = listProjects().filter(
    (project) => project.autonomyLanePolicy.enabled,
  )
  const laneEnabledProjectIds = new Set(
    laneEnabledProjects.map((project) => project.id),
  )
  const laneSelectedWorkItemIds = new Set<string>()

  for (const project of laneEnabledProjects) {
    const selection = selectNextLaneWorkItem({
      project,
      workItems: allWorkItems,
    })
    const selected = selection.active ?? selection.next
    if (selected) laneSelectedWorkItemIds.add(selected.id)
  }

  const workItems = allWorkItems.filter((workItem) => {
    if (!laneEnabledProjectIds.has(workItem.projectId)) return true
    return laneSelectedWorkItemIds.has(workItem.id)
  })
  const events: Array<WorkItemOrchestratorEvent> = []
  const findings: Array<unknown> = []
  let changed = 0

  for (const workItem of workItems) {
    try {
      const result = await reconcileWorkItemAutonomy(workItem.id)
      events.push(...result.events)
      if (result.changed) changed += 1
    } catch (error) {
      findings.push({
        workItemId: workItem.id,
        projectId: workItem.projectId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return {
    checked: workItems.length,
    changed,
    events,
    findings,
  }
}

export function hasActivePlanningDraft(workItemId: string): boolean {
  return listPlanningDrafts({ workItemId }).some((draft) =>
    ACTIVE_PLANNING_DRAFT_STATUSES.has(draft.status),
  )
}
