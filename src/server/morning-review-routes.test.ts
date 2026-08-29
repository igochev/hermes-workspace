import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { storeSessionToken } from './auth-middleware'
import { createProject } from './projects-store'
import { createWorkItem } from './work-items-store'
import { requestWorkItemApproval } from './work-item-approvals'

type RouteGetHandler = (input: { request: Request; params: Record<string, string> }) => Promise<Response>

async function importRoute(): Promise<RouteGetHandler> {
  const route = await import('../routes/api/morning-review')
  return (
    route.Route as unknown as {
      options: { server: { handlers: { GET: RouteGetHandler } } }
    }
  ).options.server.handlers.GET
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>
}

describe('morning review API route', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined
  const now = new Date('2026-04-29T12:00:00.000Z')

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-morning-review-route-'))
    previousHermesHome = process.env.HERMES_HOME
    previousHermesPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    if (previousHermesPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousHermesPassword
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('requires authentication when password protection is enabled', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const get = await importRoute()

    const response = await get({
      request: new Request('http://127.0.0.1:3456/api/morning-review'),
      params: {},
    })

    expect(response.status).toBe(401)
    await expect(readJson(response)).resolves.toMatchObject({ error: 'Unauthorized' })
  })

  it('returns a JSON morning review digest with the default 18 hour lookback', async () => {
    const project = createProject({ id: 'project-api', name: 'API Project', repoPath: '/repos/api' })
    const workItem = createWorkItem({
      id: 'work-api-approval',
      projectId: project.id,
      title: 'Approve API route',
      status: 'active',
      phase: 'review',
      priority: 'high',
      riskLevel: 'high',
      repoPathSnapshot: project.repoPath,
    })
    requestWorkItemApproval(workItem.id, { phase: 'review', requestedBy: 'operator' })
    const get = await importRoute()

    const response = await get({
      request: new Request('http://127.0.0.1:3456/api/morning-review'),
      params: {},
    })

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      digest: {
        generatedAt: now.toISOString(),
        window: {
          since: '2026-04-28T18:00:00.000Z',
          until: now.toISOString(),
          lookbackHours: 18,
        },
        summary: expect.objectContaining({ needs_approval: 1 }),
        nextAttentionItem: expect.objectContaining({ workItemId: workItem.id }),
      },
    })
  })

  it('clamps query lookback hours to the supported 1 to 72 hour window', async () => {
    const get = await importRoute()

    const tooLow = await get({
      request: new Request('http://127.0.0.1:3456/api/morning-review?lookbackHours=0'),
      params: {},
    })
    const tooHigh = await get({
      request: new Request('http://127.0.0.1:3456/api/morning-review?lookbackHours=200'),
      params: {},
    })

    await expect(readJson(tooLow)).resolves.toMatchObject({
      digest: { window: { lookbackHours: 1, since: '2026-04-29T11:00:00.000Z' } },
    })
    await expect(readJson(tooHigh)).resolves.toMatchObject({
      digest: { window: { lookbackHours: 72, since: '2026-04-26T12:00:00.000Z' } },
    })
  })

  it('returns Discord formatted output without persisting the status digest hash', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    storeSessionToken('morning-review-token')
    const get = await importRoute()

    const response = await get({
      request: new Request('http://127.0.0.1:3456/api/morning-review?lookbackHours=6&format=discord', {
        headers: { cookie: 'hermes-auth=morning-review-token' },
      }),
      params: {},
    })

    expect(response.status).toBe(200)
    const body = await readJson(response)
    expect(body.digest.window.lookbackHours).toBe(6)
    expect(body.message).toContain('**🌅 Morning Review — Mission Control**')
    expect(body.message).toContain('Last 6h')
    expect(body.message).not.toMatch(/Failed missions|Running missions|Hermes Job ID|Mission Link/)
    expect(
      fs.existsSync(path.join(process.env.HERMES_HOME!, 'notification-digest-last-hash.txt')),
    ).toBe(false)
  })
})
