import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { listApprovalInboxEntries } from './work-item-approvals'
import {    listWorkItems } from './work-items-store'
import {   getProject } from './projects-store'
import type {WorkItemBlockedReason, WorkItemMissionState, WorkItemRecord} from './work-items-store';
import type {ProjectAutonomyAlwaysOnNotificationEvent, ProjectRecord} from './projects-store';

export type DigestApprovalEntry = {
  workItemId: string
  workItemTitle: string
  projectName: string
  phase: 'review' | 'deploy'
  requestedAt: string
  ageMinutes: number
}

export type DigestBlockedEntry = {
  workItemId: string
  workItemTitle: string
  projectName: string
  blockedReason?: WorkItemBlockedReason
  missionState?: WorkItemMissionState
  missionLastError?: string
  updatedAt: string
  ageMinutes: number
}

export type DigestLaneEscalationKind = Extract<
  ProjectAutonomyAlwaysOnNotificationEvent,
  'blocked' | 'retry_scheduled' | 'retry_exhausted' | 'unsafe_repo' | 'pr_ready' | 'cleanup_recommended'
>

export type DigestLaneEscalationEntry = {
  workItemId: string
  workItemTitle: string
  projectName: string
  kind: DigestLaneEscalationKind
  laneState?: WorkItemRecord['laneState']
  phase?: WorkItemRecord['phase']
  branchName?: string
  baseBranch?: string
  reason?: string
  recoveryDecision?: string
  recoveryGuidance: string
  retryCount?: number
  lastRetryAt?: string
  exhaustedAt?: string
  prUrl?: string
  updatedAt: string
  ageMinutes: number
}

export type StatusDigest = {
  generatedAt: string
  pendingApprovals: Array<DigestApprovalEntry>
  blockedItems: Array<DigestBlockedEntry>
  failedMissions: Array<DigestBlockedEntry>
  laneEscalations: Array<DigestLaneEscalationEntry>
  summary: {
    pendingApprovalCount: number
    blockedCount: number
    failedMissionCount: number
    laneEscalationCount: number
    oldestPendingApprovalMinutes: number | null
    oldestBlockedMinutes: number | null
  }
  stateHash: string
}

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getDigestHashFile(): string {
  return path.join(getHermesHome(), 'notification-digest-last-hash.txt')
}

function minutesSince(iso: string): number {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return Infinity
  return Math.round((Date.now() - then) / 60000)
}

function computeStateHash(digest: StatusDigest): string {
  const canonical = JSON.stringify({
    approvals: digest.pendingApprovals.map((a) => `${a.workItemId}:${a.phase}`).sort(),
    blocked: digest.blockedItems.map((b) => b.workItemId).sort(),
    failed: digest.failedMissions.map((f) => f.workItemId).sort(),
    laneEscalations: digest.laneEscalations
      .map((entry) => [
        entry.workItemId,
        entry.kind,
        entry.reason ?? '',
        entry.recoveryDecision ?? '',
        entry.retryCount ?? 0,
        entry.branchName ?? '',
        entry.prUrl ?? '',
      ].join(':'))
      .sort(),
  })
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

function notifyEnabled(project: ProjectRecord | null | undefined, kind: DigestLaneEscalationKind): boolean {
  const notifications = project?.autonomyLanePolicy.alwaysOn.notifications
  if (!notifications || notifications.enabled === false) return false
  return notifications.notifyOn.includes(kind)
}

function buildLaneRecoveryGuidance(kind: DigestLaneEscalationKind): string {
  if (kind === 'retry_scheduled') return 'Watch the bounded retry cooldown and verify the next run produces fresh evidence.'
  if (kind === 'retry_exhausted') return 'Retry attempts are exhausted; manual operator recovery is required before the lane continues.'
  if (kind === 'unsafe_repo') return 'Resolve repo hygiene warnings before retrying or admitting the next lane item.'
  if (kind === 'pr_ready') return 'Review PR publishing preflight evidence and publish only through the explicit gated action.'
  if (kind === 'cleanup_recommended') return 'Review cleanup recommendations; retention is dry-run/non-destructive unless explicitly enabled.'
  return 'Review the parked lane evidence and choose an explicit recovery action.'
}

function makeLaneEscalationEntry(
  workItem: WorkItemRecord,
  projectName: string,
  kind: DigestLaneEscalationKind,
): DigestLaneEscalationEntry {
  return {
    workItemId: workItem.id,
    workItemTitle: workItem.title,
    projectName,
    kind,
    laneState: workItem.laneState,
    phase: workItem.phase,
    branchName: workItem.branchName,
    baseBranch: workItem.baseBranch,
    reason: workItem.laneBlockedReason ?? workItem.missionLastError,
    recoveryDecision: workItem.laneRecoveryDecision,
    recoveryGuidance: buildLaneRecoveryGuidance(kind),
    retryCount: workItem.laneRetryCount,
    lastRetryAt: workItem.laneLastRetryAt,
    exhaustedAt: workItem.laneRetryExhaustedAt,
    prUrl: workItem.prUrl,
    updatedAt: workItem.updatedAt,
    ageMinutes: minutesSince(workItem.updatedAt),
  }
}

function getLaneEscalationKinds(workItem: WorkItemRecord): Array<DigestLaneEscalationKind> {
  const decision = workItem.laneRecoveryDecision

  if (decision === 'unsafe_repo') return ['unsafe_repo']
  if (decision === 'retry_exhausted' || workItem.laneRetryExhaustedAt) return ['retry_exhausted']
  if (decision === 'schedule_retry') return ['retry_scheduled']
  if (workItem.laneState === 'blocked' || workItem.status === 'blocked') return ['blocked']
  if (workItem.mergeState === 'merged' && workItem.branchName && !workItem.prUrl) return ['pr_ready']
  if (workItem.mergeState === 'merged' && workItem.branchName) return ['cleanup_recommended']

  return []
}

export function buildLaneEscalations(
  workItems: Array<WorkItemRecord>,
): Array<DigestLaneEscalationEntry> {
  const entries: Array<DigestLaneEscalationEntry> = []
  for (const workItem of workItems) {
    const project = getProject(workItem.projectId)
    const projectName = project?.name ?? 'Unknown project'
    for (const kind of getLaneEscalationKinds(workItem)) {
      if (notifyEnabled(project, kind)) entries.push(makeLaneEscalationEntry(workItem, projectName, kind))
    }
  }
  return entries.sort((a, b) => {
    const projectCompare = a.projectName.localeCompare(b.projectName)
    if (projectCompare !== 0) return projectCompare
    return a.workItemTitle.localeCompare(b.workItemTitle)
  })
}

export function buildStatusDigest(): StatusDigest {
  // Gather pending approvals
  const inboxEntries = listApprovalInboxEntries()
  const pendingApprovals: Array<DigestApprovalEntry> = inboxEntries
    .filter((entry) => entry.status === 'pending')
    .map((entry) => ({
      workItemId: entry.workItemId,
      workItemTitle: entry.workItemTitle,
      projectName: entry.projectName,
      phase: entry.phase,
      requestedAt: entry.requestedAt,
      ageMinutes: minutesSince(entry.requestedAt),
    }))

  // Gather blocked work items
  const allWorkItems = listWorkItems()
  const blockedItems: Array<DigestBlockedEntry> = []
  const failedMissions: Array<DigestBlockedEntry> = []

  for (const workItem of allWorkItems) {
    const project = getProject(workItem.projectId)
    const projectName = project?.name ?? 'Unknown project'

    if (workItem.status === 'blocked') {
      blockedItems.push({
        workItemId: workItem.id,
        workItemTitle: workItem.title,
        projectName,
        blockedReason: workItem.blockedReason,
        missionState: workItem.missionState,
        missionLastError: workItem.missionLastError,
        updatedAt: workItem.updatedAt,
        ageMinutes: minutesSince(workItem.updatedAt),
      })
    }

    if (workItem.missionState === 'failed') {
      failedMissions.push({
        workItemId: workItem.id,
        workItemTitle: workItem.title,
        projectName,
        blockedReason: workItem.blockedReason,
        missionState: workItem.missionState,
        missionLastError: workItem.missionLastError,
        updatedAt: workItem.updatedAt,
        ageMinutes: minutesSince(workItem.updatedAt),
      })
    }
  }

  const oldestPendingApprovalMinutes = pendingApprovals.length > 0
    ? Math.max(...pendingApprovals.map((a) => a.ageMinutes))
    : null

  const oldestBlockedMinutes = blockedItems.length > 0
    ? Math.max(...blockedItems.map((b) => b.ageMinutes))
    : null

  const laneEscalations = buildLaneEscalations(allWorkItems)

  const digest: StatusDigest = {
    generatedAt: new Date().toISOString(),
    pendingApprovals,
    blockedItems,
    failedMissions,
    laneEscalations,
    summary: {
      pendingApprovalCount: pendingApprovals.length,
      blockedCount: blockedItems.length,
      failedMissionCount: failedMissions.length,
      laneEscalationCount: laneEscalations.length,
      oldestPendingApprovalMinutes,
      oldestBlockedMinutes,
    },
    stateHash: '', // computed below
  }

  digest.stateHash = computeStateHash(digest)
  return digest
}

export function digestStateHasChanged(currentHash: string): boolean {
  const hashFile = getDigestHashFile()
  try {
    if (!fs.existsSync(hashFile)) return true
    const lastHash = fs.readFileSync(hashFile, 'utf-8').trim()
    return currentHash !== lastHash
  } catch {
    return true
  }
}

export function persistDigestHash(hash: string): void {
  try {
    fs.mkdirSync(getHermesHome(), { recursive: true })
    fs.writeFileSync(getDigestHashFile(), hash, 'utf-8')
  } catch {
    // Non-fatal — de-dup window is best-effort
  }
}

export function formatDigestForDiscord(digest: StatusDigest): string {
  const lines: Array<string> = [
    '**📋 Mission Control Status Digest**',
    `_Generated: ${new Date(digest.generatedAt).toLocaleString()}_`,
    '',
  ]

  // Summary header
  const summaryItems: Array<string> = []
  if (digest.summary.pendingApprovalCount > 0) {
    summaryItems.push(`⏳ ${digest.summary.pendingApprovalCount} pending approval${digest.summary.pendingApprovalCount !== 1 ? 's' : ''}`)
  }
  if (digest.summary.blockedCount > 0) {
    summaryItems.push(`🚧 ${digest.summary.blockedCount} blocked work item${digest.summary.blockedCount !== 1 ? 's' : ''}`)
  }
  if (digest.summary.failedMissionCount > 0) {
    summaryItems.push(`❌ ${digest.summary.failedMissionCount} failed mission${digest.summary.failedMissionCount !== 1 ? 's' : ''}`)
  }
  if (digest.summary.laneEscalationCount > 0) {
    summaryItems.push(`🚨 ${digest.summary.laneEscalationCount} lane escalation${digest.summary.laneEscalationCount !== 1 ? 's' : ''}`)
  }

  if (summaryItems.length === 0) {
    lines.push('✅ No pending approvals, blocked items, failed missions, or lane escalations.')
    lines.push('')
    lines.push('All clear — no operator attention needed.')
    return lines.join('\n')
  }

  lines.push(`**Summary:** ${summaryItems.join(' · ')}`)
  if (digest.summary.oldestPendingApprovalMinutes !== null) {
    lines.push(`   Oldest pending approval: ~${digest.summary.oldestPendingApprovalMinutes} minutes`)
  }
  if (digest.summary.oldestBlockedMinutes !== null) {
    lines.push(`   Oldest blocked item: ~${digest.summary.oldestBlockedMinutes} minutes`)
  }
  lines.push('')

  // Pending approvals detail
  if (digest.pendingApprovals.length > 0) {
    lines.push('**⏳ Pending Approvals:**')
    for (const approval of digest.pendingApprovals) {
      const phaseLabel = approval.phase === 'deploy' ? 'Deploy' : 'Review'
      lines.push(`• [#${approval.workItemId.slice(0, 8)}] **${approval.workItemTitle}** — ${phaseLabel} approval · _~${approval.ageMinutes}m_ · ${approval.projectName}`)
    }
    lines.push('')
  }

  // Blocked items detail
  if (digest.blockedItems.length > 0) {
    lines.push('**🚧 Blocked Work Items:**')
    for (const item of digest.blockedItems) {
      const reason = item.blockedReason
        ? ` (${item.blockedReason.replace(/_/g, ' ')})`
        : ''
      lines.push(`• [#${item.workItemId.slice(0, 8)}] **${item.workItemTitle}**${reason} · _~${item.ageMinutes}m_ · ${item.projectName}`)
    }
    lines.push('')
  }

  // Failed missions detail
  if (digest.failedMissions.length > 0) {
    lines.push('**❌ Failed Missions:**')
    for (const item of digest.failedMissions) {
      const error = item.missionLastError
        ? ` — ${item.missionLastError.slice(0, 120)}`
        : ''
      lines.push(`• [#${item.workItemId.slice(0, 8)}] **${item.workItemTitle}**${error} · _~${item.ageMinutes}m_ · ${item.projectName}`)
    }
    lines.push('')
  }

  // Lane escalation detail
  if (digest.laneEscalations.length > 0) {
    lines.push('**🚨 Lane Escalations:**')
    for (const escalation of digest.laneEscalations) {
      const label = escalation.kind
        .replace(/_/g, ' ')
        .replace(/^./, (first) => first.toUpperCase())
      const reason = escalation.reason ? ` — ${escalation.reason.slice(0, 160)}` : ''
      const retry = typeof escalation.retryCount === 'number' ? ` · retry #${escalation.retryCount}` : ''
      const branch = escalation.branchName ? ` · branch ${escalation.branchName}` : ''
      lines.push(`• [#${escalation.workItemId.slice(0, 8)}] **${escalation.workItemTitle}** — ${label}${reason}${retry}${branch} · _~${escalation.ageMinutes}m_ · ${escalation.projectName}`)
      lines.push(`  ↳ ${escalation.recoveryGuidance}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('Use `/projects/approvals` and `/dashboard` for full details.')

  return lines.join('\n')
}

export function formatDigestAge(ageMinutes: number | null): string {
  if (ageMinutes === null) return '—'
  if (ageMinutes < 60) return `~${ageMinutes}m`
  const hours = Math.floor(ageMinutes / 60)
  const mins = ageMinutes % 60
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`
}
