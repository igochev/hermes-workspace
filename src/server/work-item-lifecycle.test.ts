import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createProject } from './projects-store'
import { getWorkItem, createWorkItem } from './work-items-store'
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
})
