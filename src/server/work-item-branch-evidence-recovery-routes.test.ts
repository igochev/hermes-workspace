import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { recoverMissingBranchEvidence } = vi.hoisted(() => ({
  recoverMissingBranchEvidence: vi.fn(),
}))

vi.mock('../server/work-item-branch-evidence-recovery', () => ({
  recoverMissingBranchEvidence,
}))

// eslint-disable-next-line import/first
import { Route } from '../routes/api/work-items.$workItemId.branch-evidence-recovery'

type RouteHandler<TParams extends Record<string, string> = Record<string, string>> = (input: {
  request: Request
  params: TParams
}) => Promise<Response>

function getRouteHandler<TMethod extends 'POST', TParams extends Record<string, string>>(
  route: unknown,
  method: TMethod,
): RouteHandler<TParams> {
  return (
    route as {
      options: { server: { handlers: Record<TMethod, RouteHandler<TParams>> } }
    }
  ).options.server.handlers[method]
}

const postBranchEvidenceRecovery = getRouteHandler<'POST', { workItemId: string }>(Route, 'POST')

describe('/api/work-items/$workItemId/branch-evidence-recovery POST', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-branch-evidence-route-'))
    previousHermesHome = process.env.HERMES_HOME
    previousPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
    recoverMissingBranchEvidence.mockReset()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    if (previousPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousPassword
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('requires authentication before calling recovery helper', async () => {
    process.env.HERMES_PASSWORD = 'secret'

    const response = await postBranchEvidenceRecovery({
      request: new Request('http://127.0.0.1:3456/api/work-items/work-1/branch-evidence-recovery', {
        method: 'POST',
        body: JSON.stringify({ branchName: 'mission/recovery' }),
      }),
      params: { workItemId: 'work-1' },
    })

    expect(response.status).toBe(401)
    expect(recoverMissingBranchEvidence).not.toHaveBeenCalled()
  })

  it('returns validation errors as 400 responses', async () => {
    vi.mocked(recoverMissingBranchEvidence).mockRejectedValueOnce(new Error('branchName is required'))

    const response = await postBranchEvidenceRecovery({
      request: new Request('http://127.0.0.1:3456/api/work-items/work-1/branch-evidence-recovery', {
        method: 'POST',
        body: JSON.stringify({ branchName: '' }),
      }),
      params: { workItemId: 'work-1' },
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'branchName is required' })
  })

  it('returns 404 when the target work item does not exist', async () => {
    vi.mocked(recoverMissingBranchEvidence).mockRejectedValueOnce(new Error('Work item not found'))

    const response = await postBranchEvidenceRecovery({
      request: new Request('http://127.0.0.1:3456/api/work-items/missing/branch-evidence-recovery', {
        method: 'POST',
        body: JSON.stringify({ branchName: 'mission/recovery' }),
      }),
      params: { workItemId: 'missing' },
    })

    const body = (await response.json()) as Record<string, unknown>
    expect({ status: response.status, body }).toEqual({ status: 404, body: { error: 'Work item not found' } })
  })

  it('attaches branch evidence and returns recovery metadata without running Merge-Healer', async () => {
    vi.mocked(recoverMissingBranchEvidence).mockResolvedValueOnce({
      workItem: {
        id: 'work-1',
        projectId: 'project-1',
        title: 'Recovered item',
        description: '',
        status: 'active',
        phase: 'deploy',
        priority: 'high',
        riskLevel: 'medium',
        labels: [],
        repoPathSnapshot: '/repo',
        sourceSuggestionEvidence: [],
        reviewQualityGateReasons: [],
        reviewMissingEvidence: [],
        sessionKeys: [],
        laneState: 'merge_healing',
        branchName: 'mission/recovery',
        baseBranch: 'main',
        mergeTargetBranch: 'main',
        mergeBaseCommit: 'a'.repeat(40),
        mergeState: 'not_started',
        mergeTestPassed: false,
        artifactPaths: [],
        acceptanceCriteria: [],
        criteriaStatus: [],
        notes: [],
        history: [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      branchName: 'mission/recovery',
      baseBranch: 'main',
      mergeBaseCommit: 'a'.repeat(40),
      branchHeadCommit: 'b'.repeat(40),
      commitsAhead: ['bbbbbbb feature'],
    })

    const response = await postBranchEvidenceRecovery({
      request: new Request('http://127.0.0.1:3456/api/work-items/work-1/branch-evidence-recovery', {
        method: 'POST',
        body: JSON.stringify({
          branchName: 'mission/recovery',
          baseBranch: 'main',
          operatorNote: 'Recovered branch evidence.',
        }),
      }),
      params: { workItemId: 'work-1' },
    })

    expect(response.status).toBe(200)
    expect(recoverMissingBranchEvidence).toHaveBeenCalledWith({
      workItemId: 'work-1',
      branchName: 'mission/recovery',
      baseBranch: 'main',
      operatorNote: 'Recovered branch evidence.',
    })
    await expect(response.json()).resolves.toMatchObject({
      workItem: { id: 'work-1', status: 'active', phase: 'deploy' },
      recovery: {
        branchName: 'mission/recovery',
        baseBranch: 'main',
        mergeBaseCommit: 'a'.repeat(40),
        branchHeadCommit: 'b'.repeat(40),
        commitsAhead: ['bbbbbbb feature'],
      },
    })
  })
})
