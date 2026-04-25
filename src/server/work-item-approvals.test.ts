import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createProject } from './projects-store'
import { createWorkItem, getWorkItem } from './work-items-store'
import {
  listApprovalInboxEntries,
  listWorkItemApprovals,
  requestWorkItemApproval,
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

  it('approves a review approval and advances the work item into deploy with audit history', () => {
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
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('deploy')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'active',
      phase: 'deploy',
      note: 'Review approved; advanced work item to deploy.',
    })
    expect(getWorkItem(workItem.id)).toMatchObject({ status: 'active', phase: 'deploy' })
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
      note: 'Review requested changes; returned work item to build for relaunch.',
    })
  })

  it('approves a deploy approval and completes the work item', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Approve deploy outcome',
      status: 'active',
      phase: 'deploy',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    const approval = requestWorkItemApproval(workItem.id, {
      requestedBy: 'operator',
      notes: 'Ready for deploy approval',
      phase: 'deploy',
    })

    const result = resolveWorkItemApprovalDecision(approval.id, {
      decision: 'approved',
      resolvedBy: 'D3n13r',
      notes: 'Deploy validated',
    })

    expect(result.approval.phase).toBe('deploy')
    expect(result.approval.status).toBe('approved')
    expect(result.workItem.status).toBe('done')
    expect(result.workItem.phase).toBeUndefined()
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'done',
      note: 'Deploy approved; work item completed.',
    })
  })

  it('returns rejected deploy approvals to active build for correction', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Deploy rejected should return to build',
      status: 'active',
      phase: 'deploy',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    const approval = requestWorkItemApproval(workItem.id, {
      requestedBy: 'operator',
      notes: 'Ready for deploy approval',
      phase: 'deploy',
    })

    const result = resolveWorkItemApprovalDecision(approval.id, {
      decision: 'rejected',
      resolvedBy: 'D3n13r',
      notes: 'Deploy failed smoke checks',
    })

    expect(result.approval.phase).toBe('deploy')
    expect(result.approval.status).toBe('rejected')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'active',
      phase: 'build',
      note: 'Deploy rejected; returned work item to build for correction and relaunch.',
    })
  })

  it('returns deploy changes-requested approvals to active build for correction', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Deploy changes requested should return to build',
      status: 'active',
      phase: 'deploy',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    const approval = requestWorkItemApproval(workItem.id, {
      requestedBy: 'operator',
      notes: 'Ready for deploy approval',
      phase: 'deploy',
    })

    const result = resolveWorkItemApprovalDecision(approval.id, {
      decision: 'changes_requested',
      resolvedBy: 'D3n13r',
      notes: 'Need rollback guard update',
    })

    expect(result.approval.phase).toBe('deploy')
    expect(result.approval.status).toBe('changes_requested')
    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'active',
      phase: 'build',
      note: 'Deploy requested changes; returned work item to build for correction and relaunch.',
    })
  })

  it('lists approvals inbox entries with project and work item context, pending first', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const older = createWorkItem({
      projectId: project.id,
      title: 'Older review item',
      status: 'active',
      phase: 'review',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    const newer = createWorkItem({
      projectId: project.id,
      title: 'Newer review item',
      status: 'active',
      phase: 'review',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
    })

    const firstApproval = requestWorkItemReviewApproval(older.id, { requestedBy: 'operator' })
    const secondApproval = requestWorkItemReviewApproval(newer.id, { requestedBy: 'operator' })
    resolveWorkItemApprovalDecision(firstApproval.id, {
      decision: 'approved',
      resolvedBy: 'D3n13r',
    })

    const entries = listApprovalInboxEntries()

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      approvalId: secondApproval.id,
      projectName: 'Mission Control Demo',
      workItemTitle: 'Newer review item',
      status: 'pending',
    })
    expect(entries[1]).toMatchObject({
      approvalId: firstApproval.id,
      workItemTitle: 'Older review item',
      status: 'approved',
    })
  })

  it('auto-approves review work items when the project policy allows the priority', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      reviewAutoApproval: {
        enabled: true,
        maxPriority: 'low',
      },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Low-risk review item',
      status: 'active',
      phase: 'review',
      priority: 'low',
      repoPathSnapshot: project.repoPath,
    })

    const approval = requestWorkItemReviewApproval(workItem.id, {
      requestedBy: 'operator',
      notes: 'Safe to auto-approve',
    })

    expect(approval.status).toBe('approved')
    expect(approval.resolvedBy).toBe('policy')
    expect(approval.resolutionNotes).toBe('Auto-approved by project review policy.')
    expect(getWorkItem(workItem.id)).toMatchObject({
      status: 'active',
      phase: 'deploy',
    })
    expect(getWorkItem(workItem.id)?.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'active',
      phase: 'deploy',
      note: 'Review auto-approved by policy; advanced work item to deploy.',
    })
  })

  it('auto-approves review work items with low risk level regardless of project policy', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      reviewAutoApproval: {
        enabled: false,
        maxPriority: 'low',
      },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Low-risk item bypasses policy',
      status: 'active',
      phase: 'review',
      priority: 'high',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
    })

    const approval = requestWorkItemReviewApproval(workItem.id, {
      requestedBy: 'operator',
      notes: 'Low-risk review',
    })

    expect(approval.status).toBe('approved')
    expect(approval.resolvedBy).toBe('policy')
    expect(approval.resolutionNotes).toBe('Auto-approved by project review policy.')
    expect(getWorkItem(workItem.id)).toMatchObject({
      status: 'active',
      phase: 'deploy',
    })
  })
})
