import { describe, expect, it } from 'vitest'

import {
  PROJECT_BOARD_FLOW_ORDER,
  buildProjectBoardUrgencySummary,
  buildProjectStatsLine,
  buildWorkItemOperatorSignals,
  filterWorkItemsForProjectBoard,
  getWorkItemUrgencyTone,
  groupWorkItemsByStatus,
  sortWorkItemsForProjectBoard,
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
      blocked: 1,
      changesRequested: 1,
      failedMissions: 1,
      pendingApprovals: 1,
      runningMissions: 1,
    })
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
    history: overrides.history ?? [],
    createdAt: overrides.createdAt ?? '2026-04-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-21T00:00:00.000Z',
  }
}
