import { describe, expect, it } from 'vitest'

import { recommendAutopilotDelegationAction } from './autopilot-delegation-policy'

describe('recommendAutopilotDelegationAction', () => {
  it('recommends Convert + Plan for low-risk high-evidence suggestions', () => {
    const recommendation = recommendAutopilotDelegationAction(
      {
        title: 'Add flaky test quarantine lane',
        rationale: 'Flakes delay release confidence',
        evidence: ['Vitest retry rate rose to 18%', 'CI reruns increased for test shard 3'],
        impact: 'high',
        risk: 'low',
        effort: 'small',
        source: 'failing-tests-scout',
      },
      { buildAfterAcceptedPlan: false },
    )

    expect(recommendation).toMatchObject({
      recommendedAction: 'work-item-and-plan',
      confidence: 'high',
      evidenceQuality: 'strong',
      riskWarning: undefined,
    })
    expect(recommendation.operatorCopy).toContain('Convert + Plan')
    expect(recommendation.operatorCopy).toContain('Planner')
  })

  it('recommends manual review for high-risk suggestions even with evidence', () => {
    const recommendation = recommendAutopilotDelegationAction(
      {
        title: 'Replace deployment authentication flow',
        rationale: 'Current deployment token flow is stale',
        evidence: ['Token rotation failed twice', 'Deployment runbook references old API'],
        impact: 'high',
        risk: 'high',
        effort: 'large',
        source: 'architecture-debt-scout',
      },
      { buildAfterAcceptedPlan: true },
    )

    expect(recommendation).toMatchObject({
      recommendedAction: 'manual-review',
      confidence: 'medium',
      evidenceQuality: 'strong',
    })
    expect(recommendation.riskWarning).toContain('High-risk')
    expect(recommendation.operatorCopy).toContain('manual review')
  })

  it('uses policy-gated build queue only for strong low-risk suggestions when enabled', () => {
    const recommendation = recommendAutopilotDelegationAction(
      {
        title: 'Refresh stale docs link checker',
        rationale: 'Docs have stale API links',
        evidence: ['Link checker reported 12 stale links', 'API changelog removed v1 endpoints'],
        impact: 'medium',
        risk: 'low',
        effort: 'small',
        source: 'stale-docs-scout',
      },
      { buildAfterAcceptedPlan: true },
    )

    expect(recommendation.recommendedAction).toBe('work-item-plan-build-queued')
    expect(recommendation.operatorCopy).toContain('Build queued after accepted plan')
    expect(recommendation.operatorCopy).toContain('No code is launched')
  })
})
