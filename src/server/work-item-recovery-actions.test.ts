import { describe, expect, it } from 'vitest'

import { recommendWorkItemRecoveryActions } from './work-item-recovery-actions'
import type { AttentionQueueItem } from './attention-queue-store'
import type { WorkItemRecord } from './work-items-store'

function attention(overrides: Partial<AttentionQueueItem> = {}): AttentionQueueItem {
  return {
    id: 'attention-1',
    dedupeKey: 'attention:1',
    kind: 'mission_failed',
    severity: 'critical',
    projectId: 'project-1',
    workItemId: 'work-1',
    title: 'Mission failed',
    detail: 'Build failed',
    href: '/projects/project-1/work-items/work-1',
    source: 'derived',
    status: 'open',
    firstSeenAt: '2026-04-26T00:00:00.000Z',
    lastSeenAt: '2026-04-26T00:00:00.000Z',
    ...overrides,
  }
}

function workItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: 'work-1',
    projectId: 'project-1',
    title: 'Build feature',
    description: 'Implement feature',
    status: 'active',
    phase: 'build',
    priority: 'high',
    riskLevel: 'medium',
    labels: [],
    repoPathSnapshot: '/repos/project',
    sourceSuggestionEvidence: [],
    reviewQualityGateReasons: [],
    reviewMissingEvidence: [],
    sessionKeys: [],
    artifactPaths: [],
    acceptanceCriteria: [],
    criteriaStatus: [],
    notes: [],
    history: [],
    createdAt: '2026-04-26T00:00:00.000Z',
    updatedAt: '2026-04-26T00:00:00.000Z',
    ...overrides,
  }
}

describe('work item recovery action recommendations', () => {
  it('recommends relaunching the current phase for failed mission attention', () => {
    const actions = recommendWorkItemRecoveryActions({
      attentionItem: attention({ kind: 'mission_failed' }),
      workItem: workItem({ status: 'active', phase: 'build', missionState: 'failed' }),
    })

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'relaunch_phase',
          phase: 'build',
          label: 'Relaunch build',
          destructive: false,
        }),
        expect.objectContaining({ type: 'return_to_build' }),
        expect.objectContaining({ type: 'cancel_work_item', destructive: true }),
      ]),
    )
  })

  it('recommends returning to build or requesting review for failed review attention', () => {
    const actions = recommendWorkItemRecoveryActions({
      attentionItem: attention({ kind: 'review_failed', title: 'Review needs attention' }),
      workItem: workItem({ status: 'active', phase: 'review', reviewDecision: 'changes_requested' }),
    })

    expect(actions.map((action) => action.type)).toContain('return_to_build')
    expect(actions.map((action) => action.type)).toContain('request_review')
    expect(actions.find((action) => action.type === 'return_to_build')?.label).toBe('Return to build')
  })

  it('keeps stale execution recovery explicit and auditable', () => {
    const actions = recommendWorkItemRecoveryActions({
      attentionItem: attention({ kind: 'execution_stale', severity: 'warning' }),
      workItem: workItem({ status: 'active', phase: 'research', missionState: 'running' }),
    })

    expect(actions[0]).toEqual(
      expect.objectContaining({
        type: 'relaunch_phase',
        phase: 'research',
        label: 'Relaunch research',
        auditNote: expect.stringContaining('Operator requested'),
      }),
    )
    expect(actions.map((action) => action.type)).toContain('dismiss_attention')
  })

  it('allows blocked work to return to build and resolve attention without relaunching automatically', () => {
    const actions = recommendWorkItemRecoveryActions({
      attentionItem: attention({ kind: 'blocked_work', severity: 'warning' }),
      workItem: workItem({ status: 'blocked', phase: 'build', blockedReason: 'blocked_by_dependency' }),
    })

    expect(actions.map((action) => action.type)).toEqual([
      'return_to_build',
      'mark_resolved',
      'cancel_work_item',
      'dismiss_attention',
    ])
  })
})
