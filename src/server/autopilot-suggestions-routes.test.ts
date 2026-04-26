import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProject } from './projects-store'
import {
  createAutopilotSuggestion,
  getAutopilotSuggestion,
} from './autopilot-suggestions-store'
import { getWorkItem } from './work-items-store'
import { Route as SuggestionsRoute } from '../routes/api/autopilot-suggestions'
import { Route as ConvertSuggestionRoute } from '../routes/api/autopilot-suggestions.$suggestionId.convert'

describe('autopilot suggestions routes', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-autopilot-routes-'))
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

    const response = await SuggestionsRoute.options.server.handlers.POST({
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
    const response = await SuggestionsRoute.options.server.handlers.POST({
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

    const response = await SuggestionsRoute.options.server.handlers.POST({
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
      suggestion: { id: string; projectId: string; title: string; status: string }
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

    const response = await ConvertSuggestionRoute.options.server.handlers.POST({
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
    expect(workItem?.labels).toEqual(expect.arrayContaining(['autopilot', 'ci', 'tests']))
    expect(workItem?.acceptanceCriteria).toEqual(['Flaky test label + quarantine workflow'])
    expect(workItem?.sourceSuggestionId).toBe(suggestion.id)
    expect(workItem?.sourceSuggestionTitle).toBe('Add flaky test quarantine lane')
    expect(workItem?.sourceSuggestionEvidence).toEqual([
      'Vitest retries increasing',
      'CI rerun rate 18%',
    ])

    expect(convertedSuggestion?.status).toBe('converted')
    expect(convertedSuggestion?.convertedWorkItemId).toBe(body.workItem.id)
  })
})
