export type StructuredReviewDecision = 'approved' | 'changes_requested'
export type ReviewDecisionConfidence = 'low' | 'medium' | 'high'

export type ReviewCriterionFinding = {
  text: string
  met: boolean
  evidence?: string
  notes?: string
}

export type ReviewEvidence = {
  branchName?: string
  prUrl?: string
  artifactPaths?: Array<string>
  testCommands?: Array<string>
  testResults?: Array<{ command: string; status: 'passed' | 'failed' | 'not_run' | 'unknown'; summary?: string }>
  filesReviewed?: Array<string>
  planReviewed?: boolean
}

export type ParsedPlannerReviewDecision = {
  decision: StructuredReviewDecision
  confidence: ReviewDecisionConfidence
  summary: string
  criteria: Array<ReviewCriterionFinding>
  evidence: ReviewEvidence
  blockers: Array<string>
  risks: Array<string>
  rawDecisionLine?: string
}

export type ReviewDecisionParseResult =
  | { ok: true; parsed: ParsedPlannerReviewDecision; source: 'json' | 'decision-line-fallback'; warnings: Array<string> }
  | { ok: false; error: string; source: 'missing' | 'invalid-json' | 'invalid-schema' | 'ambiguous'; warnings: Array<string> }

export type ReviewQualityGateStatus = 'pass' | 'fail' | 'manual_review'

export type ReviewQualityGateResult = {
  status: ReviewQualityGateStatus
  reasons: Array<string>
  missingEvidence: Array<string>
  autoResolvable: boolean
}

const VALID_CONFIDENCE = new Set<string>(['low', 'medium', 'high'])

function isUnsuccessfulResult(
  r: ReviewDecisionParseResult,
): r is { ok: false; error: string; source: 'missing' | 'invalid-json' | 'invalid-schema' | 'ambiguous'; warnings: Array<string> } {
  return !r.ok
}

function readOptionalString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function readOptionalBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function asStringArray(v: unknown): Array<string> {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function asCriterionArray(v: unknown): Array<ReviewCriterionFinding> {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => isRecord(x))
    .map((item) => ({
      text: readOptionalString(item.text),
      met: item.met === true,
      evidence: readOptionalString(item.evidence) || undefined,
      notes: readOptionalString(item.notes) || undefined,
    }))
    .filter((c) => c.text.length > 0)
}

function asTestResultArray(
  v: unknown,
): Array<{ command: string; status: 'passed' | 'failed' | 'not_run' | 'unknown'; summary?: string }> {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => isRecord(x))
    .map((item) => ({
      command: readOptionalString(item.command),
      status: ['passed', 'failed', 'not_run', 'unknown'].includes(readOptionalString(item.status))
        ? (readOptionalString(item.status) as 'passed' | 'failed' | 'not_run' | 'unknown')
        : 'unknown',
      summary: readOptionalString(item.summary) || undefined,
    }))
    .filter((t) => t.command.length > 0)
}

function extractDecisionLine(text: string): string | null {
  const match = text.match(/^\s*DECISION:\s*(\S+)/im)
  return match ? match[1]?.trim().toUpperCase() ?? null : null
}

function extractJsonBlock(text: string): string | null {
  // Support fenced blocks (must check first — the fence consumes the JSON)
  const fencedRegex = /REVIEW_DECISION_JSON:\s*```(?:json)?\s*\n?([\s\S]*?)```/im
  const fencedMatch = text.match(fencedRegex)
  if (fencedMatch) return fencedMatch[1]

  // Use brace-depth matching after REVIEW_DECISION_JSON: marker
  const braceStartIndex = text.indexOf('REVIEW_DECISION_JSON:')
  if (braceStartIndex !== -1) {
    const afterColon = text.indexOf('{', braceStartIndex)
    if (afterColon !== -1) {
      let depth = 0
      let start = afterColon
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++
        else if (text[i] === '}') {
          depth--
          if (depth === 0) {
            return text.slice(start, i + 1)
          }
        }
      }
    }
  }

  return null
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function validateStructuredDecision(data: Record<string, unknown>): ParsedPlannerReviewDecision | string {
  const decision = readOptionalString(data.decision)
  if (decision !== 'approved' && decision !== 'changes_requested') {
    return `invalid decision: "${decision}"`
  }

  const confidence = readOptionalString(data.confidence)
  if (!VALID_CONFIDENCE.has(confidence)) {
    return `invalid confidence: "${confidence}"`
  }

  const summary = readOptionalString(data.summary)
  if (!summary) {
    return 'invalid or missing summary'
  }

  const criteria = asCriterionArray(data.criteria)
  const blockers = asStringArray(data.blockers)
  const risks = asStringArray(data.risks)

  // Require arrays to exist in payload (even if empty)
  if (!Array.isArray(data.criteria)) return 'missing criteria array'
  if (!Array.isArray(data.blockers)) return 'missing blockers array'
  if (!Array.isArray(data.risks)) return 'missing risks array'

  const evidenceRaw = isRecord(data.evidence) ? data.evidence : {}
  const evidence: ReviewEvidence = {
    branchName: readOptionalString(evidenceRaw.branchName) || undefined,
    prUrl: readOptionalString(evidenceRaw.prUrl) || undefined,
    artifactPaths: asStringArray(evidenceRaw.artifactPaths),
    testCommands: asStringArray(evidenceRaw.testCommands),
    testResults: asTestResultArray(evidenceRaw.testResults),
    filesReviewed: asStringArray(evidenceRaw.filesReviewed),
    planReviewed: readOptionalBoolean(evidenceRaw.planReviewed),
  }

  return {
    decision: decision as StructuredReviewDecision,
    confidence: confidence as ReviewDecisionConfidence,
    summary,
    criteria,
    evidence,
    blockers,
    risks,
  }
}

export function parsePlannerReviewDecision(outputText: string): ReviewDecisionParseResult {
  const text = outputText.trim()
  if (!text) {
    return { ok: false, error: 'Empty output — no review content provided.', source: 'missing', warnings: [] }
  }

  const decisionLine = extractDecisionLine(text)
  const jsonBlock = extractJsonBlock(text)
  const warnings: Array<string> = []

  if (!jsonBlock && !decisionLine) {
    return { ok: false, error: 'No REVIEW_DECISION_JSON or DECISION line found in output.', source: 'missing', warnings: [] }
  }

  if (!jsonBlock) {
    // Decision-line only
    if (decisionLine === 'CHANGES_REQUESTED') {
      return {
        ok: true,
        source: 'decision-line-fallback',
        parsed: {
          decision: 'changes_requested',
          confidence: 'low',
          summary: 'Decision line only — structured output missing.',
          criteria: [],
          evidence: {},
          blockers: [],
          risks: [],
          rawDecisionLine: decisionLine,
        },
        warnings: [],
      }
    }

    // APPROVED requires structured JSON
    return {
      ok: false,
      error: 'Structured REVIEW_DECISION_JSON is required for APPROVED but was not found in output.',
      source: 'missing',
      warnings: [],
    }
  }

  const parsedJson = tryParseJson(jsonBlock)
  if (!parsedJson) {
    return { ok: false, error: 'Found REVIEW_DECISION_JSON marker but content is not valid JSON.', source: 'invalid-json', warnings }
  }

  const validated = validateStructuredDecision(parsedJson)
  if (typeof validated === 'string') {
    return { ok: false, error: validated, source: 'invalid-schema', warnings }
  }

  // Check decision line agreement
  if (decisionLine) {
    const normalisedLine = decisionLine === 'APPROVED' ? 'approved' : decisionLine === 'CHANGES_REQUESTED' ? 'changes_requested' : null
    if (normalisedLine && normalisedLine !== validated.decision) {
      return {
        ok: false,
        error: `JSON decision ("${validated.decision}") does not match final DECISION line ("${decisionLine}")`,
        source: 'ambiguous',
        warnings: [],
      }
    }
  }

  return {
    ok: true,
    source: 'json',
    parsed: validated,
    warnings,
  }
}

export function evaluateReviewQualityGate(params: {
  workItem: { riskLevel?: string; priority?: string }
  project: { reviewAutoApproval?: { enabled?: boolean; maxPriority?: string } }
  parseResult: ReviewDecisionParseResult
}): ReviewQualityGateResult {
  const { workItem, project, parseResult } = params

  // changes_requested is always auto-resolvable
  if (parseResult.ok && parseResult.parsed.decision === 'changes_requested') {
    return {
      status: 'fail',
      reasons: ['Review decision: changes_requested — returning to build.'],
      missingEvidence: [],
      autoResolvable: true,
    }
  }

  if (isUnsuccessfulResult(parseResult)) {
    return {
      status: 'manual_review',
      reasons: [`Parse error: ${parseResult.error}`],
      missingEvidence: [],
      autoResolvable: false,
    }
  }

  const parsed = parseResult.parsed
  const reasons: Array<string> = []
  const missingEvidence: Array<string> = []

  // Blockers prevent approval
  if (parsed.blockers.length > 0) {
    return {
      status: 'fail',
      reasons: [`Review blocked by ${parsed.blockers.length} blocker(s): ${parsed.blockers.join('; ')}`],
      missingEvidence: [],
      autoResolvable: false,
    }
  }

  // Unmet criteria prevent approval
  const unmetCriteria = parsed.criteria.filter((c) => !c.met)
  if (unmetCriteria.length > 0) {
    return {
      status: 'fail',
      reasons: [`${unmetCriteria.length} unmet criteria: ${unmetCriteria.map((c) => c.text).join(', ')}`],
      missingEvidence: [],
      autoResolvable: false,
    }
  }

  const riskLevel = workItem.riskLevel ?? 'medium'
  const priority = workItem.priority ?? 'medium'
  const policy = project.reviewAutoApproval ?? { enabled: false, maxPriority: 'low' }

  // Risk-based gate logic
  const missing: Array<string> = []

  if (riskLevel === 'low') {
    // Low-risk: require confidence medium+ and at least one evidence type
    if (parsed.confidence === 'low') missing.push('confidence level must be medium or higher for auto-approval')
    const hasEvidence = Object.values(parsed.evidence).some(
      (v) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && v !== false,
    )
    if (!hasEvidence) missing.push('at least one evidence field must be populated')
  } else if (riskLevel === 'medium') {
    // Medium-risk: require high confidence, all criteria met, plan reviewed, test evidence
    if (parsed.confidence !== 'high') missing.push('confidence must be high for medium-risk approval')
    if (!parsed.evidence.planReviewed) missing.push('plan must be marked as reviewed')
    if (!parsed.evidence.testCommands || parsed.evidence.testCommands.length === 0) missing.push('test evidence required')
    if (!parsed.evidence.testResults || parsed.evidence.testResults.length === 0) missing.push('test results required')
  } else if (riskLevel === 'high') {
    // High-risk: never auto-approves
    return {
      status: 'manual_review',
      reasons: ['High-risk work items require manual CEO review.'],
      missingEvidence: [],
      autoResolvable: false,
    }
  }

  // Project policy check
  const priorityRank = (p: string): number => (p === 'high' ? 3 : p === 'medium' ? 2 : 1)

  const policyEnabled = policy.enabled !== false
  const policyMaxPriorityRank = priorityRank(policy.maxPriority ?? 'low')

  if (policyEnabled && priority) {
    if (priorityRank(priority) > policyMaxPriorityRank) {
      missing.push(`priority "${priority}" exceeds policy maxPriority "${policy.maxPriority ?? 'low'}"`)
    }
  } else if (!policyEnabled) {
    missing.push('project review auto-approval policy is disabled')
  }

  if (missing.length > 0) {
    return {
      status: 'manual_review',
      reasons: missing,
      missingEvidence: missing,
      autoResolvable: false,
    }
  }

  return {
    status: 'pass',
    reasons: ['All quality gates passed.'],
    missingEvidence: [],
    autoResolvable: true,
  }
}
