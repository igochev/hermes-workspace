import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem, updateWorkItem } from './work-items-store'
import { requestWorkItemApproval } from './work-item-approvals'
import { upsertExecutionRun } from './execution-runs-store'
import { buildMorningReviewDigest, formatMorningReviewForDiscord } from './morning-review'

describe('morning-review', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  const now = new Date('2026-04-29T12:00:00.000Z')

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-morning-review-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('classifies changed, approval, failed, merged, and parked digest buckets', () => {
    const project = createProject({
      id: 'project-alpha',
      name: 'Alpha Project',
      repoPath: '/repos/alpha',
    })

    const changed = createWorkItem({
      id: 'work-changed',
      projectId: project.id,
      title: 'Updated overnight docs',
      status: 'active',
      phase: 'build',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
      history: [
        {
          id: 'history-1',
          action: 'note',
          note: 'Builder added overnight evidence.',
          createdAt: '2026-04-29T04:00:00.000Z',
        },
      ],
    })
    const approval = createWorkItem({
      id: 'work-approval',
      projectId: project.id,
      title: 'Review pending feature',
      status: 'active',
      phase: 'review',
      priority: 'high',
      riskLevel: 'high',
      repoPathSnapshot: project.repoPath,
    })
    requestWorkItemApproval(approval.id, {
      phase: 'review',
      requestedBy: 'operator',
    })
    const failed = createWorkItem({
      id: 'work-failed',
      projectId: project.id,
      title: 'Build failure item',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionState: 'failed',
      missionLastError: 'Tests failed in Builder.',
    })
    const merged = createWorkItem({
      id: 'work-merged',
      projectId: project.id,
      title: 'Merged cleanup item',
      status: 'done',
      phase: 'deploy',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
      mergeState: 'merged',
      mergeCommit: 'abc123',
      prUrl: 'https://example.test/pull/123',
    })
    const parked = createWorkItem({
      id: 'work-parked',
      projectId: project.id,
      title: 'Parked lane item',
      status: 'blocked',
      phase: 'build',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
      laneState: 'blocked',
      laneParkedAt: '2026-04-29T05:00:00.000Z',
      laneBlockedReason: 'Repo needs operator cleanup.',
    })
    const execution = upsertExecutionRun({
      id: 'exec-failed-1',
      workItemId: failed.id,
      projectId: project.id,
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-build-failed',
      runId: 'run-failed-1',
      state: 'failed',
      lastObservedAt: '2026-04-29T06:00:00.000Z',
      error: 'pnpm test failed',
    })

    const digest = buildMorningReviewDigest({ now, lookbackHours: 18 })

    expect(digest.generatedAt).toBe(now.toISOString())
    expect(digest.window).toEqual({
      since: '2026-04-28T18:00:00.000Z',
      until: now.toISOString(),
      lookbackHours: 18,
    })
    expect(digest.summary).toMatchObject({
      changed: expect.any(Number),
      needs_approval: 1,
      failed: expect.any(Number),
      merged: 1,
      parked: 1,
      total: expect.any(Number),
    })
    expect(digest.buckets.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bucket: 'changed',
          id: expect.stringContaining(changed.id),
          title: expect.stringContaining('Updated overnight docs'),
          projectId: project.id,
          projectName: 'Alpha Project',
          workItemId: changed.id,
          workItemTitle: changed.title,
          href: `/projects/${project.id}/work-items/${changed.id}`,
          observedAt: expect.any(String),
          ageMinutes: expect.any(Number),
        }),
      ]),
    )
    expect(digest.buckets.needs_approval).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bucket: 'needs_approval',
          severity: 'warning',
          title: 'Review approval pending',
          href: `/projects/${project.id}/work-items/${approval.id}`,
        }),
      ]),
    )
    expect(digest.buckets.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bucket: 'failed',
          severity: 'critical',
          workItemId: failed.id,
          executionHref: `/executions/${execution.id}`,
          href: `/projects/${project.id}/work-items/${failed.id}`,
        }),
      ]),
    )
    expect(digest.buckets.merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bucket: 'merged',
          severity: 'success',
          workItemId: merged.id,
          href: `/projects/${project.id}/work-items/${merged.id}`,
        }),
      ]),
    )
    expect(digest.buckets.parked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bucket: 'parked',
          severity: 'warning',
          workItemId: parked.id,
          detail: expect.stringContaining('Repo needs operator cleanup'),
        }),
      ]),
    )
    expect(digest.allClear).toBe(false)
  })

  it('ranks the next attention item as critical failed, then approval, parked, warning failed, changed', () => {
    const project = createProject({
      id: 'project-ranking',
      name: 'Ranking Project',
      repoPath: '/repos/ranking',
    })
    const approval = createWorkItem({
      id: 'work-ranking-approval',
      projectId: project.id,
      title: 'Approval should rank second',
      status: 'active',
      phase: 'review',
      priority: 'high',
      riskLevel: 'high',
      repoPathSnapshot: project.repoPath,
    })
    requestWorkItemApproval(approval.id, { phase: 'review', requestedBy: 'operator' })
    const failed = createWorkItem({
      id: 'work-ranking-failed',
      projectId: project.id,
      title: 'Critical failure ranks first',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    upsertExecutionRun({
      id: 'exec-ranking-failed',
      workItemId: failed.id,
      projectId: project.id,
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-ranking-failed',
      state: 'failed',
      lastObservedAt: '2026-04-29T10:00:00.000Z',
    })

    const digest = buildMorningReviewDigest({ now, lookbackHours: 18 })

    expect(digest.nextAttentionItem).toMatchObject({
      bucket: 'failed',
      severity: 'critical',
      workItemId: failed.id,
      title: expect.stringContaining('Critical failure'),
    })
  })

  it('orders needs-approval entries oldest pending approval first', () => {
    const project = createProject({
      id: 'project-approval-order',
      name: 'Approval Order Project',
      repoPath: '/repos/approval-order',
    })
    const older = createWorkItem({
      id: 'work-approval-older',
      projectId: project.id,
      title: 'Older pending approval',
      status: 'active',
      phase: 'review',
      priority: 'high',
      riskLevel: 'high',
      repoPathSnapshot: project.repoPath,
    })
    const newer = createWorkItem({
      id: 'work-approval-newer',
      projectId: project.id,
      title: 'Newer pending approval',
      status: 'active',
      phase: 'review',
      priority: 'high',
      riskLevel: 'high',
      repoPathSnapshot: project.repoPath,
    })

    vi.setSystemTime(new Date('2026-04-29T09:00:00.000Z'))
    requestWorkItemApproval(older.id, { phase: 'review', requestedBy: 'operator' })
    vi.setSystemTime(new Date('2026-04-29T11:00:00.000Z'))
    requestWorkItemApproval(newer.id, { phase: 'review', requestedBy: 'operator' })

    const digest = buildMorningReviewDigest({ now, lookbackHours: 18 })

    expect(digest.buckets.needs_approval.map((entry) => entry.workItemId)).toEqual([
      older.id,
      newer.id,
    ])
    expect(digest.nextAttentionItem).toMatchObject({
      bucket: 'needs_approval',
      workItemId: older.id,
    })
  })

  it('returns an explicit all-clear digest when no records need operator attention', () => {
    const digest = buildMorningReviewDigest({ now, lookbackHours: 18 })

    expect(digest.summary).toEqual({
      changed: 0,
      needs_approval: 0,
      failed: 0,
      merged: 0,
      parked: 0,
      total: 0,
    })
    expect(digest.buckets.changed).toEqual([])
    expect(digest.nextAttentionItem).toBeNull()
    expect(digest.allClear).toBe(true)
  })

  it('deduplicates entries by stable bucket source ids and sorts by severity then newest observation', () => {
    const project = createProject({
      id: 'project-sort',
      name: 'Sort Project',
      repoPath: '/repos/sort',
    })
    const item = createWorkItem({
      id: 'work-sort-failed',
      projectId: project.id,
      title: 'Duplicate failure sources',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionState: 'failed',
      missionLastError: 'Work item failure should not duplicate run failure.',
    })
    updateWorkItem(item.id, { reviewState: 'failed' })
    upsertExecutionRun({
      id: 'exec-sort-failed',
      workItemId: item.id,
      projectId: project.id,
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-sort-failed',
      state: 'failed',
      lastObservedAt: '2026-04-29T11:00:00.000Z',
    })

    const digest = buildMorningReviewDigest({ now, lookbackHours: 18 })

    const failedIds = digest.buckets.failed.map((entry) => entry.id)
    expect(new Set(failedIds).size).toBe(failedIds.length)
    expect(digest.buckets.failed[0]).toMatchObject({
      severity: 'critical',
      observedAt: '2026-04-29T11:00:00.000Z',
    })
  })

  it('formats a compact Discord morning review with summary, next item, bucket entries, and execution terminology', () => {
    const project = createProject({
      id: 'project-discord',
      name: 'Discord Project',
      repoPath: '/repos/discord',
    })
    const failed = createWorkItem({
      id: 'work-discord-failed',
      projectId: project.id,
      title: 'Discord failed execution item',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    upsertExecutionRun({
      id: 'exec-discord-failed',
      workItemId: failed.id,
      projectId: project.id,
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-discord-failed',
      state: 'failed',
      lastObservedAt: '2026-04-29T10:30:00.000Z',
      error: 'Builder tests failed',
    })
    const digest = buildMorningReviewDigest({ now, lookbackHours: 18 })

    const message = formatMorningReviewForDiscord(digest)

    expect(message).toContain('**🌅 Morning Review — Mission Control**')
    expect(message).toContain('Last 18h')
    expect(message).toContain('Changed')
    expect(message).toContain('Needs approval')
    expect(message).toContain('Failed')
    expect(message).toContain('Merged')
    expect(message).toContain('Parked')
    expect(message).toContain('Next:')
    expect(message).toContain('Discord failed execution item')
    expect(message).toContain('/executions/exec-discord-failed')
    expect(message).toContain('failed execution')
    expect(message).not.toContain('failed mission')
    expect(message).not.toContain('Failed missions')
    expect(message).not.toContain('Mission Link')
    expect(message).not.toContain('Hermes Job ID')
  })

  it('formats an all-clear Discord morning review message', () => {
    const digest = buildMorningReviewDigest({ now, lookbackHours: 18 })

    const message = formatMorningReviewForDiscord(digest)

    expect(message).toContain('**🌅 Morning Review — Mission Control**')
    expect(message).toContain('All clear — no overnight operator action needed.')
    expect(message).not.toContain('Next:')
  })
})
