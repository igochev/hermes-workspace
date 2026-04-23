import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProject } from './projects-store'
import { buildProjectDetailPayload } from './project-detail'
import { requestWorkItemReviewApproval } from './work-item-approvals'
import { createWorkItem } from './work-items-store'

describe('project-detail payload', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-project-detail-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('builds project board payload with enriched work-item approvals for operator-visible kanban signals', () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
    })

    const reviewItem = createWorkItem({
      projectId: project.id,
      title: 'Needs review approval',
      status: 'active',
      phase: 'review',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })

    const executionItem = createWorkItem({
      projectId: project.id,
      title: 'Running execution',
      status: 'active',
      phase: 'build',
      priority: 'medium',
      missionState: 'running',
      sessionKeys: ['cron_example_1'],
      repoPathSnapshot: project.repoPath,
    })

    requestWorkItemReviewApproval(reviewItem.id, {
      requestedBy: 'operator',
      notes: 'Awaiting review decision',
    })

    const payload = buildProjectDetailPayload(project.id)

    expect(payload).not.toBeNull()
    expect(payload?.project).toMatchObject({
      id: project.id,
      workItemCount: 2,
      activeWorkItemCount: 2,
      doneWorkItemCount: 0,
    })
    expect(payload?.workItems).toHaveLength(2)
    expect(payload?.workItems.find((item) => item.id === reviewItem.id)?.approvals).toMatchObject([
      {
        workItemId: reviewItem.id,
        status: 'pending',
        phase: 'review',
      },
    ])
    expect(payload?.workItems.find((item) => item.id === executionItem.id)).toMatchObject({
      missionState: 'running',
      sessionKeys: ['cron_example_1'],
    })
  })
})
