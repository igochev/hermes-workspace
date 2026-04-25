import type {
  ProjectSummary,
  WorkItemPriority,
  WorkItemRecord,
  WorkItemRiskLevel,
  WorkItemStatus,
} from './projects-api'

export type ProjectBoardFilter = 'all' | 'attention' | 'execution' | 'approvals' | `label:${string}`
export type WorkItemUrgencyTone = 'default' | 'warning' | 'danger'
export type ProjectBoardUrgencySummary = {
  pendingApprovals: number
  changesRequested: number
  runningMissions: number
  failedMissions: number
  blocked: number
  activeThisWeek: number
  blockedThisWeek: number
  doneThisWeek: number
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
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

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

      // Weekly analytics
      const itemDate = new Date(workItem.updatedAt)
      if (itemDate >= weekAgo) {
        if (workItem.status === 'active') {
          summary.activeThisWeek += 1
        }
        if (workItem.status === 'blocked') {
          summary.blockedThisWeek += 1
        }
        if (workItem.status === 'done') {
          summary.doneThisWeek += 1
        }
      }

      return summary
    },
    {
      pendingApprovals: 0,
      changesRequested: 0,
      runningMissions: 0,
      failedMissions: 0,
      blocked: 0,
      activeThisWeek: 0,
      blockedThisWeek: 0,
      doneThisWeek: 0,
    },
  )
}

export function filterWorkItemsForProjectBoard(
  workItems: Array<WorkItemRecord>,
  filter: ProjectBoardFilter,
): Array<WorkItemRecord> {
  // Handle label filters (label:${string})
  if (typeof filter === 'string' && filter.startsWith('label:')) {
    const targetLabel = filter.slice(6)
    return workItems.filter((workItem) => workItem.labels.includes(targetLabel))
  }

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

export function getUniqueLabels(workItems: Array<WorkItemRecord>): Array<string> {
  const labelSet = new Set<string>()
  for (const workItem of workItems) {
    for (const label of workItem.labels) {
      labelSet.add(label)
    }
  }
  return Array.from(labelSet).sort()
}

export type LabelAnalyticsEntry = {
  label: string
  total: number
  active: number
  blocked: number
  done: number
  cancelled: number
  doneThisWeek: number
  blockedRatio: number
  health: 'healthy' | 'warning' | 'critical'
  insight: string | null
  // Cycle time: average days from creation to done (for completed items)
  avgCycleTimeDays: number | null
  // Throughput: items completed per week (annualized rate)
  throughputPerWeek: number
  // Rework: items that went through build→review→build cycle
  reworkCount: number
  reworkRatio: number
}

export type LabelAnalytics = {
  labels: Array<LabelAnalyticsEntry>
  totalWorkItems: number
  totalLabels: number
  mostUsedLabel: string | null
  mostBlockedLabel: string | null
  healthiestLabel: string | null
  // Project-level aggregate metrics
  avgCycleTimeDays: number | null
  throughputPerWeek: number
  reworkRate: number
  totalDone: number
  totalActive: number
  totalBlocked: number
  totalCancelled: number
}

const MAX_LABELS_TO_SHOW = 15

// Detect rework: items whose history contains a build→review→build cycle
function detectRework(workItem: WorkItemRecord): boolean {
  const history = workItem.history ?? []
  const buildReviewBuildPatterns = [
    ['build', 'review', 'build'],
    ['build', 'review', 'build', 'review', 'build'],
  ]

  for (const pattern of buildReviewBuildPatterns) {
    for (let i = 0; i <= history.length - pattern.length; i++) {
      const slice = history.slice(i, i + pattern.length)
      const phases = slice.map((h) => h.phase)
      if (phases.every((p, idx) => p === pattern[idx])) {
        return true
      }
    }
  }
  return false
}

function computeAvgCycleTime(workItems: Array<WorkItemRecord>, filter: (w: WorkItemRecord) => boolean): number | null {
  let totalMs = 0
  let count = 0
  for (const w of workItems) {
    if (!filter(w)) continue
    if (w.status !== 'done') continue
    const created = new Date(w.createdAt).getTime()
    const done = new Date(w.updatedAt).getTime()
    if (Number.isNaN(created) || Number.isNaN(done) || done <= created) continue
    totalMs += done - created
    count += 1
  }
  return count > 0 ? totalMs / count / (1000 * 60 * 60 * 24) : null
}

export function buildLabelAnalytics(workItems: Array<WorkItemRecord>): LabelAnalytics {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Aggregate project-level counts
  let totalDone = 0, totalActive = 0, totalBlocked = 0, totalCancelled = 0
  let cycleTimeMs = 0, cycleTimeCount = 0
  let doneThisWeekGlobal = 0

  for (const w of workItems) {
    if (w.status === 'done') totalDone += 1
    if (w.status === 'active') totalActive += 1
    if (w.status === 'blocked') totalBlocked += 1
    if (w.status === 'cancelled') totalCancelled += 1
    if (w.status === 'done') {
      const created = new Date(w.createdAt).getTime()
      const done = new Date(w.updatedAt).getTime()
      if (!Number.isNaN(created) && !Number.isNaN(done) && done > created) {
        cycleTimeMs += done - created
        cycleTimeCount += 1
      }
    }
    const itemDate = new Date(w.updatedAt)
    if (w.status === 'done' && itemDate >= weekAgo) doneThisWeekGlobal += 1
  }

  const avgCycleTimeDays = cycleTimeCount > 0 ? cycleTimeMs / cycleTimeCount / (1000 * 60 * 60 * 24) : null
  const throughputPerWeek = Math.round((doneThisWeekGlobal / 7) * 100) / 100

  // Build per-label breakdown
  const labelMap = new Map<string, { total: number; active: number; blocked: number; done: number; cancelled: number; doneThisWeek: number; cycleTimeMs: number; cycleTimeCount: number; reworkCount: number }>()

  for (const workItem of workItems) {
    const hasRework = detectRework(workItem)
    for (const label of workItem.labels) {
      const entry = labelMap.get(label) ?? { total: 0, active: 0, blocked: 0, done: 0, cancelled: 0, doneThisWeek: 0, cycleTimeMs: 0, cycleTimeCount: 0, reworkCount: 0 }
      entry.total += 1
      if (workItem.status === 'active') entry.active += 1
      if (workItem.status === 'blocked') entry.blocked += 1
      if (workItem.status === 'done') {
        entry.done += 1
        const itemDate = new Date(workItem.updatedAt)
        if (itemDate >= weekAgo) entry.doneThisWeek += 1
        const created = new Date(workItem.createdAt).getTime()
        const done = new Date(workItem.updatedAt).getTime()
        if (!Number.isNaN(created) && !Number.isNaN(done) && done > created) {
          entry.cycleTimeMs += done - created
          entry.cycleTimeCount += 1
        }
      }
      if (workItem.status === 'cancelled') entry.cancelled += 1
      if (hasRework) entry.reworkCount += 1
      labelMap.set(label, entry)
    }
  }

  // Convert to entries with computed metrics
  const labels = Array.from(labelMap.entries())
    .sort((a, b) => b[1].total - a[1].total) // sort by usage (most used first)
    .slice(0, MAX_LABELS_TO_SHOW)
    .map(([label, counts]) => {
      const blockedRatio = counts.total > 0 ? counts.blocked / counts.total : 0
      let health: LabelAnalyticsEntry['health'] = 'healthy'
      let insight: string | null = null

      if (blockedRatio >= 0.5 && counts.blocked >= 2) {
        health = 'critical'
        insight = `${counts.blocked} of ${counts.total} items blocked`
      } else if (blockedRatio >= 0.33 || (counts.blocked >= 1 && blockedRatio > 0)) {
        health = 'warning'
        insight = counts.blocked > 0 ? `${counts.blocked} blocked item${counts.blocked > 1 ? 's' : ''}` : null
      }

      if (counts.doneThisWeek > 0 && counts.total > 0 && counts.blocked === 0) {
        insight = insight ? `${insight} · ${counts.doneThisWeek} done this week` : `${counts.doneThisWeek} done this week`
      }

      const avgCycleTime = counts.cycleTimeCount > 0 ? counts.cycleTimeMs / counts.cycleTimeCount / (1000 * 60 * 60 * 24) : null
      const throughput = Math.round((counts.doneThisWeek / 7) * 100) / 100
      const reworkRatio = counts.total > 0 ? counts.reworkCount / counts.total : 0

      return {
        label,
        ...counts,
        blockedRatio,
        health,
        insight,
        avgCycleTimeDays: avgCycleTime,
        throughputPerWeek: throughput,
        reworkCount: counts.reworkCount,
        reworkRatio,
      }
    })

  // Derived insights
  const totalLabels = labelMap.size
  const mostUsedLabel = labels.length > 0 ? labels[0].label : null
  const mostBlockedLabel = labels.length > 0
    ? labels.reduce((worst, cur) => (cur.blocked > worst.blocked ? cur : worst), labels[0]).label
    : null
  const healthiestLabel = labels.length > 0
    ? labels.reduce((best, cur) => {
        const bestScore = best.done > 0 && best.total > 0 ? best.done / best.total : 0
        const curScore = cur.done > 0 && cur.total > 0 ? cur.done / cur.total : 0
        return curScore > bestScore ? cur : best
      }).label
    : null

  // Overall rework rate: fraction of items with labels that had build→review→build cycles
  let totalItemsWithRework = 0
  for (const w of workItems) {
    if (w.labels.length > 0 && detectRework(w)) totalItemsWithRework += 1
  }
  const itemsWithLabels = workItems.filter(w => w.labels.length > 0)
  const reworkRate = itemsWithLabels.length > 0 ? Math.round((totalItemsWithRework / itemsWithLabels.length) * 1000) / 1000 : 0

  return {
    labels,
    totalWorkItems: workItems.length,
    totalLabels,
    mostUsedLabel,
    mostBlockedLabel,
    healthiestLabel,
    avgCycleTimeDays: avgCycleTimeDays,
    throughputPerWeek: throughputPerWeek,
    reworkRate: reworkRate,
    totalDone,
    totalActive,
    totalBlocked,
    totalCancelled,
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

  const latestDraft = workItem.latestPlanningDraft
  if (latestDraft?.status === 'structured_ready') {
    signals.push('Draft ready')
  } else if (latestDraft?.status === 'parse_failed') {
    signals.push('Planner revision needed')
  } else if (
    workItem.status === 'inbox' &&
    workItem.phase === 'research' &&
    !workItem.planFilePath
  ) {
    signals.push('Needs Planner')
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
  const needsPlanner =
    workItem.status === 'inbox' &&
    workItem.phase === 'research' &&
    !workItem.planFilePath &&
    workItem.latestPlanningDraft?.status !== 'structured_ready' &&
    workItem.latestPlanningDraft?.status !== 'accepted'

  return (
    hasApprovalAttention(workItem) ||
    needsPlanner ||
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
