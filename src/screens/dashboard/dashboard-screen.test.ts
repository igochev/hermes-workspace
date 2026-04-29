import { describe, expect, it } from 'vitest'

import {
  DASHBOARD_CLICKABILITY_AUDIT,
  DASHBOARD_MISSION_CONTROL_QUERY_KEY,
  DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY,
  DASHBOARD_MISSION_CONTROL_QUEUE_TITLES,
  DASHBOARD_MISSION_CONTROL_SUMMARY_LABELS,
  DASHBOARD_MORNING_REVIEW_BUCKET_LABELS,
  DASHBOARD_MORNING_REVIEW_SUBTITLE,
  DASHBOARD_MORNING_REVIEW_TITLE,
  DASHBOARD_SESSION_TELEMETRY_LABELS,
  buildDashboardAttentionSurface,
  buildDashboardMissionControlQueues,
  buildDashboardMissionControlSummary,
  buildDashboardMorningReviewSurface,
  buildDashboardSessionTelemetryCards,
} from './dashboard-screen'
import type { ProjectSummary, WorkItemRecord } from '@/lib/projects-api'
import type { AttentionQueueItem } from '@/server/attention-queue-store'
import type { ApprovalInboxEntry } from '@/lib/work-item-approvals-api'
import type { SessionTelemetrySummary } from '@/server/session-telemetry'
import type {
  MorningReviewDigest,
  MorningReviewEntry,
} from '@/server/morning-review'

describe('dashboard mission control helpers', () => {
  it('uses a dedicated dashboard query namespace and stable operator-facing labels', () => {
    expect(DASHBOARD_MISSION_CONTROL_QUERY_KEY).toEqual([
      'dashboard',
      'mission-control',
    ])
    expect(DASHBOARD_MISSION_CONTROL_SUMMARY_LABELS).toEqual({
      blockedWorkItems: 'Blocked work',
      failedMissions: 'Failed executions',
      pendingApprovals: 'Pending approvals',
      projects: 'Projects',
      runningMissions: 'Running executions',
      workItems: 'Work items',
    })
    expect(DASHBOARD_MISSION_CONTROL_QUEUE_TITLES).toEqual({
      approvals: 'Pending approvals',
      blocked: 'Blocked work',
      failed: 'Failed executions',
      running: 'Running executions',
    })
  })

  it('builds mission control attention summary counts for the operator dashboard', () => {
    expect(
      buildDashboardMissionControlSummary(
        [
          makeProject({
            id: 'project-1',
            name: 'Mission Control',
            workItemCount: 3,
          }),
          makeProject({
            id: 'project-2',
            name: 'Hermes Workspace',
            workItemCount: 2,
          }),
        ],
        [
          makeWorkItem({
            id: 'blocked-1',
            projectId: 'project-1',
            status: 'blocked',
          }),
          makeWorkItem({
            id: 'failed-1',
            projectId: 'project-2',
            status: 'active',
            missionState: 'failed',
          }),
          makeWorkItem({
            id: 'running-1',
            projectId: 'project-1',
            status: 'active',
            missionState: 'running',
          }),
          makeWorkItem({
            id: 'quiet-1',
            projectId: 'project-2',
            status: 'ready',
          }),
        ],
        [
          makeApproval({
            approvalId: 'approval-1',
            projectId: 'project-1',
            workItemId: 'review-1',
            status: 'pending',
          }),
          makeApproval({
            approvalId: 'approval-2',
            projectId: 'project-2',
            workItemId: 'review-2',
            status: 'approved',
          }),
        ],
      ),
    ).toEqual({
      blockedWorkItems: 1,
      failedMissions: 1,
      pendingApprovals: 1,
      projects: 2,
      runningMissions: 1,
      workItems: 4,
    })
  })

  it('builds top-level operator queues for approvals, blocked work, and running missions', () => {
    const queues = buildDashboardMissionControlQueues(
      [
        makeProject({ id: 'project-1', name: 'Mission Control' }),
        makeProject({ id: 'project-2', name: 'Hermes Workspace' }),
      ],
      [
        makeWorkItem({
          id: 'blocked-new',
          projectId: 'project-2',
          title: 'Fix release blocker',
          status: 'blocked',
          updatedAt: '2026-04-22T10:30:00.000Z',
        }),
        makeWorkItem({
          id: 'blocked-old',
          projectId: 'project-1',
          title: 'Earlier blocker',
          status: 'blocked',
          updatedAt: '2026-04-22T09:30:00.000Z',
        }),
        makeWorkItem({
          id: 'running-1',
          projectId: 'project-1',
          title: 'Implement cockpit updates',
          status: 'active',
          missionState: 'running',
          missionLastRunAt: '2026-04-22T10:45:00.000Z',
          phase: 'build',
        }),
        makeWorkItem({
          id: 'failed-stale-high-attention',
          projectId: 'project-1',
          title: 'Failed release verification',
          status: 'active',
          missionState: 'failed',
          missionLastError: 'Release verification failed',
          updatedAt: '2026-04-22T10:20:00.000Z',
          missionLastRunAt: '2026-04-22T10:20:00.000Z',
          phase: 'deploy',
        }),
        makeWorkItem({
          id: 'failed-recent-lower-attention',
          projectId: 'project-2',
          title: 'Failed build smoke test',
          status: 'active',
          missionState: 'failed',
          missionLastError: 'Smoke test failed',
          updatedAt: '2026-04-22T10:50:00.000Z',
          missionLastRunAt: '2026-04-22T10:50:00.000Z',
          phase: 'build',
        }),
      ],
      [
        makeApproval({
          approvalId: 'approval-new',
          projectId: 'project-1',
          projectName: 'Mission Control',
          workItemId: 'review-new',
          workItemTitle: 'Review cockpit launch flow',
          requestedAt: '2026-04-22T10:40:00.000Z',
          status: 'pending',
        }),
        makeApproval({
          approvalId: 'approval-old',
          projectId: 'project-2',
          projectName: 'Hermes Workspace',
          workItemId: 'review-old',
          workItemTitle: 'Review routing policy copy',
          requestedAt: '2026-04-22T08:40:00.000Z',
          status: 'pending',
        }),
        makeApproval({
          approvalId: 'approval-extra',
          projectId: 'project-1',
          projectName: 'Mission Control',
          workItemId: 'review-extra',
          workItemTitle: 'Review failed release follow-up',
          requestedAt: '2026-04-22T10:35:00.000Z',
          status: 'pending',
        }),
        makeApproval({
          approvalId: 'approval-done',
          projectId: 'project-2',
          workItemId: 'review-done',
          status: 'approved',
        }),
      ],
    )

    expect(queues.approvals.map((item) => item.id)).toEqual([
      'approval-new',
      'approval-extra',
      'approval-old',
    ])
    expect(queues.approvals[0]).toMatchObject({
      href: '/projects/project-1/work-items/review-new',
      subtitle: 'Mission Control',
      title: 'Review cockpit launch flow',
    })
    expect(queues.failed.map((item) => item.id)).toEqual([
      'failed-stale-high-attention',
      'failed-recent-lower-attention',
    ])
    expect(queues.failed[0]).toMatchObject({
      href: '/projects/project-1/work-items/failed-stale-high-attention',
      subtitle: 'Mission Control',
      title: 'Failed release verification',
      detail: 'Deploy failed · 5 attention signals across project',
    })
    expect(queues.blocked.map((item) => item.id)).toEqual([
      'blocked-new',
      'blocked-old',
    ])
    expect(queues.blocked[0]).toMatchObject({
      href: '/projects/project-2/work-items/blocked-new',
      subtitle: 'Hermes Workspace',
      title: 'Fix release blocker',
    })
    expect(queues.running.map((item) => item.id)).toEqual(['running-1'])
    expect(queues.running[0]).toMatchObject({
      href: '/projects/project-1/work-items/running-1',
      subtitle: 'Mission Control',
      title: 'Implement cockpit updates',
    })
  })

  it('builds a calm dashboard attention surface with critical items first and stable hrefs', () => {
    const surface = buildDashboardAttentionSurface([
      makeAttentionItem({
        id: 'warning-blocked',
        dedupeKey: 'blocked:work-2',
        kind: 'blocked_work',
        severity: 'warning',
        title: 'Blocked implementation',
        detail: 'Needs operator follow-up.',
        href: '/projects/project-1/work-items/work-2',
        workItemId: 'work-2',
        lastSeenAt: '2026-04-22T10:10:00.000Z',
      }),
      makeAttentionItem({
        id: 'critical-review',
        dedupeKey: 'review_failed:work-1',
        kind: 'review_failed',
        severity: 'critical',
        title: 'Structured review failed',
        detail: 'Planner requested changes.',
        href: '/projects/project-1/work-items/work-1',
        workItemId: 'work-1',
        lastSeenAt: '2026-04-22T10:00:00.000Z',
      }),
      makeAttentionItem({
        id: 'resolved-old',
        dedupeKey: 'mission_failed:work-old',
        kind: 'mission_failed',
        severity: 'critical',
        title: 'Resolved old failure',
        detail: 'Already handled.',
        status: 'resolved',
        href: '/projects/project-1/work-items/work-old',
        workItemId: 'work-old',
        lastSeenAt: '2026-04-22T11:00:00.000Z',
      }),
    ])

    expect(surface.count).toBe(2)
    expect(surface.items.map((item) => item.id)).toEqual([
      'critical-review',
      'warning-blocked',
    ])
    expect(surface.items[0]).toMatchObject({
      badge: 'critical',
      href: '/projects/project-1/work-items/work-1',
      subtitle: 'Review failed',
      title: 'Structured review failed',
    })
  })

  it('surfaces the first recommended recovery action and keeps a detail deep link', () => {
    const surface = buildDashboardAttentionSurface([
      makeAttentionItem({
        id: 'failed-build',
        dedupeKey: 'mission_failed:work-1',
        kind: 'mission_failed',
        severity: 'critical',
        title: 'Build mission failed',
        detail: 'Builder run exited non-zero.',
        href: '/projects/project-1/work-items/work-1',
        workItemId: 'work-1',
        recommendedActions: [
          {
            type: 'relaunch_phase',
            label: 'Relaunch build',
            description:
              'Relaunch the failed build through the existing launch path.',
            phase: 'build',
            destructive: false,
            auditNote: 'Operator relaunched build from recovery actions.',
          },
          {
            type: 'cancel_work_item',
            label: 'Cancel work item',
            description:
              'Cancel the work item with an operator-supplied reason.',
            destructive: true,
            auditNote: 'Operator cancelled work item from recovery actions.',
          },
        ],
      }),
    ])

    expect(surface.items[0]).toMatchObject({
      firstActionLabel: 'Relaunch build',
      firstActionDescription:
        'Relaunch the failed build through the existing launch path.',
      firstActionType: 'relaunch_phase',
      detailHref: '/projects/project-1/work-items/work-1',
      detailCta: 'Open detail for all recovery actions',
    })
  })

  it('builds a calm empty attention surface when no open items need operator action', () => {
    expect(buildDashboardAttentionSurface([])).toEqual({
      count: 0,
      items: [],
      emptyCopy:
        'No global attention items right now. Mission Control is calm.',
    })
  })

  it('builds the Dashboard Morning Review surface with summary chips and next action links', () => {
    const failedEntry = makeMorningReviewEntry({
      id: 'failed:execution-run-1',
      bucket: 'failed',
      severity: 'critical',
      title: 'Failed execution: build smoke',
      href: '/projects/project-1/work-items/work-1',
      executionHref: '/executions/execution-run-1',
    })
    const surface = buildDashboardMorningReviewSurface(
      makeMorningReviewDigest({
        buckets: {
          changed: [
            makeMorningReviewEntry({
              bucket: 'changed',
              id: 'changed:work-2',
              title: 'Changed: docs update',
            }),
          ],
          needs_approval: [
            makeMorningReviewEntry({
              bucket: 'needs_approval',
              id: 'approval:review-1',
              title: 'Review approval waiting',
            }),
          ],
          failed: [failedEntry],
          merged: [
            makeMorningReviewEntry({
              bucket: 'merged',
              id: 'merged:work-3',
              title: 'Merged: cleanup PR',
              severity: 'success',
            }),
          ],
          parked: [
            makeMorningReviewEntry({
              bucket: 'parked',
              id: 'parked:work-4',
              title: 'Parked: blocked deploy',
              severity: 'warning',
            }),
          ],
        },
        nextAttentionItem: failedEntry,
      }),
    )

    expect(DASHBOARD_MORNING_REVIEW_TITLE).toBe('Morning Review')
    expect(DASHBOARD_MORNING_REVIEW_SUBTITLE).toBe(
      'Overnight digest for the last 18h.',
    )
    expect(DASHBOARD_MORNING_REVIEW_BUCKET_LABELS).toEqual({
      changed: 'Changed',
      needs_approval: 'Needs approval',
      failed: 'Failed',
      merged: 'Merged',
      parked: 'Parked',
    })
    expect(surface.summaryChips).toEqual([
      { bucket: 'changed', label: 'Changed', count: 1 },
      { bucket: 'needs_approval', label: 'Needs approval', count: 1 },
      { bucket: 'failed', label: 'Failed', count: 1 },
      { bucket: 'merged', label: 'Merged', count: 1 },
      { bucket: 'parked', label: 'Parked', count: 1 },
    ])
    expect(surface.primaryAction).toEqual({
      label: 'Open next attention item',
      href: '/projects/project-1/work-items/work-1',
    })
    expect(surface.bucketPreviews.failed[0]).toMatchObject({
      title: 'Failed execution: build smoke',
      href: '/projects/project-1/work-items/work-1',
      executionHref: '/executions/execution-run-1',
      executionLabel: 'Open execution',
    })
  })

  it('builds an explicit all-clear Morning Review state without dead primary actions', () => {
    const surface = buildDashboardMorningReviewSurface(
      makeMorningReviewDigest({ allClear: true }),
    )

    expect(surface.primaryAction).toBeNull()
    expect(surface.allClearCopy).toBe(
      'All clear — no overnight operator action needed.',
    )
    expect(surface.bucketPreviews.failed).toEqual([])
  })

  it('keeps Morning Review execution links on /executions and banned labels absent', () => {
    const surface = buildDashboardMorningReviewSurface(
      makeMorningReviewDigest({
        buckets: {
          changed: [],
          needs_approval: [],
          failed: [
            makeMorningReviewEntry({
              executionHref: '/executions/execution-run-1',
            }),
          ],
          merged: [],
          parked: [],
        },
      }),
    )
    const visibleCopy = JSON.stringify({
      morningReview: surface,
      queueEmptyCopy: DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY,
    })
    const normalizedVisibleCopy = visibleCopy.toLowerCase()

    expect(DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY).toEqual({
      approvals: 'No pending approvals in the operator queue.',
      blocked: 'No blocked work items right now.',
      failed: 'No failed executions in the operator escalation queue.',
      running: 'No running executions at the moment.',
    })
    expect(visibleCopy).toContain('/executions/execution-run-1')
    expect(visibleCopy).not.toContain('/jobs?jobId=')
    expect(normalizedVisibleCopy).not.toContain('mission link')
    expect(normalizedVisibleCopy).not.toContain('hermes job id')
    expect(normalizedVisibleCopy).not.toContain('failed missions')
    expect(normalizedVisibleCopy).not.toContain('running missions')
  })

  it('normalizes Morning Review action links to approved operator routes', () => {
    const unsafeNext = makeMorningReviewEntry({
      href: '/jobs?jobId=legacy-run',
      projectId: 'project-1',
      workItemId: 'work-1',
    })
    const surface = buildDashboardMorningReviewSurface(
      makeMorningReviewDigest({
        buckets: {
          changed: [
            makeMorningReviewEntry({
              bucket: 'changed',
              id: 'unsafe-project-fallback',
              href: '/legacy/missions/unsafe',
              projectId: 'project-2',
              workItemId: undefined,
            }),
            makeMorningReviewEntry({
              bucket: 'changed',
              id: 'approval-link',
              href: '/projects/approvals',
            }),
            makeMorningReviewEntry({
              bucket: 'changed',
              id: 'execution-link',
              href: '/executions/execution-run-2',
              executionHref: '/jobs?jobId=legacy-run-2',
            }),
          ],
          needs_approval: [],
          failed: [unsafeNext],
          merged: [],
          parked: [],
        },
        nextAttentionItem: unsafeNext,
      }),
    )

    expect(surface.primaryAction).toEqual({
      label: 'Open next attention item',
      href: '/projects/project-1/work-items/work-1',
    })
    expect(surface.bucketPreviews.changed.map((entry) => entry.href)).toEqual([
      '/projects/project-2/work-items/work-1',
      '/projects/approvals',
      '/executions/execution-run-2',
    ])
    expect(surface.bucketPreviews.changed[2].executionHref).toBeUndefined()
    expect(JSON.stringify(surface)).not.toContain('/jobs?jobId=')
    expect(JSON.stringify(surface)).not.toContain('/legacy/missions/unsafe')
  })

  it('documents dashboard attention/recovery clickability so no card-like CTA is a no-op', () => {
    expect(DASHBOARD_CLICKABILITY_AUDIT).toEqual([
      {
        surface: 'summary-projects',
        label: 'Projects',
        kind: 'link',
        target: '/projects',
      },
      {
        surface: 'summary-work-items',
        label: 'Work items',
        kind: 'link',
        target: '/projects',
      },
      {
        surface: 'summary-approvals',
        label: 'Pending approvals',
        kind: 'link',
        target: '/projects/approvals',
      },
      {
        surface: 'summary-blocked',
        label: 'Blocked work',
        kind: 'link',
        target: '/projects',
      },
      {
        surface: 'summary-failed',
        label: 'Failed executions',
        kind: 'link',
        target: '/projects',
      },
      {
        surface: 'summary-running',
        label: 'Running executions',
        kind: 'link',
        target: '/projects',
      },
      {
        surface: 'morning-review-chip',
        label: 'Morning Review bucket summary',
        kind: 'static',
        target: null,
      },
      {
        surface: 'morning-review-next-action',
        label: 'Open next attention item',
        kind: 'link',
        target: 'morningReview.primaryAction.href',
      },
      {
        surface: 'morning-review-bucket-entry',
        label: 'Open Morning Review item',
        kind: 'link',
        target: 'morningReview.entry.href',
      },
      {
        surface: 'morning-review-execution-link',
        label: 'Open execution',
        kind: 'link',
        target: 'morningReview.entry.executionHref',
      },
      {
        surface: 'attention-card',
        label: 'Open detail for all recovery actions',
        kind: 'link',
        target: 'attention.href',
      },
      {
        surface: 'attention-first-action',
        label: 'Recommended action preview',
        kind: 'static',
        target: null,
      },
      {
        surface: 'mission-queue-card',
        label: 'Open work item/project detail',
        kind: 'link',
        target: 'queue.href',
      },
      {
        surface: 'session-telemetry-card',
        label: 'Session telemetry summary',
        kind: 'static',
        target: null,
      },
    ])
  })

  it('keeps Dashboard clickability audit entries intentionally linked or static', () => {
    for (const auditEntry of DASHBOARD_CLICKABILITY_AUDIT) {
      if (auditEntry.kind === 'static') {
        expect(auditEntry.target, `${auditEntry.surface} should document a static surface`).toBeNull()
        continue
      }

      expect(auditEntry.target, `${auditEntry.surface} should document its operator target`).toBeTruthy()
    }

    expect(
      DASHBOARD_CLICKABILITY_AUDIT.filter((entry) => entry.surface.startsWith('morning-review')).map(
        (entry) => entry.surface,
      ),
    ).toEqual([
      'morning-review-chip',
      'morning-review-next-action',
      'morning-review-bucket-entry',
      'morning-review-execution-link',
    ])
  })

  it('uses stable labels for session telemetry truth cards', () => {
    expect(DASHBOARD_SESSION_TELEMETRY_LABELS).toEqual({
      totalTokens: 'Session tokens',
      recentSessions: 'Recent sessions',
      highestContext: 'Highest context',
      accuracy: 'Telemetry accuracy',
    })
  })

  it('builds session telemetry cards from the server summary without false precision', () => {
    const summary: SessionTelemetrySummary = {
      totalSessions: 9,
      totalMessages: 18,
      totalInputTokens: 1_000,
      totalOutputTokens: 500,
      totalCacheReadTokens: 250,
      totalTokens: 1_750,
      contextPercent: 72.4,
      accuracy: 'estimated',
      topSessions: [],
    }

    expect(buildDashboardSessionTelemetryCards(summary)).toEqual([
      {
        key: 'totalTokens',
        label: 'Session tokens',
        value: '1.8K',
        detail: 'Estimated from Hermes session metadata',
      },
      {
        key: 'recentSessions',
        label: 'Recent sessions',
        value: '9',
        detail: '18 messages visible to Mission Control',
      },
      {
        key: 'highestContext',
        label: 'Highest context',
        value: '72%',
        detail: 'Highest reported session context usage',
      },
      {
        key: 'accuracy',
        label: 'Telemetry accuracy',
        value: 'Estimated',
        detail: 'Token totals are derived from partial Hermes metadata',
      },
    ])
  })
})

function makeAttentionItem(
  overrides: Partial<AttentionQueueItem>,
): AttentionQueueItem {
  return {
    id: overrides.id ?? 'attention-1',
    dedupeKey: overrides.dedupeKey ?? 'approval:work-item-1',
    kind: overrides.kind ?? 'approval_pending',
    severity: overrides.severity ?? 'warning',
    projectId: overrides.projectId ?? 'project-1',
    workItemId: overrides.workItemId,
    title: overrides.title ?? 'Attention item',
    detail: overrides.detail ?? 'Operator attention needed.',
    href: overrides.href ?? '/projects/project-1/work-items/work-item-1',
    source: overrides.source ?? 'derived',
    status: overrides.status ?? 'open',
    firstSeenAt: overrides.firstSeenAt ?? '2026-04-22T09:00:00.000Z',
    lastSeenAt: overrides.lastSeenAt ?? '2026-04-22T10:00:00.000Z',
    recommendedActions: overrides.recommendedActions ?? [],
  }
}

function makeProject(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: overrides.id ?? 'project-1',
    name: overrides.name ?? 'Mission Control',
    slug: overrides.slug ?? 'mission-control',
    repoPath: overrides.repoPath ?? '/repos/mission-control',
    repoUrl: overrides.repoUrl,
    defaultBranch: overrides.defaultBranch,
    description: overrides.description,
    phaseProfiles: overrides.phaseProfiles ?? {
      research: '',
      build: '',
      review: '',
      deploy: '',
    },
    reviewAutoApproval: overrides.reviewAutoApproval ?? {
      enabled: false,
      maxPriority: 'low',
    },
    runtimeProfiles: overrides.runtimeProfiles ?? {},
    autopilotPolicy: overrides.autopilotPolicy ?? {
      enabled: false,
      schedulePreset: 'manual',
      suggestionLimit: 5,
      scoutSources: ['manual'],
    },
    autonomyLanePolicy: overrides.autonomyLanePolicy ?? {
      enabled: true,
      mode: 'single_lane',
      isolation: 'branch',
      maxActiveWorkItems: 1,
      plannerTiming: 'on_lane_entry',
      blockedBehavior: 'park_and_continue_when_repo_clean',
      mergeHealerEnabled: true,
      allowParallelWorktrees: false,
      alwaysOn: {
        enabled: false,
        retry: {
          enabled: false,
          maxAttemptsPerPhase: 1,
          cooldownMinutes: 30,
          staleScheduledMinutes: 30,
          staleRunningMinutes: 240,
        },
        notifications: {
          enabled: true,
          digestOnly: true,
          notifyOn: ['blocked', 'retry_exhausted', 'unsafe_repo', 'pr_ready', 'cleanup_recommended'],
          minRepeatMinutes: 60,
        },
        prPublishing: {
          enabled: false,
          mode: 'manual',
          titlePrefix: '[Hermes Workspace]',
          requireCleanRepo: true,
          requirePassingMergeTests: true,
        },
        cleanup: {
          enabled: false,
          deleteMergedBranches: false,
          retainMergedBranchDays: 30,
          retainLaneStashes: true,
          retainLaneStashDays: 30,
          dryRun: true,
        },
      },
    },
    createdAt: overrides.createdAt ?? '2026-04-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-22T00:00:00.000Z',
    workItemCount: overrides.workItemCount ?? 0,
    activeWorkItemCount: overrides.activeWorkItemCount ?? 0,
    doneWorkItemCount: overrides.doneWorkItemCount ?? 0,
  }
}

function makeWorkItem(overrides: Partial<WorkItemRecord>): WorkItemRecord {
  return {
    id: overrides.id ?? 'work-item-1',
    projectId: overrides.projectId ?? 'project-1',
    title: overrides.title ?? 'Work item',
    description: overrides.description ?? '',
    status: overrides.status ?? 'inbox',
    phase: overrides.phase,
    priority: overrides.priority ?? 'medium',
    riskLevel: overrides.riskLevel ?? 'medium',
    assignedProfile: overrides.assignedProfile,
    labels: overrides.labels ?? [],
    repoPathSnapshot: overrides.repoPathSnapshot ?? '/repos/mission-control',
    planFilePath: overrides.planFilePath,
    sourceSuggestionId: overrides.sourceSuggestionId,
    sourceSuggestionTitle: overrides.sourceSuggestionTitle,
    sourceSuggestionEvidence: overrides.sourceSuggestionEvidence ?? [],
    autopilotBuildIntent: overrides.autopilotBuildIntent,
    missionId: overrides.missionId,
    missionJobId: overrides.missionJobId,
    missionJobName: overrides.missionJobName,
    missionSessionKeyPrefix: overrides.missionSessionKeyPrefix,
    missionLink: overrides.missionLink,
    missionState: overrides.missionState,
    missionLastRunAt: overrides.missionLastRunAt,
    missionLastError: overrides.missionLastError,
    reviewParserError: overrides.reviewParserError,
    reviewQualityGateStatus: overrides.reviewQualityGateStatus,
    reviewQualityGateReasons: overrides.reviewQualityGateReasons ?? [],
    reviewMissingEvidence: overrides.reviewMissingEvidence ?? [],
    sessionKeys: overrides.sessionKeys ?? [],
    branchName: overrides.branchName,
    prUrl: overrides.prUrl,
    artifactPaths: overrides.artifactPaths ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    criteriaStatus: overrides.criteriaStatus ?? [],
    notes: overrides.notes ?? [],
    approvals: overrides.approvals ?? [],
    history: overrides.history ?? [],
    createdAt: overrides.createdAt ?? '2026-04-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-22T00:00:00.000Z',
  }
}

function makeApproval(
  overrides: Partial<ApprovalInboxEntry>,
): ApprovalInboxEntry {
  return {
    approvalId: overrides.approvalId ?? 'approval-1',
    workItemId: overrides.workItemId ?? 'work-item-1',
    workItemTitle: overrides.workItemTitle ?? 'Review work item',
    projectId: overrides.projectId ?? 'project-1',
    projectName: overrides.projectName ?? 'Mission Control',
    phase: overrides.phase ?? 'review',
    status: overrides.status ?? 'pending',
    requestedBy: overrides.requestedBy ?? 'operator',
    requestedAt: overrides.requestedAt ?? '2026-04-22T09:00:00.000Z',
    resolvedBy: overrides.resolvedBy,
    resolvedAt: overrides.resolvedAt,
    notes: overrides.notes,
    resolutionNotes: overrides.resolutionNotes,
  }
}

function makeMorningReviewEntry(
  overrides: Partial<MorningReviewEntry> = {},
): MorningReviewEntry {
  return {
    id: overrides.id ?? 'failed:execution-run-1',
    bucket: overrides.bucket ?? 'failed',
    severity: overrides.severity ?? 'critical',
    title: overrides.title ?? 'Failed execution: build smoke',
    detail: overrides.detail ?? 'Build smoke failed overnight.',
    projectId: overrides.projectId ?? 'project-1',
    projectName: overrides.projectName ?? 'Mission Control',
    workItemId: overrides.workItemId ?? 'work-1',
    workItemTitle: overrides.workItemTitle ?? 'Build smoke',
    href: overrides.href ?? '/projects/project-1/work-items/work-1',
    observedAt: overrides.observedAt ?? '2026-04-22T09:00:00.000Z',
    ageMinutes: overrides.ageMinutes ?? 120,
    executionHref: overrides.executionHref,
  }
}

function emptyMorningReviewBuckets(): MorningReviewDigest['buckets'] {
  return {
    changed: [],
    needs_approval: [],
    failed: [],
    merged: [],
    parked: [],
  }
}

function makeMorningReviewDigest(
  overrides: Partial<MorningReviewDigest> = {},
): MorningReviewDigest {
  const buckets = overrides.buckets ?? emptyMorningReviewBuckets()
  const summary = overrides.summary ?? {
    changed: buckets.changed.length,
    needs_approval: buckets.needs_approval.length,
    failed: buckets.failed.length,
    merged: buckets.merged.length,
    parked: buckets.parked.length,
    total:
      buckets.changed.length +
      buckets.needs_approval.length +
      buckets.failed.length +
      buckets.merged.length +
      buckets.parked.length,
  }

  return {
    generatedAt: overrides.generatedAt ?? '2026-04-22T11:00:00.000Z',
    window: overrides.window ?? {
      since: '2026-04-21T17:00:00.000Z',
      until: '2026-04-22T11:00:00.000Z',
      lookbackHours: 18,
    },
    summary,
    buckets,
    nextAttentionItem: overrides.nextAttentionItem ?? null,
    allClear: overrides.allClear ?? summary.total === 0,
  }
}
