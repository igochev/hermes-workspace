import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createProject } from './projects-store'
import { createWorkItem, getWorkItem } from './work-items-store'
import {
  listWorkItemApprovals,
  requestWorkItemReviewApproval,
  resolveWorkItemApprovalDecision,
} from './work-item-approvals'

describe('work-item-approvals', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-work-item-approvals-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('creates and reuses a pending review approval for a work item in review', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Review approval needed',
      status: 'active',
      phase: 'review',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })

    const first = requestWorkItemReviewApproval(workItem.id, {
      requestedBy: 'operator',
      notes: 'Ready for human review',
    })
    const second = requestWorkItemReviewApproval(workItem.id, {
      requestedBy: 'operator',
      notes: 'Should reuse pending approval',
    })

    expect(first.id).toBe(second.id)
    expect(first.status).toBe('pending')
    expect(first.phase).toBe('review')
    expect(first.notes).toBe('Ready for human review')
    expect(listWorkItemApprovals(workItem.id)).toHaveLength(1)
  })

  it('approves a review approval and completes the work item with audit history', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Approve review outcome',
      status: 'active',
      phase: 'review',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    const approval = requestWorkItemReviewApproval(workItem.id, {
      requestedBy: 'operator',
    })

    const result = resolveWorkItemApprovalDecision(approval.id, {
      decision: 'approved',
      resolvedBy: 'D3n13r',
      notes: 'Looks good',
    })

    expect(result.approval.status).toBe('approved')
    expect(result.approval.resolvedBy).toBe('D3n13r')
    expect(result.workItem.status).toBe('done')
    expect(result.workItem.phase).toBeUndefined()
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'done',
      note: 'Review approved; work item completed.',
    })
    expect(getWorkItem(workItem.id)?.status).toBe('done')
  })

  it('requests changes and returns the work item to build', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Request changes after review',
      status: 'active',
      phase: 'review',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    const approval = requestWorkItemReviewApproval(workItem.id, {
      requestedBy: 'operator',
    })

    const result = resolveWorkItemApprovalDecision(approval.id, {
      decision: 'changes_requested',
      resolvedBy: 'D3n13r',
      notes: 'Please fix the failing edge case',
    })

    expect(result.approval.status).toBe('changes_requested')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'active',
      phase: 'build',
      note: 'Review requested changes; returned work item to build.',
    })
  })
})
