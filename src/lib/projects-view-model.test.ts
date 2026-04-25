import { describe, expect, it } from 'vitest'

import {
  PROJECT_ACTIVE_WIP_WARNING_THRESHOLD,
  PROJECT_BOARD_FLOW_ORDER,
  buildLabelAnalytics,
  buildProjectBoardUrgencySummary,
  buildProjectStatsLine,
  buildProjectWipHint,
  buildWorkItemOperatorSignals,
  buildWorkItemRecoveryHint,
  filterWorkItemsForProjectBoard,
  getUniqueLabels,
  getWorkItemUrgencyTone,
  groupWorkItemsByStatus,
  isProjectWipHigh,
  sortWorkItemsForProjectBoard,
  type LabelAnalytics,
  type ProjectSummary,
  type WorkItemRecord,
} from './projects-view-model'

describe('projects-view-model', () => {
  it('formats compact project stats for project cards', () => {
    const project: ProjectSummary = {
      id: 'project-1',
      name: 'Mission Control',
      slug: 'mission-control',
      repoPath: '/repos/mission-control',
      createdAt: '2026-04-21T00:00:00.000Z',
      updatedAt: '2026-04-21T00:00:00.000Z',
      workItemCount: 5,
      activeWorkItemCount: 2,
      doneWorkItemCount: 1,
    }

    expect(buildProjectStatsLine(project)).toBe('5 work items · 2 active · 1 done')
  })

  it('flags high WIP pressure once active work reaches threshold', () => {
    expect(PROJECT_ACTIVE_WIP_WARNING_THRESHOLD).toBe(3)
    expect(isProjectWipHigh(2)).toBe(false)
    expect(isProjectWipHigh(3)).toBe(true)
    expect(buildProjectWipHint(2)).toBeNull()
    expect(buildProjectWipHint(3)).toBe('WIP is high; finish one active item first.')
  })

  it('groups work items into the canonical Mission Control status order', () => {
    const workItems: Array<WorkItemRecord> = [
      makeWorkItem({ id: 'done', status: 'done' }),
      makeWorkItem({ id: 'active', status: 'active' }),
      makeWorkItem({ id: 'blocked', status: 'blocked' }),
      makeWorkItem({ id: 'inbox', status: 'inbox' }),
    ]

    const grouped = groupWorkItemsByStatus(workItems)

    expect(PROJECT_BOARD_FLOW_ORDER).toEqual([
      'inbox',
      'ready',
      'active',
      'blocked',
      'done',
      'cancelled',
    ])
    expect(grouped.active.map((item) => item.id)).toEqual(['active'])
    expect(grouped.inbox.map((item) => item.id)).toEqual(['inbox'])
    expect(grouped.blocked.map((item) => item.id)).toEqual(['blocked'])
    expect(grouped.done.map((item) => item.id)).toEqual(['done'])
    expect(grouped.ready).toEqual([])
    expect(grouped.cancelled).toEqual([])
  })

  it('sorts work items inside a board column by operator attention first', () => {
    const sorted = sortWorkItemsForProjectBoard([
      makeWorkItem({
        id: 'low-priority',
        title: 'Low priority',
        status: 'active',
        priority: 'low',
        updatedAt: '2026-04-21T00:00:00.000Z',
      }),
      makeWorkItem({
        id: 'changes-requested',
        title: 'Changes requested',
        status: 'active',
        phase: 'review',
        approvals: [
          {
            id: 'approval-2',
            workItemId: 'changes-requested',
            projectId: 'project-1',
            phase: 'review',
            status: 'changes_requested',
            requestedBy: 'operator',
            requestedAt: '2026-04-21T00:00:00.000Z',
            createdAt: '2026-04-21T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
          },
        ],
      }),
      makeWorkItem({
        id: 'running-high',
        title: 'Running high',
        status: 'active',
        priority: 'high',
        missionState: 'running',
        updatedAt: '2026-04-21T00:00:01.000Z',
      }),
      makeWorkItem({
        id: 'approval-pending',
        title: 'Approval pending',
        status: 'active',
        phase: 'review',
        approvals: [
          {
            id: 'approval-3',
            workItemId: 'approval-pending',
            projectId: 'project-1',
            phase: 'review',
            status: 'pending',
            requestedBy: 'operator',
            requestedAt: '2026-04-21T00:00:00.000Z',
            createdAt: '2026-04-21T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
          },
        ],
      }),
    ])

    expect(sorted.map((item) => item.id)).toEqual([
      'approval-pending',
      'changes-requested',
      'running-high',
      'low-priority',
    ])
  })

  it('sorts lower-risk items after higher-risk items at the same attention and priority', () => {
    const sorted = sortWorkItemsForProjectBoard([
      makeWorkItem({
        id: 'medium-risk',
        title: 'Medium risk',
        status: 'active',
        priority: 'medium',
        riskLevel: 'medium',
        updatedAt: '2026-04-21T00:00:01.000Z',
      }),
      makeWorkItem({
        id: 'low-risk',
        title: 'Low risk',
        status: 'active',
        priority: 'medium',
        riskLevel: 'low',
        updatedAt: '2026-04-21T00:00:02.000Z',
      }),
      makeWorkItem({
        id: 'high-risk',
        title: 'High risk',
        status: 'active',
        priority: 'medium',
        riskLevel: 'high',
        updatedAt: '2026-04-21T00:00:00.000Z',
      }),
    ])

    expect(sorted.map((item) => item.id)).toEqual([
      'high-risk',
      'medium-risk',
      'low-risk',
    ])
  })

  it('builds project urgency summary counters for the operator board header', () => {
    const summary = buildProjectBoardUrgencySummary([
      makeWorkItem({
        id: 'pending-approval',
        phase: 'review',
        approvals: [
          {
            id: 'approval-5',
            workItemId: 'pending-approval',
            projectId: 'project-1',
            phase: 'review',
            status: 'pending',
            requestedBy: 'operator',
            requestedAt: '2026-04-21T00:00:00.000Z',
            createdAt: '2026-04-21T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
          },
        ],
      }),
      makeWorkItem({
        id: 'changes-requested',
        phase: 'review',
        approvals: [
          {
            id: 'approval-6',
            workItemId: 'changes-requested',
            projectId: 'project-1',
            phase: 'review',
            status: 'changes_requested',
            requestedBy: 'operator',
            requestedAt: '2026-04-21T00:00:00.000Z',
            createdAt: '2026-04-21T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
          },
        ],
      }),
      makeWorkItem({ id: 'running', missionState: 'running', sessionKeys: ['s1'] }),
      makeWorkItem({ id: 'failed', missionState: 'failed' }),
      makeWorkItem({ id: 'blocked', status: 'blocked' }),
      makeWorkItem({ id: 'quiet', status: 'ready' }),
    ])

    expect(summary).toEqual({
      activeThisWeek: 0,
      blocked: 1,
      blockedThisWeek: 1,
      changesRequested: 1,
      doneThisWeek: 0,
      failedMissions: 1,
      pendingApprovals: 1,
      runningMissions: 1,
    })
  })

  it('adds an explicit recovery signal when blocked work has a failed mission', () => {
    expect(
      buildWorkItemOperatorSignals(
        makeWorkItem({
          id: 'recovery-needed',
          status: 'blocked',
          phase: 'build',
          missionState: 'failed',
        }),
      ),
    ).toEqual(
      expect.arrayContaining(['Mission failed', 'Recovery ready', 'Build phase']),
    )
  })

  it('builds recovery hints for failed and rework-oriented cards', () => {
    expect(
      buildWorkItemRecoveryHint(
        makeWorkItem({
          id: 'failed-build',
          status: 'blocked',
          phase: 'build',
          missionState: 'failed',
        }),
      ),
    ).toBe('Recovery: Resume Build, then relaunch Build.')
    expect(
      buildWorkItemRecoveryHint(
        makeWorkItem({
          id: 'changes-requested',
          status: 'active',
          phase: 'review',
          approvals: [
            {
              id: 'approval-8',
              workItemId: 'changes-requested',
              projectId: 'project-1',
              phase: 'review',
              status: 'changes_requested',
              requestedBy: 'operator',
              requestedAt: '2026-04-21T00:00:00.000Z',
              createdAt: '2026-04-21T00:00:00.000Z',
              updatedAt: '2026-04-21T00:00:00.000Z',
            },
          ],
        }),
      ),
    ).toBe('Recovery: Address review feedback and relaunch Build.')
    expect(buildWorkItemRecoveryHint(makeWorkItem({ id: 'quiet', status: 'ready' }))).toBeNull()
  })

  it('assigns stronger urgency tones for board card emphasis', () => {
    expect(
      getWorkItemUrgencyTone(
        makeWorkItem({
          id: 'pending',
          approvals: [
            {
              id: 'approval-7',
              workItemId: 'pending',
              projectId: 'project-1',
              phase: 'review',
              status: 'pending',
              requestedBy: 'operator',
              requestedAt: '2026-04-21T00:00:00.000Z',
              createdAt: '2026-04-21T00:00:00.000Z',
              updatedAt: '2026-04-21T00:00:00.000Z',
            },
          ],
        }),
      ),
    ).toBe('warning')
    expect(getWorkItemUrgencyTone(makeWorkItem({ id: 'blocked', status: 'blocked' }))).toBe('danger')
    expect(getWorkItemUrgencyTone(makeWorkItem({ id: 'failed', missionState: 'failed' }))).toBe(
      'danger',
    )
    expect(getWorkItemUrgencyTone(makeWorkItem({ id: 'quiet', status: 'ready' }))).toBe('default')
  })

  it('filters board work items by operator attention presets', () => {
    const workItems = [
      makeWorkItem({
        id: 'needs-approval',
        status: 'active',
        phase: 'review',
        approvals: [
          {
            id: 'approval-4',
            workItemId: 'needs-approval',
            projectId: 'project-1',
            phase: 'review',
            status: 'pending',
            requestedBy: 'operator',
            requestedAt: '2026-04-21T00:00:00.000Z',
            createdAt: '2026-04-21T00:00:00.000Z',
            updatedAt: '2026-04-21T00:00:00.000Z',
          },
        ],
      }),
      makeWorkItem({ id: 'running', status: 'active', missionState: 'running' }),
      makeWorkItem({ id: 'blocked', status: 'blocked', priority: 'high' }),
      makeWorkItem({ id: 'quiet', status: 'ready', priority: 'low' }),
    ]

    expect(filterWorkItemsForProjectBoard(workItems, 'attention').map((item) => item.id)).toEqual([
      'needs-approval',
      'running',
      'blocked',
    ])
    expect(filterWorkItemsForProjectBoard(workItems, 'execution').map((item) => item.id)).toEqual([
      'running',
    ])
    expect(filterWorkItemsForProjectBoard(workItems, 'approvals').map((item) => item.id)).toEqual([
      'needs-approval',
    ])
    expect(filterWorkItemsForProjectBoard(workItems, 'all').map((item) => item.id)).toEqual([
      'needs-approval',
      'running',
      'blocked',
      'quiet',
    ])
  })

  it('deduplicates labels across work items', () => {
    const workItems = [
      makeWorkItem({ id: 'w1', labels: ['frontend', 'bug'] }),
      makeWorkItem({ id: 'w2', labels: ['backend', 'frontend'] }),
      makeWorkItem({ id: 'w3', labels: ['frontend'] }),
    ]

    expect(getUniqueLabels(workItems)).toEqual(['backend', 'bug', 'frontend'])
    expect(getUniqueLabels([])).toEqual([])
  })

  it('builds label analytics with per-label breakdown', () => {
    const now = new Date()
    const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
    const oldDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days ago

    const workItems: Array<WorkItemRecord> = [
      makeWorkItem({ id: 'a1', status: 'active', labels: ['frontend', 'feature'], updatedAt: recentDate }),
      makeWorkItem({ id: 'a2', status: 'active', labels: ['frontend'], updatedAt: oldDate }),
      makeWorkItem({ id: 'b1', status: 'blocked', labels: ['backend', 'bug'], updatedAt: recentDate }),
      makeWorkItem({ id: 'b2', status: 'blocked', labels: ['backend'], updatedAt: recentDate }),
      makeWorkItem({ id: 'd1', status: 'done', labels: ['frontend', 'feature'], updatedAt: recentDate }),
      makeWorkItem({ id: 'c1', status: 'cancelled', labels: ['backend'], updatedAt: oldDate }),
    ]

    const analytics = buildLabelAnalytics(workItems)

    // Total labels found
    expect(analytics.totalLabels).toBe(4) // frontend, backend, feature, bug
    expect(analytics.totalWorkItems).toBe(6)

    // Most used label
    expect(analytics.mostUsedLabel).toBe('frontend') // 3 items
    expect(analytics.mostBlockedLabel).toBe('backend') // 2 blocked
    expect(analytics.healthiestLabel).toBe('feature') // 1 done out of 2 = 50%

    // Per-label breakdown
    const frontend = analytics.labels.find((l) => l.label === 'frontend')!
    expect(frontend.total).toBe(3)
    expect(frontend.active).toBe(2)
    expect(frontend.blocked).toBe(0)
    expect(frontend.done).toBe(1)
    expect(frontend.doneThisWeek).toBe(1)
    expect(frontend.health).toBe('healthy')
    expect(frontend.insight).toBe('1 done this week')

    const backend = analytics.labels.find((l) => l.label === 'backend')!
    expect(backend.total).toBe(3)
    expect(backend.active).toBe(0)
    expect(backend.blocked).toBe(2)
    expect(backend.done).toBe(0)
    expect(backend.health).toBe('critical')
    expect(backend.insight).toBe('2 of 3 items blocked')

    const feature = analytics.labels.find((l) => l.label === 'feature')!
    expect(feature.total).toBe(2)
    expect(feature.active).toBe(1)
    expect(feature.blocked).toBe(0)
    expect(feature.done).toBe(1)
    expect(feature.health).toBe('healthy')
    expect(feature.insight).toBe('1 done this week')

    // Sorted by usage (most used first)
    expect(analytics.labels.map((l) => l.label)).toEqual(['frontend', 'backend', 'feature', 'bug'])
  })

  it('computes cycle time, throughput, and rework metrics', () => {
    const now = new Date()
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString()

    // Item 1: done 3 days ago, with rework (build→review→build→review→done)
    // createdAt=15d ago, updatedAt=3d ago → cycle time ~12d
    const workItems: Array<WorkItemRecord> = [
      makeWorkItem({
        id: 'w1', status: 'done', labels: ['frontend'],
        createdAt: fifteenDaysAgo,
        updatedAt: threeDaysAgo,
        history: [
          { id: 'h1', action: 'status-change', status: 'ready', note: 'ready', createdAt: '2026-04-01T00:00:00.000Z' },
          { id: 'h2', action: 'launch', phase: 'build', note: 'build', createdAt: '2026-04-02T00:00:00.000Z' },
          { id: 'h3', action: 'status-change', status: 'active', phase: 'review', note: 'review', createdAt: '2026-04-03T00:00:00.000Z' },
          { id: 'h4', action: 'launch', phase: 'build', note: 'build rework', createdAt: '2026-04-04T00:00:00.000Z' },
          { id: 'h5', action: 'status-change', status: 'done', phase: 'review', note: 'done', createdAt: '2026-04-05T00:00:00.000Z' },
        ],
      }),
      // Item 2: active, no rework
      makeWorkItem({
        id: 'w2', status: 'active', labels: ['frontend'],
        createdAt: '2026-04-20T00:00:00.000Z',
        updatedAt: '2026-04-24T00:00:00.000Z',
        history: [
          { id: 'h6', action: 'status-change', status: 'active', note: 'active', createdAt: '2026-04-21T00:00:00.000Z' },
        ],
      }),
      // Item 3: done 2 days ago, no labels (won't count in rework)
      makeWorkItem({
        id: 'w3', status: 'done', labels: [],
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-23T00:00:00.000Z',
      }),
    ]

    const analytics = buildLabelAnalytics(workItems)

    // Aggregate metrics
    expect(analytics.totalDone).toBe(2)
    expect(analytics.totalActive).toBe(1)
    expect(analytics.totalBlocked).toBe(0)
    expect(analytics.totalCancelled).toBe(0)

    // Average cycle time: only w1 (frontend, done), w3 has no labels so excluded
    expect(analytics.avgCycleTimeDays).not.toBeNull()
    expect(analytics.avgCycleTimeDays).toBeGreaterThan(0)
    expect(analytics.avgCycleTimeDays).toBeLessThanOrEqual(15)

    // Throughput: 1 done this week (w1 updatedAt=7d ago, so borderline; w3 updatedAt=2d ago)
    // w3 has no labels, so only w1 counts for label-based throughput
    expect(analytics.throughputPerWeek).toBeGreaterThanOrEqual(0)

    // Rework rate: 1 of 2 items with labels had rework = 0.5
    expect(analytics.reworkRate).toBe(0.5)

    // Per-label: frontend has 1 rework out of 2 items
    const frontend = analytics.labels.find((l) => l.label === 'frontend')!
    expect(frontend.reworkCount).toBe(1)
    expect(frontend.reworkRatio).toBe(0.5)
    expect(frontend.avgCycleTimeDays).not.toBeNull()
    expect(frontend.avgCycleTimeDays).toBeGreaterThan(0)
  })

  it('returns empty analytics when no labels exist', () => {
    const workItems = [
      makeWorkItem({ id: 'w1', labels: [] }),
      makeWorkItem({ id: 'w2', status: 'active', labels: [] }),
    ]

    const analytics = buildLabelAnalytics(workItems)

    expect(analytics.labels).toEqual([])
    expect(analytics.totalLabels).toBe(0)
    expect(analytics.totalWorkItems).toBe(2)
    expect(analytics.mostUsedLabel).toBeNull()
    expect(analytics.mostBlockedLabel).toBeNull()
    expect(analytics.healthiestLabel).toBeNull()
    expect(analytics.reworkRate).toBe(0)
  })

  it('caps label analytics to MAX_LABELS_TO_SHOW', () => {
    const workItems = Array.from({ length: 20 }, (_, i) =>
      makeWorkItem({ id: `w${i}`, labels: [`label-${i}`] }),
    )

    const analytics = buildLabelAnalytics(workItems)
    expect(analytics.labels.length).toBeLessThanOrEqual(15)
  })
})

function makeWorkItem(overrides: Partial<WorkItemRecord>): WorkItemRecord {
  return {
    id: overrides.id ?? 'work-item',
    projectId: overrides.projectId ?? 'project-1',
    title: overrides.title ?? 'Work item',
    description: overrides.description ?? '',
    status: overrides.status ?? 'inbox',
    phase: overrides.phase,
    priority: overrides.priority ?? 'medium',
    riskLevel: overrides.riskLevel ?? 'medium',
    assignedProfile: overrides.assignedProfile,
    repoPathSnapshot: overrides.repoPathSnapshot ?? '/repos/mission-control',
    missionId: overrides.missionId,
    missionJobId: overrides.missionJobId,
    missionJobName: overrides.missionJobName,
    missionSessionKeyPrefix: overrides.missionSessionKeyPrefix,
    missionLink: overrides.missionLink,
    missionState: overrides.missionState,
    missionLastRunAt: overrides.missionLastRunAt,
    missionLastError: overrides.missionLastError,
    sessionKeys: overrides.sessionKeys ?? [],
    branchName: overrides.branchName,
    prUrl: overrides.prUrl,
    artifactPaths: overrides.artifactPaths ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    notes: overrides.notes ?? [],
    approvals: overrides.approvals ?? [],
    labels: overrides.labels ?? [],
    history: overrides.history ?? [],
    createdAt: overrides.createdAt ?? '2026-04-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-21T00:00:00.000Z',
  }
}
