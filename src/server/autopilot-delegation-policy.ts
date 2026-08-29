import type {
  AutopilotSuggestionEffort,
  AutopilotSuggestionImpact,
  AutopilotSuggestionRisk,
  AutopilotSuggestionSource,
} from './autopilot-suggestions-store'

export type AutopilotDelegationRecommendedAction =
  | 'work-item'
  | 'work-item-and-plan'
  | 'work-item-plan-build-queued'
  | 'manual-review'

export type AutopilotDelegationConfidence = 'low' | 'medium' | 'high'
export type AutopilotEvidenceQuality = 'weak' | 'moderate' | 'strong'

export type AutopilotDelegationSuggestion = {
  title: string
  rationale: string
  evidence: Array<string>
  impact: AutopilotSuggestionImpact
  risk: AutopilotSuggestionRisk
  effort: AutopilotSuggestionEffort
  source: AutopilotSuggestionSource
}

export type AutopilotDelegationProjectPolicy = {
  buildAfterAcceptedPlan?: boolean
}

export type AutopilotDelegationRecommendation = {
  recommendedAction: AutopilotDelegationRecommendedAction
  confidence: AutopilotDelegationConfidence
  evidenceQuality: AutopilotEvidenceQuality
  riskWarning?: string
  operatorCopy: string
}

function scoreEvidence(evidence: Array<string>): AutopilotEvidenceQuality {
  const count = evidence.filter((item) => item.trim().length > 0).length
  if (count >= 2) return 'strong'
  if (count === 1) return 'moderate'
  return 'weak'
}

function confidenceFor(params: {
  evidenceQuality: AutopilotEvidenceQuality
  risk: AutopilotSuggestionRisk
  effort: AutopilotSuggestionEffort
}): AutopilotDelegationConfidence {
  if (params.risk === 'high') return params.evidenceQuality === 'weak' ? 'low' : 'medium'
  if (params.evidenceQuality === 'strong' && params.effort !== 'large') return 'high'
  if (params.evidenceQuality === 'weak' || params.effort === 'large') return 'low'
  return 'medium'
}

export function recommendAutopilotDelegationAction(
  suggestion: AutopilotDelegationSuggestion,
  projectPolicy: AutopilotDelegationProjectPolicy = {},
): AutopilotDelegationRecommendation {
  const evidenceQuality = scoreEvidence(suggestion.evidence)
  const confidence = confidenceFor({
    evidenceQuality,
    risk: suggestion.risk,
    effort: suggestion.effort,
  })

  if (suggestion.risk === 'high') {
    return {
      recommendedAction: 'manual-review',
      confidence,
      evidenceQuality,
      riskWarning: 'High-risk Autopilot suggestions require operator manual review before planning.',
      operatorCopy:
        'manual review recommended before conversion. Autopilot will not request planning or launch code until an operator confirms the policy boundary.',
    }
  }

  if (evidenceQuality === 'weak') {
    return {
      recommendedAction: 'work-item',
      confidence,
      evidenceQuality,
      riskWarning: 'Evidence is weak; convert first and gather more context before requesting Planner work.',
      operatorCopy:
        'Convert to Work Item first. Ask Planner only after evidence/rationale are strengthened.',
    }
  }

  if (projectPolicy.buildAfterAcceptedPlan && suggestion.risk === 'low' && evidenceQuality === 'strong') {
    return {
      recommendedAction: 'work-item-plan-build-queued',
      confidence,
      evidenceQuality,
      operatorCopy:
        'Convert + Plan with Build queued after accepted plan. No code is launched until Planner output is accepted and operator/policy conditions are met.',
    }
  }

  return {
    recommendedAction: 'work-item-and-plan',
    confidence,
    evidenceQuality,
    riskWarning: undefined,
    operatorCopy:
      'Convert + Plan is recommended. Planner should enrich scope and acceptance criteria before any Builder work is eligible.',
  }
}
