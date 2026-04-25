import { describe, expect, it } from 'vitest'

import {
  AUTOPILOT_SUGGESTION_ACTION_LABELS,
  AUTOPILOT_SUGGESTION_CONVERT_BUTTON_LABEL,
  AUTOPILOT_SUGGESTIONS_EMPTY_COPY,
  AUTOPILOT_SUGGESTIONS_FILTER_OPTIONS,
  AUTOPILOT_SUGGESTIONS_QUERY_KEY,
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
})
