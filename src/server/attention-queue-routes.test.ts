import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem } from './work-items-store'
import { Route as AttentionQueueRoute } from '../routes/api/attention-queue'

describe('attention queue route', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-attention-route-'))
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

    const response = await AttentionQueueRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/attention-queue'),
    })

    expect(response.status).toBe(401)
  })

  it('refreshes and returns attention queue items', async () => {
    const project = createProject({ name: 'Mission Control', repoPath: '/repos/mission-control' })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Failed work',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionState: 'failed',
    })

    const response = await AttentionQueueRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/attention-queue?refresh=true'),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: Array<{ dedupeKey: string }> }
    expect(body.items).toEqual([
      expect.objectContaining({ dedupeKey: `mission_failed:${workItem.id}` }),
    ])
  })
})
