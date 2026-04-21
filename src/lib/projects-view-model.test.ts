import { describe, expect, it } from 'vitest'

import {
  PROJECT_STATUS_ORDER,
  buildProjectStatsLine,
  groupWorkItemsByStatus,
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

    expect(PROJECT_STATUS_ORDER).toEqual([
      'active',
      'ready',
      'inbox',
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
    sessionKeys: overrides.sessionKeys ?? [],
    branchName: overrides.branchName,
    prUrl: overrides.prUrl,
    artifactPaths: overrides.artifactPaths ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    notes: overrides.notes ?? [],
    createdAt: overrides.createdAt ?? '2026-04-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-04-21T00:00:00.000Z',
  }
}
