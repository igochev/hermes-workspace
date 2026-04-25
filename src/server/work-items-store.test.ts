import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  appendWorkItemHistoryEntry,
  createWorkItem,
  deleteWorkItem,
  deleteWorkItemsForProject,
  getWorkItem,
  listWorkItems,
  updateWorkItem,
} from './work-items-store'

describe('work-items-store', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-work-items-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('creates and lists work items for a project with canonical mission-control fields', () => {
    const workItem = createWorkItem({
      projectId: 'project-1',
      title: 'Implement projects screen',
      description: 'Add the initial /projects Mission Control route',
      status: 'active',
      phase: 'build',
      priority: 'high',
      assignedProfile: 'builder',
      repoPathSnapshot: '/repos/hermes-workspace',
      acceptanceCriteria: ['Projects route exists', 'Page renders project cards'],
      notes: ['Initial Phase 1 placeholder'],
    })

    expect(workItem.projectId).toBe('project-1')
    expect(workItem.title).toBe('Implement projects screen')
    expect(workItem.status).toBe('active')
    expect(workItem.phase).toBe('build')
    expect(workItem.priority).toBe('high')
    expect(workItem.assignedProfile).toBe('builder')
    expect(workItem.repoPathSnapshot).toBe('/repos/hermes-workspace')
    expect(workItem.acceptanceCriteria).toEqual([
      'Projects route exists',
      'Page renders project cards',
    ])
    expect(workItem.notes).toEqual(['Initial Phase 1 placeholder'])
    expect(workItem.riskLevel).toBe('medium')
    expect(workItem.history).toEqual([])
    expect(workItem.missionLink).toBeUndefined()
    expect(workItem.sessionKeys).toEqual([])
    expect(workItem.artifactPaths).toEqual([])

    expect(listWorkItems({ projectId: 'project-1' })).toEqual([workItem])
    expect(getWorkItem(workItem.id)).toEqual(workItem)
  })

  it('normalizes risk level defaults and accepts custom values', () => {
    const defaultRisk = createWorkItem({
      projectId: 'project-risk',
      title: 'Default risk',
      repoPathSnapshot: '/repos/risk',
    })
    expect(defaultRisk.riskLevel).toBe('medium')

    const highRisk = createWorkItem({
      projectId: 'project-risk',
      title: 'High risk item',
      riskLevel: 'high',
      repoPathSnapshot: '/repos/risk',
    })
    expect(highRisk.riskLevel).toBe('high')

    const lowRisk = createWorkItem({
      projectId: 'project-risk',
      title: 'Low risk item',
      riskLevel: 'low',
      repoPathSnapshot: '/repos/risk',
    })
    expect(lowRisk.riskLevel).toBe('low')
  })

  it('normalizes blocked reason taxonomy and preserves explicit values', () => {
    const withReason = createWorkItem({
      projectId: 'project-blocked',
      title: 'Blocked by dependency',
      status: 'blocked',
      phase: 'build',
      blockedReason: 'blocked_by_dependency',
      repoPathSnapshot: '/repos/blocked',
    })

    expect(withReason.blockedReason).toBe('blocked_by_dependency')

    const updated = updateWorkItem(withReason.id, {
      blockedReason: 'external',
    })

    expect(updated?.blockedReason).toBe('external')

    const normalizedFallback = createWorkItem({
      projectId: 'project-blocked',
      title: 'Blocked fallback',
      status: 'blocked',
      phase: 'build',
      blockedReason: 'invalid_reason' as never,
      repoPathSnapshot: '/repos/blocked',
    })

    expect(normalizedFallback.blockedReason).toBe('other')
  })

  it('tracks per-criterion status and re-aligns status when criteria change', () => {
    const workItem = createWorkItem({
      projectId: 'project-criteria',
      title: 'Criteria status test',
      repoPathSnapshot: '/repos/criteria',
      acceptanceCriteria: ['Criterion A', 'Criterion B'],
    })

    expect(workItem.criteriaStatus).toEqual([
      { text: 'Criterion A', met: false },
      { text: 'Criterion B', met: false },
    ])

    const marked = updateWorkItem(workItem.id, {
      criteriaStatus: [
        { text: 'Criterion A', met: true },
        { text: 'Criterion B', met: true },
      ],
    })

    expect(marked?.criteriaStatus).toEqual([
      { text: 'Criterion A', met: true },
      { text: 'Criterion B', met: true },
    ])

    const realigned = updateWorkItem(workItem.id, {
      acceptanceCriteria: ['Criterion B', 'Criterion C'],
    })

    expect(realigned?.criteriaStatus).toEqual([
      { text: 'Criterion B', met: true },
      { text: 'Criterion C', met: false },
    ])
  })

  it('normalizes review decision quality-gate fields with defaults and round-trips valid values', () => {
    const workItem = createWorkItem({
      projectId: 'project-review-gate',
      title: 'Review gate fields test',
      repoPathSnapshot: '/repos/gate',
    })

    expect(workItem.reviewQualityGateReasons).toEqual([])
    expect(workItem.reviewMissingEvidence).toEqual([])
    expect(workItem.reviewDecision).toBeUndefined()
    expect(workItem.reviewDecisionConfidence).toBeUndefined()
    expect(workItem.reviewQualityGateStatus).toBeUndefined()
    expect(workItem.reviewParserError).toBeUndefined()

    const updated = updateWorkItem(workItem.id, {
      reviewDecision: 'approved' as const,
      reviewDecisionSummary: 'All criteria met with evidence.',
      reviewDecisionConfidence: 'high' as const,
      reviewDecisionSource: 'json' as const,
      reviewQualityGateStatus: 'pass' as const,
      reviewQualityGateReasons: ['All gates passed'],
      reviewMissingEvidence: [],
    })

    expect(updated?.reviewDecision).toBe('approved')
    expect(updated?.reviewDecisionSummary).toBe('All criteria met with evidence.')
    expect(updated?.reviewDecisionConfidence).toBe('high')
    expect(updated?.reviewDecisionSource).toBe('json')
    expect(updated?.reviewQualityGateStatus).toBe('pass')
    expect(updated?.reviewQualityGateReasons).toEqual(['All gates passed'])
    expect(updated?.reviewMissingEvidence).toEqual([])

    const reset = updateWorkItem(workItem.id, {
      reviewQualityGateStatus: 'manual_review' as const,
    })
    expect(reset?.reviewQualityGateStatus).toBe('manual_review')
  })

  it('updates work items and can remove all work items for a deleted project', () => {
    const keep = createWorkItem({
      projectId: 'project-keep',
      title: 'Keep me',
      repoPathSnapshot: '/repos/keep',
    })
    const removeOne = createWorkItem({
      projectId: 'project-delete',
      title: 'Delete me 1',
      repoPathSnapshot: '/repos/delete',
    })
    const removeTwo = createWorkItem({
      projectId: 'project-delete',
      title: 'Delete me 2',
      repoPathSnapshot: '/repos/delete',
    })

    const updated = updateWorkItem(removeOne.id, {
      status: 'blocked',
      phase: 'review',
      priority: 'medium',
      branchName: 'feature/projects-screen',
      prUrl: 'https://github.com/igochev/hermes-workspace/pull/1',
      missionLink: '/jobs?jobId=job-123',
      sessionKeys: ['session-1'],
    })

    expect(updated).not.toBeNull()
    expect(updated?.status).toBe('blocked')
    expect(updated?.phase).toBe('review')
    expect(updated?.branchName).toBe('feature/projects-screen')
    expect(updated?.prUrl).toBe('https://github.com/igochev/hermes-workspace/pull/1')
    expect(updated?.missionLink).toBe('/jobs?jobId=job-123')
    expect(updated?.sessionKeys).toEqual(['session-1'])

    expect(deleteWorkItem(removeTwo.id)).toBe(true)
    const withHistory = appendWorkItemHistoryEntry(removeOne.id, {
      action: 'launch',
      status: 'active',
      phase: 'review',
      note: 'Launched into review phase',
      missionId: 'job-123',
      sessionKey: 'cron_job-123_pending',
      sessionKeyPrefix: 'cron_job-123_',
      profile: 'reviewer',
    })
    expect(withHistory?.history.at(-1)).toMatchObject({
      action: 'launch',
      missionId: 'job-123',
      sessionKey: 'cron_job-123_pending',
      profile: 'reviewer',
    })
    expect(deleteWorkItemsForProject('project-delete')).toBe(1)
    expect(listWorkItems({ projectId: 'project-delete' })).toEqual([])
    expect(listWorkItems({ projectId: 'project-keep' }).map((item) => item.id)).toEqual([
      keep.id,
    ])
  })
})
