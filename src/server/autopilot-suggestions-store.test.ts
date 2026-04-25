import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  acceptAutopilotSuggestion,
  archiveAutopilotSuggestion,
  createAutopilotSuggestion,
  deleteAutopilotSuggestionsForProject,
  listAutopilotSuggestions,
  markAutopilotSuggestionConverted,
  rejectAutopilotSuggestion,
  updateAutopilotSuggestion,
} from './autopilot-suggestions-store'

describe('autopilot-suggestions-store', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-autopilot-suggestions-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('creates, lists, and filters suggestions', () => {
    const first = createAutopilotSuggestion({
      projectId: 'project-1',
      title: 'Reduce flaky CI tests',
      rationale: 'Flakes slow delivery and create false negatives',
      source: 'failing-tests-scout',
      status: 'new',
    })

    const second = createAutopilotSuggestion({
      projectId: 'project-2',
      title: 'Refresh stale onboarding docs',
      rationale: 'Developer setup has drifted from current scripts',
      source: 'stale-docs-scout',
      status: 'accepted',
    })

    expect(listAutopilotSuggestions().map((item) => item.id)).toEqual([second.id, first.id])
    expect(listAutopilotSuggestions({ projectId: 'project-1' }).map((item) => item.id)).toEqual([first.id])
    expect(listAutopilotSuggestions({ status: 'accepted' }).map((item) => item.id)).toEqual([second.id])
    expect(listAutopilotSuggestions({ source: 'failing-tests-scout' }).map((item) => item.id)).toEqual([
      first.id,
    ])
  })

  it('normalizes malformed fields and trims/dedupes string arrays', () => {
    const suggestion = createAutopilotSuggestion({
      projectId: 'project-1',
      title: '  Improve keyboard navigation  ',
      rationale: '  Current dialog flow is hard to use without a mouse  ',
      evidence: ['  broken tab order ', 'broken tab order', 123 as unknown as string],
      suggestedAcceptanceCriteria: ['  Can tab to close button', '', 'Can tab to close button'],
      labels: [' ux ', 'ux', '', ' accessibility '],
      impact: 'unexpected' as unknown as 'high',
      risk: 'unknown' as unknown as 'high',
      effort: 'tiny' as unknown as 'small',
      source: 'not-real-source' as unknown as 'manual',
      status: 'not-real-status' as unknown as 'new',
    })

    expect(suggestion.title).toBe('Improve keyboard navigation')
    expect(suggestion.rationale).toBe('Current dialog flow is hard to use without a mouse')
    expect(suggestion.impact).toBe('medium')
    expect(suggestion.risk).toBe('medium')
    expect(suggestion.effort).toBe('medium')
    expect(suggestion.source).toBe('autopilot')
    expect(suggestion.status).toBe('new')
    expect(suggestion.evidence).toEqual(['broken tab order'])
    expect(suggestion.suggestedAcceptanceCriteria).toEqual(['Can tab to close button'])
    expect(suggestion.labels).toEqual(['ux', 'accessibility'])
  })

  it('supports accept/reject/archive/convert transitions and persists convertedWorkItemId', () => {
    const suggestion = createAutopilotSuggestion({
      projectId: 'project-1',
      title: 'Add API timeout alarms',
      rationale: 'Timeout spikes are currently discovered manually',
    })

    const accepted = acceptAutopilotSuggestion(suggestion.id)
    expect(accepted?.status).toBe('accepted')

    const rejected = rejectAutopilotSuggestion(suggestion.id, 'Out of current quarter scope')
    expect(rejected?.status).toBe('rejected')
    expect(rejected?.rejectionReason).toBe('Out of current quarter scope')

    const archived = archiveAutopilotSuggestion(suggestion.id)
    expect(archived?.status).toBe('archived')

    const converted = markAutopilotSuggestionConverted(suggestion.id, 'work-item-123')
    expect(converted?.status).toBe('converted')
    expect(converted?.convertedWorkItemId).toBe('work-item-123')

    const fetched = listAutopilotSuggestions().find((item) => item.id === suggestion.id)
    expect(fetched?.status).toBe('converted')
    expect(fetched?.convertedWorkItemId).toBe('work-item-123')
  })

  it('updates existing suggestion metadata', () => {
    const suggestion = createAutopilotSuggestion({
      projectId: 'project-1',
      title: 'Harden webhooks retries',
      rationale: 'Retries are not idempotent yet',
    })

    const updated = updateAutopilotSuggestion(suggestion.id, {
      impact: 'high',
      risk: 'low',
      effort: 'large',
      labels: ['resilience', ' webhooks ', 'resilience'],
      evidence: ['Recent incidents #1234'],
      suggestedAcceptanceCriteria: ['Retries are idempotent'],
      source: 'repo-health-scout',
      status: 'accepted',
    })

    expect(updated).not.toBeNull()
    expect(updated?.impact).toBe('high')
    expect(updated?.risk).toBe('low')
    expect(updated?.effort).toBe('large')
    expect(updated?.labels).toEqual(['resilience', 'webhooks'])
    expect(updated?.evidence).toEqual(['Recent incidents #1234'])
    expect(updated?.suggestedAcceptanceCriteria).toEqual(['Retries are idempotent'])
    expect(updated?.source).toBe('repo-health-scout')
    expect(updated?.status).toBe('accepted')
  })

  it('deletes suggestions by project id', () => {
    createAutopilotSuggestion({
      projectId: 'project-delete',
      title: 'Suggestion A',
      rationale: 'A',
    })
    createAutopilotSuggestion({
      projectId: 'project-delete',
      title: 'Suggestion B',
      rationale: 'B',
    })
    const keep = createAutopilotSuggestion({
      projectId: 'project-keep',
      title: 'Suggestion C',
      rationale: 'C',
    })

    expect(deleteAutopilotSuggestionsForProject('project-delete')).toBe(2)
    expect(listAutopilotSuggestions().map((item) => item.id)).toEqual([keep.id])
  })

  it('returns empty list if backing file contains invalid json', () => {
    createAutopilotSuggestion({
      projectId: 'project-1',
      title: 'Keep app healthy',
      rationale: 'test',
    })

    const backingFile = path.join(process.env.HERMES_HOME!, 'autopilot-suggestions.json')
    fs.writeFileSync(backingFile, '{not valid json', 'utf-8')

    expect(listAutopilotSuggestions()).toEqual([])
  })
})
