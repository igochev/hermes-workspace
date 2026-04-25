import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('./work-item-execution', () => ({
  syncWorkItemExecutionState: vi.fn(),
}))

import { createProject } from './projects-store'
import { createWorkItem } from './work-items-store'
import { syncWorkItemExecutionState } from './work-item-execution'
import { Route } from '../routes/api/work-items.$workItemId'

describe('/api/work-items/$workItemId GET sync fallback envelope', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-route-work-item-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('returns base payload with executionSyncWarning instead of 500 when syncExecution fails', async () => {
    const project = createProject({
      name: 'Route fallback project',
      repoPath: '/repos/route-fallback',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Execution sync fallback',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })

    vi.mocked(syncWorkItemExecutionState).mockRejectedValueOnce(new Error('Hermes dashboard timed out'))

    const response = await Route.options.server.handlers.GET({
      request: new Request(`http://127.0.0.1:3456/api/work-items/${workItem.id}?syncExecution=true`),
      params: { workItemId: workItem.id },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>

    expect(body.error).toBeUndefined()
    expect(body.execution).toBeUndefined()
    expect(body.executionSyncWarning).toBe('Hermes dashboard timed out')

    const payloadWorkItem = body.workItem as Record<string, unknown>
    expect(payloadWorkItem.id).toBe(workItem.id)
    expect(payloadWorkItem.status).toBe('active')
    expect(payloadWorkItem.phase).toBe('build')
  })
})
