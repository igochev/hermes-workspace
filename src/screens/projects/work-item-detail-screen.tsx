'use client'

import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  GithubIcon,
  GitBranchIcon,
  PlayIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { toast } from '@/components/ui/toast'
import {
  deleteWorkItem,
  updateWorkItem,
  type PlannerStructuredOutput,
  type PlanningDraftRecord,
  type PlanningDraftStatus,
  type WorkItemApprovalDecision,
  type WorkItemBlockedReason,
  type WorkItemCriterionStatus,
  type WorkItemRiskLevel,
  type WorkItemStatus,
  WORK_ITEM_BLOCKED_REASON_LABELS,
  WORK_ITEM_PHASE_LABELS,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_RISK_LEVEL_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/projects-api'
import {
  acceptPlanningDraft,
  prepareWorkItemWithPlanner,
  updatePlanningDraft,
} from '@/lib/planning-drafts-api'
import { resolveWorkItemApproval } from '@/lib/work-item-approvals-api'
import { launchWorkItem } from '@/lib/work-item-launch-api'
import { fetchProjectProfileReadiness } from '@/lib/profile-readiness-api'
import type {
  ProfileReadinessReport,
  ProfileReadinessRoleReport,
  ProfileReadinessSource,
  ProfileReadinessStatus,
} from '@/server/profile-readiness'
import {
  fetchAttentionQueue,
} from '@/lib/attention-queue-api'
import {
  executeWorkItemRecoveryAction,
  toRecoveryActionInput,
} from '@/lib/work-item-recovery-actions-api'
import type { AttentionQueueItem } from '@/server/attention-queue-store'
import type { WorkItemRecoveryAction } from '@/server/work-item-recovery-actions'
import {
  applyWorkItemLifecycleAction,
  syncWorkItemExecution,
  type WorkItemExecutionPayload,
  type WorkItemLifecycleAction,
} from '@/lib/work-item-execution-api'

export const WORK_ITEM_DETAIL_HEADER_CLASS = 'rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 backdrop-blur-xl'
export const WORK_ITEM_DETAIL_PANEL_CLASS = 'rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm'
export const WORK_ITEM_DETAIL_MUTED_TEXT_CLASS = 'text-[var(--theme-muted)]'
export const WORK_ITEM_DETAIL_AUTO_SYNC_MODE = 'sync-execution'
export const WORK_ITEM_DETAIL_ACCEPTANCE_CRITERIA_HELP_TEXT =
  'Planning can draft or refine acceptance criteria here before build execution.'
export const WORK_ITEM_DETAIL_NOTES_HELP_TEXT =
  'Capture planning output, operator guidance, or open questions as one note per line.'
export const WORK_ITEM_BLOCKED_REASON_FIELD_LABEL = 'Blocked reason'
export const WORK_ITEM_BLOCKED_REASON_HELP_TEXT =
  'Classify why this work item is blocked so board triage and recovery guidance stay actionable.'
export const WORK_ITEM_DETAIL_OPEN_CONDUCTOR_LABEL = 'Open Conductor'
export const WORK_ITEM_EXECUTION_SYNC_WARNING_TITLE = 'Execution sync warning'
export const WORK_ITEM_PROFILE_READINESS_PREFLIGHT_TITLE = 'Profile Preflight'
export const WORK_ITEM_RECOVERY_PANEL_TITLE = 'Recovery Actions'

type WorkItemRecoveryPanelSourceItem = Pick<
  AttentionQueueItem,
  'id' | 'status' | 'title' | 'detail' | 'recommendedActions'
>

export type WorkItemRecoveryPanelItem = {
  attentionItemId: string
  title: string
  detail: string
  actions: Array<WorkItemRecoveryAction>
}

export function getWorkItemRecoveryPanelItems(
  attentionItems: Array<WorkItemRecoveryPanelSourceItem>,
): Array<WorkItemRecoveryPanelItem> {
  return attentionItems
    .filter((item) => item.status === 'open' && item.recommendedActions.length > 0)
    .map((item) => ({
      attentionItemId: item.id,
      title: item.title,
      detail: item.detail,
      actions: item.recommendedActions,
    }))
}

export function getWorkItemRecoveryActionButtonLabel(action: WorkItemRecoveryAction): string {
  if (action.type === 'relaunch_phase' && action.phase) {
    return `Relaunch ${WORK_ITEM_PHASE_LABELS[action.phase].toLowerCase()}`
  }
  return action.label
}

const WORK_ITEM_RECOVERY_DEFAULT_NOTES: Record<WorkItemRecoveryAction['type'], string> = {
  relaunch_phase: 'Operator relaunched phase from recovery panel.',
  return_to_build: 'Operator returned work item to build from recovery panel.',
  request_review: 'Operator requested review from recovery panel.',
  mark_resolved: 'Operator marked attention externally resolved from recovery panel.',
  cancel_work_item: 'Operator cancelled work item from recovery panel.',
  dismiss_attention: 'Operator dismissed attention from recovery panel.',
}

const WORK_ITEM_PROFILE_READINESS_SOURCE_LABELS: Record<ProfileReadinessSource, string> = {
  'work-item-assigned-profile': 'work-item override',
  'project-phase-profile': 'project phase mapping',
  'project-autopilot-policy': 'project Autopilot policy',
  default: 'default mapping',
  none: 'no mapping',
}

const WORK_ITEM_PROFILE_READINESS_STATUS_LABELS: Record<ProfileReadinessStatus, string> = {
  ready: 'Ready for launch.',
  unmapped: 'No mapped Hermes profile; launch may use fallback routing.',
  missing: 'Warning: missing Hermes profile.',
  unknown: 'Warning: profile availability could not be checked.',
}

export function getWorkItemProfileReadinessDecision(
  report: ProfileReadinessReport | null | undefined,
  phase: 'research' | 'build' | 'review' | 'deploy' | undefined,
): ProfileReadinessRoleReport | undefined {
  if (!report || !phase) return undefined
  return report.roles.find((role) => role.role === phase)
}

export function getWorkItemProfileReadinessAdvisory(
  decision: ProfileReadinessRoleReport | undefined,
): string {
  if (!decision) return 'Profile readiness is loading for this work item launch path.'

  const profile = decision.mappedProfile ?? 'Unmapped'
  const source = WORK_ITEM_PROFILE_READINESS_SOURCE_LABELS[decision.source]
  const status = WORK_ITEM_PROFILE_READINESS_STATUS_LABELS[decision.status]
  const fixHint = decision.status === 'ready' ? '' : ` ${decision.fixHint}`
  return `Selected phase profile: ${profile} (${source}). ${status}${fixHint}`
}

export function getWorkItemExecutionSyncWarningMessage(warning?: string): string | null {
  if (!warning || warning.trim().length === 0) return null
  return `Execution data may be stale: ${warning.trim()}`
}

export function getWorkItemBlockedReasonGuidance(
  blockedReason?: WorkItemBlockedReason,
): string {
  if (!blockedReason) {
    return 'Select a blocked reason when status is Blocked to keep triage and recovery hints precise.'
  }

  if (blockedReason === 'mission_failed') {
    return 'Mission failed — capture the failing run details, record fix notes, then resume build and relaunch.'
  }
  if (blockedReason === 'review_feedback') {
    return 'review feedback is blocking progress — capture requested changes and route back to build after updates.'
  }
  if (blockedReason === 'blocked_by_dependency') {
    return 'A dependency is blocking this item — track the upstream owner/status and relaunch once unblocked.'
  }
  if (blockedReason === 'external') {
    return 'An external dependency is blocking this item — record the external owner/timeline for follow-up.'
  }

  return 'Document the blocker in notes so the next operator can resume with clear context.'
}

export function buildWorkItemConductorHref(workItemId: string): string {
  return `/conductor?mode=work-item&id=${encodeURIComponent(workItemId)}`
}

export type WorkItemDetailLifecycleAction =
  | 'send_to_planning'
  | 'mark_ready'
  | 'request_review'
  | 'request_deploy_approval'
  | 'resume_build'
  | 'cancel'
  | 'back_to_research'
  | 'back_to_build'
  | 'back_to_inbox'

export function stringifyWorkItemDetailListDraft(items: Array<string>): string {
  return items.join('\n')
}

export function parseWorkItemDetailListDraft(value: string): Array<string> {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function getPlanningDraftStatusLabel(status?: string): string {
  if (!status) return 'No draft'
  if (status === 'requested') return 'Planner requested'
  if (status === 'running') return 'Planner running'
  if (status === 'structured_ready') return 'Draft ready'
  if (status === 'parse_failed') return 'Planner revision needed'
  if (status === 'accepted') return 'Accepted'
  if (status === 'revision_requested') return 'Revision requested'
  if (status === 'cancelled') return 'Cancelled'
  return status
}

export function getPlanningDraftGuidance(status?: string): string {
  if (!status) return 'No planner draft yet. Prepare with Planner to generate a structured enrichment draft.'
  if (status === 'requested' || status === 'running') {
    return 'Planner enrichment is running. Wait for structured output, then review the suggested changes before accepting.'
  }
  if (status === 'structured_ready') {
    return 'Planner draft is ready. Review the diff preview and Accept Planner Draft when the enrichment looks correct.'
  }
  if (status === 'parse_failed') {
    return 'Planner output could not be parsed. Request revision and ask Planner to return schema-valid JSON only.'
  }
  if (status === 'accepted') {
    return 'Planner draft accepted. Work item is prepared for Build launch.'
  }
  if (status === 'revision_requested') {
    return 'Revision requested. Relaunch Planner after clarifying the missing or invalid fields.'
  }
  return 'Review planner draft metadata and continue with the next workflow action.'
}

export function canLaunchBuildFromPlanningState(
  workItem: {
    status: WorkItemStatus
    phase: 'research' | 'build' | 'review' | 'deploy' | undefined
    planFilePath?: string
  },
  latestDraft?: { status: PlanningDraftStatus } | null,
): boolean {
  if (workItem.planFilePath) return true

  const isRoughIdea = workItem.status === 'inbox' && workItem.phase === 'research'
  if (!isRoughIdea) return true

  return latestDraft?.status === 'accepted'
}

function formatPlanningDiffList(items: Array<string>, separator: '\n' | ', '): string {
  if (items.length === 0) return '—'
  return items.join(separator)
}

export function buildPlanningDraftDiff(
  currentWorkItem: {
    title: string
    description: string
    priority: string
    riskLevel: string
    labels: Array<string>
    acceptanceCriteria: Array<string>
    notes: Array<string>
    planFilePath?: string
  },
  structuredOutput?: PlannerStructuredOutput,
): Array<{ label: string; before: string; after: string }> {
  if (!structuredOutput) return []

  const diffs: Array<{ label: string; before: string; after: string }> = []
  const pushDiff = (label: string, before: string, after: string) => {
    if (before === after) return
    diffs.push({ label, before, after })
  }

  pushDiff('Title', currentWorkItem.title || '—', structuredOutput.title || '—')
  pushDiff('Description', currentWorkItem.description || '—', structuredOutput.description || '—')
  pushDiff('Priority', currentWorkItem.priority || '—', structuredOutput.priority || '—')
  pushDiff('Risk level', currentWorkItem.riskLevel || '—', structuredOutput.riskLevel || '—')
  pushDiff(
    'Labels',
    formatPlanningDiffList(currentWorkItem.labels, ', '),
    formatPlanningDiffList(structuredOutput.labels, ', '),
  )
  pushDiff(
    'Acceptance criteria',
    formatPlanningDiffList(currentWorkItem.acceptanceCriteria, '\n'),
    formatPlanningDiffList(structuredOutput.acceptanceCriteria, '\n'),
  )
  pushDiff('Notes', formatPlanningDiffList(currentWorkItem.notes, '\n'), formatPlanningDiffList(structuredOutput.notes, '\n'))
  pushDiff('Plan file path', currentWorkItem.planFilePath || '—', structuredOutput.planFilePath || '—')

  return diffs
}

export function buildWorkItemAcceptanceCriteriaStatus(
  acceptanceCriteria: Array<string>,
  criteriaStatus: Array<WorkItemCriterionStatus>,
): Array<WorkItemCriterionStatus> {
  if (acceptanceCriteria.length === 0) return []

  return acceptanceCriteria.map((criterion, index) => {
    const indexed = criteriaStatus[index]
    if (indexed && indexed.text === criterion) {
      return { text: criterion, met: indexed.met }
    }

    const byText = criteriaStatus.find((item) => item.text === criterion)
    return { text: criterion, met: byText?.met === true }
  })
}

export function getWorkItemAcceptanceCriteriaProgress(criteriaStatus: Array<WorkItemCriterionStatus>): {
  metCount: number
  totalCount: number
} {
  const totalCount = criteriaStatus.length
  const metCount = criteriaStatus.filter((item) => item.met).length
  return { metCount, totalCount }
}

export function getWorkItemAcceptanceCriteriaProgressLabel(progress: {
  metCount: number
  totalCount: number
}): string {
  return `${progress.metCount}/${progress.totalCount} criteria met`
}

export const WORK_ITEM_DETAIL_ACTION_GROUP_TITLES = {
  operator: 'Operator Workflow',
  execution: 'Execution Controls',
  administration: 'Administrative Actions',
} as const

export function getWorkItemOperatorGuidance(state: {
  status: 'inbox' | 'ready' | 'active' | 'blocked' | 'done' | 'cancelled'
  phase: 'research' | 'build' | 'review' | 'deploy' | undefined
  missionState?: 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'
  riskLevel?: 'low' | 'medium' | 'high'
  blockedReason?: WorkItemBlockedReason
  acceptanceCriteriaProgress?: { metCount: number; totalCount: number }
}): string {
  if (state.status === 'blocked' && state.phase === 'build' && state.missionState === 'failed') {
    return 'This work item is blocked by a failed build mission. Capture fixes, run Resume Build, and relaunch Build to continue delivery.'
  }
  if (state.status === 'blocked') {
    return getWorkItemBlockedReasonGuidance(state.blockedReason)
  }
  if (state.status === 'inbox' && state.phase === 'research') {
    return 'Capture the request, send it to planning, and launch Researcher when you want a grounded plan.'
  }
  if (state.status === 'active' && state.phase === 'research') {
    return 'Planning is active. Refine acceptance criteria and notes, then mark the work item ready for build.'
  }
  if (state.status === 'ready') {
    const progressSuffix =
      state.acceptanceCriteriaProgress && state.acceptanceCriteriaProgress.totalCount > 0
        ? ` Acceptance criteria progress: ${state.acceptanceCriteriaProgress.metCount}/${state.acceptanceCriteriaProgress.totalCount} met.`
        : ''

    if (state.riskLevel === 'low') {
      return `Planning is complete. This is a low-risk item — review will be auto-approved after build. Launch Build triggers the two-phase pipeline (Planner writes a plan, then Builder implements per the plan).${progressSuffix}`
    }
    return `Planning is complete. Launch Build triggers the two-phase pipeline (Planner writes a plan, then Builder implements per the plan).${progressSuffix}`
  }
  if (state.status === 'active' && state.phase === 'build' && state.missionState === 'running') {
    return 'Build mission is in flight. Sync execution for fresh evidence or request review once implementation is ready.'
  }
  if (state.status === 'active' && state.phase === 'build') {
    return 'Implementation is active. Sync execution for fresh evidence or request review once implementation is ready.'
  }
  if (state.status === 'active' && state.phase === 'review') {
    return 'Review is active. Resolve pending approvals or send the work item back to build if changes are requested.'
  }
  if (state.status === 'active' && state.phase === 'deploy') {
    return 'Deploy is active. Verify release evidence, then request deploy approval before completing the work item.'
  }
  if (state.status === 'done') {
    return 'This work item is complete. Review evidence and history if you need a release record.'
  }
  if (state.status === 'cancelled') {
    return 'This work item was cancelled. Preserve notes here if the request needs to be revived later.'
  }
  return 'Use lifecycle actions to move the work item forward, sync execution for fresh evidence, and keep operator notes current.'
}

export function getWorkItemExecutionSummary(state: {
  missionState?: 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'
  latestRunStatus?: string | null
}): string {
  if (state.missionState === 'failed' || state.latestRunStatus === 'failed') {
    return 'Mission failed — inspect the latest run, capture follow-up notes, run Resume Build, and relaunch Build when ready.'
  }
  if (state.missionState === 'running') {
    return 'Mission is currently running — sync execution to refresh run data, session linkage, and delivery evidence.'
  }
  if (state.missionState === 'scheduled') {
    return 'Mission is scheduled — wait for execution to start or sync if the job state looks stale.'
  }
  if (state.missionState === 'succeeded' || state.latestRunStatus === 'succeeded') {
    return 'Mission succeeded — review artifacts, branch/PR evidence, and move the workflow into the next approval or deploy step.'
  }
  return 'No decisive execution signal yet — launch or sync when you need fresh execution evidence.'
}

export function getWorkItemApprovalSummary(
  approvals: Array<{ status?: string; phase?: string }>,
): string {
  const pendingReviewCount = approvals.filter(
    (approval) => approval.status === 'pending' && approval.phase !== 'deploy',
  ).length
  const pendingDeployCount = approvals.filter(
    (approval) => approval.status === 'pending' && approval.phase === 'deploy',
  ).length
  const changesRequestedCount = approvals.filter(
    (approval) => approval.status === 'changes_requested',
  ).length
  const totalAttention = pendingReviewCount + pendingDeployCount + changesRequestedCount

  if (totalAttention === 0) {
    return 'No approvals are currently blocking this work item.'
  }

  const parts: Array<string> = []
  if (pendingReviewCount > 0) parts.push('pending review approval')
  if (pendingDeployCount > 0) parts.push('pending deploy approval')
  if (changesRequestedCount > 0) parts.push('changes requested')

  return `${totalAttention} approvals need attention — ${parts.join(' and ')}.`
}

export function getWorkItemPrimaryLaunchLabel(state: {
  phase: 'research' | 'build' | 'review' | 'deploy' | undefined
  status: 'inbox' | 'ready' | 'active' | 'blocked' | 'done' | 'cancelled'
}): string {
  if (state.phase === 'research') return 'Plan with Planner'
  if (state.phase === 'review') return 'Launch Review'
  if (state.phase === 'deploy') return 'Launch Deploy'
  if (state.phase === 'build' && state.status === 'blocked') return 'Relaunch Build'
  return 'Launch Build'
}

export function getWorkItemLifecycleActionLabel(action: WorkItemDetailLifecycleAction): string {
  if (action === 'send_to_planning') return 'Send to Planning'
  if (action === 'mark_ready') return 'Mark Ready'
  if (action === 'request_review') return 'Request Review'
  if (action === 'request_deploy_approval') return 'Request Deploy Approval'
  if (action === 'cancel') return 'Cancel Work Item'
  if (action === 'back_to_research') return 'Back to Research'
  if (action === 'back_to_build') return 'Back to Build'
  if (action === 'back_to_inbox') return 'Back to Inbox'
  return 'Resume Build'
}

export function reviewDecisionLabel(decision: string): string {
  if (decision === 'approved') return '✅ Approved — advance to deploy'
  if (decision === 'changes_requested') return '🔧 Changes Requested — return to build'
  if (decision === 'manual_review') return '🧑‍⚖️ Manual Review — CEO attention required'
  return decision || '—'
}

export function reviewQualityGateLabel(status?: string): string {
  if (status === 'pass') return '✅ Gate passed'
  if (status === 'fail') return '🔧 Gate failed'
  if (status === 'manual_review') return '🧑‍⚖️ Manual review required'
  return '—'
}

export function getReviewEvidenceAttentionMessage(workItemLike: {
  reviewDecision?: string
  reviewParserError?: string
  reviewQualityGateStatus?: string
  reviewMissingEvidence?: Array<string>
}): string | null {
  if (workItemLike.reviewDecision === 'changes_requested') {
    return 'Changes requested — Planner review found blockers or unmet criteria.'
  }
  if (workItemLike.reviewParserError) {
    return 'Manual review required — Planner review completed without valid structured decision.'
  }
  if (workItemLike.reviewQualityGateStatus === 'pass') {
    return 'Review gate passed — structured Planner approval verified.'
  }
  if (workItemLike.reviewQualityGateStatus === 'manual_review' || workItemLike.reviewDecision === 'manual_review') {
    return 'Manual review required — approved decision failed quality gates.'
  }
  if (workItemLike.reviewMissingEvidence && workItemLike.reviewMissingEvidence.length > 0) {
    return `Missing review evidence: ${workItemLike.reviewMissingEvidence.join(', ')}.`
  }
  return null
}

export function getAvailableWorkItemLifecycleActions(state: {
  status: 'inbox' | 'ready' | 'active' | 'blocked' | 'done' | 'cancelled'
  phase: 'research' | 'build' | 'review' | 'deploy' | undefined
}): Array<WorkItemDetailLifecycleAction> {
  if (state.status === 'done' || state.status === 'cancelled') return []
  if (state.status === 'inbox' && state.phase === 'research') return ['send_to_planning', 'cancel']
  if (state.status === 'active' && state.phase === 'research') return ['mark_ready', 'back_to_inbox', 'cancel']
  if (state.status === 'active' && state.phase === 'build') return ['request_review', 'back_to_research', 'cancel']
  if (state.status === 'active' && state.phase === 'deploy') return ['request_deploy_approval', 'back_to_build', 'cancel']
  if (state.status === 'active' && state.phase === 'review') return ['back_to_research', 'cancel']
  if (state.status === 'blocked' && state.phase === 'build') return ['resume_build', 'back_to_research', 'cancel']
  if (state.status === 'ready') return ['cancel']
  return []
}

export function WorkItemDetailScreen({
  projectId,
  workItemId,
}: {
  projectId: string
  workItemId: string
}) {
  const queryClient = useQueryClient()
  const queryKey = ['mission-control', 'work-items', workItemId] as const
  const workItemQuery = useQuery({
    queryKey,
    queryFn: () => syncWorkItemExecution(workItemId),
    refetchInterval: 30_000,
  })
  const profileReadinessQueryKey = ['mission-control', 'projects', projectId, 'profile-readiness', workItemId] as const
  const profileReadinessQuery = useQuery({
    queryKey: profileReadinessQueryKey,
    queryFn: () => fetchProjectProfileReadiness(projectId, workItemId),
    refetchInterval: 60_000,
  })
  const attentionQueryKey = ['mission-control', 'attention-queue', workItemId] as const
  const attentionQuery = useQuery({
    queryKey: attentionQueryKey,
    queryFn: () => fetchAttentionQueue({ refresh: true }),
    refetchInterval: 30_000,
  })

  const launchMutation = useMutation({
    mutationFn: () =>
      launchWorkItem(workItemId, {
        phase: workItem?.phase ?? 'build',
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      await queryClient.invalidateQueries({ queryKey: profileReadinessQueryKey })
      const isTwoPhase = !!result.workItem.planFilePath
      toast(
        isTwoPhase
          ? `Launched two-phase pipeline (Planner → Builder). Plan path: ${result.workItem.planFilePath}`
          : result.launch.profile
            ? `Launched ${result.launch.phase} via Conductor (${result.launch.profile})`
            : `Launched ${result.launch.phase} via Conductor`,
      )
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to launch work item', {
        type: 'error',
      })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => syncWorkItemExecution(workItemId),
    onSuccess: async (result: WorkItemExecutionPayload) => {
      queryClient.setQueryData(queryKey, {
        workItem: result.workItem,
        project: result.project,
        execution: result.execution,
        executionSyncWarning: result.executionSyncWarning,
      })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      if (result.executionSyncWarning) return
      toast(
        result.execution?.transitionApplied
          ? `Execution synced: ${result.execution.transitionApplied}`
          : `Execution synced: ${result.execution?.state ?? 'unknown'}`,
      )
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to sync execution state', {
        type: 'error',
      })
    },
  })

  const approvalMutation = useMutation({
    mutationFn: ({ decision, notes }: { decision: WorkItemApprovalDecision; notes?: string }) =>
      resolveWorkItemApproval(workItem.approvals?.[0]?.id || '', {
        decision,
        resolvedBy: 'D3n13r',
        notes,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast('Approval decision recorded')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to resolve approval', {
        type: 'error',
      })
    },
  })

  const lifecycleMutation = useMutation({
    mutationFn: ({ action, notes }: { action: WorkItemLifecycleAction; notes?: string }) =>
      applyWorkItemLifecycleAction(workItemId, {
        action,
        actor: 'D3n13r',
        notes,
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKey, {
        workItem: result.workItem,
        project: result.project,
      })
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      setCancelReason('')
      setShowCancelInput(false)
      toast('Lifecycle action applied')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to apply lifecycle action', {
        type: 'error',
      })
    },
  })

  const recoveryMutation = useMutation({
    mutationFn: ({
      action,
      attentionItemId,
    }: {
      action: WorkItemRecoveryAction
      attentionItemId: string
    }) =>
      executeWorkItemRecoveryAction(
        workItemId,
        toRecoveryActionInput(action, attentionItemId, WORK_ITEM_RECOVERY_DEFAULT_NOTES[action.type]),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      await queryClient.invalidateQueries({ queryKey: attentionQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['dashboard', 'mission-control', 'attention-queue'] })
      toast('Recovery action applied')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to apply recovery action', {
        type: 'error',
      })
    },
  })

  const planningDetailsMutation = useMutation({
    mutationFn: ({
      acceptanceCriteria,
      criteriaStatus,
      notes,
    }: {
      acceptanceCriteria: Array<string>
      criteriaStatus: Array<WorkItemCriterionStatus>
      notes: Array<string>
    }) =>
      updateWorkItem(workItemId, {
        acceptanceCriteria,
        criteriaStatus,
        notes,
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKey, result)
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      setIsEditingPlanningDetails(false)
      toast('Planning details saved')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to save planning details', {
        type: 'error',
      })
    },
  })

  const plannerPrepareMutation = useMutation({
    mutationFn: () => prepareWorkItemWithPlanner(workItemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast('Planner enrichment requested')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to prepare with Planner', {
        type: 'error',
      })
    },
  })

  const plannerAcceptMutation = useMutation({
    mutationFn: (draftId: string) => acceptPlanningDraft(draftId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast('Planner draft accepted')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to accept planner draft', {
        type: 'error',
      })
    },
  })

  const plannerRevisionMutation = useMutation({
    mutationFn: ({ draftId, parseError }: { draftId: string; parseError?: string }) =>
      updatePlanningDraft(draftId, {
        status: 'revision_requested',
        parseError,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast('Planner revision requested')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to request planner revision', {
        type: 'error',
      })
    },
  })

  const criteriaStatusMutation = useMutation({
    mutationFn: (criteriaStatus: Array<WorkItemCriterionStatus>) =>
      updateWorkItem(workItemId, {
        criteriaStatus,
      }),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKey, result)
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast('Acceptance criteria progress updated')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to update acceptance criteria progress', {
        type: 'error',
      })
    },
  })

  function startEditingPlanningDetails() {
    if (!workItem) return
    setAcceptanceCriteriaDraft(stringifyWorkItemDetailListDraft(workItem.acceptanceCriteria))
    setNotesDraft(stringifyWorkItemDetailListDraft(workItem.notes))
    setIsEditingPlanningDetails(true)
  }

  function cancelEditingPlanningDetails() {
    setIsEditingPlanningDetails(false)
    setAcceptanceCriteriaDraft('')
    setNotesDraft('')
  }

  function savePlanningDetails() {
    const acceptanceCriteria = parseWorkItemDetailListDraft(acceptanceCriteriaDraft)
    const nextCriteriaStatus = buildWorkItemAcceptanceCriteriaStatus(
      acceptanceCriteria,
      workItem?.criteriaStatus ?? [],
    )

    planningDetailsMutation.mutate({
      acceptanceCriteria,
      criteriaStatus: nextCriteriaStatus,
      notes: parseWorkItemDetailListDraft(notesDraft),
    })
  }

  function toggleAcceptanceCriterion(index: number) {
    const criterion = acceptanceCriteriaStatus[index]
    if (!criterion) return

    const nextStatus = acceptanceCriteriaStatus.map((item, itemIndex) =>
      itemIndex === index ? { ...item, met: !item.met } : item,
    )

    criteriaStatusMutation.mutate(nextStatus)
  }

  const deleteMutation = useMutation({
    mutationFn: deleteWorkItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast('Work item deleted')
      window.location.href = `/projects/${projectId}`
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to delete work item', {
        type: 'error',
      })
    },
  })

  const payload = workItemQuery.data
  const workItem = payload?.workItem ?? null
  const project = payload?.project ?? null
  const execution = payload?.execution ?? syncMutation.data?.execution ?? null
  const executionSyncWarning = getWorkItemExecutionSyncWarningMessage(
    payload?.executionSyncWarning ?? syncMutation.data?.executionSyncWarning,
  )
  const [isEditingPlanningDetails, setIsEditingPlanningDetails] = useState(false)
  const [acceptanceCriteriaDraft, setAcceptanceCriteriaDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [showCancelInput, setShowCancelInput] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [isAddingLabel, setIsAddingLabel] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const labelMutation = useMutation({
    mutationFn: (labels: Array<string>) =>
      updateWorkItem(workItem.id, { labels }).then(() => queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast('Labels updated')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to update labels', {
        type: 'error',
      })
    },
  })
  const primaryLaunchLabel = getWorkItemPrimaryLaunchLabel({
    phase: workItem?.phase,
    status: workItem?.status ?? 'ready',
  })
  const lifecycleActions = workItem
    ? getAvailableWorkItemLifecycleActions({ status: workItem.status, phase: workItem.phase })
    : []
  const acceptanceCriteriaStatus = workItem
    ? buildWorkItemAcceptanceCriteriaStatus(workItem.acceptanceCriteria, workItem.criteriaStatus ?? [])
    : []
  const acceptanceCriteriaProgress = getWorkItemAcceptanceCriteriaProgress(acceptanceCriteriaStatus)
  const acceptanceCriteriaProgressLabel =
    acceptanceCriteriaProgress.totalCount > 0
      ? getWorkItemAcceptanceCriteriaProgressLabel(acceptanceCriteriaProgress)
      : ''
  const operatorGuidance = workItem
    ? getWorkItemOperatorGuidance({
        status: workItem.status,
        phase: workItem.phase,
        missionState: workItem.missionState,
        riskLevel: workItem.riskLevel,
        blockedReason: workItem.blockedReason,
        acceptanceCriteriaProgress,
      })
    : ''
  const executionSummary = getWorkItemExecutionSummary({
    missionState: workItem?.missionState,
    latestRunStatus: execution?.latestRun?.status ?? null,
  })
  const approvalSummary = getWorkItemApprovalSummary(workItem?.approvals ?? [])
  const recoveryPanelItems = getWorkItemRecoveryPanelItems(
    (attentionQuery.data?.items ?? []).filter((item) => item.workItemId === workItemId),
  )
  const latestPlanningDraft: PlanningDraftRecord | null = workItem?.latestPlanningDraft ?? null
  const planningDraftStatusLabel = getPlanningDraftStatusLabel(latestPlanningDraft?.status)
  const planningDraftGuidance = getPlanningDraftGuidance(latestPlanningDraft?.status)
  const planningDiff = workItem
    ? buildPlanningDraftDiff(workItem, latestPlanningDraft?.structuredOutput)
    : []
  const canLaunchBuild = workItem
    ? canLaunchBuildFromPlanningState(workItem, latestPlanningDraft)
    : true
  const isBuildLaunchAction =
    primaryLaunchLabel === 'Launch Build' || primaryLaunchLabel === 'Relaunch Build'
  const profileReadinessDecision = getWorkItemProfileReadinessDecision(
    profileReadinessQuery.data?.report,
    workItem?.phase,
  )
  const profileReadinessAdvisory = getWorkItemProfileReadinessAdvisory(profileReadinessDecision)
  const profileReadinessIsWarning =
    profileReadinessDecision?.status === 'missing' || profileReadinessDecision?.status === 'unknown'

  useEffect(() => {
    if (!executionSyncWarning) return
    toast(executionSyncWarning, { type: 'warning' })
  }, [executionSyncWarning])

  if (workItemQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-primary-500">
        Loading work item…
      </div>
    )
  }

  if (!workItem) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-8 text-center">
          <h2 className="text-xl font-semibold text-ink">Work item not found</h2>
          <p className="mt-2 text-sm text-[var(--theme-muted)]">
            The requested work item could not be loaded.
          </p>
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--theme-accent)] px-4 py-2 text-sm font-medium text-white"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            Back to Project
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        {executionSyncWarning ? (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <div className="font-semibold">{WORK_ITEM_EXECUTION_SYNC_WARNING_TITLE}</div>
            <div className="mt-1">{executionSyncWarning}</div>
          </div>
        ) : null}
        <header className={WORK_ITEM_DETAIL_HEADER_CLASS}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3 min-w-0">
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-text)]"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                Back to {project?.name || 'Project'}
              </Link>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge>{WORK_ITEM_STATUS_LABELS[workItem.status]}</Badge>
                  {workItem.phase ? <Badge>{WORK_ITEM_PHASE_LABELS[workItem.phase]}</Badge> : null}
                  <Badge>{WORK_ITEM_PRIORITY_LABELS[workItem.priority]}</Badge>
                  <Badge>{WORK_ITEM_RISK_LEVEL_LABELS[workItem.riskLevel]}</Badge>
                  {workItem.assignedProfile ? <Badge>{workItem.assignedProfile}</Badge> : null}
                  {workItem.labels.map((label) => (
                    <span key={label} className="inline-flex items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-0.5 text-[11px] font-medium text-[var(--theme-muted)]">{label}</span>
                  ))}
                </div>
                <h1 className="text-2xl font-medium text-ink">{workItem.title}</h1>
                <p className="max-w-3xl text-sm text-[var(--theme-muted)]">
                  {workItem.description || 'No work item description yet.'}
                </p>
                <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                    {WORK_ITEM_DETAIL_ACTION_GROUP_TITLES.operator}
                  </div>
                  <div className="mt-2 text-sm text-[var(--theme-text)]">{operatorGuidance}</div>
                </div>
              </div>
            </div>

            <div className="space-y-3 lg:max-w-[28rem]">
              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  {WORK_ITEM_DETAIL_ACTION_GROUP_TITLES.operator}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {lifecycleActions.map((action) => {
                    if (action === 'cancel' && showCancelInput) {
                      return (
                        <div key="cancel-input" className="flex w-full flex-col gap-2">
                          <input
                            type="text"
                            value={cancelReason}
                            onChange={(event) => setCancelReason(event.target.value)}
                            placeholder="Why are you cancelling this work item?"
                            className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25"
                            autoFocus
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                lifecycleMutation.mutate({ action: 'cancel', notes: cancelReason || undefined })
                              }}
                              disabled={lifecycleMutation.isPending || !cancelReason.trim()}
                              className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                            >
                              {lifecycleMutation.isPending ? 'Cancelling…' : 'Confirm Cancel'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowCancelInput(false)
                                setCancelReason('')
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]/80"
                            >
                              Back
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <button
                        key={action}
                        type="button"
                        onClick={() => {
                          if (action === 'cancel') {
                            setShowCancelInput(true)
                          } else {
                            lifecycleMutation.mutate({ action })
                          }
                        }}
                        disabled={lifecycleMutation.isPending}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                          action === 'cancel'
                            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                            : 'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card)]/80'
                        }`}
                      >
                        {lifecycleMutation.isPending ? 'Applying…' : getWorkItemLifecycleActionLabel(action)}
                      </button>
                    )
                  })}
                  {lifecycleActions.length === 0 ? (
                    <span className="text-sm text-[var(--theme-muted)]">
                      No workflow transition is available for the current phase/status.
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  {WORK_ITEM_DETAIL_ACTION_GROUP_TITLES.execution}
                </div>
                <div className="mt-2 text-sm text-[var(--theme-text)]">{executionSummary}</div>
                <div
                  className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                    profileReadinessIsWarning
                      ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                      : 'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)]'
                  }`}
                >
                  <div className="font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                    {WORK_ITEM_PROFILE_READINESS_PREFLIGHT_TITLE}
                  </div>
                  <div className="mt-1 text-[var(--theme-text)]">{profileReadinessAdvisory}</div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void workItemQuery.refetch()
                      void profileReadinessQuery.refetch()
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]/80"
                  >
                    <HugeiconsIcon icon={RefreshIcon} size={14} />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]/80 disabled:opacity-60"
                  >
                    <HugeiconsIcon icon={RefreshIcon} size={14} />
                    {syncMutation.isPending ? 'Syncing…' : 'Sync Execution'}
                  </button>
                  <button
                    type="button"
                    onClick={() => launchMutation.mutate()}
                    disabled={launchMutation.isPending || (isBuildLaunchAction && !canLaunchBuild)}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    <HugeiconsIcon icon={PlayIcon} size={14} />
                    {launchMutation.isPending ? 'Launching…' : primaryLaunchLabel}
                  </button>
                  <a
                    href={buildWorkItemConductorHref(workItem.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]/80"
                  >
                    {WORK_ITEM_DETAIL_OPEN_CONDUCTOR_LABEL}
                  </a>
                </div>
                {isBuildLaunchAction && !canLaunchBuild ? (
                  <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Build launch is gated until this rough idea is prepared by Planner and accepted.
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  Approvals Attention
                </div>
                <div className="mt-2 text-sm text-[var(--theme-text)]">{approvalSummary}</div>
              </div>

              {recoveryPanelItems.length > 0 ? (
                <Panel title={WORK_ITEM_RECOVERY_PANEL_TITLE}>
                  <div className="space-y-3">
                    {recoveryPanelItems.map((item) => (
                      <div
                        key={item.attentionItemId}
                        className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-3 text-sm text-[var(--theme-text)]"
                      >
                        <div className="font-semibold text-ink">{item.title}</div>
                        <div className="mt-1 text-xs text-[var(--theme-muted)]">{item.detail}</div>
                        <div className="mt-3 space-y-2">
                          {item.actions.map((action) => (
                            <div key={`${item.attentionItemId}-${action.type}-${action.phase ?? 'none'}`} className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="max-w-[20rem]">
                                  <div className="text-xs font-semibold text-ink">
                                    {getWorkItemRecoveryActionButtonLabel(action)}
                                  </div>
                                  <div className="mt-1 text-[11px] text-[var(--theme-muted)]">{action.description}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => recoveryMutation.mutate({ action, attentionItemId: item.attentionItemId })}
                                  disabled={recoveryMutation.isPending}
                                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                                    action.destructive
                                      ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                      : 'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)] hover:bg-[var(--theme-card)]/80'
                                  }`}
                                >
                                  {recoveryMutation.isPending ? 'Applying…' : getWorkItemRecoveryActionButtonLabel(action)}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="rounded-xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-xs text-[var(--theme-muted)]">
                      Recovery actions are explicit operator controls. No automatic retry runs until you click an action.
                    </div>
                  </div>
                </Panel>
              ) : null}

              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  {WORK_ITEM_DETAIL_ACTION_GROUP_TITLES.administration}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(workItem.id)}
                    disabled={deleteMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  Labels
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {workItem.labels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-accent)]/30 bg-[var(--theme-accent)]/10 px-2.5 py-1 text-xs font-medium text-[var(--theme-text)]"
                    >
                      {label}
                      <button
                        type="button"
                        onClick={() =>
                          labelMutation.mutate({
                            labels: workItem.labels.filter((l) => l !== label),
                          })
                        }
                        disabled={labelMutation.isPending}
                        className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[var(--theme-muted)] transition-colors hover:bg-red-500/20 hover:text-red-400 disabled:opacity-40"
                        aria-label={`Remove label ${label}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {isAddingLabel ? (
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={newLabel}
                        onChange={(event) => setNewLabel(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && newLabel.trim()) {
                            labelMutation.mutate({
                              labels: [...workItem.labels, newLabel.trim()],
                            })
                            setNewLabel('')
                            setIsAddingLabel(false)
                          } else if (event.key === 'Escape') {
                            setIsAddingLabel(false)
                            setNewLabel('')
                          }
                        }}
                        placeholder="label"
                        className="w-24 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2.5 py-1 text-xs font-medium text-[var(--theme-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newLabel.trim()) {
                            labelMutation.mutate({
                              labels: [...workItem.labels, newLabel.trim()],
                            })
                            setNewLabel('')
                            setIsAddingLabel(false)
                          } else {
                            setIsAddingLabel(false)
                            setNewLabel('')
                          }
                        }}
                        disabled={labelMutation.isPending || !newLabel.trim()}
                        className="rounded-full bg-[var(--theme-accent)] px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingLabel(false)
                          setNewLabel('')
                        }}
                        className="rounded-full border border-[var(--theme-border)] px-2.5 py-1 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddingLabel(true)}
                      className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--theme-border)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--theme-muted)] transition-colors hover:border-[var(--theme-accent)]/50 hover:text-[var(--theme-text)]"
                    >
                      + Add Label
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
          <div className="space-y-4">
            <Panel title="Mission Control Summary">
              <dl className="grid gap-3 md:grid-cols-2">
                <Detail label="Project" value={project?.name || 'Unknown project'} />
                <Detail label="Repo Snapshot" value={workItem.repoPathSnapshot} />
                <Detail label="Mission ID" value={workItem.missionId || '—'} />
                <Detail label="Hermes Job ID" value={workItem.missionJobId || '—'} />
                <Detail label="Hermes Job Name" value={workItem.missionJobName || '—'} />
                <Detail label="Session Prefix" value={workItem.missionSessionKeyPrefix || '—'} />
                <Detail label="Mission Link" value={workItem.missionLink || '—'} />
                <Detail label="Mission State" value={workItem.missionState || 'unknown'} />
                <Detail label="Mission Last Run" value={workItem.missionLastRunAt || '—'} />
                <Detail label="Mission Last Error" value={workItem.missionLastError || '—'} />
                <Detail
                  label={WORK_ITEM_BLOCKED_REASON_FIELD_LABEL}
                  value={
                    workItem.blockedReason
                      ? WORK_ITEM_BLOCKED_REASON_LABELS[workItem.blockedReason]
                      : '—'
                  }
                />
                <Detail label="Blocked guidance" value={getWorkItemBlockedReasonGuidance(workItem.blockedReason)} />
                <Detail label="Assigned Profile" value={workItem.assignedProfile || '—'} />
                <Detail label="Risk Level" value={WORK_ITEM_RISK_LEVEL_LABELS[workItem.riskLevel]} />
                <Detail label="Plan File Path" value={workItem.planFilePath || '—'} />
                {workItem.reviewJobId ? (
                  <>
                    <Detail label="Planner Review Job" value={workItem.reviewJobId} />
                    <Detail label="Planner Review State" value={workItem.reviewState || 'scheduled'} />
                    {workItem.reviewDecision ? (
                      <Detail
                        label="Planner Review Decision"
                        value={reviewDecisionLabel(workItem.reviewDecision)}
                      />
                    ) : null}
                    <Detail label="Review Confidence" value={workItem.reviewDecisionConfidence || '—'} />
                    <Detail
                      label="Review Quality Gate"
                      value={reviewQualityGateLabel(workItem.reviewQualityGateStatus)}
                    />
                    <Detail
                      label="Review Summary"
                      value={workItem.reviewDecisionSummary || '—'}
                    />
                    <Detail label="Parser Error" value={workItem.reviewParserError || '—'} />
                    <Detail
                      label="Missing Evidence"
                      value={workItem.reviewMissingEvidence?.join(', ') || '—'}
                    />
                    <Detail
                      label="Gate Reasons"
                      value={workItem.reviewQualityGateReasons?.join('; ') || '—'}
                    />
                    {getReviewEvidenceAttentionMessage(workItem) ? (
                      <Detail
                        label="Review Attention"
                        value={getReviewEvidenceAttentionMessage(workItem) ?? '—'}
                      />
                    ) : null}
                  </>
                ) : null}
                <Detail label="Launch Sessions" value={workItem.sessionKeys.join(', ') || '—'} />
                <Detail label="Created" value={workItem.createdAt} />
                <Detail label="Updated" value={workItem.updatedAt} />
              </dl>
            </Panel>

            <Panel title="Planner Enrichment">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <span className="inline-flex items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2.5 py-1 text-xs font-medium text-[var(--theme-text)]">
                    {planningDraftStatusLabel}
                  </span>
                  <p className="text-sm text-[var(--theme-muted)]">{planningDraftGuidance}</p>
                </div>
                {!latestPlanningDraft ? (
                  <button
                    type="button"
                    onClick={() => plannerPrepareMutation.mutate()}
                    disabled={plannerPrepareMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {plannerPrepareMutation.isPending ? 'Preparing…' : 'Prepare with Planner'}
                  </button>
                ) : null}
              </div>

              {latestPlanningDraft ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-2 text-sm text-[var(--theme-text)] md:grid-cols-2">
                    <Detail label="Draft ID" value={latestPlanningDraft.id} />
                    <Detail label="Planner Job ID" value={latestPlanningDraft.plannerJobId || '—'} />
                    <Detail label="Planner Job Name" value={latestPlanningDraft.plannerJobName || '—'} />
                    <Detail label="Planner Session" value={latestPlanningDraft.plannerSessionKey || '—'} />
                    <Detail
                      label="Planner Session Prefix"
                      value={latestPlanningDraft.plannerSessionKeyPrefix || '—'}
                    />
                    <Detail label="Planner Profile" value={latestPlanningDraft.plannerProfile || '—'} />
                    <Detail label="Draft Updated" value={latestPlanningDraft.updatedAt} />
                    <Detail label="Accepted At" value={latestPlanningDraft.acceptedAt || '—'} />
                    <Detail label="Plan File Path" value={latestPlanningDraft.planFilePath || '—'} />
                  </div>

                  {latestPlanningDraft.status === 'structured_ready' ? (
                    <>
                      {planningDiff.length === 0 ? (
                        <EmptyCopy>No structured changes detected.</EmptyCopy>
                      ) : (
                        <ul className="space-y-2">
                          {planningDiff.map((entry) => (
                            <li
                              key={entry.label}
                              className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2"
                            >
                              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                                {entry.label}
                              </div>
                              <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                                <div>
                                  <div className="text-[11px] uppercase tracking-wide text-[var(--theme-muted)]">
                                    Current
                                  </div>
                                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[var(--theme-text)]">
                                    {entry.before}
                                  </pre>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-wide text-[var(--theme-muted)]">
                                    Planner draft
                                  </div>
                                  <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-[var(--theme-text)]">
                                    {entry.after}
                                  </pre>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => plannerAcceptMutation.mutate(latestPlanningDraft.id)}
                          disabled={plannerAcceptMutation.isPending}
                          className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {plannerAcceptMutation.isPending ? 'Accepting…' : 'Accept Planner Draft'}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {latestPlanningDraft.status === 'parse_failed' ? (
                    <div className="space-y-3">
                      {latestPlanningDraft.parseError ? (
                        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                          {latestPlanningDraft.parseError}
                        </div>
                      ) : null}
                      {latestPlanningDraft.parseWarnings.length > 0 ? (
                        <ul className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                          {latestPlanningDraft.parseWarnings.map((warning) => (
                            <li key={warning}>• {warning}</li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            plannerRevisionMutation.mutate({
                              draftId: latestPlanningDraft.id,
                              parseError:
                                latestPlanningDraft.parseError ||
                                'Revision requested: please return valid structured JSON output.',
                            })
                          }
                          disabled={plannerRevisionMutation.isPending}
                          className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)] disabled:opacity-60"
                        >
                          {plannerRevisionMutation.isPending ? 'Requesting…' : 'Request Revision'}
                        </button>
                        <button
                          type="button"
                          onClick={() => plannerPrepareMutation.mutate()}
                          disabled={plannerPrepareMutation.isPending}
                          className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                          {plannerPrepareMutation.isPending ? 'Preparing…' : 'Relaunch Planner'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Panel>

            <Panel title="Acceptance Criteria">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="max-w-2xl text-sm text-[var(--theme-muted)]">
                    {WORK_ITEM_DETAIL_ACCEPTANCE_CRITERIA_HELP_TEXT}
                  </p>
                  {acceptanceCriteriaProgressLabel ? (
                    <div className="inline-flex items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2.5 py-1 text-xs font-medium text-[var(--theme-text)]">
                      {acceptanceCriteriaProgressLabel}
                    </div>
                  ) : null}
                </div>
                {isEditingPlanningDetails ? null : (
                  <button
                    type="button"
                    onClick={startEditingPlanningDetails}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]"
                  >
                    Edit Planning Details
                  </button>
                )}
              </div>
              {isEditingPlanningDetails ? (
                <div className="space-y-3">
                  <textarea
                    value={acceptanceCriteriaDraft}
                    onChange={(event) => setAcceptanceCriteriaDraft(event.target.value)}
                    rows={6}
                    placeholder="One acceptance criterion per line"
                    className="min-h-[10rem] w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-3 text-sm text-[var(--theme-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25"
                  />
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEditingPlanningDetails}
                      className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={savePlanningDetails}
                      disabled={planningDetailsMutation.isPending}
                      className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {planningDetailsMutation.isPending ? 'Saving…' : 'Save Planning Details'}
                    </button>
                  </div>
                </div>
              ) : acceptanceCriteriaStatus.length === 0 ? (
                <EmptyCopy>No acceptance criteria recorded yet.</EmptyCopy>
              ) : (
                <ul className="space-y-2">
                  {acceptanceCriteriaStatus.map((criterion, index) => (
                    <li key={`${criterion.text}-${index}`}>
                      <button
                        type="button"
                        onClick={() => toggleAcceptanceCriterion(index)}
                        disabled={criteriaStatusMutation.isPending}
                        className={`flex w-full items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60 ${
                          criterion.met
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-text)] hover:bg-[var(--theme-card)]'
                        }`}
                      >
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded border text-xs ${
                            criterion.met
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)]'
                          }`}
                        >
                          {criterion.met ? '✓' : ''}
                        </span>
                        <span>{criterion.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Operator Notes">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-2xl text-sm text-[var(--theme-muted)]">
                  {WORK_ITEM_DETAIL_NOTES_HELP_TEXT}
                </p>
                {isEditingPlanningDetails ? null : (
                  <button
                    type="button"
                    onClick={startEditingPlanningDetails}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]"
                  >
                    Edit Planning Details
                  </button>
                )}
              </div>
              {isEditingPlanningDetails ? (
                <div className="space-y-3">
                  <textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.target.value)}
                    rows={8}
                    placeholder="One planning note per line"
                    className="min-h-[12rem] w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-3 text-sm text-[var(--theme-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25"
                  />
                  <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-xs text-[var(--theme-muted)]">
                    Use this for planning output, decisions, open questions, or operator handoff notes.
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEditingPlanningDetails}
                      className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={savePlanningDetails}
                      disabled={planningDetailsMutation.isPending}
                      className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {planningDetailsMutation.isPending ? 'Saving…' : 'Save Planning Details'}
                    </button>
                  </div>
                </div>
              ) : workItem.notes.length === 0 ? (
                <EmptyCopy>No notes recorded yet.</EmptyCopy>
              ) : (
                <ul className="space-y-2">
                  {workItem.notes.map((note, index) => (
                    <li
                      key={`${note}-${index}`}
                      className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-sm text-[var(--theme-text)]"
                    >
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Delivery Evidence">
              <div className="space-y-3 text-sm text-[var(--theme-text)]">
                <EvidenceRow
                  icon={GitBranchIcon}
                  label="Branch"
                  value={workItem.branchName || 'No branch recorded'}
                />
                <EvidenceRow
                  icon={GithubIcon}
                  label="PR URL"
                  value={workItem.prUrl || 'No PR recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Mission Link"
                  value={workItem.missionLink || 'No mission link recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Hermes Job ID"
                  value={workItem.missionJobId || 'No job ID recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Hermes Job Name"
                  value={workItem.missionJobName || 'No job name recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Session Prefix"
                  value={workItem.missionSessionKeyPrefix || 'No session prefix recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Plan File"
                  value={workItem.planFilePath || 'No plan file recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Mission State"
                  value={workItem.missionState || 'unknown'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Mission Last Run"
                  value={workItem.missionLastRunAt || 'No run recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Mission Last Error"
                  value={workItem.missionLastError || 'No errors recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Session Keys"
                  value={
                    workItem.sessionKeys.length > 0
                      ? workItem.sessionKeys.join(', ')
                      : 'No linked sessions yet'
                  }
                />
              </div>
            </Panel>

            <Panel title="Execution Activity">
              <p className="text-sm text-[var(--theme-muted)]">{executionSummary}</p>
              <div className="mt-3 space-y-3 text-sm text-[var(--theme-text)]">
                <Detail label="Latest Session Key" value={execution?.latestSessionKey || '—'} />
                <Detail label="Latest Run ID" value={execution?.latestRun?.id || '—'} />
                <Detail label="Latest Run Status" value={execution?.latestRun?.status || '—'} />
                <Detail label="Latest Run Started" value={execution?.latestRun?.startedAt || '—'} />
                <Detail label="Latest Run Finished" value={execution?.latestRun?.finishedAt || '—'} />
                <Detail label="Known Runs" value={String(execution?.jobRuns.length ?? 0)} />
              </div>
              {execution?.jobRuns && execution.jobRuns.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {execution.jobRuns.slice(0, 5).map((run) => (
                    <li key={run.id} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-3 text-sm text-[var(--theme-text)]">
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-[var(--theme-muted)]">
                        <span>{run.status}</span>
                        <span>{run.id}</span>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-[var(--theme-muted)]">
                        <div>Started: {run.startedAt || '—'}</div>
                        <div>Finished: {run.finishedAt || '—'}</div>
                        {run.chatSessionKey ? <div>Session: {run.chatSessionKey}</div> : null}
                        {run.error ? <div>Error: {run.error}</div> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-4"><EmptyCopy>No Hermes job runs available yet. Use Sync Execution after launch.</EmptyCopy></div>
              )}
            </Panel>

            <Panel title="Phase History">
              {workItem.history.length === 0 ? (
                <EmptyCopy>No phase history recorded yet.</EmptyCopy>
              ) : (
                <ul className="space-y-2">
                  {workItem.history
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-3 text-sm text-[var(--theme-text)]"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-[var(--theme-muted)]">
                          <span>{entry.action}</span>
                          {entry.phase ? <span>{WORK_ITEM_PHASE_LABELS[entry.phase]}</span> : null}
                          {entry.status ? <span>{WORK_ITEM_STATUS_LABELS[entry.status]}</span> : null}
                          {entry.profile ? <span>{entry.profile}</span> : null}
                        </div>
                        <div className="mt-2 font-medium text-ink">{entry.note}</div>
                        <div className="mt-2 space-y-1 text-xs text-[var(--theme-muted)]">
                          {entry.missionId ? <div>Mission: {entry.missionId}</div> : null}
                          {entry.sessionKey ? <div>Session: {entry.sessionKey}</div> : null}
                          {entry.sessionKeyPrefix ? <div>Session Prefix: {entry.sessionKeyPrefix}</div> : null}
                          <div>{entry.createdAt}</div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>

            <Panel title="Approvals">
              <p className="text-sm text-[var(--theme-muted)]">{approvalSummary}</p>
              <div className="mb-3 mt-3 flex justify-end">
                <Link
                  to="/projects/approvals"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]"
                >
                  Open Approvals Inbox
                </Link>
              </div>
              {!workItem.approvals || workItem.approvals.length === 0 ? (
                <EmptyCopy>No approvals recorded yet.</EmptyCopy>
              ) : (
                <div className="space-y-3">
                  {workItem.approvals.map((approval) => (
                    <div
                      key={approval.id}
                      className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-3 text-sm text-[var(--theme-text)]"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-[var(--theme-muted)]">
                        <span>{approval.phase}</span>
                        <span>{approval.status}</span>
                        <span>requested by {approval.requestedBy}</span>
                      </div>
                      {approval.notes ? (
                        <div className="mt-2 font-medium text-ink">{approval.notes}</div>
                      ) : null}
                      <div className="mt-2 space-y-1 text-xs text-[var(--theme-muted)]">
                        <div>Requested: {approval.requestedAt}</div>
                        {approval.resolvedAt ? <div>Resolved: {approval.resolvedAt}</div> : null}
                        {approval.resolvedBy ? <div>Resolver: {approval.resolvedBy}</div> : null}
                        {approval.resolutionNotes ? <div>Resolution Notes: {approval.resolutionNotes}</div> : null}
                      </div>
                      {approval.status === 'pending' ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => approvalMutation.mutate({ decision: 'approved' })}
                            disabled={approvalMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => approvalMutation.mutate({ decision: 'changes_requested' })}
                            disabled={approvalMutation.isPending}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60"
                          >
                            Request Changes
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Artifacts">
              {workItem.artifactPaths.length === 0 ? (
                <EmptyCopy>No artifacts recorded yet.</EmptyCopy>
              ) : (
                <ul className="space-y-2">
                  {workItem.artifactPaths.map((artifactPath) => (
                    <li
                      key={artifactPath}
                      className="break-all rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-sm text-[var(--theme-text)]"
                    >
                      {artifactPath}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={WORK_ITEM_DETAIL_PANEL_CLASS}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
      <div className="text-xs uppercase tracking-wide text-[var(--theme-muted)]">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-ink">{value}</div>
    </div>
  )
}

function EvidenceRow({
  icon,
  label,
  value,
}: {
  icon: unknown
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--theme-muted)]">
        <HugeiconsIcon icon={icon as never} size={14} />
        {label}
      </div>
      <div className="mt-2 break-all text-sm font-medium text-ink">{value}</div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2.5 py-1 text-xs font-medium text-[var(--theme-text)]">
      {children}
    </span>
  )
}

function EmptyCopy({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-6 text-center text-sm text-[var(--theme-muted)]">
      {children}
    </div>
  )
}
