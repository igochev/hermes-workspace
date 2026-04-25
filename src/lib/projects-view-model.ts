import type {
  ProjectSummary,
  WorkItemPriority,
  WorkItemRecord,
  WorkItemRiskLevel,
  WorkItemStatus,
} from './projects-api'

export type ProjectBoardFilter = 'all' | 'attention' | 'execution' | 'approvals'
export type WorkItemUrgencyTone = 'default' | 'warning' | 'danger'
export type ProjectBoardUrgencySummary = {
  pendingApprovals: number
  changesRequested: number
  runningMissions: number
  failedMissions: number
  blocked: number
}

export const PROJECT_BOARD_FLOW_ORDER: Array<WorkItemStatus> = [
  'inbox',
  'ready',
  'active',
  'blocked',
  'done',
  'cancelled',
]

export const PROJECT_STATUS_ORDER = PROJECT_BOARD_FLOW_ORDER

export const PROJECT_ACTIVE_WIP_WARNING_THRESHOLD = 3

export function isProjectWipHigh(
  activeCount: number,
  threshold: number = PROJECT_ACTIVE_WIP_WARNING_THRESHOLD,
): boolean {
  return activeCount >= threshold
}

export function buildProjectWipHint(
  activeCount: number,
  threshold: number = PROJECT_ACTIVE_WIP_WARNING_THRESHOLD,
): string | null {
  return isProjectWipHigh(activeCount, threshold)
    ? 'WIP is high; finish one active item first.'
    : null
}

const PRIORITY_RANK: Record<WorkItemPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const RISK_LEVEL_RANK: Record<WorkItemRiskLevel, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export function buildProjectStatsLine(project: ProjectSummary): string {
  return `${project.workItemCount} work items · ${project.activeWorkItemCount} active · ${project.doneWorkItemCount} done`
}

export function groupWorkItemsByStatus(workItems: Array<WorkItemRecord>): Record<WorkItemStatus, Array<WorkItemRecord>> {
  const grouped: Record<WorkItemStatus, Array<WorkItemRecord>> = {
    inbox: [],
    ready: [],
    active: [],
    blocked: [],
    done: [],
    cancelled: [],
  }

  for (const workItem of workItems) {
    grouped[workItem.status].push(workItem)
  }

  return grouped
}

export function buildProjectBoardUrgencySummary(
  workItems: Array<WorkItemRecord>,
): ProjectBoardUrgencySummary {
  return workItems.reduce<ProjectBoardUrgencySummary>(
    (summary, workItem) => {
      const latestApproval = workItem.approvals?.[0]
      if (latestApproval?.status === 'pending') {
        summary.pendingApprovals += 1
      }
      if (latestApproval?.status === 'changes_requested') {
        summary.changesRequested += 1
      }
      if (workItem.missionState === 'running') {
        summary.runningMissions += 1
      }
      if (workItem.missionState === 'failed') {
        summary.failedMissions += 1
      }
      if (workItem.status === 'blocked') {
        summary.blocked += 1
      }
      return summary
    },
    {
      pendingApprovals: 0,
      changesRequested: 0,
      runningMissions: 0,
      failedMissions: 0,
      blocked: 0,
    },
  )
}

export function filterWorkItemsForProjectBoard(
  workItems: Array<WorkItemRecord>,
  filter: ProjectBoardFilter,
): Array<WorkItemRecord> {
  switch (filter) {
    case 'attention':
      return workItems.filter((workItem) => isWorkItemNeedingAttention(workItem))
    case 'execution':
      return workItems.filter((workItem) =>
        workItem.missionState === 'running' ||
        workItem.missionState === 'scheduled' ||
        workItem.missionState === 'failed',
      )
    case 'approvals':
      return workItems.filter((workItem) => hasApprovalAttention(workItem))
    case 'all':
    default:
      return workItems
  }
}

export function sortWorkItemsForProjectBoard(workItems: Array<WorkItemRecord>): Array<WorkItemRecord> {
  return [...workItems].sort((left, right) => {
    const attentionDelta = getWorkItemAttentionRank(left) - getWorkItemAttentionRank(right)
    if (attentionDelta !== 0) return attentionDelta

    const priorityDelta = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    if (priorityDelta !== 0) return priorityDelta

    const riskDelta = RISK_LEVEL_RANK[left.riskLevel] - RISK_LEVEL_RANK[right.riskLevel]
    if (riskDelta !== 0) return riskDelta

    const updatedDelta = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    if (updatedDelta !== 0) return updatedDelta

    const createdDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt)
    if (createdDelta !== 0) return createdDelta

    return left.title.localeCompare(right.title)
  })
}

export function buildWorkItemOperatorSignals(workItem: WorkItemRecord): Array<string> {
  const signals: Array<string> = []

  const latestApproval = workItem.approvals?.[0]
  if (latestApproval?.status === 'pending') {
    signals.push('Approval pending')
  } else if (latestApproval?.status === 'changes_requested') {
    signals.push('Changes requested')
  }

  if (workItem.missionState === 'running') {
    signals.push('Mission running')
  } else if (workItem.missionState === 'scheduled') {
    signals.push('Mission scheduled')
  } else if (workItem.missionState === 'failed') {
    signals.push('Mission failed')
    if (workItem.status === 'blocked') {
      signals.push('Recovery ready')
    }
  } else if (workItem.missionState === 'succeeded') {
    signals.push('Mission succeeded')
  }

  if (workItem.sessionKeys.length > 0) {
    signals.push(`${workItem.sessionKeys.length} session${workItem.sessionKeys.length === 1 ? '' : 's'}`)
  }

  if (workItem.phase) {
    signals.push(`${workItem.phase.charAt(0).toUpperCase()}${workItem.phase.slice(1)} phase`)
  }

  return signals
}

export function buildWorkItemRecoveryHint(workItem: WorkItemRecord): string | null {
  const latestApproval = workItem.approvals?.[0]
  if (workItem.status === 'blocked' && workItem.phase === 'build' && workItem.missionState === 'failed') {
    return 'Recovery: Resume Build, then relaunch Build.'
  }
  if (latestApproval?.status === 'changes_requested' && latestApproval.phase === 'review') {
    return 'Recovery: Address review feedback and relaunch Build.'
  }
  return null
}

export function getWorkItemUrgencyTone(workItem: WorkItemRecord): WorkItemUrgencyTone {
  const latestApproval = workItem.approvals?.[0]
  if (workItem.missionState === 'failed' || workItem.status === 'blocked') {
    return 'danger'
  }
  if (
    latestApproval?.status === 'pending' ||
    latestApproval?.status === 'changes_requested' ||
    workItem.missionState === 'running' ||
    workItem.missionState === 'scheduled'
  ) {
    return 'warning'
  }
  return 'default'
}

function hasApprovalAttention(workItem: WorkItemRecord): boolean {
  const latestApproval = workItem.approvals?.[0]
  return latestApproval?.status === 'pending' || latestApproval?.status === 'changes_requested'
}

function isWorkItemNeedingAttention(workItem: WorkItemRecord): boolean {
  return (
    hasApprovalAttention(workItem) ||
    workItem.status === 'blocked' ||
    workItem.missionState === 'running' ||
    workItem.missionState === 'scheduled' ||
    workItem.missionState === 'failed'
  )
}

function getWorkItemAttentionRank(workItem: WorkItemRecord): number {
  const latestApproval = workItem.approvals?.[0]
  if (latestApproval?.status === 'pending') return 0
  if (latestApproval?.status === 'changes_requested') return 1
  if (workItem.missionState === 'failed') return 2
  if (workItem.status === 'blocked') return 3
  if (workItem.missionState === 'running') return 4
  if (workItem.missionState === 'scheduled') return 5
  return 6
}
