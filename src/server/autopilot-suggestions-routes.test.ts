import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as SuggestionsRoute } from '../routes/api/autopilot-suggestions'
import { Route as ConvertSuggestionRoute } from '../routes/api/autopilot-suggestions.$suggestionId.convert'
import { createProject } from './projects-store'
import {
  createAutopilotSuggestion,
  getAutopilotSuggestion,
} from './autopilot-suggestions-store'
import { getLatestPlanningDraftForWorkItem } from './planning-drafts-store'
import { getWorkItem } from './work-items-store'

const { launchConductorMission, launchImmediateExecution } = vi.hoisted(() => ({
  launchConductorMission: vi.fn(),
  launchImmediateExecution: vi.fn(),
}))

vi.mock('./conductor-launch', () => ({
  launchConductorMission,
}))

vi.mock('./immediate-execution-launch', () => ({
  launchImmediateExecution,
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

const postSuggestion = getRouteHandler(SuggestionsRoute, 'POST')
const postConvertSuggestion = getRouteHandler<'POST', { suggestionId: string }>(
  ConvertSuggestionRoute,
  'POST',
)

describe('autopilot suggestions routes', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(
      path.join(os.tmpdir(), 'hermes-workspace-autopilot-routes-'),
    )
    previousHermesHome = process.env.HERMES_HOME
    previousHermesPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
    launchConductorMission.mockReset()
    launchImmediateExecution.mockReset()
    launchConductorMission.mockResolvedValue({
      ok: true,
      sessionKey: 'cron_job-autopilot-plan_pending',
      sessionKeyPrefix: 'cron_job-autopilot-plan_',
      jobId: 'job-autopilot-plan',
      jobName: 'autopilot-planner',
      runId: null,
    })
    launchImmediateExecution.mockResolvedValue({
      executionRunId: 'execution-autopilot-plan',
      sessionKey: 'session-autopilot-plan',
      state: 'running',
      link: '/executions/execution-autopilot-plan',
    })
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

    const response = await postSuggestion({
      request: new Request('http://127.0.0.1:3456/api/autopilot-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'project-1',
          title: 'Secure defaults',
          rationale: 'test',
        }),
      }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 404 when creating suggestion for missing project', async () => {
    const response = await postSuggestion({
      request: new Request('http://127.0.0.1:3456/api/autopilot-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'missing-project',
          title: 'Secure defaults',
          rationale: 'test',
        }),
      }),
    })

    expect(response.status).toBe(404)
  })

  it('creates suggestion with 201', async () => {
    const project = createProject({
      name: 'Mission control',
      repoPath: '/repos/mission-control',
    })

    const response = await postSuggestion({
      request: new Request('http://127.0.0.1:3456/api/autopilot-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          title: 'Improve deployment rollback checklist',
          rationale: 'Recent deploy errors had no standard rollback steps',
          evidence: ['Incident #1242', 'Incident #1243'],
          suggestedAcceptanceCriteria: ['Rollback playbook published'],
        }),
      }),
    })

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      suggestion: {
        id: string
        projectId: string
        title: string
        status: string
      }
    }
    expect(body.suggestion.projectId).toBe(project.id)
    expect(body.suggestion.title).toBe('Improve deployment rollback checklist')
    expect(body.suggestion.status).toBe('new')
  })

  it('converts suggestion into inbox/research work item and marks suggestion converted', async () => {
    const project = createProject({
      name: 'Mission control',
      repoPath: '/repos/mission-control',
    })

    const suggestion = createAutopilotSuggestion({
      projectId: project.id,
      title: 'Add flaky test quarantine lane',
      rationale: 'Flakes delay release confidence',
      evidence: ['Vitest retries increasing', 'CI rerun rate 18%'],
      suggestedAcceptanceCriteria: ['Flaky test label + quarantine workflow'],
      impact: 'high',
      risk: 'low',
      effort: 'small',
      labels: ['ci', 'tests'],
      source: 'failing-tests-scout',
    })

    const response = await postConvertSuggestion({
      request: new Request(
        `http://127.0.0.1:3456/api/autopilot-suggestions/${suggestion.id}/convert`,
        {
          method: 'POST',
        },
      ),
      params: { suggestionId: suggestion.id },
    })

    expect(response.status).toBe(201)
    const body = (await response.json()) as { workItem: { id: string } }
    const workItem = getWorkItem(body.workItem.id)
    const convertedSuggestion = getAutopilotSuggestion(suggestion.id)

    expect(workItem).not.toBeNull()
    expect(workItem?.projectId).toBe(project.id)
    expect(workItem?.status).toBe('inbox')
    expect(workItem?.phase).toBe('research')
    expect(workItem?.priority).toBe('high')
    expect(workItem?.riskLevel).toBe('low')
    expect(workItem?.labels).toEqual(
      expect.arrayContaining(['autopilot', 'ci', 'tests']),
    )
    expect(workItem?.acceptanceCriteria).toEqual([
      'Flaky test label + quarantine workflow',
    ])
    expect(workItem?.sourceSuggestionId).toBe(suggestion.id)
    expect(workItem?.sourceSuggestionTitle).toBe(
      'Add flaky test quarantine lane',
    )
    expect(workItem?.sourceSuggestionEvidence).toEqual([
      'Vitest retries increasing',
      'CI rerun rate 18%',
    ])

    expect(convertedSuggestion?.status).toBe('converted')
    expect(convertedSuggestion?.convertedWorkItemId).toBe(body.workItem.id)
  })

  it('converts suggestion into work item and requested planning draft when mode asks for planning', async () => {
    const project = createProject({
      name: 'Mission control',
      repoPath: '/repos/mission-control',
    })

    const suggestion = createAutopilotSuggestion({
      projectId: project.id,
      title: 'Plan flaky test quarantine lane',
      rationale: 'Flakes need planner-scoped implementation before coding',
      evidence: ['CI retry rate 18%'],
      suggestedAcceptanceCriteria: [
        'Planner draft is requested before build starts',
      ],
      impact: 'medium',
      risk: 'low',
      effort: 'small',
      labels: ['ci'],
      source: 'failing-tests-scout',
    })

    const response = await postConvertSuggestion({
      request: new Request(
        `http://127.0.0.1:3456/api/autopilot-suggestions/${suggestion.id}/convert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'work-item-and-plan' }),
        },
      ),
      params: { suggestionId: suggestion.id },
    })

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      workItem: { id: string; status: string; phase?: string }
      planningDraft: {
        id: string
        status: string
        workItemId: string
        plannerJobId?: string
      }
    }

    expect(body.workItem.status).toBe('active')
    expect(body.workItem.phase).toBe('research')
    expect(body.planningDraft.status).toBe('running')
    expect(body.planningDraft.workItemId).toBe(body.workItem.id)
    expect(body.planningDraft.plannerJobId).toBeUndefined()

    const latestDraft = getLatestPlanningDraftForWorkItem(body.workItem.id)
    expect(latestDraft?.id).toBe(body.planningDraft.id)
    expect(latestDraft?.plannerLink).toBe('/executions/execution-autopilot-plan')
    expect(launchConductorMission).not.toHaveBeenCalled()
    expect(launchImmediateExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        workItemId: body.workItem.id,
        phase: 'research',
        role: 'planner',
        profile: expect.any(String),
      }),
    )
    expect(getWorkItem(body.workItem.id)?.history.at(-1)?.note).toContain(
      'Planner enrichment requested',
    )
  })

  it('records policy-gated build intent without launching build when mode queues post-plan build', async () => {
    const project = createProject({
      name: 'Mission control',
      repoPath: '/repos/mission-control',
    })

    const suggestion = createAutopilotSuggestion({
      projectId: project.id,
      title: 'Queue safe docs build after plan',
      rationale: 'Low risk docs automation still needs accepted plan first',
      evidence: ['Docs page drift detected'],
      suggestedAcceptanceCriteria: ['Build waits for accepted planner draft'],
      impact: 'low',
      risk: 'low',
      effort: 'small',
      labels: ['docs'],
      source: 'stale-docs-scout',
    })

    const response = await postConvertSuggestion({
      request: new Request(
        `http://127.0.0.1:3456/api/autopilot-suggestions/${suggestion.id}/convert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'work-item-plan-build-queued' }),
        },
      ),
      params: { suggestionId: suggestion.id },
    })

    expect(response.status).toBe(201)
    const body = (await response.json()) as {
      workItem: {
        id: string
        autopilotBuildIntent?: string
        missionId?: string
        status: string
        phase?: string
      }
      planningDraft: { id: string; status: string; plannerJobId?: string }
    }

    expect(body.workItem.status).toBe('active')
    expect(body.workItem.phase).toBe('research')
    expect(body.workItem.autopilotBuildIntent).toBe('build-after-accepted-plan')
    expect(body.workItem.missionId).toBeUndefined()
    expect(body.planningDraft.status).toBe('running')
    expect(body.planningDraft.plannerJobId).toBeUndefined()
    expect(getWorkItem(body.workItem.id)?.notes).toContain(
      'Autopilot build intent queued: launch build only after an operator accepts the planner draft.',
    )
  })
})
