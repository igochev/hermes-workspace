import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { reconcileAllWorkItemAutonomy, reconcileWorkItemAutonomy } = vi.hoisted(() => ({
  reconcileAllWorkItemAutonomy: vi.fn(),
  reconcileWorkItemAutonomy: vi.fn(),
}))

vi.mock('./work-item-orchestrator', () => ({
  reconcileAllWorkItemAutonomy,
  reconcileWorkItemAutonomy,
}))

import { Route as WorkItemOrchestratorReconcileRoute } from '../routes/api/work-items.orchestrator.reconcile'

describe('work item orchestrator reconcile route', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-orchestrator-route-'))
    previousHermesHome = process.env.HERMES_HOME
    previousHermesPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
    reconcileAllWorkItemAutonomy.mockReset()
    reconcileWorkItemAutonomy.mockReset()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome

    if (previousHermesPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousHermesPassword

    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('returns 401 when unauthenticated', async () => {
    process.env.HERMES_PASSWORD = 'secret'

    const response = await WorkItemOrchestratorReconcileRoute.options.server.handlers.POST({
      request: new Request('http://127.0.0.1:3456/api/work-items/orchestrator/reconcile', {
        method: 'POST',
      }),
    })

    expect(response.status).toBe(401)
    expect(reconcileAllWorkItemAutonomy).not.toHaveBeenCalled()
    expect(reconcileWorkItemAutonomy).not.toHaveBeenCalled()
  })

  it('reconciles a single work item when workItemId is provided', async () => {
    reconcileWorkItemAutonomy.mockResolvedValue({
      workItemId: 'work-item-1',
      changed: true,
      events: [{ action: 'launch_builder' }],
    })

    const response = await WorkItemOrchestratorReconcileRoute.options.server.handlers.POST({
      request: new Request(
        'http://127.0.0.1:3456/api/work-items/orchestrator/reconcile?workItemId=work-item-1',
        { method: 'POST' },
      ),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { checked: number; changed: number; events: Array<unknown>; findings: Array<unknown> }
    expect(body).toMatchObject({ checked: 1, changed: 1, findings: [] })
    expect(body.events).toEqual([{ action: 'launch_builder' }])
    expect(reconcileWorkItemAutonomy).toHaveBeenCalledWith('work-item-1')
    expect(reconcileAllWorkItemAutonomy).not.toHaveBeenCalled()
  })

  it('reconciles all work items when workItemId is absent', async () => {
    reconcileAllWorkItemAutonomy.mockResolvedValue({
      checked: 2,
      changed: 1,
      events: [{ action: 'sync_execution' }],
      findings: [],
    })

    const response = await WorkItemOrchestratorReconcileRoute.options.server.handlers.POST({
      request: new Request('http://127.0.0.1:3456/api/work-items/orchestrator/reconcile', {
        method: 'POST',
      }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { checked: number; changed: number; events: Array<unknown>; findings: Array<unknown> }
    expect(body).toEqual({
      checked: 2,
      changed: 1,
      events: [{ action: 'sync_execution' }],
      findings: [],
    })
    expect(reconcileAllWorkItemAutonomy).toHaveBeenCalledTimes(1)
    expect(reconcileWorkItemAutonomy).not.toHaveBeenCalled()
  })
})
