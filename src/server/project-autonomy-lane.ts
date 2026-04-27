import { type ProjectRecord } from './projects-store'
import { type WorkItemPriority, type WorkItemRecord, type WorkItemRiskLevel } from './work-items-store'

export type ProjectLaneSelectionResult = {
  active: WorkItemRecord | null
  next: WorkItemRecord | null
  parked: Array<WorkItemRecord>
  reason: string
}

const ACTIVE_LANE_STATES = new Set(['preparing', 'building', 'reviewing', 'merge_healing'])
const CANDIDATE_STATUSES = new Set(['inbox', 'ready'])
const TERMINAL_STATUSES = new Set(['done', 'cancelled'])

const PRIORITY_RANK: Record<WorkItemPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const RISK_RANK: Record<WorkItemRiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
}

function belongsToProject(project: ProjectRecord, workItem: WorkItemRecord): boolean {
  return workItem.projectId === project.id
}

function isActiveLaneWorkItem(workItem: WorkItemRecord): boolean {
  if (workItem.status === 'blocked' || TERMINAL_STATUSES.has(workItem.status)) return false
  return workItem.status === 'active' || Boolean(workItem.laneState && ACTIVE_LANE_STATES.has(workItem.laneState))
}

function isParkedBlockedItem(workItem: WorkItemRecord): boolean {
  return (
    workItem.status === 'blocked' &&
    workItem.laneState === 'blocked' &&
    Boolean(workItem.laneParkedAt?.trim()) &&
    Boolean(workItem.laneBlockedReason?.trim())
  )
}

function isUnsafeBlockedItem(workItem: WorkItemRecord): boolean {
  return workItem.status === 'blocked' && workItem.laneState === 'blocked' && !isParkedBlockedItem(workItem)
}

function isQueuedCandidate(workItem: WorkItemRecord): boolean {
  if (TERMINAL_STATUSES.has(workItem.status) || workItem.status === 'blocked') return false
  return (
    CANDIDATE_STATUSES.has(workItem.status) ||
    workItem.laneState === 'queued' ||
    (workItem.status === 'inbox' && workItem.phase === 'research')
  )
}

function compareLaneCandidates(a: WorkItemRecord, b: WorkItemRecord): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    RISK_RANK[a.riskLevel] - RISK_RANK[b.riskLevel] ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  )
}

export function selectNextLaneWorkItem(params: {
  project: ProjectRecord
  workItems: WorkItemRecord[]
}): ProjectLaneSelectionResult {
  const projectItems = params.workItems.filter((workItem) => belongsToProject(params.project, workItem))
  const parked = projectItems.filter(isParkedBlockedItem)
  const active = projectItems.find(isActiveLaneWorkItem) ?? null

  if (active) {
    return {
      active,
      next: null,
      parked,
      reason: `Project lane already active with work item ${active.id}.`,
    }
  }

  const unsafeBlocked = projectItems.find(isUnsafeBlockedItem)
  if (unsafeBlocked) {
    return {
      active: null,
      next: null,
      parked,
      reason: `Project lane unsafe: blocked work item ${unsafeBlocked.id} is not safely parked.`,
    }
  }

  const next = projectItems.filter(isQueuedCandidate).sort(compareLaneCandidates)[0] ?? null
  if (!next) {
    return {
      active: null,
      next: null,
      parked,
      reason: parked.length > 0 ? 'No queued lane candidate; blocked items are parked.' : 'No queued lane candidate.',
    }
  }

  return {
    active: null,
    next,
    parked,
    reason: parked.length > 0 ? `Selected ${next.id}; blocked items are parked.` : `Selected ${next.id}.`,
  }
}
