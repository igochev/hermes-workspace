import { describe, expect, it } from 'vitest'

import {
  AUTOPILOT_SUGGESTIONS_CLICKABILITY_AUDIT,
  AUTOPILOT_SUGGESTIONS_EMPTY_COPY,
  AUTOPILOT_SUGGESTIONS_FILTER_OPTIONS,
  AUTOPILOT_SUGGESTIONS_QUERY_KEY,
  AUTOPILOT_SUGGESTION_ACTION_LABELS,
  AUTOPILOT_SUGGESTION_CONVERT_BUTTON_LABEL,
  AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUILD_BUTTON_LABEL,
  AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUTTON_LABEL,
  AUTOPILOT_SUGGESTION_DELEGATION_SAFETY_COPY,
  applyAutopilotSuggestionFilters,
} from './autopilot-suggestions-screen'
import {
  AUTOPILOT_SUGGESTION_EFFORT_LABELS,
  AUTOPILOT_SUGGESTION_IMPACT_LABELS,
  AUTOPILOT_SUGGESTION_RISK_LABELS,
  AUTOPILOT_SUGGESTION_SOURCE_LABELS,
  AUTOPILOT_SUGGESTION_STATUS_LABELS,
} from '@/lib/autopilot-suggestions-api'

describe('autopilot suggestions screen constants', () => {
  it('uses a dedicated query namespace', () => {
    expect(AUTOPILOT_SUGGESTIONS_QUERY_KEY).toEqual(['mission-control', 'autopilot-suggestions'])
  })

  it('defines workflow filter options in expected status order', () => {
    expect(AUTOPILOT_SUGGESTIONS_FILTER_OPTIONS).toEqual([
      { value: 'new', label: 'New' },
      { value: 'accepted', label: 'Accepted' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'converted', label: 'Converted' },
      { value: 'archived', label: 'Archived' },
    ])
  })

  it('defines action and empty-state copy for operator inbox flow', () => {
    expect(AUTOPILOT_SUGGESTIONS_EMPTY_COPY).toContain('No autopilot suggestions yet')
    expect(AUTOPILOT_SUGGESTION_CONVERT_BUTTON_LABEL).toBe('Convert to Work Item')
    expect(AUTOPILOT_SUGGESTION_ACTION_LABELS).toEqual({
      accept: 'Accept',
      archive: 'Archive',
      reject: 'Reject',
    })
  })

  it('exports status and classification labels for cards', () => {
    expect(AUTOPILOT_SUGGESTION_STATUS_LABELS.new).toBe('New')
    expect(AUTOPILOT_SUGGESTION_IMPACT_LABELS.high).toBe('High impact')
    expect(AUTOPILOT_SUGGESTION_RISK_LABELS.low).toBe('Low risk')
    expect(AUTOPILOT_SUGGESTION_EFFORT_LABELS.large).toBe('Large effort')
    expect(AUTOPILOT_SUGGESTION_SOURCE_LABELS['failing-tests-scout']).toBe('Failing tests scout')
  })

  it('filters suggestions by status, project, source, and impact or risk', () => {
    const baseSuggestion = {
      id: 'suggestion-1',
      projectId: 'project-a',
      title: 'Improve tests',
      rationale: 'CI evidence',
      evidence: ['CI retry rate'],
      suggestedAcceptanceCriteria: ['Add guardrails'],
      impact: 'high' as const,
      risk: 'low' as const,
      effort: 'small' as const,
      labels: ['ci'],
      source: 'failing-tests-scout' as const,
      status: 'new' as const,
      createdAt: '2026-04-26T00:00:00.000Z',
      updatedAt: '2026-04-26T00:00:00.000Z',
    }
    const suggestions = [
      baseSuggestion,
      {
        ...baseSuggestion,
        id: 'suggestion-2',
        projectId: 'project-b',
        source: 'stale-docs-scout' as const,
        impact: 'low' as const,
        risk: 'high' as const,
        status: 'accepted' as const,
      },
    ]

    expect(applyAutopilotSuggestionFilters(suggestions, { status: 'new' }).map((item) => item.id)).toEqual([
      'suggestion-1',
    ])
    expect(applyAutopilotSuggestionFilters(suggestions, { projectId: 'project-b' }).map((item) => item.id)).toEqual([
      'suggestion-2',
    ])
    expect(
      applyAutopilotSuggestionFilters(suggestions, { source: 'failing-tests-scout', impact: 'high', risk: 'low' }).map(
        (item) => item.id,
      ),
    ).toEqual(['suggestion-1'])
  })

  it('defines delegation action labels and safety copy for policy-gated conversion', () => {
    expect(AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUTTON_LABEL).toBe('Convert + Plan')
    expect(AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUILD_BUTTON_LABEL).toBe('Convert + Plan + Build Queued')
    expect(AUTOPILOT_SUGGESTION_DELEGATION_SAFETY_COPY).toContain(
      'No code is launched until policy/operator conditions are met.',
    )
  })

  it('documents suggestion inbox clickability across filters and card actions', () => {
    expect(AUTOPILOT_SUGGESTIONS_CLICKABILITY_AUDIT).toEqual([
      { surface: 'refresh', label: 'Refresh', kind: 'button', target: 'invalidate-autopilot-suggestions' },
      { surface: 'filters', label: 'Status/Project/Source/Impact/Risk filters', kind: 'button', target: 'setFilters' },
      { surface: 'accept', label: 'Accept', kind: 'button', target: 'acceptAutopilotSuggestion' },
      { surface: 'reject', label: 'Reject', kind: 'button', target: 'rejectAutopilotSuggestion' },
      { surface: 'archive', label: 'Archive', kind: 'button', target: 'archiveAutopilotSuggestion' },
      { surface: 'convert', label: 'Convert to Work Item', kind: 'button', target: 'convertAutopilotSuggestion:work-item' },
      { surface: 'convert-plan', label: 'Convert + Plan', kind: 'button', target: 'convertAutopilotSuggestion:work-item-and-plan' },
      { surface: 'convert-plan-build', label: 'Convert + Plan + Build Queued', kind: 'button', target: 'convertAutopilotSuggestion:work-item-plan-build-queued' },
      { surface: 'open-project', label: 'Open Project', kind: 'link', target: '/projects/:projectId' },
    ])
  })
})
