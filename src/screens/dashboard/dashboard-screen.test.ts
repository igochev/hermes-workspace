import { describe, expect, it } from 'vitest'

import type { ProjectSummary, WorkItemRecord } from '@/lib/projects-api'
import type { ApprovalInboxEntry } from '@/lib/work-item-approvals-api'
import {
  DASHBOARD_MISSION_CONTROL_QUERY_KEY,
  DASHBOARD_MISSION_CONTROL_QUEUE_TITLES,
  DASHBOARD_MISSION_CONTROL_SUMMARY_LABELS,
  buildDashboardMissionControlQueues,
  buildDashboardMissionControlSummary,
} from './dashboard-screen'

describe('dashboard mission control helpers', () => {
  it('uses a dedicated dashboard query namespace and stable operator-facing labels', () => {
    expect(DASHBOARD_MISSION_CONTROL_QUERY_KEY).toEqual(['dashboard', 'mission-control'])
    expect(DASHBOARD_MISSION_CONTROL_SUMMARY_LABELS).toEqual({
      blockedWorkItems: 'Blocked work',
      failedMissions: 'Failed missions',
      pendingApprovals: 'Pending approvals',
      projects: 'Projects',
      runningMissions: 'Running missions',
      workItems: 'Work items',
    })
    expect(DASHBOARD_MISSION_CONTROL_QUEUE_TITLES).toEqual({
      approvals: 'Pending approvals',
      blocked: 'Blocked work',
      failed: 'Failed missions',
      running: 'Running missions',
    })
  })

  it('builds mission control attention summary counts for the operator dashboard', () => {
    expect(
      buildDashboardMissionControlSummary(
        [
          makeProject({ id: 'project-1', name: 'Mission Control', workItemCount: 3 }),
          makeProject({ id: 'project-2', name: 'Hermes Workspace', workItemCount: 2 }),
        ],
        [
          makeWorkItem({ id: 'blocked-1', projectId: 'project-1', status: 'blocked' }),
          makeWorkItem({ id: 'failed-1', projectId: 'project-2', status: 'active', missionState: 'failed' }),
          makeWorkItem({ id: 'running-1', projectId: 'project-1', status: 'active', missionState: 'running' }),
          makeWorkItem({ id: 'quiet-1', projectId: 'project-2', status: 'ready' }),
        ],
        [
          makeApproval({ approvalId: 'approval-1', projectId: 'project-1', workItemId: 'review-1', status: 'pending' }),
          makeApproval({ approvalId: 'approval-2', projectId: 'project-2', workItemId: 'review-2', status: 'approved' }),
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
    expect(queues.blocked.map((item) => item.id)).toEqual(['blocked-new', 'blocked-old'])
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
})

function makeProject(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: overrides.id ?? 'project-1',
    name: overrides.name ?? 'Mission Control',
    slug: overrides.slug ?? 'mission-control',
    repoPath: overrides.repoPath ?? '/repos/mission-control',
    repoUrl: overrides.repoUrl,
    defaultBranch: overrides.defaultBranch,
    description: overrides.description,
    phaseProfiles: overrides.phaseProfiles ?? { research: '', build: '', review: '', deploy: '' },
    reviewAutoApproval: overrides.reviewAutoApproval ?? { enabled: false, maxPriority: 'low' },
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
    updatedAt: overrides.updatedAt ?? '2026-04-22T00:00:00.000Z',
  }
}

function makeApproval(overrides: Partial<ApprovalInboxEntry>): ApprovalInboxEntry {
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
