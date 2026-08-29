import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as WorkItemRecoveryActionsRoute } from '../routes/api/work-items.$workItemId.recovery-actions'
import {
  markAttentionQueueItemResolved,
  upsertAttentionQueueItem,
} from './attention-queue-store'
import { createProject } from './projects-store'
import { createWorkItem, getWorkItem } from './work-items-store'

const { launchWorkItemIntoConductor } = vi.hoisted(() => ({
  launchWorkItemIntoConductor: vi.fn(),
}))

vi.mock('./work-item-launch', () => ({
  launchWorkItemIntoConductor,
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

const postRecoveryAction = getRouteHandler<'POST', { workItemId: string }>(
  WorkItemRecoveryActionsRoute,
  'POST',
)

describe('work item recovery actions route', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'hermes-workspace-recovery-route-'),
    )
    previousHermesHome = process.env.HERMES_HOME
    previousHermesPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
    launchWorkItemIntoConductor.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome

    if (previousHermesPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousHermesPassword

    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  function createFixture() {
    const project = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Recover failed build',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
      missionState: 'failed',
      missionLastError: 'Tests failed',
    })
    const attention = upsertAttentionQueueItem({
      dedupeKey: `mission_failed:${workItem.id}`,
      kind: 'mission_failed',
      severity: 'critical',
      projectId: project.id,
      workItemId: workItem.id,
      title: 'Mission failed',
      detail: 'Tests failed',
      href: `/projects/${project.id}/work-items/${workItem.id}`,
      source: 'derived',
      recommendedActions: [
        {
          type: 'relaunch_phase',
          label: 'Relaunch build',
          description: 'Relaunch build',
          phase: 'build',
          destructive: false,
          auditNote: 'Operator requested build relaunch from recovery actions.',
        },
        {
          type: 'mark_resolved',
          label: 'Mark externally resolved',
          description: 'Resolve attention',
          destructive: false,
          auditNote:
            'Operator marked attention externally resolved from recovery actions.',
        },
      ],
    })
    return { project, workItem, attention }
  }

  async function postRecovery(
    workItemId: string,
    body: Record<string, unknown>,
  ) {
    return postRecoveryAction({
      request: new Request(
        `http://127.0.0.1:3456/api/work-items/${workItemId}/recovery-actions`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        },
      ),
      params: { workItemId },
    })
  }

  it('returns 401 when unauthenticated', async () => {
    process.env.HERMES_PASSWORD = 'secret'
    const { workItem } = createFixture()

    const response = await postRecovery(workItem.id, {
      actionType: 'mark_resolved',
    })

    expect(response.status).toBe(401)
  })

  it('marks an attention item externally resolved and appends audit history', async () => {
    const { workItem, attention } = createFixture()

    const response = await postRecovery(workItem.id, {
      actionType: 'mark_resolved',
      attentionItemId: attention.id,
      notes: 'Fixed outside Hermes.',
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      workItem: { history: Array<{ note: string }> }
      attentionItem: { status: string }
    }
    expect(body.attentionItem.status).toBe('resolved')
    expect(body.workItem.history.at(-1)?.note).toContain('Fixed outside Hermes')
  })

  it('returns blocked build work to active build and resolves linked attention', async () => {
    const { project } = createFixture()
    const blocked = createWorkItem({
      projectId: project.id,
      title: 'Blocked build',
      status: 'blocked',
      phase: 'build',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
      blockedReason: 'blocked_by_dependency',
    })
    const attention = upsertAttentionQueueItem({
      dedupeKey: `blocked:${blocked.id}`,
      kind: 'blocked_work',
      severity: 'warning',
      projectId: project.id,
      workItemId: blocked.id,
      title: 'Blocked work item',
      detail: 'Dependency cleared',
      href: `/projects/${project.id}/work-items/${blocked.id}`,
      source: 'derived',
    })

    const response = await postRecovery(blocked.id, {
      actionType: 'return_to_build',
      attentionItemId: attention.id,
      notes: 'Dependency cleared.',
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      workItem: { status: string; phase: string }
      attentionItem: { status: string }
    }
    expect(body.workItem).toEqual(
      expect.objectContaining({ status: 'active', phase: 'build' }),
    )
    expect(body.attentionItem.status).toBe('resolved')
  })

  it('relaunches through the existing launch path with explicit phase', async () => {
    const { project, workItem, attention } = createFixture()
    const launched = { ...workItem, missionState: 'scheduled' as const }
    launchWorkItemIntoConductor.mockResolvedValue({
      workItem: launched,
      project,
      launch: { phase: 'build', profile: 'builder' },
    })

    const response = await postRecovery(workItem.id, {
      actionType: 'relaunch_phase',
      attentionItemId: attention.id,
      phase: 'build',
      notes: 'Retry after transient failure.',
    })

    expect(response.status).toBe(201)
    expect(launchWorkItemIntoConductor).toHaveBeenCalledWith(
      workItem.id,
      expect.objectContaining({ phase: 'build', supervised: true }),
    )
    expect(markAttentionQueueItemResolved(attention.id)?.status).toBe(
      'resolved',
    )
    expect(getWorkItem(workItem.id)?.history.at(-1)?.note).toContain(
      'Retry after transient failure',
    )
  })
})
