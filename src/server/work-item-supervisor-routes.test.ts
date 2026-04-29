import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as WorkItemSupervisorReconcileRoute } from '../routes/api/work-items.supervisor.reconcile'
import { createProject } from './projects-store'
import { createWorkItem, getWorkItem } from './work-items-store'

const { syncWorkItemExecutionState } = vi.hoisted(() => ({
  syncWorkItemExecutionState: vi.fn(),
}))

vi.mock('./work-item-execution', () => ({
  syncWorkItemExecutionState,
}))

type RouteHandler<
  TParams extends Record<string, string> = Record<string, string>,
> = (input: { request: Request; params?: TParams }) => Promise<Response>

function getRouteHandler<
  TMethod extends 'GET' | 'POST',
  TParams extends Record<string, string> = Record<string, string>,
>(route: unknown, method: TMethod): RouteHandler<TParams> {
  return (
    route as {
      options: { server: { handlers: Record<TMethod, RouteHandler<TParams>> } }
    }
  ).options.server.handlers[method]
}

const postSupervisorReconcile = getRouteHandler(
  WorkItemSupervisorReconcileRoute,
  'POST',
)

describe('work item supervisor reconcile route', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'hermes-workspace-supervisor-route-'),
    )
    previousHermesHome = process.env.HERMES_HOME
    previousHermesPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
    syncWorkItemExecutionState.mockReset()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome

    if (previousHermesPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousHermesPassword

    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  function createSupervisorCandidate() {
    const project = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
    })
    return createWorkItem({
      projectId: project.id,
      title: 'Supervise build',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionJobId: 'job-supervise',
      missionState: 'running',
    })
  }

  it('returns 401 when unauthenticated', async () => {
    process.env.HERMES_PASSWORD = 'secret'

    const response = await postSupervisorReconcile({
      request: new Request(
        'http://127.0.0.1:3456/api/work-items/supervisor/reconcile',
        {
          method: 'POST',
        },
      ),
    })

    expect(response.status).toBe(401)
  })

  it('reconciles a single work item when workItemId is provided', async () => {
    const workItem = createSupervisorCandidate()
    syncWorkItemExecutionState.mockImplementation(
      async (workItemId: string) => ({
        workItem: getWorkItem(workItemId),
      }),
    )

    const response = await postSupervisorReconcile({
      request: new Request(
        `http://127.0.0.1:3456/api/work-items/supervisor/reconcile?workItemId=${workItem.id}`,
        { method: 'POST' },
      ),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      checked: number
      findings: Array<unknown>
    }
    expect(body.checked).toBe(1)
    expect(body.findings).toEqual([])
    expect(syncWorkItemExecutionState).toHaveBeenCalledTimes(1)
    expect(syncWorkItemExecutionState).toHaveBeenCalledWith(workItem.id)
  })

  it('reconciles all candidate work items by default', async () => {
    const active = createSupervisorCandidate()
    createWorkItem({
      projectId: active.projectId,
      title: 'Done item',
      status: 'done',
      phase: 'deploy',
      priority: 'low',
      repoPathSnapshot: '/repos/mission-control',
    })
    syncWorkItemExecutionState.mockImplementation(
      async (workItemId: string) => ({
        workItem: getWorkItem(workItemId),
      }),
    )

    const response = await postSupervisorReconcile({
      request: new Request(
        'http://127.0.0.1:3456/api/work-items/supervisor/reconcile',
        {
          method: 'POST',
        },
      ),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      checked: number
      findings: Array<unknown>
    }
    expect(body.checked).toBe(1)
    expect(body.findings).toEqual([])
    expect(syncWorkItemExecutionState).toHaveBeenCalledWith(active.id)
  })
})
