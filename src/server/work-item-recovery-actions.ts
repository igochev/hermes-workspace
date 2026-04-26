import type { AttentionQueueItem } from './attention-queue-store'
import type { WorkItemPhase, WorkItemRecord } from './work-items-store'

export type WorkItemRecoveryActionType =
  | 'relaunch_phase'
  | 'return_to_build'
  | 'request_review'
  | 'mark_resolved'
  | 'cancel_work_item'
  | 'dismiss_attention'

export type WorkItemRecoveryAction = {
  type: WorkItemRecoveryActionType
  label: string
  description: string
  phase?: WorkItemPhase
  destructive: boolean
  auditNote: string
}

export type RecommendWorkItemRecoveryActionsInput = {
  attentionItem: AttentionQueueItem
  workItem?: WorkItemRecord | null
}

const PHASE_LABELS: Record<WorkItemPhase, string> = {
  research: 'research',
  build: 'build',
  review: 'review',
  deploy: 'deploy',
}

function recoveryAction(input: WorkItemRecoveryAction): WorkItemRecoveryAction {
  return input
}

function relaunchPhaseAction(phase: WorkItemPhase): WorkItemRecoveryAction {
  const label = PHASE_LABELS[phase]
  return recoveryAction({
    type: 'relaunch_phase',
    phase,
    label: `Relaunch ${label}`,
    description: `Explicitly relaunch the ${label} phase through the existing launch path.`,
    destructive: false,
    auditNote: `Operator requested ${label} relaunch from recovery actions.`,
  })
}

function returnToBuildAction(): WorkItemRecoveryAction {
  return recoveryAction({
    type: 'return_to_build',
    label: 'Return to build',
    description: 'Move the work item back to active build so fixes can continue.',
    destructive: false,
    auditNote: 'Operator returned work item to build from recovery actions.',
  })
}

function requestReviewAction(): WorkItemRecoveryAction {
  return recoveryAction({
    type: 'request_review',
    label: 'Request review',
    description: 'Move build output back into review and request a fresh review approval.',
    destructive: false,
    auditNote: 'Operator requested review from recovery actions.',
  })
}

function markResolvedAction(): WorkItemRecoveryAction {
  return recoveryAction({
    type: 'mark_resolved',
    label: 'Mark externally resolved',
    description: 'Resolve the attention item without pretending the work item itself is done.',
    destructive: false,
    auditNote: 'Operator marked attention externally resolved from recovery actions.',
  })
}

function cancelWorkItemAction(): WorkItemRecoveryAction {
  return recoveryAction({
    type: 'cancel_work_item',
    label: 'Cancel work item',
    description: 'Cancel the work item with an operator-supplied reason.',
    destructive: true,
    auditNote: 'Operator cancelled work item from recovery actions.',
  })
}

function dismissAttentionAction(): WorkItemRecoveryAction {
  return recoveryAction({
    type: 'dismiss_attention',
    label: 'Dismiss attention',
    description: 'Dismiss this attention item only; no work-item lifecycle state changes.',
    destructive: false,
    auditNote: 'Operator dismissed attention from recovery actions.',
  })
}

function canCancel(workItem?: WorkItemRecord | null): boolean {
  return Boolean(workItem && workItem.status !== 'done' && workItem.status !== 'cancelled')
}

function addIfMissing(actions: Array<WorkItemRecoveryAction>, action: WorkItemRecoveryAction): void {
  if (!actions.some((candidate) => candidate.type === action.type && candidate.phase === action.phase)) {
    actions.push(action)
  }
}

export function recommendWorkItemRecoveryActions({
  attentionItem,
  workItem,
}: RecommendWorkItemRecoveryActionsInput): Array<WorkItemRecoveryAction> {
  if (attentionItem.status === 'resolved') return []

  const actions: Array<WorkItemRecoveryAction> = []
  const phase = workItem?.phase

  if (attentionItem.kind === 'mission_failed') {
    if (phase) addIfMissing(actions, relaunchPhaseAction(phase))
    addIfMissing(actions, returnToBuildAction())
  }

  if (attentionItem.kind === 'execution_stale') {
    if (phase) addIfMissing(actions, relaunchPhaseAction(phase))
    addIfMissing(actions, markResolvedAction())
  }

  if (attentionItem.kind === 'review_failed') {
    addIfMissing(actions, returnToBuildAction())
    addIfMissing(actions, requestReviewAction())
  }

  if (attentionItem.kind === 'blocked_work') {
    if (workItem?.phase === 'build') addIfMissing(actions, returnToBuildAction())
    addIfMissing(actions, markResolvedAction())
  }

  if (attentionItem.kind === 'approval_pending') {
    addIfMissing(actions, requestReviewAction())
    addIfMissing(actions, dismissAttentionAction())
  }

  if (attentionItem.kind === 'capacity_exceeded') {
    addIfMissing(actions, markResolvedAction())
  }

  if (canCancel(workItem)) addIfMissing(actions, cancelWorkItemAction())
  addIfMissing(actions, dismissAttentionAction())

  return actions
}
