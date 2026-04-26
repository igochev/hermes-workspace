import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAttentionQueueItems } from './attention-queue-store'
import { buildAttentionQueue, refreshAttentionQueue } from './attention-queue'
import { createProject } from './projects-store'
import { requestWorkItemApproval } from './work-item-approvals'
import { createWorkItem } from './work-items-store'
import type { SupervisorFinding } from './work-item-supervisor'

describe('attention queue builder', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-attention-builder-'))
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

  function createFixture() {
    const project = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
    })
    return { project }
  }

  it('creates attention items for pending approvals', () => {
    const { project } = createFixture()
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Review this change',
      status: 'active',
      phase: 'review',
      priority: 'high',
      riskLevel: 'high',
      repoPathSnapshot: project.repoPath,
    })
    requestWorkItemApproval(workItem.id, { phase: 'review', requestedBy: 'builder' })

    const items = buildAttentionQueue()

    expect(items).toEqual([
      expect.objectContaining({
        dedupeKey: `approval:${workItem.id}:review`,
        kind: 'approval_pending',
        severity: 'warning',
        projectId: project.id,
        workItemId: workItem.id,
        title: 'Review approval pending',
        href: `/projects/${project.id}/work-items/${workItem.id}`,
        source: 'derived',
        status: 'open',
      }),
    ])
  })

  it('creates critical attention for failed missions', () => {
    const { project } = createFixture()
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Build failed',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-failed',
      missionState: 'failed',
      missionLastError: 'Tests failed',
    })

    const items = buildAttentionQueue()

    expect(items).toContainEqual(
      expect.objectContaining({
        dedupeKey: `mission_failed:${workItem.id}`,
        kind: 'mission_failed',
        severity: 'critical',
        detail: expect.stringContaining('Tests failed'),
      }),
    )
  })

  it('creates warning attention for blocked work', () => {
    const { project } = createFixture()
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Blocked dependency',
      status: 'blocked',
      phase: 'build',
      priority: 'medium',
      blockedReason: 'blocked_by_dependency',
      repoPathSnapshot: project.repoPath,
    })

    const items = buildAttentionQueue()

    expect(items).toContainEqual(
      expect.objectContaining({
        dedupeKey: `blocked:${workItem.id}`,
        kind: 'blocked_work',
        severity: 'warning',
        detail: expect.stringContaining('blocked_by_dependency'),
      }),
    )
  })

  it('creates execution_stale attention from supervisor findings', () => {
    const { project } = createFixture()
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Stale build',
      status: 'active',
      phase: 'build',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
    })
    const finding: SupervisorFinding = {
      id: 'finding-1',
      workItemId: workItem.id,
      projectId: project.id,
      kind: 'mission_stale',
      severity: 'warning',
      message: 'Mission execution has been running for 300 minutes.',
      jobId: 'job-stale',
      role: 'mission',
      observedAt: '2026-04-26T00:00:00.000Z',
    }

    const items = buildAttentionQueue({ supervisorFindings: [finding] })

    expect(items).toContainEqual(
      expect.objectContaining({
        dedupeKey: `supervisor:${finding.kind}:${workItem.id}:job-stale`,
        kind: 'execution_stale',
        severity: 'warning',
        source: 'supervisor',
      }),
    )
  })

  it('refreshes persistent queue items and sorts deterministically', () => {
    const { project } = createFixture()
    const blocked = createWorkItem({
      projectId: project.id,
      title: 'Blocked item',
      status: 'blocked',
      phase: 'build',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
    })
    const failed = createWorkItem({
      projectId: project.id,
      title: 'Failed item',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionState: 'failed',
    })

    const refreshed = refreshAttentionQueue()

    expect(refreshed.map((item) => item.dedupeKey)).toEqual([
      `mission_failed:${failed.id}`,
      `blocked:${blocked.id}`,
    ])
    expect(listAttentionQueueItems().map((item) => item.dedupeKey)).toEqual(refreshed.map((item) => item.dedupeKey))
  })
})
