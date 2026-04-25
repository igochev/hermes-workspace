import { describe, expect, it } from 'vitest'
import {
  evaluateReviewQualityGate,
  parsePlannerReviewDecision,
  type ParsedPlannerReviewDecision,
  type ReviewDecisionParseResult,
} from './work-item-review-decision'

function isUnsuccessful(
  r: ReviewDecisionParseResult,
): r is { ok: false; error: string; source: 'missing' | 'invalid-json' | 'invalid-schema' | 'ambiguous'; warnings: Array<string> } {
  return !r.ok
}

function isSuccessful(
  r: ReviewDecisionParseResult,
): r is { ok: true; parsed: ParsedPlannerReviewDecision; source: 'json' | 'decision-line-fallback'; warnings: Array<string> } {
  return r.ok
}

function buildApprovedJson(overrides: Partial<ParsedPlannerReviewDecision> = {}): Record<string, unknown> {
  return {
    decision: 'approved',
    confidence: 'high',
    summary: 'All criteria validated with evidence.',
    criteria: [
      {
        text: 'Feature ships with regression tests',
        met: true,
        evidence: 'pnpm vitest run src/server/work-item-execution.test.ts',
      },
    ],
    evidence: {
      testCommands: ['pnpm vitest run src/server/work-item-execution.test.ts'],
      testResults: [
        {
          command: 'pnpm vitest run src/server/work-item-execution.test.ts',
          status: 'passed',
          summary: '28/28 passing',
        },
      ],
      filesReviewed: ['src/server/work-item-execution.ts'],
      planReviewed: true,
    },
    blockers: [],
    risks: [],
    ...overrides,
  }
}

describe('parsePlannerReviewDecision', () => {
  it('parses approved decision with REVIEW_DECISION_JSON payload and final decision line', () => {
    const output = [
      'SUMMARY',
      'Looks good.',
      '',
      `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson())}`,
      '',
      'DECISION: APPROVED',
    ].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('json')
    expect(result.parsed.decision).toBe('approved')
    expect(result.parsed.summary).toContain('criteria validated')
    expect(result.parsed.criteria).toHaveLength(1)
  })

  it('parses changes_requested decision with JSON payload and final line', () => {
    const payload = buildApprovedJson({
      decision: 'changes_requested',
      confidence: 'medium',
      summary: 'Criteria not fully met.',
      criteria: [{ text: 'Feature ships with regression tests', met: false, notes: 'missing coverage' }],
      blockers: ['Missing regression coverage for edge case.'],
    })
    const output = [
      'REVIEW_DECISION_JSON:',
      JSON.stringify(payload, null, 2),
      '',
      'DECISION: CHANGES_REQUESTED',
    ].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.parsed.decision).toBe('changes_requested')
    expect(result.parsed.blockers).toEqual(['Missing regression coverage for edge case.'])
  })

  it('parses fenced REVIEW_DECISION_JSON blocks', () => {
    const output = [
      'REVIEW_DECISION_JSON:',
      '```json',
      JSON.stringify(buildApprovedJson(), null, 2),
      '```',
      '',
      'DECISION: APPROVED',
    ].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.parsed.decision).toBe('approved')
  })

  it('rejects approval with decision-line-only output and no structured JSON', () => {
    const output = ['SUMMARY', 'Looks good.', 'DECISION: APPROVED'].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(false)
    if (isSuccessful(result)) return
    expect(result.source).toBe('missing')
    expect(result.error).toContain('Structured REVIEW_DECISION_JSON is required for APPROVED')
  })

  it('accepts decision-line-only changes_requested as safe fallback', () => {
    const output = ['SUMMARY', 'Missing tests.', 'DECISION: CHANGES_REQUESTED'].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toBe('decision-line-fallback')
    expect(result.parsed.decision).toBe('changes_requested')
  })

  it('rejects mismatched JSON and final decision line', () => {
    const output = [
      `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson({ decision: 'approved' }))}`,
      'DECISION: CHANGES_REQUESTED',
    ].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.source).toBe('ambiguous')
  })

  it('rejects invalid confidence values', () => {
    const output = [
      `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson({ confidence: 'certain' as never }))}`,
      'DECISION: APPROVED',
    ].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(false)
    if (isSuccessful(result)) return
    expect(result.source).toBe('invalid-schema')
    expect(result.error).toContain('confidence')
  })

  it('rejects missing summary values', () => {
    const output = [
      `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson({ summary: '' }))}`,
      'DECISION: APPROVED',
    ].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(false)
    if (isSuccessful(result)) return
    expect(result.source).toBe('invalid-schema')
    expect(result.error).toContain('summary')
  })

  it('requires blockers, risks, and criteria arrays in structured output', () => {
    const payload = buildApprovedJson()
    delete (payload as { blockers?: unknown }).blockers
    delete (payload as { risks?: unknown }).risks
    delete (payload as { criteria?: unknown }).criteria

    const output = [
      `REVIEW_DECISION_JSON: ${JSON.stringify(payload)}`,
      'DECISION: APPROVED',
    ].join('\n')

    const result = parsePlannerReviewDecision(output)

    expect(result.ok).toBe(false)
    if (isSuccessful(result)) return
    expect(result.source).toBe('invalid-schema')
    expect(result.error).toContain('criteria')
  })
})

describe('evaluateReviewQualityGate', () => {
  it('passes low-risk approval with medium confidence and at least one evidence type', () => {
    const parseResult = parsePlannerReviewDecision(
      [
        `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson({ confidence: 'medium' }))}`,
        'DECISION: APPROVED',
      ].join('\n'),
    )

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'low', priority: 'high' } as never,
      project: { reviewAutoApproval: { enabled: true, maxPriority: 'high' } } as never,
      parseResult,
    })

    expect(result.status).toBe('pass')
    expect(result.autoResolvable).toBe(true)
  })

  it('marks low-risk approval without evidence as manual_review', () => {
    const parseResult = parsePlannerReviewDecision(
      [
        `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson({
          evidence: { planReviewed: false },
        }))}`,
        'DECISION: APPROVED',
      ].join('\n'),
    )

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'low', priority: 'low' } as never,
      project: { reviewAutoApproval: { enabled: true, maxPriority: 'high' } } as never,
      parseResult,
    })

    expect(result.status).toBe('manual_review')
    expect(result.missingEvidence.length).toBeGreaterThan(0)
    expect(result.autoResolvable).toBe(false)
  })

  it('marks medium-risk approval without test evidence as manual_review', () => {
    const parseResult = parsePlannerReviewDecision(
      [
        `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson({
          evidence: { filesReviewed: ['src/server/work-item-execution.ts'], planReviewed: true },
        }))}`,
        'DECISION: APPROVED',
      ].join('\n'),
    )

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'medium', priority: 'medium' } as never,
      project: { reviewAutoApproval: { enabled: true, maxPriority: 'high' } } as never,
      parseResult,
    })

    expect(result.status).toBe('manual_review')
    expect(result.reasons.join(' ')).toContain('test evidence')
    expect(result.autoResolvable).toBe(false)
  })

  it('marks high-risk approved decision as manual_review', () => {
    const parseResult = parsePlannerReviewDecision(
      [
        `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson())}`,
        'DECISION: APPROVED',
      ].join('\n'),
    )

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'high', priority: 'low' } as never,
      project: { reviewAutoApproval: { enabled: true, maxPriority: 'high' } } as never,
      parseResult,
    })

    expect(result.status).toBe('manual_review')
    expect(result.reasons.join(' ')).toContain('High-risk')
    expect(result.autoResolvable).toBe(false)
  })

  it('auto-resolves changes_requested decisions', () => {
    const parseResult = parsePlannerReviewDecision('DECISION: CHANGES_REQUESTED')

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'low', priority: 'low' } as never,
      project: { reviewAutoApproval: { enabled: false, maxPriority: 'low' } } as never,
      parseResult,
    })

    expect(result.status).toBe('fail')
    expect(result.autoResolvable).toBe(true)
    expect(result.reasons.join(' ')).toContain('changes_requested')
  })

  it('fails approved decision with blockers', () => {
    const parseResult = parsePlannerReviewDecision(
      [
        `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson({ blockers: ['Build output missing migration plan'] }))}`,
        'DECISION: APPROVED',
      ].join('\n'),
    )

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'low', priority: 'low' } as never,
      project: { reviewAutoApproval: { enabled: true, maxPriority: 'high' } } as never,
      parseResult,
    })

    expect(result.status).toBe('fail')
    expect(result.reasons.join(' ')).toContain('blocker')
    expect(result.autoResolvable).toBe(false)
  })

  it('fails approved decision with unmet criteria', () => {
    const parseResult = parsePlannerReviewDecision(
      [
        `REVIEW_DECISION_JSON: ${JSON.stringify(
          buildApprovedJson({
            criteria: [{ text: 'Feature ships with regression tests', met: false }],
          }),
        )}`,
        'DECISION: APPROVED',
      ].join('\n'),
    )

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'low', priority: 'low' } as never,
      project: { reviewAutoApproval: { enabled: true, maxPriority: 'high' } } as never,
      parseResult,
    })

    expect(result.status).toBe('fail')
    expect(result.reasons.join(' ')).toContain('unmet criteria')
  })

  it('prevents positive auto-resolve when project policy disabled', () => {
    const parseResult = parsePlannerReviewDecision(
      [
        `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson())}`,
        'DECISION: APPROVED',
      ].join('\n'),
    )

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'low', priority: 'low' } as never,
      project: { reviewAutoApproval: { enabled: false, maxPriority: 'high' } } as never,
      parseResult,
    })

    expect(result.status).toBe('manual_review')
    expect(result.reasons.join(' ')).toContain('policy')
    expect(result.autoResolvable).toBe(false)
  })

  it('prevents positive auto-resolve when priority exceeds policy maxPriority', () => {
    const parseResult = parsePlannerReviewDecision(
      [
        `REVIEW_DECISION_JSON: ${JSON.stringify(buildApprovedJson())}`,
        'DECISION: APPROVED',
      ].join('\n'),
    )

    const result = evaluateReviewQualityGate({
      workItem: { riskLevel: 'low', priority: 'high' } as never,
      project: { reviewAutoApproval: { enabled: true, maxPriority: 'medium' } } as never,
      parseResult,
    })

    expect(result.status).toBe('manual_review')
    expect(result.reasons.join(' ')).toContain('priority')
    expect(result.autoResolvable).toBe(false)
  })
})
