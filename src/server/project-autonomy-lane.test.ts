import { describe, expect, it } from 'vitest'

import { type ProjectRecord } from './projects-store'
import { selectNextLaneWorkItem } from './project-autonomy-lane'
import { type WorkItemRecord } from './work-items-store'

function project(input: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: input.id ?? 'project-1',
    name: input.name ?? 'Project One',
    slug: input.slug ?? 'project-one',
    repoPath: input.repoPath ?? '/repos/project-one',
    defaultBranch: input.defaultBranch ?? 'main',
    phaseProfiles: input.phaseProfiles ?? {},
    runtimeProfiles: input.runtimeProfiles ?? {},
    reviewAutoApproval: input.reviewAutoApproval ?? { enabled: false, maxPriority: 'low' },
    autopilotPolicy: input.autopilotPolicy ?? {
      enabled: false,
      schedulePreset: 'manual',
      suggestionLimit: 3,
      scoutSources: ['manual'],
    },
    autonomyLanePolicy: input.autonomyLanePolicy ?? {
      enabled: true,
      mode: 'single_lane',
      isolation: 'branch',
      maxActiveWorkItems: 1,
      baseBranch: 'main',
      branchPrefix: 'mission',
      plannerTiming: 'on_lane_entry',
      blockedBehavior: 'park_and_continue_when_repo_clean',
      mergeHealerEnabled: true,
      allowParallelWorktrees: false,
    },
    createdAt: input.createdAt ?? '2026-04-27T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-27T00:00:00.000Z',
  }
}

function workItem(input: Partial<WorkItemRecord> & { id: string; projectId?: string }): WorkItemRecord {
  return {
    id: input.id,
    projectId: input.projectId ?? 'project-1',
    title: input.title ?? input.id,
    description: input.description ?? '',
    status: input.status ?? 'inbox',
    phase: input.phase ?? 'research',
    priority: input.priority ?? 'medium',
    riskLevel: input.riskLevel ?? 'medium',
    labels: input.labels ?? [],
    repoPathSnapshot: input.repoPathSnapshot ?? '/repos/project-one',
    sourceSuggestionEvidence: input.sourceSuggestionEvidence ?? [],
    reviewQualityGateReasons: input.reviewQualityGateReasons ?? [],
    reviewMissingEvidence: input.reviewMissingEvidence ?? [],
    sessionKeys: input.sessionKeys ?? [],
    artifactPaths: input.artifactPaths ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    criteriaStatus: input.criteriaStatus ?? [],
    notes: input.notes ?? [],
    history: input.history ?? [],
    laneState: input.laneState,
    laneEnteredAt: input.laneEnteredAt,
    laneParkedAt: input.laneParkedAt,
    laneBlockedReason: input.laneBlockedReason,
    branchName: input.branchName,
    createdAt: input.createdAt ?? '2026-04-27T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-27T00:00:00.000Z',
  }
}

describe('project autonomy lane selector', () => {
  it('returns an active build item and prevents selecting a second project item', () => {
    const active = workItem({ id: 'active-build', status: 'active', phase: 'build', laneState: 'building' })
    const queued = workItem({ id: 'queued-high', status: 'ready', phase: 'build', priority: 'high' })

    const result = selectNextLaneWorkItem({ project: project(), workItems: [queued, active] })

    expect(result).toMatchObject({ active: { id: 'active-build' }, next: null })
    expect(result.reason).toContain('already active')
  })

  it('allows the next queued item when a blocked item is explicitly parked', () => {
    const blocked = workItem({
      id: 'blocked-parked',
      status: 'blocked',
      phase: 'build',
      laneState: 'blocked',
      laneParkedAt: '2026-04-27T01:00:00.000Z',
      laneBlockedReason: 'Dependency unavailable; repo reset to clean base.',
    })
    const next = workItem({ id: 'next-ready', status: 'ready', phase: 'build' })

    const result = selectNextLaneWorkItem({ project: project(), workItems: [blocked, next] })

    expect(result.active).toBeNull()
    expect(result.next).toMatchObject({ id: 'next-ready' })
    expect(result.parked).toHaveLength(1)
    expect(result.reason).toContain('parked')
  })

  it('does not select a next item when a blocked lane item is not safely parked', () => {
    const blocked = workItem({
      id: 'blocked-dirty',
      status: 'blocked',
      phase: 'build',
      laneState: 'blocked',
      laneBlockedReason: 'Tests failing on dirty branch.',
    })
    const next = workItem({ id: 'next-ready', status: 'ready', phase: 'build' })

    const result = selectNextLaneWorkItem({ project: project(), workItems: [blocked, next] })

    expect(result).toMatchObject({ active: null, next: null })
    expect(result.parked).toHaveLength(0)
    expect(result.reason).toContain('unsafe')
  })

  it('orders queued candidates by priority, lower risk, then createdAt', () => {
    const low = workItem({ id: 'low', status: 'ready', phase: 'build', priority: 'low' })
    const highRisk = workItem({
      id: 'high-risk',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      riskLevel: 'high',
      createdAt: '2026-04-27T00:00:00.000Z',
    })
    const highLowRisk = workItem({
      id: 'high-low-risk',
      status: 'ready',
      phase: 'build',
      priority: 'high',
      riskLevel: 'low',
      createdAt: '2026-04-27T02:00:00.000Z',
    })

    const result = selectNextLaneWorkItem({ project: project(), workItems: [low, highRisk, highLowRisk] })

    expect(result.next).toMatchObject({ id: 'high-low-risk' })
  })

  it('selects one item per project independently', () => {
    const projectOne = project({ id: 'project-1' })
    const projectTwo = project({ id: 'project-2' })
    const workItems = [
      workItem({ id: 'p1-ready', projectId: 'project-1', status: 'ready', phase: 'build' }),
      workItem({ id: 'p2-active', projectId: 'project-2', status: 'active', phase: 'build' }),
      workItem({ id: 'p2-ready', projectId: 'project-2', status: 'ready', phase: 'build', priority: 'high' }),
    ]

    expect(selectNextLaneWorkItem({ project: projectOne, workItems })).toMatchObject({
      active: null,
      next: { id: 'p1-ready' },
    })
    expect(selectNextLaneWorkItem({ project: projectTwo, workItems })).toMatchObject({
      active: { id: 'p2-active' },
      next: null,
    })
  })
})
