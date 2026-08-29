import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem } from './work-items-store'
import { reconcileWorkItemAutonomy } from './work-item-orchestrator'
import type * as WorkItemPlanningModule from './work-item-planning'

const { prepareWorkItemWithPlanner } = vi.hoisted(() => ({
  prepareWorkItemWithPlanner: vi.fn(),
}))

vi.mock('./work-item-planning', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkItemPlanningModule>()),
  prepareWorkItemWithPlanner,
}))

describe('work-item orchestrator Planner launch evidence', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'hermes-workspace-planner-evidence-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = join(tempHome, '.hermes')
    prepareWorkItemWithPlanner.mockReset()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('records Planner job and draft evidence on first inbox research reconcile without manual mutation', async () => {
    const project = createProject({
      name: 'Mission Control Demo',
      repoPath: '/repos/mission-control-demo',
      defaultBranch: 'main',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Autonomous orchestrator live smoke autonomy-smoke-20260427T175044Z',
      description:
        'Temporary API smoke item verifies orchestrator reconcile launches Planner.',
      status: 'inbox',
      phase: 'research',
      priority: 'medium',
      riskLevel: 'low',
      repoPathSnapshot: project.repoPath,
    })
    prepareWorkItemWithPlanner.mockResolvedValue({
      draft: {
        id: '89ef9e12-2418-45c5-8f2c-1f8eba8e9253',
        plannerJobId: '0eac4b039e43',
      },
      launch: { jobId: '0eac4b039e43' },
    })

    const result = await reconcileWorkItemAutonomy(workItem.id)

    expect(prepareWorkItemWithPlanner).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ workItemId: workItem.id, changed: true })
    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      workItemId: workItem.id,
      projectId: project.id,
      action: 'launch_planner',
      statusBefore: 'inbox',
      phaseBefore: 'research',
      statusAfter: 'inbox',
      phaseAfter: 'research',
      jobId: '0eac4b039e43',
      draftId: '89ef9e12-2418-45c5-8f2c-1f8eba8e9253',
      message: 'Auto-launched Planner for inbox research work item.',
    })
    expect(result.events[0]?.observedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
