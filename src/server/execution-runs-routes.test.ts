import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { storeSessionToken } from './auth-middleware'
import { upsertExecutionRun } from './execution-runs-store'

type RouteGetHandler<
  TParams extends Record<string, string> = Record<string, string>,
> = (input: { request: Request; params: TParams }) => Promise<Response>

async function importRoutes() {
  const listRoute = await import('../routes/api/execution-runs')
  const detailRoute =
    await import('../routes/api/execution-runs.$executionRunId')
  return {
    list: (
      listRoute.Route as unknown as {
        options: { server: { handlers: { GET: RouteGetHandler } } }
      }
    ).options.server.handlers.GET,
    detail: (
      detailRoute.Route as unknown as {
        options: {
          server: {
            handlers: { GET: RouteGetHandler<{ executionRunId: string }> }
          }
        }
      }
    ).options.server.handlers.GET,
  }
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, any>
}

describe('execution run API routes', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'hermes-workspace-execution-routes-'),
    )
    previousHermesHome = process.env.HERMES_HOME
    previousHermesPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    if (previousHermesPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousHermesPassword
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('requires authentication when password protection is enabled', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { list } = await importRoutes()

    const response = await list({
      request: new Request('http://127.0.0.1:3456/api/execution-runs'),
      params: {},
    })

    expect(response.status).toBe(401)
    await expect(readJson(response)).resolves.toMatchObject({
      error: 'Unauthorized',
    })
  })

  it('filters execution runs by work item, project, state, phase, role, job id, and text query', async () => {
    const matching = upsertExecutionRun({
      id: 'exec-build-1',
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-build-123',
      jobName: 'Build execution',
      runId: 'run-abc',
      state: 'running',
      sessionKey: 'session-full-key',
      sessionKeyPrefix: 'session-prefix',
      branchName: 'mission/work-1',
      artifactPaths: ['reports/build.md'],
    })
    upsertExecutionRun({
      id: 'exec-review-1',
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'review',
      phase: 'review',
      engine: 'conductor',
      jobId: 'job-review-123',
      state: 'succeeded',
    })
    upsertExecutionRun({
      id: 'exec-other',
      workItemId: 'work-2',
      projectId: 'project-2',
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-build-999',
      state: 'running',
    })
    const { list } = await importRoutes()

    const response = await list({
      request: new Request(
        'http://127.0.0.1:3456/api/execution-runs?workItemId=work-1&projectId=project-1&state=running&phase=build&role=mission&jobId=job-build-123&q=session-prefix',
      ),
      params: {},
    })

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      runs: [
        expect.objectContaining({ id: matching.id, jobId: 'job-build-123' }),
      ],
      filters: expect.objectContaining({
        workItemId: 'work-1',
        projectId: 'project-1',
        state: 'running',
        phase: 'build',
        role: 'mission',
        jobId: 'job-build-123',
        q: 'session-prefix',
      }),
      legacyLookup: null,
    })
  })

  it('returns exact execution run detail or a 404', async () => {
    const run = upsertExecutionRun({
      id: 'exec-detail-1',
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-detail',
      state: 'succeeded',
    })
    const { detail } = await importRoutes()

    const response = await detail({
      request: new Request(
        'http://127.0.0.1:3456/api/execution-runs/exec-detail-1',
      ),
      params: { executionRunId: run.id },
    })
    const missing = await detail({
      request: new Request('http://127.0.0.1:3456/api/execution-runs/missing'),
      params: { executionRunId: 'missing' },
    })

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      run: expect.objectContaining({ id: run.id }),
    })
    expect(missing.status).toBe(404)
    await expect(readJson(missing)).resolves.toMatchObject({
      error: 'Execution run not found',
    })
  })

  it('returns a legacy no-record lookup payload for job id traces without durable runs', async () => {
    const { list } = await importRoutes()

    const response = await list({
      request: new Request(
        'http://127.0.0.1:3456/api/execution-runs?jobId=legacy-job-1&workItemId=work-legacy',
      ),
      params: {},
    })

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      runs: [],
      legacyLookup: {
        status: 'no_durable_run',
        jobId: 'legacy-job-1',
        workItemId: 'work-legacy',
        message:
          'Scheduled job legacy-job-1 was referenced by a work item, but no durable execution run record exists yet.',
      },
    })
  })

  it('accepts a valid auth session cookie when password protection is enabled', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    storeSessionToken('token-1')
    upsertExecutionRun({
      id: 'exec-auth-1',
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-auth',
      state: 'scheduled',
    })
    const { list } = await importRoutes()

    const response = await list({
      request: new Request('http://127.0.0.1:3456/api/execution-runs', {
        headers: { cookie: 'hermes-auth=token-1' },
      }),
      params: {},
    })

    expect(response.status).toBe(200)
    await expect(readJson(response)).resolves.toMatchObject({
      runs: [expect.objectContaining({ id: 'exec-auth-1' })],
    })
  })
})
