import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem } from './work-items-store'
import { upsertExecutionRun } from './execution-runs-store'
import { Route as WorkItemExecutionRunsRoute } from '../routes/api/work-items.$workItemId.execution-runs'

describe('execution runs route', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-execution-runs-route-'))
    previousHermesHome = process.env.HERMES_HOME
    previousHermesPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
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

    const response = await WorkItemExecutionRunsRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/work-items/work-1/execution-runs'),
      params: { workItemId: 'work-1' },
    })

    expect(response.status).toBe(401)
  })

  it('returns execution runs for a work item', async () => {
    const project = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Tracked launch',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    const run = upsertExecutionRun({
      workItemId: workItem.id,
      projectId: project.id,
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-1',
      state: 'running',
    })

    const response = await WorkItemExecutionRunsRoute.options.server.handlers.GET({
      request: new Request(`http://127.0.0.1:3456/api/work-items/${workItem.id}/execution-runs`),
      params: { workItemId: workItem.id },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { workItemId: string; runs: Array<{ id: string }> }
    expect(body.workItemId).toBe(workItem.id)
    expect(body.runs.map((item) => item.id)).toEqual([run.id])
  })

  it('returns 404 for missing work item', async () => {
    const response = await WorkItemExecutionRunsRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/work-items/missing/execution-runs'),
      params: { workItemId: 'missing' },
    })

    expect(response.status).toBe(404)
  })
})
