import { Moon02Icon, Sun02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'

import type { ProjectSummary, WorkItemRecord } from '@/lib/projects-api'
import type { ApprovalInboxEntry } from '@/lib/work-item-approvals-api'
import type { AttentionKind, AttentionQueueItem } from '@/server/attention-queue-store'
import type { HermesSession } from '@/server/hermes-api'
import type { MorningReviewBucket, MorningReviewDigest, MorningReviewEntry } from '@/server/morning-review'
import type {
  SessionTelemetryItem,
  SessionTelemetrySummary,
  TelemetryAccuracy,
} from '@/server/session-telemetry'
import type { WorkItemRecoveryActionType } from '@/server/work-item-recovery-actions'
import { openHamburgerMenu } from '@/components/mobile-hamburger-menu'
import { useFeatureAvailable } from '@/hooks/use-feature-available'
import { applyTheme, useSettingsStore } from '@/hooks/use-settings'
import { fetchAttentionQueue } from '@/lib/attention-queue-api'
import { getUnavailableReason } from '@/lib/feature-gates'
import { MORNING_REVIEW_QUERY_KEY, fetchMorningReview } from '@/lib/morning-review-api'
import { WORK_ITEM_PHASE_LABELS, fetchProjects, fetchWorkItems } from '@/lib/projects-api'
import { fetchSessionTelemetry } from '@/lib/session-telemetry-api'
import { cn } from '@/lib/utils'
import { fetchApprovalInbox } from '@/lib/work-item-approvals-api'
import { chatQueryKeys } from '@/screens/chat/chat-queries'

// ── Helpers ──────────────────────────────────────────────────────

type MissionControlSummary = {
  projects: number
  workItems: number
  pendingApprovals: number
  blockedWorkItems: number
  failedMissions: number
  runningMissions: number
}

type MissionControlQueueEntry = {
  id: string
  title: string
  subtitle: string
  detail: string
  href: string
}

type DashboardAttentionEntry = MissionControlQueueEntry & {
  badge: string
  severity: AttentionQueueItem['severity']
  firstActionLabel?: string
  firstActionDescription?: string
  firstActionType?: WorkItemRecoveryActionType
  detailHref: string
  detailCta: string
}

type DashboardAttentionSurface = {
  count: number
  items: Array<DashboardAttentionEntry>
  emptyCopy: string
}

type MissionControlQueues = {
  approvals: Array<MissionControlQueueEntry>
  failed: Array<MissionControlQueueEntry>
  blocked: Array<MissionControlQueueEntry>
  running: Array<MissionControlQueueEntry>
}

type DashboardSessionTelemetryCard = {
  key: keyof typeof DASHBOARD_SESSION_TELEMETRY_LABELS
  label: string
  value: string
  detail: string
}

type DashboardMorningReviewSummaryChip = {
  bucket: MorningReviewBucket
  label: string
  count: number
}

type DashboardMorningReviewPreview = {
  id: string
  bucket: MorningReviewBucket
  title: string
  detail: string
  context: string
  href: string
  ageLabel: string
  severity: MorningReviewEntry['severity']
  executionHref?: string
  executionLabel?: string
}

type DashboardMorningReviewSurface = {
  title: string
  subtitle: string
  generatedLabel: string
  summaryChips: Array<DashboardMorningReviewSummaryChip>
  primaryAction: { label: string; href: string } | null
  allClearCopy: string | null
  bucketPreviews: Record<MorningReviewBucket, Array<DashboardMorningReviewPreview>>
}

type ClickabilityAuditEntry = {
  surface: string
  label: string
  kind: 'button' | 'link' | 'static'
  target: string | null
}

export const DASHBOARD_SESSION_TELEMETRY_QUERY_KEY = ['dashboard', 'session-telemetry'] as const
export const DASHBOARD_SESSION_TELEMETRY_LABELS = {
  totalTokens: 'Session tokens',
  recentSessions: 'Recent sessions',
  highestContext: 'Highest context',
  accuracy: 'Telemetry accuracy',
} as const

export const DASHBOARD_MISSION_CONTROL_QUERY_KEY = ['dashboard', 'mission-control'] as const
export const DASHBOARD_MISSION_CONTROL_SUMMARY_LABELS: Record<keyof MissionControlSummary, string> = {
  projects: 'Projects',
  workItems: 'Work items',
  pendingApprovals: 'Pending approvals',
  blockedWorkItems: 'Blocked work',
  failedMissions: 'Failed executions',
  runningMissions: 'Running executions',
}
export const DASHBOARD_MISSION_CONTROL_QUEUE_TITLES: Record<keyof MissionControlQueues, string> = {
  approvals: 'Pending approvals',
  failed: 'Failed executions',
  blocked: 'Blocked work',
  running: 'Running executions',
}
export const DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY: Record<keyof MissionControlQueues, string> = {
  approvals: 'No pending approvals in the operator queue.',
  failed: 'No failed executions in the operator escalation queue.',
  blocked: 'No blocked work items right now.',
  running: 'No running executions at the moment.',
}
export const DASHBOARD_MORNING_REVIEW_TITLE = 'Morning Review'
export const DASHBOARD_MORNING_REVIEW_SUBTITLE = 'Overnight digest for the last 18h.'
export const DASHBOARD_MORNING_REVIEW_ALL_CLEAR_COPY = 'All clear — no overnight operator action needed.'
export const DASHBOARD_MORNING_REVIEW_BUCKETS: Array<MorningReviewBucket> = [
  'changed',
  'needs_approval',
  'failed',
  'merged',
  'parked',
]
export const DASHBOARD_MORNING_REVIEW_BUCKET_LABELS: Record<MorningReviewBucket, string> = {
  changed: 'Changed',
  needs_approval: 'Needs approval',
  failed: 'Failed',
  merged: 'Merged',
  parked: 'Parked',
}
export const DASHBOARD_CLICKABILITY_AUDIT: Array<ClickabilityAuditEntry> = [
  { surface: 'summary-projects', label: 'Projects', kind: 'link', target: '/projects' },
  { surface: 'summary-work-items', label: 'Work items', kind: 'link', target: '/projects' },
  { surface: 'summary-approvals', label: 'Pending approvals', kind: 'link', target: '/projects/approvals' },
  { surface: 'summary-blocked', label: 'Blocked work', kind: 'link', target: '/projects' },
  { surface: 'summary-failed', label: 'Failed executions', kind: 'link', target: '/projects' },
  { surface: 'summary-running', label: 'Running executions', kind: 'link', target: '/projects' },
  { surface: 'morning-review-chip', label: 'Morning Review bucket summary', kind: 'static', target: null },
  { surface: 'morning-review-next-action', label: 'Open next attention item', kind: 'link', target: 'morningReview.primaryAction.href' },
  { surface: 'morning-review-bucket-entry', label: 'Open Morning Review item', kind: 'link', target: 'morningReview.entry.href' },
  { surface: 'morning-review-execution-link', label: 'Open execution', kind: 'link', target: 'morningReview.entry.executionHref' },
  { surface: 'attention-card', label: 'Open detail for all recovery actions', kind: 'link', target: 'attention.href' },
  { surface: 'attention-first-action', label: 'Recommended action preview', kind: 'static', target: null },
  { surface: 'mission-queue-card', label: 'Open work item/project detail', kind: 'link', target: 'queue.href' },
  { surface: 'session-telemetry-card', label: 'Session telemetry summary', kind: 'static', target: null },
]

const DASHBOARD_ATTENTION_EMPTY_COPY = 'No global attention items right now. Mission Control is calm.'

const ATTENTION_KIND_LABELS: Record<AttentionKind, string> = {
  approval_pending: 'Approval pending',
  mission_failed: 'Mission failed',
  review_failed: 'Review failed',
  execution_stale: 'Execution stale',
  blocked_work: 'Blocked work',
  capacity_exceeded: 'Capacity advisory',
}

const ATTENTION_SEVERITY_ORDER: Record<AttentionQueueItem['severity'], number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function timeAgo(ts: number): string {
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatPercent(value: number | null): string {
  if (value === null) return '—'
  return `${Math.round(value)}%`
}

function formatAccuracyLabel(accuracy: TelemetryAccuracy): string {
  return accuracy.charAt(0).toUpperCase() + accuracy.slice(1)
}

function telemetryAccuracyDetail(accuracy: TelemetryAccuracy): string {
  if (accuracy === 'exact') return 'Exact token totals from Hermes'
  if (accuracy === 'estimated') return 'Token totals are derived from partial Hermes metadata'
  return 'Telemetry unavailable from Hermes session metadata'
}

function formatMorningReviewAge(ageMinutes: number): string {
  if (ageMinutes < 60) return `${ageMinutes}m ago`
  if (ageMinutes < 1440) return `${Math.floor(ageMinutes / 60)}h ago`
  return `${Math.floor(ageMinutes / 1440)}d ago`
}

function formatMorningReviewTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function morningReviewContext(entry: MorningReviewEntry): string {
  const parts = [entry.projectName, entry.workItemTitle].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'Mission Control'
}

function isApprovedMorningReviewHref(href: string | undefined): href is string {
  if (!href) return false
  return (
    href === '/projects' ||
    href === '/projects/approvals' ||
    href.startsWith('/projects/') ||
    href === '/executions' ||
    href.startsWith('/executions/') ||
    href.startsWith('/executions?')
  )
}

function fallbackMorningReviewHref(entry: MorningReviewEntry): string {
  if (entry.projectId && entry.workItemId) {
    return `/projects/${entry.projectId}/work-items/${entry.workItemId}`
  }
  if (entry.projectId) return `/projects/${entry.projectId}`
  return '/projects'
}

function normalizeMorningReviewHref(entry: MorningReviewEntry): string {
  return isApprovedMorningReviewHref(entry.href) ? entry.href : fallbackMorningReviewHref(entry)
}

function mapMorningReviewEntry(entry: MorningReviewEntry): DashboardMorningReviewPreview {
  const executionHref = entry.executionHref?.startsWith('/executions') ? entry.executionHref : undefined
  return {
    id: entry.id,
    bucket: entry.bucket,
    title: entry.title,
    detail: entry.detail,
    context: morningReviewContext(entry),
    href: normalizeMorningReviewHref(entry),
    ageLabel: formatMorningReviewAge(entry.ageMinutes),
    severity: entry.severity,
    executionHref,
    executionLabel: executionHref ? 'Open execution' : undefined,
  }
}

export function buildDashboardMorningReviewSurface(
  digest: MorningReviewDigest,
): DashboardMorningReviewSurface {
  const bucketPreviews = DASHBOARD_MORNING_REVIEW_BUCKETS.reduce(
    (acc, bucket) => {
      acc[bucket] = digest.buckets[bucket].slice(0, 3).map(mapMorningReviewEntry)
      return acc
    },
    {
      changed: [],
      needs_approval: [],
      failed: [],
      merged: [],
      parked: [],
    } as Record<MorningReviewBucket, Array<DashboardMorningReviewPreview>>,
  )

  return {
    title: DASHBOARD_MORNING_REVIEW_TITLE,
    subtitle: DASHBOARD_MORNING_REVIEW_SUBTITLE,
    generatedLabel: `Generated ${formatMorningReviewTimestamp(digest.generatedAt)}`,
    summaryChips: DASHBOARD_MORNING_REVIEW_BUCKETS.map((bucket) => ({
      bucket,
      label: DASHBOARD_MORNING_REVIEW_BUCKET_LABELS[bucket],
      count: digest.summary[bucket],
    })),
    primaryAction: digest.nextAttentionItem
      ? {
          label: 'Open next attention item',
          href: normalizeMorningReviewHref(digest.nextAttentionItem),
        }
      : null,
    allClearCopy: digest.allClear ? DASHBOARD_MORNING_REVIEW_ALL_CLEAR_COPY : null,
    bucketPreviews,
  }
}

export function buildDashboardSessionTelemetryCards(
  summary: SessionTelemetrySummary,
): Array<DashboardSessionTelemetryCard> {
  return [
    {
      key: 'totalTokens',
      label: DASHBOARD_SESSION_TELEMETRY_LABELS.totalTokens,
      value: formatNumber(summary.totalTokens),
      detail:
        summary.accuracy === 'exact'
          ? 'Exact token totals from Hermes'
          : summary.accuracy === 'estimated'
            ? 'Estimated from Hermes session metadata'
            : 'Telemetry unavailable from Hermes session metadata',
    },
    {
      key: 'recentSessions',
      label: DASHBOARD_SESSION_TELEMETRY_LABELS.recentSessions,
      value: formatNumber(summary.totalSessions),
      detail: `${formatNumber(summary.totalMessages)} messages visible to Mission Control`,
    },
    {
      key: 'highestContext',
      label: DASHBOARD_SESSION_TELEMETRY_LABELS.highestContext,
      value: formatPercent(summary.contextPercent),
      detail:
        summary.contextPercent === null
          ? 'No context usage percentage reported'
          : 'Highest reported session context usage',
    },
    {
      key: 'accuracy',
      label: DASHBOARD_SESSION_TELEMETRY_LABELS.accuracy,
      value: formatAccuracyLabel(summary.accuracy),
      detail: telemetryAccuracyDetail(summary.accuracy),
    },
  ]
}

function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return value || fallback
}

function alpha(color: string, amount: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(amount * 100)))
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

export function buildDashboardMissionControlSummary(
  projects: Array<ProjectSummary>,
  workItems: Array<WorkItemRecord>,
  approvals: Array<ApprovalInboxEntry>,
): MissionControlSummary {
  return {
    projects: projects.length,
    workItems: workItems.length,
    pendingApprovals: approvals.filter((approval) => approval.status === 'pending').length,
    blockedWorkItems: workItems.filter((workItem) => workItem.status === 'blocked').length,
    failedMissions: workItems.filter((workItem) => workItem.missionState === 'failed').length,
    runningMissions: workItems.filter((workItem) => workItem.missionState === 'running').length,
  }
}

export function buildDashboardAttentionSurface(
  attentionItems: Array<AttentionQueueItem>,
): DashboardAttentionSurface {
  const openItems = attentionItems
    .filter((item) => item.status === 'open')
    .sort((left, right) => {
      const severityDelta = ATTENTION_SEVERITY_ORDER[left.severity] - ATTENTION_SEVERITY_ORDER[right.severity]
      if (severityDelta !== 0) return severityDelta
      return Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt)
    })

  return {
    count: openItems.length,
    emptyCopy: DASHBOARD_ATTENTION_EMPTY_COPY,
    items: openItems.slice(0, 5).map((item) => {
      const firstAction = item.recommendedActions.at(0)
      return {
        id: item.id,
        title: item.title,
        subtitle: ATTENTION_KIND_LABELS[item.kind],
        detail: item.detail,
        href: item.href,
        badge: item.severity,
        severity: item.severity,
        ...(firstAction
          ? {
              firstActionLabel: firstAction.label,
              firstActionDescription: firstAction.description,
              firstActionType: firstAction.type,
            }
          : {}),
        detailHref: item.href,
        detailCta: 'Open detail for all recovery actions',
      }
    }),
  }
}

export function buildDashboardMissionControlQueues(
  projects: Array<ProjectSummary>,
  workItems: Array<WorkItemRecord>,
  approvals: Array<ApprovalInboxEntry>,
): MissionControlQueues {
  const projectNames = new Map(projects.map((project) => [project.id, project.name]))
  const projectAttentionCounts = new Map<string, number>()
  const pendingApprovalCounts = approvals
    .filter((approval) => approval.status === 'pending')
    .reduce<Map<string, number>>((counts, approval) => {
      counts.set(approval.projectId, (counts.get(approval.projectId) ?? 0) + 1)
      return counts
    }, new Map())

  for (const workItem of workItems) {
    const current = projectAttentionCounts.get(workItem.projectId) ?? 0
    const shouldCount =
      workItem.status === 'blocked' ||
      workItem.missionState === 'failed' ||
      workItem.missionState === 'running'
    if (shouldCount) {
      projectAttentionCounts.set(workItem.projectId, current + 1)
    }
  }

  for (const [projectId, approvalCount] of pendingApprovalCounts.entries()) {
    projectAttentionCounts.set(projectId, (projectAttentionCounts.get(projectId) ?? 0) + approvalCount)
  }

  return {
    approvals: approvals
      .filter((approval) => approval.status === 'pending')
      .sort((left, right) => Date.parse(right.requestedAt) - Date.parse(left.requestedAt))
      .slice(0, 5)
      .map((approval) => ({
        id: approval.approvalId,
        title: approval.workItemTitle,
        subtitle: approval.projectName || projectNames.get(approval.projectId) || 'Unknown project',
        detail: `${approval.phase === 'deploy' ? 'Deploy' : 'Review'} approval · requested ${approval.requestedAt}`,
        href: `/projects/${approval.projectId}/work-items/${approval.workItemId}`,
      })),
    failed: workItems
      .filter((workItem) => workItem.missionState === 'failed')
      .sort((left, right) => {
        const attentionDelta =
          (projectAttentionCounts.get(right.projectId) ?? 0) -
          (projectAttentionCounts.get(left.projectId) ?? 0)
        if (attentionDelta !== 0) return attentionDelta
        return (
          Date.parse(right.missionLastRunAt ?? right.updatedAt) -
          Date.parse(left.missionLastRunAt ?? left.updatedAt)
        )
      })
      .slice(0, 5)
      .map((workItem) => {
        const attentionCount = projectAttentionCounts.get(workItem.projectId) ?? 1
        return {
          id: workItem.id,
          title: workItem.title,
          subtitle: projectNames.get(workItem.projectId) || 'Unknown project',
          detail: `${workItem.phase ? WORK_ITEM_PHASE_LABELS[workItem.phase] : 'Mission'} failed · ${attentionCount} attention signals across project`,
          href: `/projects/${workItem.projectId}/work-items/${workItem.id}`,
        }
      }),
    blocked: workItems
      .filter((workItem) => workItem.status === 'blocked')
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, 5)
      .map((workItem) => ({
        id: workItem.id,
        title: workItem.title,
        subtitle: projectNames.get(workItem.projectId) || 'Unknown project',
        detail: workItem.missionLastError || 'Operator follow-up needed before this work can continue.',
        href: `/projects/${workItem.projectId}/work-items/${workItem.id}`,
      })),
    running: workItems
      .filter((workItem) => workItem.missionState === 'running')
      .sort(
        (left, right) =>
          Date.parse(right.missionLastRunAt ?? right.updatedAt) -
          Date.parse(left.missionLastRunAt ?? left.updatedAt),
      )
      .slice(0, 5)
      .map((workItem) => ({
        id: workItem.id,
        title: workItem.title,
        subtitle: projectNames.get(workItem.projectId) || 'Unknown project',
        detail: `${workItem.phase ? WORK_ITEM_PHASE_LABELS[workItem.phase] : 'Mission'} running`,
        href: `/projects/${workItem.projectId}/work-items/${workItem.id}`,
      })),
  }
}

function readDashboardPalette() {
  return {
    accent: themeColor('--theme-accent', '#6366f1'),
    accentSecondary: themeColor('--theme-accent-secondary', '#8b5cf6'),
    success: themeColor('--theme-success', '#22c55e'),
    warning: themeColor('--theme-warning', '#f59e0b'),
    danger: themeColor('--theme-danger', '#ef4444'),
    muted: themeColor('--theme-muted', '#6b7280'),
    border: themeColor('--theme-border', '#333333'),
    card: themeColor('--theme-card', '#1a1a2e'),
    text: themeColor('--theme-text', '#e5e7eb'),
  }
}

function useDashboardPalette() {
  const [palette, setPalette] = useState(readDashboardPalette)

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const refresh = () => setPalette(readDashboardPalette())
    refresh()
    const observer = new MutationObserver(refresh)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
    })
    return () => observer.disconnect()
  }, [])

  return palette
}

// ── Glass Card ───────────────────────────────────────────────────

function GlassCard({
  title,
  titleRight,
  accentColor,
  noPadding,
  className,
  children,
}: {
  title?: string
  titleRight?: ReactNode
  accentColor?: string
  noPadding?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border transition-colors',
        className,
      )}
      style={{
        background: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
      }}
    >
      {accentColor && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: `linear-gradient(90deg, ${accentColor}, ${accentColor}50, transparent)`,
          }}
        />
      )}
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            {title}
          </h3>
          {titleRight}
        </div>
      )}
      <div className={cn('flex-1', noPadding ? '' : 'px-5 pb-4 pt-3')}>
        {children}
      </div>
    </div>
  )
}

function EnhancedBadge({ label = 'Enhanced API' }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        border: `1px solid ${themeColor('--theme-accent-border', 'rgba(245, 158, 11, 0.28)')}`,
        background: themeColor('--theme-accent-subtle', 'rgba(245, 158, 11, 0.12)'),
        color: themeColor('--theme-accent', '#f59e0b'),
      }}
    >
      {label}
    </span>
  )
}

function UnavailableWidget({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <GlassCard
      title={title}
      titleRight={<EnhancedBadge />}
      accentColor={themeColor('--theme-warning', '#f59e0b')}
      className="h-full"
    >
      <div className="flex h-full min-h-[180px] items-center justify-center rounded-lg border border-dashed border-[var(--theme-border)] bg-[var(--theme-card2)] px-4 text-center">
        <p className="text-sm text-muted">{description}</p>
      </div>
    </GlassCard>
  )
}

// ── System Glance (status bar) ───────────────────

function SystemGlance({
  sessions,
  connected,
  model,
  provider,
  tokens,
  cost,
}: {
  sessions: number
  connected: boolean
  model: string
  provider: string
  tokens: string
  cost: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-5 py-2.5 backdrop-blur-sm">
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500',
        )}
      />
      <div className="flex flex-1 items-center gap-x-4 overflow-x-auto">
        <span className="text-xs font-medium text-ink">{model}</span>
        <span className="text-muted">·</span>
        <span className="text-xs text-neutral-500">{provider}</span>
        <span className="text-muted">·</span>
        <span className="text-xs text-neutral-500">{sessions} sessions</span>
        <span className="text-muted">·</span>
        <span className="text-xs font-bold tabular-nums text-ink">
          {tokens} tokens
        </span>
        <span className="text-muted">·</span>
        <span className="text-xs text-neutral-400">{cost}</span>
      </div>
    </div>
  )
}

// ── Metric Tile ──────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
  icon,
  accentColor,
}: {
  label: string
  value: string
  sub?: string
  icon: string
  accentColor: string
}) {
  return (
    <GlassCard accentColor={accentColor}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted">
            {label}
          </div>
          <div className="text-2xl font-bold tabular-nums text-ink">
            {value}
          </div>
          {sub && <div className="text-[11px] text-muted">{sub}</div>}
        </div>
        <div
          className="flex size-8 items-center justify-center rounded-lg text-base"
          style={{ background: `${accentColor}15` }}
        >
          {icon}
        </div>
      </div>
    </GlassCard>
  )
}

function MissionControlQueueCard({
  title,
  entries,
  accentColor,
  emptyCopy,
  onOpenAll,
  onOpenEntry,
}: {
  title: string
  entries: Array<MissionControlQueueEntry>
  accentColor: string
  emptyCopy: string
  onOpenAll: () => void
  onOpenEntry: (href: string) => void
}) {
  return (
    <GlassCard
      title={title}
      titleRight={
        <button
          type="button"
          className="text-[10px] text-muted hover:text-neutral-300 transition-colors"
          onClick={onOpenAll}
        >
          View all →
        </button>
      }
      accentColor={accentColor}
      className="h-full"
      noPadding
    >
      <div className="py-2">
        {entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-muted">{emptyCopy}</div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onOpenEntry(entry.href)}
              className="w-full px-5 py-3 text-left transition-colors hover:bg-[var(--theme-card2)]"
            >
              <div className="text-sm font-semibold text-ink">{entry.title}</div>
              <div className="mt-1 text-xs font-medium text-[var(--theme-text)]">{entry.subtitle}</div>
              <div className="mt-1 text-[11px] text-muted">{entry.detail}</div>
            </button>
          ))
        )}
      </div>
    </GlassCard>
  )
}

function MorningReviewCard({
  surface,
  accentColor,
}: {
  surface: DashboardMorningReviewSurface
  accentColor: string
}) {
  const previewEntries = DASHBOARD_MORNING_REVIEW_BUCKETS.flatMap((bucket) =>
    surface.bucketPreviews[bucket].map((entry) => ({ ...entry, bucketLabel: DASHBOARD_MORNING_REVIEW_BUCKET_LABELS[bucket] })),
  )

  return (
    <GlassCard title={surface.title} accentColor={accentColor} noPadding>
      <div className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">{surface.subtitle}</p>
            <p className="mt-1 text-[11px] text-muted">{surface.generatedLabel}</p>
          </div>
          {surface.primaryAction ? (
            <a
              href={surface.primaryAction.href}
              className="inline-flex items-center justify-center rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              {surface.primaryAction.label} →
            </a>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {surface.summaryChips.map((chip) => (
            <div
              key={chip.bucket}
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2"
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                {chip.label}
              </div>
              <div className="mt-1 text-lg font-bold tabular-nums text-ink">{chip.count}</div>
            </div>
          ))}
        </div>
        {surface.allClearCopy ? (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {surface.allClearCopy}
          </div>
        ) : null}
      </div>
      {previewEntries.length > 0 ? (
        <div className="border-t border-[var(--theme-border)] py-2">
          {previewEntries.slice(0, 6).map((entry) => (
            <div key={`${entry.bucket}:${entry.id}`} className="px-5 py-3 hover:bg-[var(--theme-card2)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {entry.bucketLabel} · {entry.ageLabel}
                  </div>
                  <a href={entry.href} className="mt-1 block text-sm font-semibold text-ink hover:text-[var(--theme-accent)]">
                    {entry.title}
                  </a>
                  <div className="mt-1 text-xs text-[var(--theme-text)]">{entry.context}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] text-muted">{entry.detail}</div>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                    entry.severity === 'critical'
                      ? 'bg-red-500/15 text-red-300'
                      : entry.severity === 'warning'
                        ? 'bg-amber-500/15 text-amber-300'
                        : entry.severity === 'success'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-blue-500/15 text-blue-300',
                  )}
                >
                  {entry.severity}
                </span>
              </div>
              {entry.executionHref ? (
                <a
                  href={entry.executionHref}
                  className="mt-2 inline-flex text-[11px] font-semibold text-[var(--theme-accent)] hover:underline"
                >
                  {entry.executionLabel} →
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </GlassCard>
  )
}

function MissionControlAttentionCard({
  surface,
  accentColor,
  onOpenAll,
  onOpenEntry,
}: {
  surface: DashboardAttentionSurface
  accentColor: string
  onOpenAll: () => void
  onOpenEntry: (href: string) => void
}) {
  return (
    <GlassCard
      title="Global attention"
      titleRight={
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
            {surface.count} open
          </span>
          <button
            type="button"
            className="text-[10px] text-muted hover:text-neutral-300 transition-colors"
            onClick={onOpenAll}
          >
            Refresh →
          </button>
        </div>
      }
      accentColor={accentColor}
      className="h-full"
      noPadding
    >
      <div className="py-2">
        {surface.items.length === 0 ? (
          <div className="px-5 py-10 text-center text-xs text-muted">{surface.emptyCopy}</div>
        ) : (
          surface.items.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => onOpenEntry(entry.href)}
              className="w-full px-5 py-3 text-left transition-colors hover:bg-[var(--theme-card2)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">{entry.title}</div>
                  <div className="mt-1 text-xs font-medium text-[var(--theme-text)]">{entry.subtitle}</div>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                    entry.severity === 'critical'
                      ? 'bg-red-500/15 text-red-300'
                      : entry.severity === 'warning'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-blue-500/15 text-blue-300',
                  )}
                >
                  {entry.badge}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted">{entry.detail}</div>
              {entry.firstActionLabel ? (
                <div className="mt-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Recommended recovery
                  </div>
                  <div className="mt-1 text-xs font-semibold text-ink">{entry.firstActionLabel}</div>
                  <div className="mt-1 text-[11px] text-muted">{entry.firstActionDescription}</div>
                </div>
              ) : null}
              <div className="mt-2 text-[11px] font-medium text-[var(--theme-accent)]">
                {entry.detailCta} →
              </div>
            </button>
          ))
        )}
      </div>
    </GlassCard>
  )
}

// ── Activity Chart ───────────────────────────────────────────────

function ActivityChart({
  sessions,
  palette,
}: {
  sessions: Array<HermesSession>
  palette: ReturnType<typeof readDashboardPalette>
}) {
  const chartData = useMemo(() => {
    const dayMap = new Map<string, { sessions: number; messages: number }>()
    const now = Date.now() / 1000
    for (let i = 13; i >= 0; i--) {
      const d = new Date((now - i * 86400) * 1000)
      const key = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      dayMap.set(key, { sessions: 0, messages: 0 })
    }
    for (const s of sessions) {
      if (!s.started_at) continue
      const d = new Date(s.started_at * 1000)
      const key = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      const entry = dayMap.get(key)
      if (entry) {
        entry.sessions += 1
        entry.messages += s.message_count ?? 0
      }
    }
    const all = Array.from(dayMap.entries()).map(([date, data]) => ({
      date,
      ...data,
    }))
    let firstActive = all.findIndex((d) => d.sessions > 0 || d.messages > 0)
    if (firstActive > 0) firstActive = Math.max(0, firstActive - 1)
    return firstActive > 0 ? all.slice(firstActive) : all
  }, [sessions])

  return (
    <GlassCard
      title="Activity"
      titleRight={<span className="text-[10px] text-muted">14 days</span>}
      accentColor={palette.accent}
      className="h-full"
    >
      <div className="h-[200px] w-full -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 32, left: -16, bottom: 0 }}
          >
            <defs>
              <linearGradient id="g-sessions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.accent} stopOpacity={0.3} />
                <stop offset="100%" stopColor={palette.accent} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="g-messages" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette.success} stopOpacity={0.2} />
                <stop offset="100%" stopColor={palette.success} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={palette.border} opacity={0.45} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: palette.muted }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 10, fill: palette.success }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: palette.accent }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              contentStyle={{
                background: palette.card,
                border: `1px solid ${palette.border}`,
                borderRadius: '8px',
                fontSize: '11px',
              }}
              labelStyle={{ color: palette.muted, fontSize: '10px' }}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="messages"
              stroke={palette.success}
              fill="url(#g-messages)"
              strokeWidth={1.5}
              dot={false}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="sessions"
              stroke={palette.accent}
              fill="url(#g-sessions)"
              strokeWidth={2}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-5 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: palette.accent }} />
          Sessions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: palette.success }} />
          Messages
        </span>
      </div>
    </GlassCard>
  )
}

// ── Model Card ───────────────────────────────────────────────────

function ModelCard({ palette }: { palette: ReturnType<typeof readDashboardPalette> }) {
  const sessionsAvailable = useFeatureAvailable('sessions')
  const configAvailable = useFeatureAvailable('config')
  const configQuery = useQuery({
    queryKey: ['hermes-config'],
    queryFn: async () => {
      const res = await fetch('/api/hermes-config')
      if (!res.ok) return null
      return res.json() as Promise<Record<string, unknown>>
    },
    staleTime: 30_000,
    enabled: configAvailable,
  })
  const config = configQuery.data as Record<string, unknown> | undefined
  const modelName = (config?.activeModel ?? '—') as string
  const provider = (config?.activeProvider ?? '—') as string
  const configBlock = config?.config as Record<string, unknown> | undefined
  const modelBlock = configBlock?.model as Record<string, unknown> | undefined
  const baseUrl = (modelBlock?.base_url ??
    configBlock?.base_url ??
    '') as string
  const connected = sessionsAvailable
  const fallbackBlock = config?.fallback_model as
    | Record<string, unknown>
    | undefined
  const fallbackModel = fallbackBlock?.model as string | undefined
  const fallbackProvider = fallbackBlock?.provider as string | undefined

  if (!configAvailable) {
    return (
      <UnavailableWidget
        title="Model"
        description={getUnavailableReason('config')}
      />
    )
  }

  return (
    <GlassCard
      title="Model"
      titleRight={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full',
            connected
              ? 'text-emerald-400 bg-emerald-500/10'
              : 'text-red-400 bg-red-500/10',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              connected ? 'bg-emerald-500' : 'bg-red-500',
            )}
          />
          {connected ? 'Online' : 'Offline'}
        </span>
      }
      accentColor={connected ? palette.success : palette.danger}
      className="h-full"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-lg p-2.5 bg-[var(--theme-card2)] border border-[var(--theme-border)]">
          <div
            className="flex size-7 items-center justify-center rounded-md text-sm"
            style={{ background: alpha(palette.accent, 0.1), color: palette.accent }}
          >
            🤖
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[13px] font-bold text-ink truncate">
              {typeof modelName === 'string' ? modelName : '—'}
            </div>
            <div className="text-[10px] text-muted font-mono truncate">
              {provider}
              {baseUrl ? ` · ${baseUrl}` : ''}
            </div>
          </div>
        </div>
        {fallbackModel && (
          <div className="flex items-center gap-3 rounded-lg p-2.5 bg-[var(--theme-card2)] border border-[var(--theme-border)]">
            <div className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-sm">
              🔄
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[13px] text-ink truncate">
                {fallbackModel}
              </div>
              <div className="text-[10px] text-muted font-mono truncate">
                {fallbackProvider ?? ''}
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

// ── Skills Widget ────────────────────────────────────────────────

function SkillsWidget({ palette }: { palette: ReturnType<typeof readDashboardPalette> }) {
  const skillsAvailable = useFeatureAvailable('skills')
  const skillsQuery = useQuery({
    queryKey: ['hermes-skills'],
    queryFn: async () => {
      const res = await fetch(
        '/api/skills?tab=installed&limit=8&summary=search',
      )
      if (!res.ok) return []
      const data = await res.json()
      return (data?.skills ?? []) as Array<Record<string, unknown>>
    },
    staleTime: 30_000,
    enabled: skillsAvailable,
  })

  const skills = skillsQuery.data ?? []

  if (!skillsAvailable) {
    return (
      <UnavailableWidget
        title="Skills"
        description={getUnavailableReason('skills')}
      />
    )
  }

  return (
    <GlassCard
      title="Skills"
      titleRight={
        <span className="text-[10px] text-muted">
          {skills.length} installed
        </span>
      }
      accentColor={palette.warning}
    >
      {skills.length === 0 ? (
        <div className="text-xs text-neutral-400 py-4 text-center">
          No skills installed
        </div>
      ) : (
        <div className="space-y-1.5">
          {skills.slice(0, 6).map((skill, i) => (
            <div
              key={String(skill.name ?? i)}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-[var(--theme-card2)] transition-colors"
            >
              <span className="text-xs">📦</span>
              <span className="text-xs font-medium text-ink truncate flex-1">
                {String(skill.name ?? 'Unnamed')}
              </span>
              {skill.enabled !== false && (
                <span className="size-1.5 rounded-full bg-emerald-500/60" />
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  )
}

// ── Quick Action ─────────────────────────────────────────────────

function QuickAction({
  label,
  icon,
  onClick,
  accentColor,
  disabled,
  badge,
}: {
  label: string
  icon: string
  onClick: () => void
  accentColor: string
  disabled?: boolean
  badge?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative overflow-hidden flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-all',
        'border-[var(--theme-border)] bg-[var(--theme-card)] text-left',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'hover:border-[var(--theme-accent-border)] hover:scale-[1.01] active:scale-[0.99]',
      )}
    >
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-sm"
        style={{ background: `${accentColor}18` }}
      >
        {icon}
      </div>
      <span
        className="min-w-0 flex-1 text-xs font-semibold"
        style={{ color: 'var(--theme-text)' }}
      >
        {label}
      </span>
      {badge ? (
        <span className="ml-auto shrink-0 rounded-full border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-700">
          {badge}
        </span>
      ) : null}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
        }}
      />
    </button>
  )
}

// ── Session Telemetry ─────────────────────────────────────────────

function SessionTelemetryPanel({
  cards,
  items,
  message,
  palette,
}: {
  cards: Array<DashboardSessionTelemetryCard>
  items: Array<SessionTelemetryItem>
  message?: string
  palette: ReturnType<typeof readDashboardPalette>
}) {
  return (
    <GlassCard
      title="Mission Control telemetry"
      titleRight={<span className="text-[10px] text-muted">15s refresh</span>}
      accentColor={palette.accentSecondary}
      noPadding
    >
      <div className="grid grid-cols-2 gap-px bg-[var(--theme-border)] lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.key} className="bg-[var(--theme-card)] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              {card.label}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{card.value}</div>
            <div className="mt-1 text-[11px] text-muted">{card.detail}</div>
          </div>
        ))}
      </div>
      <div className="p-4">
        {message ? <div className="mb-3 text-xs text-amber-300">{message}</div> : null}
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--theme-border)] py-6 text-center text-xs text-muted">
            Session telemetry unavailable — waiting for Hermes session metadata.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--theme-border)]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--theme-card2)] text-[10px] uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Session</th>
                  <th className="px-3 py-2 font-semibold">Model / provider</th>
                  <th className="px-3 py-2 text-right font-semibold">Tokens</th>
                  <th className="px-3 py-2 text-right font-semibold">Context</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 5).map((item) => (
                  <tr key={item.key} className="border-t border-[var(--theme-border)]">
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{item.label}</div>
                      <div className="text-[10px] text-muted">
                        {item.messageCount} messages · {item.accuracy}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px] text-muted">
                      {item.model ?? 'Unknown model'}{item.provider ? ` · ${item.provider}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-ink">
                      {formatNumber(item.totalTokens)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-muted">
                      {formatPercent(item.contextPercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </GlassCard>
  )
}

// ── Session Row (minimal) ────────────────────────────────────────

function SessionRow({
  session,
  maxTokens,
  onClick,
  palette,
}: {
  session: HermesSession
  maxTokens: number
  onClick: () => void
  palette: ReturnType<typeof readDashboardPalette>
}) {
  const tokens = (session.input_tokens ?? 0) + (session.output_tokens ?? 0)
  const msgs = session.message_count ?? 0
  const tools = session.tool_call_count ?? 0
  const barWidth = maxTokens > 0 ? Math.max(1, (tokens / maxTokens) * 100) : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-[var(--theme-card2)] transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px] font-medium text-ink truncate flex-1 group-hover:text-ink">
          {session.title || session.id}
        </span>
        <span className="text-[10px] tabular-nums text-muted shrink-0">
          {session.started_at ? timeAgo(session.started_at) : ''}
        </span>
      </div>
      <div className="mb-1.5 flex items-center gap-2 text-[10px] text-neutral-500">
        {session.model && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[9px] font-medium"
            style={{
              background: alpha(palette.accent, 0.1),
              color: palette.accent,
            }}
          >
            {session.model}
          </span>
        )}
        <span>{msgs} msgs</span>
        {tools > 0 && <span>{tools} tools</span>}
        {tokens > 0 && <span>{formatNumber(tokens)} tok</span>}
      </div>
      <div className="h-[3px] rounded-full w-full bg-[var(--theme-border)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${barWidth}%`,
            background: `linear-gradient(90deg, ${palette.accent}, ${palette.accentSecondary})`,
          }}
        />
      </div>
    </button>
  )
}

// ── Main Dashboard ───────────────────────────────────────────────

export function DashboardScreen() {
  const navigate = useNavigate()
  const sessionsAvailable = useFeatureAvailable('sessions')
  const skillsAvailable = useFeatureAvailable('skills')
  const sessionsQuery = useQuery({
    // Use a dedicated query key — NOT chatQueryKeys.sessions — to avoid
    // cache collisions with the chat sidebar which fetches fewer sessions
    // and overwrites the dashboard's larger dataset.
    // Also use the workspace proxy (/api/sessions) rather than the server-side
    // listSessions() — the latter calls the gateway via HERMES_API which is
    // only available server-side and returns nothing when called from the client.
    queryKey: ['dashboard', 'sessions'],
    queryFn: async () => {
      const res = await fetch('/api/sessions?limit=200&offset=0')
      if (!res.ok) return []
      const data = (await res.json()) as {
        sessions?: Array<Record<string, unknown>>
      }
      return (data.sessions ?? []).map((s) => ({
        id: (s.key ?? s.id) as string,
        started_at: s.startedAt ? (s.startedAt as number) / 1000 : undefined,
        message_count: (s.message_count as number | undefined) ?? 0,
        tool_call_count: (s.tool_call_count as number | undefined) ?? 0,
        input_tokens: (s.tokenCount as number | undefined) ?? 0,
        output_tokens: 0,
      })) as Array<HermesSession>
    },
    staleTime: 10_000,
    refetchInterval: 30_000,
    enabled: sessionsAvailable,
  })

  const sessions = (sessionsQuery.data ?? [])
  const sessionTelemetryQuery = useQuery({
    queryKey: DASHBOARD_SESSION_TELEMETRY_QUERY_KEY,
    queryFn: fetchSessionTelemetry,
    staleTime: 5_000,
    refetchInterval: 15_000,
    enabled: sessionsAvailable,
  })

  const emptySessionTelemetrySummary: SessionTelemetrySummary = {
    totalSessions: 0,
    totalMessages: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalTokens: 0,
    contextPercent: null,
    accuracy: 'unavailable',
    topSessions: [],
  }

  const missionProjectsQuery = useQuery({
    queryKey: [...DASHBOARD_MISSION_CONTROL_QUERY_KEY, 'projects'],
    queryFn: fetchProjects,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const missionWorkItemsQuery = useQuery({
    queryKey: [...DASHBOARD_MISSION_CONTROL_QUERY_KEY, 'work-items'],
    queryFn: () => fetchWorkItems(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const missionApprovalsQuery = useQuery({
    queryKey: [...DASHBOARD_MISSION_CONTROL_QUERY_KEY, 'approvals'],
    queryFn: fetchApprovalInbox,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const missionAttentionQuery = useQuery({
    queryKey: [...DASHBOARD_MISSION_CONTROL_QUERY_KEY, 'attention-queue'],
    queryFn: () => fetchAttentionQueue({ refresh: true }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
  const morningReviewQuery = useQuery({
    queryKey: MORNING_REVIEW_QUERY_KEY,
    queryFn: () => fetchMorningReview({ lookbackHours: 18 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  const missionProjects = missionProjectsQuery.data ?? []
  const missionWorkItems = missionWorkItemsQuery.data ?? []
  const missionApprovals = missionApprovalsQuery.data ?? []
  const missionAttentionItems = missionAttentionQuery.data?.items ?? []

  const stats = useMemo(() => {
    let totalMessages = 0,
      totalToolCalls = 0,
      totalTokens = 0
    for (const s of sessions) {
      totalMessages += s.message_count ?? 0
      totalToolCalls += s.tool_call_count ?? 0
      totalTokens += (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
    }
    return {
      totalSessions: sessions.length,
      totalMessages,
      totalToolCalls,
      totalTokens,
    }
  }, [sessions])

  const recentSessions = useMemo(
    () =>
      [...sessions]
        .sort((a, b) => (b.started_at ?? 0) - (a.started_at ?? 0))
        .slice(0, 6),
    [sessions],
  )

  const maxTokens = useMemo(() => {
    let max = 0
    for (const s of recentSessions) {
      const t = (s.input_tokens ?? 0) + (s.output_tokens ?? 0)
      if (t > max) max = t
    }
    return max
  }, [recentSessions])

  const costEstimate = `~$${((stats.totalTokens / 1_000_000) * 5).toFixed(2)}`
  const palette = useDashboardPalette()
  const missionControlSummary = useMemo(
    () => buildDashboardMissionControlSummary(missionProjects, missionWorkItems, missionApprovals),
    [missionApprovals, missionProjects, missionWorkItems],
  )
  const missionControlQueues = useMemo(
    () => buildDashboardMissionControlQueues(missionProjects, missionWorkItems, missionApprovals),
    [missionApprovals, missionProjects, missionWorkItems],
  )
  const missionAttentionSurface = useMemo(
    () => buildDashboardAttentionSurface(missionAttentionItems),
    [missionAttentionItems],
  )
  const morningReviewSurface = useMemo(
    () =>
      morningReviewQuery.data?.digest
        ? buildDashboardMorningReviewSurface(morningReviewQuery.data.digest)
        : null,
    [morningReviewQuery.data],
  )
  const sessionTelemetrySummary = sessionTelemetryQuery.data?.summary ?? emptySessionTelemetrySummary
  const sessionTelemetryCards = useMemo(
    () => buildDashboardSessionTelemetryCards(sessionTelemetrySummary),
    [sessionTelemetrySummary],
  )
  const sessionTelemetryItems = sessionTelemetryQuery.data?.items ?? sessionTelemetrySummary.topSessions
  const sessionTelemetryMessage = sessionTelemetryQuery.error
    ? sessionTelemetryQuery.error instanceof Error
      ? sessionTelemetryQuery.error.message
      : String(sessionTelemetryQuery.error)
    : sessionTelemetryQuery.data?.message

  const updateSettings = useSettingsStore((state) => state.updateSettings)
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return true
    const dt = document.documentElement.getAttribute('data-theme') || ''
    return !dt.endsWith('-light')
  })

  return (
    <div className="min-h-full">
      {/* Floating mobile nav: hamburger left, theme toggle right */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-2 h-12" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <button
          type="button"
          aria-label="Open navigation menu"
          onClick={openHamburgerMenu}
          className="flex items-center justify-center w-11 h-11 rounded-xl active:bg-white/10 transition-colors touch-manipulation"
        >
          <svg width="20" height="16" viewBox="0 0 20 16" fill="none" className="opacity-70" style={{ color: 'var(--color-ink, #111)' }}>
            <path d="M1 1.5H19M1 8H19M1 14.5H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Toggle theme"
          onClick={() => {
            const LIGHT_DARK_PAIRS: Record<string, string> = {
              'hermes-nous': 'hermes-nous-light',
              'hermes-nous-light': 'hermes-nous',
              'hermes-official': 'hermes-official-light',
              'hermes-official-light': 'hermes-official',
              'hermes-classic': 'hermes-classic-light',
              'hermes-classic-light': 'hermes-classic',
              'hermes-slate': 'hermes-slate-light',
              'hermes-slate-light': 'hermes-slate',
            }
            const cur = document.documentElement.getAttribute('data-theme') || 'hermes-official'
            const nextDataTheme = LIGHT_DARK_PAIRS[cur] || (isDark ? 'hermes-official-light' : 'hermes-official')
            import('@/lib/theme').then(({ setTheme }) => { setTheme(nextDataTheme as any) })
            const nextMode = nextDataTheme.endsWith('-light') ? 'light' : 'dark'
            applyTheme(nextMode)
            updateSettings({ theme: nextMode })
            setIsDark(nextMode === 'dark')
          }}
          className="flex items-center justify-center w-11 h-11 rounded-xl active:bg-white/10 transition-colors touch-manipulation"
          style={{ color: 'var(--theme-muted)' }}
        >
          <HugeiconsIcon icon={isDark ? Sun02Icon : Moon02Icon} size={20} strokeWidth={1.5} />
        </button>
      </div>
      <div className="px-4 pt-14 md:pt-4 py-4 md:px-8 md:py-6 lg:px-10 space-y-5 pb-28">
      {/* ── Header: Hermes Logo + Quick Actions ── */}
      <div className="flex flex-col items-center gap-3 py-3">
        <img
          src="/hermes-avatar.webp"
          alt="Hermes"
          className="size-12 md:size-14 rounded-md border border-[var(--theme-border)]"
          style={{ padding: '3px', background: 'var(--theme-card)' }}
        />
        <p className="micro-label" style={{ color: 'var(--theme-muted)' }}>
          Hermes Workspace
        </p>
        <div className="mt-1 grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
          <QuickAction
            label="Projects"
            icon="🗂️"
            accentColor={palette.warning}
            onClick={() => navigate({ to: '/projects' })}
          />
          <QuickAction
            label="Approvals"
            icon="✅"
            accentColor={palette.danger}
            onClick={() => navigate({ to: '/projects/approvals' })}
            badge={missionControlSummary.pendingApprovals > 0 ? String(missionControlSummary.pendingApprovals) : undefined}
          />
          <QuickAction
            label="New Chat"
            icon="💬"
            accentColor={palette.accent}
            onClick={() =>
              navigate({
                to: '/chat/$sessionKey',
                params: { sessionKey: 'new' },
              })
            }
          />
          <QuickAction
            label="Terminal"
            icon="💻"
            accentColor={palette.success}
            onClick={() => navigate({ to: '/terminal' })}
          />
          <QuickAction
            label="Skills"
            icon="🧩"
            accentColor={palette.warning}
            onClick={() => navigate({ to: '/skills' })}
            disabled={!skillsAvailable}
            badge={!skillsAvailable ? 'Enhanced' : undefined}
          />
          <QuickAction
            label="Settings"
            icon="⚙️"
            accentColor={palette.accentSecondary}
            onClick={() => navigate({ to: '/settings' })}
          />
        </div>
      </div>

      {/* ── Mission Control Overview ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {(Object.keys(DASHBOARD_MISSION_CONTROL_SUMMARY_LABELS) as Array<keyof MissionControlSummary>).map((key) => {
          const accentColor =
            key === 'pendingApprovals'
              ? palette.warning
              : key === 'blockedWorkItems' || key === 'failedMissions'
                ? palette.danger
                : key === 'runningMissions'
                  ? palette.accent
                  : palette.accentSecondary
          return (
            <MetricTile
              key={key}
              label={DASHBOARD_MISSION_CONTROL_SUMMARY_LABELS[key]}
              value={String(missionControlSummary[key])}
              icon={
                key === 'projects'
                  ? '🗂️'
                  : key === 'workItems'
                    ? '📋'
                    : key === 'pendingApprovals'
                      ? '✅'
                      : key === 'blockedWorkItems'
                        ? '⛔'
                        : key === 'failedMissions'
                          ? '🔥'
                          : '🚀'
              }
              accentColor={accentColor}
              sub={
                key === 'pendingApprovals'
                  ? 'Operator decisions waiting now'
                  : key === 'blockedWorkItems'
                    ? 'Needs follow-up before work can continue'
                    : key === 'failedMissions'
                      ? 'Escalate and relaunch high-risk failures now'
                      : key === 'runningMissions'
                        ? 'Execution currently in flight'
                        : undefined
              }
            />
          )
        })}
      </div>

      {morningReviewSurface ? (
        <MorningReviewCard
          surface={morningReviewSurface}
          accentColor={
            morningReviewSurface.summaryChips.some((chip) => chip.bucket === 'failed' && chip.count > 0)
              ? palette.danger
              : palette.accent
          }
        />
      ) : (
        <GlassCard title={DASHBOARD_MORNING_REVIEW_TITLE} accentColor={palette.accent}>
          <p className="text-sm font-semibold text-ink">{DASHBOARD_MORNING_REVIEW_SUBTITLE}</p>
          <p className="mt-2 text-xs text-muted">
            {morningReviewQuery.error
              ? `Morning Review unavailable: ${morningReviewQuery.error instanceof Error ? morningReviewQuery.error.message : String(morningReviewQuery.error)}`
              : 'Loading overnight digest…'}
          </p>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <MissionControlAttentionCard
          surface={missionAttentionSurface}
          accentColor={
            missionAttentionSurface.items.some((item) => item.severity === 'critical')
              ? palette.danger
              : palette.warning
          }
          onOpenAll={() => void missionAttentionQuery.refetch()}
          onOpenEntry={(href) => {
            const workItemMatch = href.match(/^\/projects\/([^/]+)\/work-items\/([^/]+)$/)
            if (workItemMatch) {
              navigate({
                to: '/projects/$projectId/work-items/$workItemId',
                params: { projectId: workItemMatch[1], workItemId: workItemMatch[2] },
              })
              return
            }
            const projectMatch = href.match(/^\/projects\/([^/]+)$/)
            if (projectMatch) {
              navigate({ to: '/projects/$projectId', params: { projectId: projectMatch[1] } })
              return
            }
            navigate({ to: '/projects' })
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <MissionControlQueueCard
          title={DASHBOARD_MISSION_CONTROL_QUEUE_TITLES.approvals}
          entries={missionControlQueues.approvals}
          accentColor={palette.warning}
          emptyCopy={DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY.approvals}
          onOpenAll={() => navigate({ to: '/projects/approvals' })}
          onOpenEntry={(href) => {
            const match = href.match(/^\/projects\/([^/]+)\/work-items\/([^/]+)$/)
            if (!match) return
            navigate({
              to: '/projects/$projectId/work-items/$workItemId',
              params: { projectId: match[1], workItemId: match[2] },
            })
          }}
        />
        <MissionControlQueueCard
          title={DASHBOARD_MISSION_CONTROL_QUEUE_TITLES.failed}
          entries={missionControlQueues.failed}
          accentColor={palette.danger}
          emptyCopy={DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY.failed}
          onOpenAll={() => navigate({ to: '/projects' })}
          onOpenEntry={(href) => {
            const match = href.match(/^\/projects\/([^/]+)\/work-items\/([^/]+)$/)
            if (!match) return
            navigate({
              to: '/projects/$projectId/work-items/$workItemId',
              params: { projectId: match[1], workItemId: match[2] },
            })
          }}
        />
        <MissionControlQueueCard
          title={DASHBOARD_MISSION_CONTROL_QUEUE_TITLES.blocked}
          entries={missionControlQueues.blocked}
          accentColor={palette.danger}
          emptyCopy={DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY.blocked}
          onOpenAll={() => navigate({ to: '/projects' })}
          onOpenEntry={(href) => {
            const match = href.match(/^\/projects\/([^/]+)\/work-items\/([^/]+)$/)
            if (!match) return
            navigate({
              to: '/projects/$projectId/work-items/$workItemId',
              params: { projectId: match[1], workItemId: match[2] },
            })
          }}
        />
        <MissionControlQueueCard
          title={DASHBOARD_MISSION_CONTROL_QUEUE_TITLES.running}
          entries={missionControlQueues.running}
          accentColor={palette.accent}
          emptyCopy={DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY.running}
          onOpenAll={() => navigate({ to: '/projects' })}
          onOpenEntry={(href) => {
            const match = href.match(/^\/projects\/([^/]+)\/work-items\/([^/]+)$/)
            if (!match) return
            navigate({
              to: '/projects/$projectId/work-items/$workItemId',
              params: { projectId: match[1], workItemId: match[2] },
            })
          }}
        />
      </div>

      {/* ── Session Telemetry Truth ── */}
      {sessionsAvailable ? (
        <SessionTelemetryPanel
          cards={sessionTelemetryCards}
          items={sessionTelemetryItems}
          message={sessionTelemetryMessage}
          palette={palette}
        />
      ) : (
        <UnavailableWidget
          title="Mission Control telemetry"
          description={getUnavailableReason('sessions')}
        />
      )}

      {/* ── Metrics Row ── */}
      {sessionsAvailable ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricTile
            label="Sessions"
            value={formatNumber(stats.totalSessions)}
            icon="💬"
            accentColor={palette.accent}
          />
          <MetricTile
            label="Messages"
            value={formatNumber(stats.totalMessages)}
            icon="✉️"
            accentColor={palette.success}
          />
          <MetricTile
            label="Tool Calls"
            value={formatNumber(stats.totalToolCalls)}
            icon="🔧"
            accentColor={palette.warning}
          />
          <MetricTile
            label="Tokens"
            value={formatNumber(stats.totalTokens)}
            sub={costEstimate}
            icon="⚡"
            accentColor={palette.accentSecondary}
          />
        </div>
      ) : (
        <UnavailableWidget
          title="Workspace Analytics"
          description={getUnavailableReason('sessions')}
        />
      )}

      {/* ── Charts + Model + Skills ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-5">
          {sessionsAvailable ? (
            <ActivityChart sessions={sessions} palette={palette} />
          ) : (
            <UnavailableWidget
              title="Activity"
              description={getUnavailableReason('sessions')}
            />
          )}
        </div>
        <div className="lg:col-span-4">
          <ModelCard palette={palette} />
        </div>
        <div className="lg:col-span-3">
          <SkillsWidget palette={palette} />
        </div>
      </div>

      {/* ── Recent Sessions (minimal) ── */}
      {sessionsAvailable ? (
        <GlassCard
          title="Recent Sessions"
          titleRight={
            <button
              type="button"
              className="text-[10px] text-muted hover:text-neutral-300 transition-colors"
              onClick={() =>
                navigate({
                  to: '/chat/$sessionKey',
                  params: { sessionKey: 'main' },
                })
              }
            >
              View all →
            </button>
          }
          accentColor={palette.accent}
          noPadding
        >
          <div className="py-1">
            {recentSessions.length === 0 ? (
              <div className="text-xs text-neutral-400 py-8 text-center">
                No sessions yet — start a chat!
              </div>
            ) : (
              recentSessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  maxTokens={maxTokens}
                  palette={palette}
                  onClick={() =>
                    navigate({
                      to: '/chat/$sessionKey',
                      params: { sessionKey: s.id },
                    })
                  }
                />
              ))
            )}
          </div>
        </GlassCard>
      ) : (
        <UnavailableWidget
          title="Recent Sessions"
          description={getUnavailableReason('sessions')}
        />
      )}
      </div>
    </div>
  )
}
