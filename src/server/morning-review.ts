import { buildAttentionQueue } from './attention-queue'
import { listExecutionRuns } from './execution-runs-store'
import { getProject } from './projects-store'
import { listApprovalInboxEntries } from './work-item-approvals'
import { listWorkItems } from './work-items-store'
import type { ExecutionRunRecord } from './execution-runs-store'
import type { WorkItemRecord } from './work-items-store'

export type MorningReviewBucket = 'changed' | 'needs_approval' | 'failed' | 'merged' | 'parked'
export type MorningReviewSeverity = 'critical' | 'warning' | 'info' | 'success'

export type MorningReviewEntry = {
  id: string
  bucket: MorningReviewBucket
  severity: MorningReviewSeverity
  title: string
  detail: string
  projectId?: string
  projectName?: string
  workItemId?: string
  workItemTitle?: string
  href: string
  observedAt: string
  ageMinutes: number
  executionHref?: string
}

export type MorningReviewDigest = {
  generatedAt: string
  window: { since: string; until: string; lookbackHours: number }
  summary: Record<MorningReviewBucket, number> & { total: number }
  buckets: Record<MorningReviewBucket, Array<MorningReviewEntry>>
  nextAttentionItem: MorningReviewEntry | null
  allClear: boolean
}

type BuildMorningReviewDigestOptions = {
  now?: Date
  lookbackHours?: number
}

const BUCKETS: Array<MorningReviewBucket> = [
  'changed',
  'needs_approval',
  'failed',
  'merged',
  'parked',
]

const SEVERITY_RANK: Record<MorningReviewSeverity, number> = {
  critical: 4,
  warning: 3,
  info: 2,
  success: 1,
}

function emptyBuckets(): Record<MorningReviewBucket, Array<MorningReviewEntry>> {
  return {
    changed: [],
    needs_approval: [],
    failed: [],
    merged: [],
    parked: [],
  }
}

function clampLookbackHours(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 18
  return Math.max(1, Math.round(value))
}

function minutesBetween(now: Date, iso: string): number {
  const observed = new Date(iso).getTime()
  if (Number.isNaN(observed)) return 0
  return Math.max(0, Math.round((now.getTime() - observed) / 60000))
}

function inWindow(iso: string | undefined, since: Date, until: Date): iso is string {
  if (!iso) return false
  const value = new Date(iso).getTime()
  if (Number.isNaN(value)) return false
  return value >= since.getTime() && value <= until.getTime()
}

function workItemHref(workItem: WorkItemRecord): string {
  return `/projects/${workItem.projectId}/work-items/${workItem.id}`
}

function executionHref(run: ExecutionRunRecord): string {
  return `/executions/${run.id}`
}

function projectNameFor(projectId: string): string {
  return getProject(projectId)?.name ?? 'Unknown project'
}

function baseWorkItemEntry(input: {
  id: string
  bucket: MorningReviewBucket
  severity: MorningReviewSeverity
  title: string
  detail: string
  workItem: WorkItemRecord
  observedAt: string
  now: Date
  executionHref?: string
}): MorningReviewEntry {
  return {
    id: input.id,
    bucket: input.bucket,
    severity: input.severity,
    title: input.title,
    detail: input.detail,
    projectId: input.workItem.projectId,
    projectName: projectNameFor(input.workItem.projectId),
    workItemId: input.workItem.id,
    workItemTitle: input.workItem.title,
    href: workItemHref(input.workItem),
    observedAt: input.observedAt,
    ageMinutes: minutesBetween(input.now, input.observedAt),
    executionHref: input.executionHref,
  }
}

function newestWorkItemObservation(
  workItem: WorkItemRecord,
  runs: Array<ExecutionRunRecord>,
  since: Date,
  until: Date,
): string | null {
  const candidates: Array<string> = []
  if (inWindow(workItem.updatedAt, since, until)) candidates.push(workItem.updatedAt)
  for (const history of workItem.history) {
    if (inWindow(history.createdAt, since, until)) candidates.push(history.createdAt)
  }
  for (const run of runs) {
    if (run.workItemId !== workItem.id) continue
    const observedAt = run.lastObservedAt
    if (inWindow(observedAt, since, until)) candidates.push(observedAt)
  }
  return candidates.sort().at(-1) ?? null
}

function newestMergeObservation(workItem: WorkItemRecord, since: Date, until: Date): string | null {
  if (!hasMergeEvidence(workItem)) return null
  const candidates = [
    workItem.updatedAt,
    ...workItem.history
      .filter((entry) => /merge|merged|pull request|pr/i.test(entry.note))
      .map((entry) => entry.createdAt),
  ].filter((iso) => inWindow(iso, since, until))
  return candidates.sort().at(-1) ?? null
}

function hasMergeEvidence(workItem: WorkItemRecord): boolean {
  return Boolean(
    workItem.mergeState === 'merged' ||
      workItem.mergeCommit ||
      workItem.prUrl ||
      workItem.mergeArtifactPaths?.length,
  )
}

function blockedDetail(workItem: WorkItemRecord): string {
  const reason = workItem.laneBlockedReason ?? workItem.blockedReason ?? workItem.missionLastError
  return reason
    ? `${workItem.title} is parked or blocked: ${reason}`
    : `${workItem.title} is parked or blocked and needs operator recovery guidance.`
}

function failedWorkItemDetail(workItem: WorkItemRecord): string {
  if (workItem.missionLastError) return `${workItem.title} failed execution: ${workItem.missionLastError}`
  if (workItem.reviewDecision === 'changes_requested') return `${workItem.title} review requested changes.`
  if (workItem.reviewState === 'failed') return `${workItem.title} review failed.`
  return `${workItem.title} has failed execution evidence.`
}

function failedRunDetail(run: ExecutionRunRecord, workItem: WorkItemRecord | undefined): string {
  const subject = workItem?.title ?? `Work item ${run.workItemId}`
  return run.error ? `${subject} failed execution: ${run.error}` : `${subject} has a failed execution run.`
}

function addEntry(
  buckets: Record<MorningReviewBucket, Array<MorningReviewEntry>>,
  seen: Set<string>,
  entry: MorningReviewEntry,
): void {
  const stableId = `${entry.bucket}:${entry.id}`
  if (seen.has(stableId)) return
  seen.add(stableId)
  buckets[entry.bucket].push(entry)
}

function sortEntries(entries: Array<MorningReviewEntry>): Array<MorningReviewEntry> {
  return [...entries].sort((a, b) => {
    const severityDelta = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (severityDelta !== 0) return severityDelta
    const observedDelta =
      a.bucket === 'needs_approval' && b.bucket === 'needs_approval'
        ? a.observedAt.localeCompare(b.observedAt)
        : b.observedAt.localeCompare(a.observedAt)
    if (observedDelta !== 0) return observedDelta
    return a.id.localeCompare(b.id)
  })
}

function pickNextAttentionItem(
  buckets: Record<MorningReviewBucket, Array<MorningReviewEntry>>,
): MorningReviewEntry | null {
  const criticalFailed = buckets.failed.find((entry) => entry.severity === 'critical')
  if (criticalFailed) return criticalFailed
  const pendingApproval = buckets.needs_approval.at(0)
  if (pendingApproval) return pendingApproval
  const parked = buckets.parked.at(0)
  if (parked) return parked
  const warningFailed = buckets.failed.find((entry) => entry.severity === 'warning')
  if (warningFailed) return warningFailed
  return buckets.changed.at(0) ?? null
}

export function buildMorningReviewDigest(
  options: BuildMorningReviewDigestOptions = {},
): MorningReviewDigest {
  const now = options.now ?? new Date()
  const lookbackHours = clampLookbackHours(options.lookbackHours)
  const since = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000)
  const workItems = listWorkItems()
  const workItemById = new Map(workItems.map((workItem) => [workItem.id, workItem]))
  const runs = listExecutionRuns()
  const buckets = emptyBuckets()
  const seen = new Set<string>()

  // Build the current attention queue view so P3 stays grounded in the existing attention seam.
  buildAttentionQueue()

  for (const workItem of workItems) {
    const observedChange = newestWorkItemObservation(workItem, runs, since, now)
    if (observedChange) {
      addEntry(
        buckets,
        seen,
        baseWorkItemEntry({
          id: `work-item:${workItem.id}`,
          bucket: 'changed',
          severity: 'info',
          title: `Changed: ${workItem.title}`,
          detail: `${workItem.title} changed during the review window.`,
          workItem,
          observedAt: observedChange,
          now,
        }),
      )
    }

    if (workItem.missionState === 'failed' || workItem.reviewState === 'failed' || workItem.reviewDecision === 'changes_requested') {
      const latestRun = runs
        .filter((run) => run.workItemId === workItem.id && (run.state === 'failed' || run.state === 'stale'))
        .sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt))
        .at(0)
      const observedAt = latestRun?.lastObservedAt ?? workItem.updatedAt
      addEntry(
        buckets,
        seen,
        baseWorkItemEntry({
          id: `work-item:${workItem.id}`,
          bucket: 'failed',
          severity: 'critical',
          title: `Failed execution: ${workItem.title}`,
          detail: failedWorkItemDetail(workItem),
          workItem,
          observedAt,
          now,
          executionHref: latestRun ? executionHref(latestRun) : undefined,
        }),
      )
    }

    const mergeObservedAt = newestMergeObservation(workItem, since, now)
    if (mergeObservedAt) {
      addEntry(
        buckets,
        seen,
        baseWorkItemEntry({
          id: `work-item:${workItem.id}`,
          bucket: 'merged',
          severity: 'success',
          title: `Merged: ${workItem.title}`,
          detail: workItem.prUrl
            ? `${workItem.title} has merge/PR evidence: ${workItem.prUrl}`
            : `${workItem.title} has merge evidence${workItem.mergeCommit ? ` at ${workItem.mergeCommit}` : ''}.`,
          workItem,
          observedAt: mergeObservedAt,
          now,
        }),
      )
    }

    if (workItem.status === 'blocked' || workItem.laneState === 'blocked' || workItem.laneParkedAt || workItem.laneBlockedReason) {
      const observedAt = [workItem.laneParkedAt, workItem.updatedAt]
        .filter((iso): iso is string => typeof iso === 'string' && iso.length > 0)
        .sort()
        .at(-1) ?? workItem.updatedAt
      addEntry(
        buckets,
        seen,
        baseWorkItemEntry({
          id: `work-item:${workItem.id}`,
          bucket: 'parked',
          severity: 'warning',
          title: `Parked: ${workItem.title}`,
          detail: blockedDetail(workItem),
          workItem,
          observedAt,
          now,
        }),
      )
    }
  }

  for (const approval of listApprovalInboxEntries()) {
    if (approval.status !== 'pending') continue
    const workItem = workItemById.get(approval.workItemId)
    const href = workItem ? workItemHref(workItem) : `/projects/${approval.projectId}`
    addEntry(buckets, seen, {
      id: `approval:${approval.approvalId}`,
      bucket: 'needs_approval',
      severity: 'warning',
      title: `${approval.phase === 'deploy' ? 'Deploy' : 'Review'} approval pending`,
      detail: `${approval.workItemTitle} is waiting for ${approval.phase} approval.`,
      projectId: approval.projectId,
      projectName: approval.projectName,
      workItemId: approval.workItemId,
      workItemTitle: approval.workItemTitle,
      href,
      observedAt: approval.requestedAt,
      ageMinutes: minutesBetween(now, approval.requestedAt),
    })
  }

  for (const run of runs) {
    const observedAt = run.lastObservedAt
    if (!inWindow(observedAt, since, now)) continue
    const workItem = workItemById.get(run.workItemId)
    if (run.state === 'failed' || run.state === 'stale') {
      addEntry(buckets, seen, {
        id: `execution:${run.id}`,
        bucket: 'failed',
        severity: run.state === 'failed' ? 'critical' : 'warning',
        title: `${run.state === 'failed' ? 'Failed' : 'Stale'} execution: ${workItem?.title ?? run.workItemId}`,
        detail: failedRunDetail(run, workItem),
        projectId: run.projectId,
        projectName: projectNameFor(run.projectId),
        workItemId: run.workItemId,
        workItemTitle: workItem?.title,
        href: workItem ? workItemHref(workItem) : executionHref(run),
        observedAt,
        ageMinutes: minutesBetween(now, observedAt),
        executionHref: executionHref(run),
      })
    }
  }

  for (const bucket of BUCKETS) {
    buckets[bucket] = sortEntries(buckets[bucket])
  }

  const summary = {
    changed: buckets.changed.length,
    needs_approval: buckets.needs_approval.length,
    failed: buckets.failed.length,
    merged: buckets.merged.length,
    parked: buckets.parked.length,
    total: BUCKETS.reduce((total, bucket) => total + buckets[bucket].length, 0),
  }

  return {
    generatedAt: now.toISOString(),
    window: {
      since: since.toISOString(),
      until: now.toISOString(),
      lookbackHours,
    },
    summary,
    buckets,
    nextAttentionItem: pickNextAttentionItem(buckets),
    allClear: summary.total === 0,
  }
}

function bucketLabel(bucket: MorningReviewBucket): string {
  if (bucket === 'needs_approval') return 'Needs approval'
  return bucket.charAt(0).toUpperCase() + bucket.slice(1)
}

function severityIcon(severity: MorningReviewSeverity): string {
  if (severity === 'critical') return '❌'
  if (severity === 'warning') return '⚠️'
  if (severity === 'success') return '✅'
  return '•'
}

function formatEntryLine(entry: MorningReviewEntry): string {
  const context = [entry.projectName, entry.workItemTitle]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' · ')
  const execution = entry.executionHref ? ` · execution ${entry.executionHref}` : ''
  const detail = entry.detail ? ` — ${entry.detail.slice(0, 140)}` : ''
  const age = Number.isFinite(entry.ageMinutes) ? ` · ~${entry.ageMinutes}m` : ''
  return `${severityIcon(entry.severity)} ${entry.title}${detail}${context ? ` · ${context}` : ''}${age} · ${entry.href}${execution}`
}

export function formatMorningReviewForDiscord(digest: MorningReviewDigest): string {
  const generated = new Date(digest.generatedAt).toLocaleString()
  const lines: Array<string> = [
    '**🌅 Morning Review — Mission Control**',
    `_Last ${digest.window.lookbackHours}h · Generated: ${generated}_`,
    '',
    `**Summary:** Changed ${digest.summary.changed} · Needs approval ${digest.summary.needs_approval} · Failed ${digest.summary.failed} · Merged ${digest.summary.merged} · Parked ${digest.summary.parked}`,
  ]

  if (digest.nextAttentionItem) {
    lines.push(`**Next:** ${digest.nextAttentionItem.title} — ${digest.nextAttentionItem.href}`)
  }

  if (digest.allClear) {
    lines.push('')
    lines.push('All clear — no overnight operator action needed.')
    return lines.join('\n')
  }

  for (const bucket of BUCKETS) {
    const entries = digest.buckets[bucket].slice(0, 3)
    if (entries.length === 0) continue
    lines.push('')
    lines.push(`**${bucketLabel(bucket)}:**`)
    for (const entry of entries) {
      lines.push(formatEntryLine(entry))
    }
  }

  return lines.join('\n')
}
