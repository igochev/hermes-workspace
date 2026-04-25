import { describe, expect, it } from 'vitest'

import { parsePlannerStructuredOutput } from './planner-output-schema'

const validPayload = {
  title: '  Add Planner Enrichment panel  ',
  description: '  Build an operator panel for planner drafts  ',
  priority: 'high',
  riskLevel: 'medium',
  labels: ['planner', 'planner', ' mission-control '],
  acceptanceCriteria: ['Criterion A', ' Criterion B ', 'Criterion A'],
  notes: ['Note 1', 'Note 1'],
  planFilePath: ' docs/plans/planner-draft.md ',
  openQuestions: ['Question 1', 'Question 1'],
  suggestedPhase: 'build',
}

describe('planner-output-schema', () => {
  it('parses raw json payloads', () => {
    const result = parsePlannerStructuredOutput(JSON.stringify(validPayload))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.output.title).toBe('Add Planner Enrichment panel')
    expect(result.output.description).toBe('Build an operator panel for planner drafts')
    expect(result.warnings).toEqual([])
  })

  it('parses fenced markdown json blocks', () => {
    const result = parsePlannerStructuredOutput([
      '```json',
      JSON.stringify(validPayload, null, 2),
      '```',
    ].join('\n'))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.output.planFilePath).toBe('docs/plans/planner-draft.md')
  })

  it('trims and dedupes arrays', () => {
    const result = parsePlannerStructuredOutput(JSON.stringify(validPayload))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.output.labels).toEqual(['planner', 'mission-control'])
    expect(result.output.acceptanceCriteria).toEqual(['Criterion A', 'Criterion B'])
    expect(result.output.notes).toEqual(['Note 1'])
    expect(result.output.openQuestions).toEqual(['Question 1'])
  })

  it('rejects invalid json', () => {
    const result = parsePlannerStructuredOutput('{nope')

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('Invalid JSON')
  })

  it('rejects missing planFilePath', () => {
    const result = parsePlannerStructuredOutput(
      JSON.stringify({
        ...validPayload,
        planFilePath: '   ',
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('planFilePath')
  })

  it('rejects empty acceptanceCriteria', () => {
    const result = parsePlannerStructuredOutput(
      JSON.stringify({
        ...validPayload,
        acceptanceCriteria: [],
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('acceptanceCriteria')
  })

  it('rejects invalid enum values', () => {
    const result = parsePlannerStructuredOutput(
      JSON.stringify({
        ...validPayload,
        priority: 'urgent',
      }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('priority')
  })

  it('warns when prose surrounds json object', () => {
    const result = parsePlannerStructuredOutput([
      'Planner summary before output.',
      JSON.stringify(validPayload, null, 2),
      'Postscript text.',
    ].join('\n\n'))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.warnings.some((warning) => warning.includes('surrounding prose'))).toBe(true)
  })
})
