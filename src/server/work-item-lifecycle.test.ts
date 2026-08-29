import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem, getWorkItem } from './work-items-store'
import { listWorkItemApprovals } from './work-item-approvals'
import { applyWorkItemLifecycleTransition } from './work-item-lifecycle'

describe('work-item-lifecycle', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-work-item-lifecycle-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('sends an inbox idea into active research planning', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Capture rough operator idea',
      status: 'inbox',
      phase: 'research',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
    })

    const result = applyWorkItemLifecycleTransition(workItem.id, {
      action: 'send_to_planning',
      actor: 'D3n13r',
    })

    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('research')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'active',
      phase: 'research',
      note: 'Sent to planning with Researcher.',
    })
    expect(getWorkItem(workItem.id)).toMatchObject({
      status: 'active',
      phase: 'research',
    })
  })

  it('marks active research work ready for build', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Finish research plan',
      status: 'active',
      phase: 'research',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
    })

    const result = applyWorkItemLifecycleTransition(workItem.id, {
      action: 'mark_ready',
      actor: 'D3n13r',
    })

    expect(result.workItem.status).toBe('ready')
    expect(result.workItem.phase).toBeUndefined()
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'ready',
      note: 'Planning complete; marked ready for build.',
    })
  })

  it('requests review by moving build work into review and creating a pending approval', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Prepare implementation for review',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })

    const result = applyWorkItemLifecycleTransition(workItem.id, {
      action: 'request_review',
      actor: 'D3n13r',
      notes: 'Ready for review approval',
    })

    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('review')
    expect(result.workItem.history.at(-2)).toMatchObject({
      action: 'status-change',
      status: 'active',
      phase: 'review',
      note: 'Requested review; moved work item into review: Ready for review approval',
    })
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'note',
      note: 'Review approval requested: Ready for review approval',
    })
    expect(listWorkItemApprovals(workItem.id)).toMatchObject([
      {
        workItemId: workItem.id,
        phase: 'review',
        status: 'pending',
        requestedBy: 'D3n13r',
      },
    ])
  })

  it('requests deploy approval for active deploy work and creates a pending deploy approval', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Prepare deploy approval',
      status: 'active',
      phase: 'deploy',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })

    const result = applyWorkItemLifecycleTransition(workItem.id, {
      action: 'request_deploy_approval',
      actor: 'D3n13r',
      notes: 'Ready to deploy to production',
    })

    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('deploy')
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'note',
      note: 'Deploy approval requested: Ready to deploy to production',
    })
    expect(listWorkItemApprovals(workItem.id)).toMatchObject([
      {
        workItemId: workItem.id,
        phase: 'deploy',
        status: 'pending',
        requestedBy: 'D3n13r',
      },
    ])
  })

  it('resumes blocked build work back into active build for relaunch', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Recover failed build',
      status: 'blocked',
      phase: 'build',
      priority: 'high',
      blockedReason: 'mission_failed',
      repoPathSnapshot: project.repoPath,
      missionState: 'failed',
      missionLastError: 'Build failed on test suite',
    })

    const result = applyWorkItemLifecycleTransition(workItem.id, {
      action: 'resume_build',
      actor: 'D3n13r',
      notes: 'Apply fix and relaunch',
    })

    expect(result.workItem.status).toBe('active')
    expect(result.workItem.phase).toBe('build')
    expect(result.workItem.blockedReason).toBe('mission_failed')
    expect(result.workItem.missionState).toBe('unknown')
    expect(result.workItem.missionLastError).toBeUndefined()
    expect(result.workItem.history.at(-1)).toMatchObject({
      action: 'status-change',
      status: 'active',
      phase: 'build',
      note: 'Resumed blocked build work for relaunch: Apply fix and relaunch',
    })
  })

  it('rejects invalid transitions for the current work-item state', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Invalid lifecycle attempt',
      status: 'inbox',
      phase: 'research',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
    })

    expect(() =>
      applyWorkItemLifecycleTransition(workItem.id, {
        action: 'request_review',
        actor: 'D3n13r',
      }),
    ).toThrow('request_review is only valid for active build work items')
  })

  describe('cancel', () => {
    it('cancels an inbox research work item with a reason', () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
      })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Cancel planned idea',
        status: 'inbox',
        phase: 'research',
        priority: 'low',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'cancel',
        actor: 'D3n13r',
        notes: 'Idea no longer needed',
      })

      expect(result.workItem.status).toBe('cancelled')
      expect(result.workItem.phase).toBeUndefined()
      expect(result.workItem.history.at(-1)).toMatchObject({
        action: 'status-change',
        status: 'cancelled',
        note: 'Cancelled: Idea no longer needed',
      })
      expect(result.approval).toBeUndefined()
    })

    it('cancels an active research work item with a reason', () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
      })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Cancel research in progress',
        status: 'active',
        phase: 'research',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'cancel',
        actor: 'D3n13r',
        notes: 'Planning is no longer a priority',
      })

      expect(result.workItem.status).toBe('cancelled')
      expect(result.workItem.phase).toBeUndefined()
      expect(result.workItem.history.at(-1)).toMatchObject({
        action: 'status-change',
        status: 'cancelled',
        note: 'Cancelled: Planning is no longer a priority',
      })
    })

    it('cancels a ready work item with a reason', () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
      })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Cancel ready item',
        status: 'ready',
        phase: undefined,
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'cancel',
        actor: 'D3n13r',
        notes: 'Build is no longer required',
      })

      expect(result.workItem.status).toBe('cancelled')
      expect(result.workItem.phase).toBeUndefined()
    })

    it('cancels an active build work item with a reason', () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
      })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Cancel active build',
        status: 'active',
        phase: 'build',
        priority: 'high',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'cancel',
        actor: 'D3n13r',
        notes: 'Requirements changed — build cancelled',
      })

      expect(result.workItem.status).toBe('cancelled')
      expect(result.workItem.phase).toBeUndefined()
    })

    it('cancels a blocked build work item with a reason', () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
      })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Cancel blocked build',
        status: 'blocked',
        phase: 'build',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
        missionState: 'failed',
        missionLastError: 'Continuous integration failure',
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'cancel',
        actor: 'D3n13r',
        notes: 'Blocked too long — abandoning work item',
      })

      expect(result.workItem.status).toBe('cancelled')
      expect(result.workItem.phase).toBeUndefined()
      expect(workItem.missionLastError).toBe('Continuous integration failure')
    })

    it('rejects cancel on a done work item', () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
      })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Cannot cancel done item',
        status: 'done',
        phase: undefined,
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      expect(() =>
        applyWorkItemLifecycleTransition(workItem.id, {
          action: 'cancel',
          actor: 'D3n13r',
          notes: 'Trying to cancel completed work',
        }),
      ).toThrow('cancel is only valid for non-terminal work items (inbox, ready, active, blocked)')
    })

    it('rejects cancel on a cancelled work item', () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
      })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Cannot cancel already cancelled item',
        status: 'cancelled',
        phase: undefined,
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      expect(() =>
        applyWorkItemLifecycleTransition(workItem.id, {
          action: 'cancel',
          actor: 'D3n13r',
          notes: 'Already cancelled',
        }),
      ).toThrow('cancel is only valid for non-terminal work items (inbox, ready, active, blocked)')
    })

    it('rejects cancel without a reason note', () => {
      const project = createProject({
        name: 'Mission Control Demo',
        repoPath: '/repos/mission-control-demo',
      })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Cancel without reason',
        status: 'active',
        phase: 'build',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      expect(() =>
        applyWorkItemLifecycleTransition(workItem.id, {
          action: 'cancel',
          actor: 'D3n13r',
        }),
      ).toThrow('cancel requires a reason note explaining why the work item is being cancelled')
    })
  })

  describe('back_to_research', () => {
    it('moves an active build work item back to research', () => {
      const project = createProject({ name: 'Test', repoPath: '/test' })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Back to research from build',
        status: 'active',
        phase: 'build',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'back_to_research',
        actor: 'D3n13r',
        notes: 'Needs more planning before continuing',
      })

      expect(result.workItem.status).toBe('active')
      expect(result.workItem.phase).toBe('research')
      expect(result.workItem.history.at(-1)).toMatchObject({
        action: 'status-change',
        status: 'active',
        phase: 'research',
        note: 'Returned to research for additional planning: Needs more planning before continuing',
      })
    })

    it('moves a blocked build work item back to research', () => {
      const project = createProject({ name: 'Test', repoPath: '/test' })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Back to research from blocked',
        status: 'blocked',
        phase: 'build',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'back_to_research',
        actor: 'D3n13r',
      })

      expect(result.workItem.status).toBe('active')
      expect(result.workItem.phase).toBe('research')
      expect(result.workItem.history.at(-1)).toMatchObject({
        note: 'Returned to research for additional planning.',
      })
    })

    it('moves an active review work item back to research', () => {
      const project = createProject({ name: 'Test', repoPath: '/test' })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Back to research from review',
        status: 'active',
        phase: 'review',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'back_to_research',
        actor: 'D3n13r',
        notes: 'Review determined more planning needed',
      })

      expect(result.workItem.status).toBe('active')
      expect(result.workItem.phase).toBe('research')
    })

    it('rejects back_to_research for an inbox work item', () => {
      const project = createProject({ name: 'Test', repoPath: '/test' })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Invalid back_to_research',
        status: 'inbox',
        phase: 'research',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      expect(() =>
        applyWorkItemLifecycleTransition(workItem.id, {
          action: 'back_to_research',
          actor: 'D3n13r',
        }),
      ).toThrow('back_to_research is only valid for active build, active review, or blocked build work items')
    })
  })

  describe('back_to_build', () => {
    it('moves an active deploy work item back to build', () => {
      const project = createProject({ name: 'Test', repoPath: '/test' })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Back to build from deploy',
        status: 'active',
        phase: 'deploy',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'back_to_build',
        actor: 'D3n13r',
        notes: 'Deploy rejected — needs fixes',
      })

      expect(result.workItem.status).toBe('active')
      expect(result.workItem.phase).toBe('build')
      expect(result.workItem.history.at(-1)).toMatchObject({
        action: 'status-change',
        status: 'active',
        phase: 'build',
        note: 'Returned to build for fixes: Deploy rejected — needs fixes',
      })
    })

    it('rejects back_to_build for a non-deploy work item', () => {
      const project = createProject({ name: 'Test', repoPath: '/test' })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Invalid back_to_build',
        status: 'active',
        phase: 'build',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      expect(() =>
        applyWorkItemLifecycleTransition(workItem.id, {
          action: 'back_to_build',
          actor: 'D3n13r',
        }),
      ).toThrow('back_to_build is only valid for active deploy work items')
    })
  })

  describe('back_to_inbox', () => {
    it('moves an active research work item back to inbox', () => {
      const project = createProject({ name: 'Test', repoPath: '/test' })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Back to inbox',
        status: 'active',
        phase: 'research',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      const result = applyWorkItemLifecycleTransition(workItem.id, {
        action: 'back_to_inbox',
        actor: 'D3n13r',
        notes: 'Idea needs more refinement before planning',
      })

      expect(result.workItem.status).toBe('inbox')
      expect(result.workItem.phase).toBe('research')
      expect(result.workItem.history.at(-1)).toMatchObject({
        action: 'status-change',
        status: 'inbox',
        phase: 'research',
        note: 'Returned to inbox for refinement: Idea needs more refinement before planning',
      })
    })

    it('rejects back_to_inbox for a non-research work item', () => {
      const project = createProject({ name: 'Test', repoPath: '/test' })
      const workItem = createWorkItem({
        projectId: project.id,
        title: 'Invalid back_to_inbox',
        status: 'active',
        phase: 'build',
        priority: 'medium',
        repoPathSnapshot: project.repoPath,
      })

      expect(() =>
        applyWorkItemLifecycleTransition(workItem.id, {
          action: 'back_to_inbox',
          actor: 'D3n13r',
        }),
      ).toThrow('back_to_inbox is only valid for active research work items')
    })
  })
})
