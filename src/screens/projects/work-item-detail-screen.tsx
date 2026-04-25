'use client'

import { useState } from 'react'
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
  type WorkItemApprovalDecision,
  type WorkItemCriterionStatus,
  type WorkItemRiskLevel,
  WORK_ITEM_PHASE_LABELS,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_RISK_LEVEL_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/projects-api'
import { resolveWorkItemApproval } from '@/lib/work-item-approvals-api'
import { launchWorkItem } from '@/lib/work-item-launch-api'
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
  acceptanceCriteriaProgress?: { metCount: number; totalCount: number }
}): string {
  if (state.status === 'blocked' && state.phase === 'build' && state.missionState === 'failed') {
    return 'This work item is blocked by a failed build mission. Capture fixes, run Resume Build, and relaunch Build to continue delivery.'
  }
  if (state.status === 'blocked') {
    return 'This work item is blocked. Review the latest error or approval feedback, then update notes before relaunching.'
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

  const launchMutation = useMutation({
    mutationFn: () =>
      launchWorkItem(workItemId, {
        phase: workItem?.phase ?? 'build',
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
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
      })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast(
        result.execution.transitionApplied
          ? `Execution synced: ${result.execution.transitionApplied}`
          : `Execution synced: ${result.execution.state}`,
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
  const [isEditingPlanningDetails, setIsEditingPlanningDetails] = useState(false)
  const [acceptanceCriteriaDraft, setAcceptanceCriteriaDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [showCancelInput, setShowCancelInput] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
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
        acceptanceCriteriaProgress,
      })
    : ''
  const executionSummary = getWorkItemExecutionSummary({
    missionState: workItem?.missionState,
    latestRunStatus: execution?.latestRun?.status ?? null,
  })
  const approvalSummary = getWorkItemApprovalSummary(workItem?.approvals ?? [])

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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void workItemQuery.refetch()}
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
                    disabled={launchMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    <HugeiconsIcon icon={PlayIcon} size={14} />
                    {launchMutation.isPending ? 'Launching…' : primaryLaunchLabel}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  Approvals Attention
                </div>
                <div className="mt-2 text-sm text-[var(--theme-text)]">{approvalSummary}</div>
              </div>

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
                <Detail label="Assigned Profile" value={workItem.assignedProfile || '—'} />
                <Detail label="Risk Level" value={WORK_ITEM_RISK_LEVEL_LABELS[workItem.riskLevel]} />
                <Detail label="Plan File Path" value={workItem.planFilePath || '—'} />
                <Detail label="Launch Sessions" value={workItem.sessionKeys.join(', ') || '—'} />
                <Detail label="Created" value={workItem.createdAt} />
                <Detail label="Updated" value={workItem.updatedAt} />
              </dl>
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
