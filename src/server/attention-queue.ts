import { listWorkItemApprovals } from './work-item-approvals'
import {  listWorkItems } from './work-items-store'
import {




  listAttentionQueueItems,
  upsertAttentionQueueItem
} from './attention-queue-store'
import {  recommendWorkItemRecoveryActions } from './work-item-recovery-actions'
import type {AttentionKind, AttentionQueueItem, AttentionQueueSource, AttentionSeverity} from './attention-queue-store';
import type {WorkItemRecoveryAction} from './work-item-recovery-actions';
import type {WorkItemRecord} from './work-items-store';
import type { SupervisorFinding } from './work-item-supervisor'

export type BuildAttentionQueueOptions = {
  supervisorFindings?: Array<SupervisorFinding>
  capacityItems?: Array<{
    dedupeKey: string
    projectId: string
    workItemId?: string
    title: string
    detail: string
    href: string
    severity?: AttentionSeverity
  }>
}

function workItemHref(workItem: WorkItemRecord): string {
  return `/projects/${workItem.projectId}/work-items/${workItem.id}`
}

function failureDetail(prefix: string, workItem: WorkItemRecord): string {
  const error = workItem.missionLastError?.trim()
  return error ? `${prefix}: ${error}` : prefix
}

function buildTransientItem(input: {
  dedupeKey: string
  kind: AttentionKind
  severity: AttentionSeverity
  projectId: string
  workItemId?: string
  title: string
  detail: string
  href: string
  source: AttentionQueueSource
  recommendedActions?: Array<WorkItemRecoveryAction>
}): AttentionQueueItem {
  const now = new Date().toISOString()
  return {
    id: input.dedupeKey,
    dedupeKey: input.dedupeKey,
    kind: input.kind,
    severity: input.severity,
    projectId: input.projectId,
    workItemId: input.workItemId,
    title: input.title,
    detail: input.detail,
    href: input.href,
    source: input.source,
    status: 'open',
    firstSeenAt: now,
    lastSeenAt: now,
    recommendedActions: input.recommendedActions ?? [],
  }
}

function withRecommendedActions(
  item: AttentionQueueItem,
  workItem: WorkItemRecord | undefined,
): AttentionQueueItem {
  return {
    ...item,
    recommendedActions: recommendWorkItemRecoveryActions({ attentionItem: item, workItem }),
  }
}

function severityRank(severity: AttentionSeverity): number {
  if (severity === 'critical') return 3
  if (severity === 'warning') return 2
  return 1
}

function sortAttentionItems(items: Array<AttentionQueueItem>): Array<AttentionQueueItem> {
  return [...items].sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity)
    if (severityDelta !== 0) return severityDelta
    const seenDelta = b.lastSeenAt.localeCompare(a.lastSeenAt)
    if (seenDelta !== 0) return seenDelta
    return a.dedupeKey.localeCompare(b.dedupeKey)
  })
}

function supervisorAttentionKind(finding: SupervisorFinding): AttentionKind {
  if (finding.kind === 'mission_failed') return 'mission_failed'
  if (finding.kind === 'review_failed') return 'review_failed'
  return 'execution_stale'
}

function supervisorDedupeKey(finding: SupervisorFinding): string {
  const jobPart = finding.jobId?.trim() || 'no-job'
  return `supervisor:${finding.kind}:${finding.workItemId}:${jobPart}`
}

export function buildAttentionQueue(options: BuildAttentionQueueOptions = {}): Array<AttentionQueueItem> {
  const items: Array<AttentionQueueItem> = []
  const workItems = listWorkItems()
  const workItemById = new Map(workItems.map((workItem) => [workItem.id, workItem]))

  for (const approval of listWorkItemApprovals()) {
    if (approval.status !== 'pending') continue
    const workItem = workItemById.get(approval.workItemId)
    if (!workItem) continue
    const item = buildTransientItem({
      dedupeKey: `approval:${approval.workItemId}:${approval.phase}`,
      kind: 'approval_pending',
      severity: 'warning',
      projectId: approval.projectId,
      workItemId: approval.workItemId,
      title: `${approval.phase === 'deploy' ? 'Deploy' : 'Review'} approval pending`,
      detail: `${workItem.title} is waiting for ${approval.phase} approval.`,
      href: workItemHref(workItem),
      source: 'derived',
    })
    items.push(withRecommendedActions(item, workItem))
  }

  for (const workItem of workItems) {
    if (workItem.status === 'blocked') {
      const item = buildTransientItem({
        dedupeKey: `blocked:${workItem.id}`,
        kind: 'blocked_work',
        severity: 'warning',
        projectId: workItem.projectId,
        workItemId: workItem.id,
        title: 'Blocked work item',
        detail: `${workItem.title} is blocked${workItem.blockedReason ? ` (${workItem.blockedReason})` : ''}.`,
        href: workItemHref(workItem),
        source: 'derived',
      })
      items.push(withRecommendedActions(item, workItem))
    }

    if (workItem.missionState === 'failed') {
      const item = buildTransientItem({
        dedupeKey: `mission_failed:${workItem.id}`,
        kind: 'mission_failed',
        severity: 'critical',
        projectId: workItem.projectId,
        workItemId: workItem.id,
        title: 'Mission failed',
        detail: failureDetail(`${workItem.title} mission failed`, workItem),
        href: workItemHref(workItem),
        source: 'derived',
      })
      items.push(withRecommendedActions(item, workItem))
    }

    if (workItem.reviewState === 'failed' || workItem.reviewDecision === 'changes_requested') {
      const item = buildTransientItem({
        dedupeKey: `review_failed:${workItem.id}`,
        kind: 'review_failed',
        severity: 'critical',
        projectId: workItem.projectId,
        workItemId: workItem.id,
        title: 'Review needs attention',
        detail: `${workItem.title} review failed or requested changes.`,
        href: workItemHref(workItem),
        source: 'derived',
      })
      items.push(withRecommendedActions(item, workItem))
    }
  }

  for (const finding of options.supervisorFindings ?? []) {
    const workItem = workItemById.get(finding.workItemId)
    const item = buildTransientItem({
      dedupeKey: supervisorDedupeKey(finding),
      kind: supervisorAttentionKind(finding),
      severity: finding.severity === 'critical' ? 'critical' : 'warning',
      projectId: finding.projectId,
      workItemId: finding.workItemId,
      title: finding.kind === 'sync_error' ? 'Execution sync failed' : 'Execution needs attention',
      detail: finding.message,
      href: workItem ? workItemHref(workItem) : `/projects/${finding.projectId}`,
      source: 'supervisor',
    })
    items.push(withRecommendedActions(item, workItem))
  }

  for (const capacity of options.capacityItems ?? []) {
    const workItem = capacity.workItemId ? workItemById.get(capacity.workItemId) : undefined
    const item = buildTransientItem({
      dedupeKey: `capacity:${capacity.dedupeKey}`,
      kind: 'capacity_exceeded',
      severity: capacity.severity ?? 'warning',
      projectId: capacity.projectId,
      workItemId: capacity.workItemId,
      title: capacity.title,
      detail: capacity.detail,
      href: capacity.href,
      source: 'capacity',
    })
    items.push(withRecommendedActions(item, workItem))
  }

  return sortAttentionItems(items)
}

export function refreshAttentionQueue(options: BuildAttentionQueueOptions = {}): Array<AttentionQueueItem> {
  for (const item of buildAttentionQueue(options)) {
    upsertAttentionQueueItem(item)
  }
  return listAttentionQueueItems({ status: 'open' })
}
