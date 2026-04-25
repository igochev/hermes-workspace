# Slice T/U Implementation Plan — Structured Review Decisions + Quality Gates

> **For Hermes:** Use `subagent-driven-development` to implement this after Slice N/O and before trusting broader Autopilot execution. This plan prevents false approvals.

**Goal:** Replace “review job succeeded means approval” with structured review parsing and quality gates.

**Architecture:** Add a review decision parser and gate evaluator. `syncWorkItemExecutionState` only resolves approvals when Planner output contains a valid structured decision and gate policy allows auto-resolution. Invalid/missing review output creates manual-review attention instead of false approval.

**Tech Stack:** TypeScript, Vitest, existing work-item execution/approval/store modules.

---

## 1. Current risk

Current behavior in `src/server/work-item-execution.ts`:

- review job `succeeded` → auto resolves approval as `approved`;
- review job `failed` → auto resolves as `changes_requested`.

That is unsafe because job success means the agent process completed, not that the code passed review.

---

## 2. New parser/gate module

Create:

```txt
src/server/work-item-review-decision.ts
src/server/work-item-review-decision.test.ts
```

Types:

```ts
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
```

Parser behavior:

1. Prefer JSON after `REVIEW_DECISION_JSON:`.
2. Support fenced JSON.
3. Require final `DECISION: APPROVED` or `DECISION: CHANGES_REQUESTED` line.
4. JSON decision and final line must agree.
5. `changes_requested` may fall back to decision-line only because it is a safe negative decision.
6. `approved` must have valid JSON; decision-line-only approval becomes manual review.

Quality gate types:

```ts
export type ReviewQualityGateStatus = 'pass' | 'fail' | 'manual_review'
export type ReviewQualityGateResult = {
  status: ReviewQualityGateStatus
  reasons: Array<string>
  missingEvidence: Array<string>
  autoResolvable: boolean
}
```

Gate rules:

- Any `changes_requested` is auto-resolvable back to build.
- Any blocker prevents approval.
- Any unmet criterion prevents approval.
- Low risk requires confidence medium+ and at least one evidence type.
- Medium risk requires high confidence, all criteria met, plan reviewed, and test evidence.
- High risk never auto-approves; manual CEO review required.
- Project `reviewAutoApproval` must permit the priority level for positive auto-approval.

---

## 3. Work-item fields

Modify `src/server/work-items-store.ts` and `src/lib/projects-api.ts`.

Add fields:

```ts
reviewDecision?: 'approved' | 'changes_requested' | 'manual_review'
reviewDecisionSummary?: string
reviewDecisionConfidence?: 'low' | 'medium' | 'high'
reviewDecisionSource?: 'json' | 'decision-line-fallback'
reviewParserError?: string
reviewQualityGateStatus?: 'pass' | 'fail' | 'manual_review'
reviewQualityGateReasons: Array<string>
reviewMissingEvidence: Array<string>
```

Normalization:

- missing arrays → `[]`;
- invalid enum → undefined;
- strings trimmed;
- PATCH route accepts these fields only if valid.

---

## 4. Prompt update

Modify `src/server/work-item-launch.ts` in `buildPlannerReviewGoal`.

Add required output section:

```md
STRUCTURED OUTPUT REQUIREMENT

You MUST include REVIEW_DECISION_JSON matching this schema:
{
  "decision": "approved | changes_requested",
  "confidence": "low | medium | high",
  "summary": "...",
  "criteria": [{ "text": "...", "met": true, "evidence": "...", "notes": "..." }],
  "evidence": {
    "branchName": "...",
    "prUrl": "...",
    "artifactPaths": ["..."],
    "testCommands": ["..."],
    "testResults": [{ "command": "...", "status": "passed|failed|not_run|unknown", "summary": "..." }],
    "filesReviewed": ["..."],
    "planReviewed": true
  },
  "blockers": [],
  "risks": []
}

You MUST end with exactly one final line:
DECISION: APPROVED
or
DECISION: CHANGES_REQUESTED

If you cannot verify every acceptance criterion with evidence, use CHANGES_REQUESTED.
Missing structured output will require manual CEO review and will not auto-approve.
```

---

## 5. Execution integration

Modify `src/server/work-item-execution.ts` review auto-resolution block.

New logic:

1. When work item is active/review and has `reviewJobId`, load review job.
2. Load review job runs via `getHermesJobRuns(reviewJobId)`.
3. Extract output text from latest run output/stringified output/job error.
4. Parse with `parsePlannerReviewDecision`.
5. Evaluate `evaluateReviewQualityGate({ workItem, project, parseResult })`.
6. Persist parser/gate fields to work item.
7. Resolve approval only if rules allow.

Cases:

| Review result | Action |
|---|---|
| valid `changes_requested` | resolve approval as `changes_requested`; return to build |
| valid `approved` + gate pass | resolve approval as `approved`; advance to deploy |
| valid `approved` + gate manual/fail | keep approval pending; set manual_review/gate reasons |
| missing/invalid output | keep approval pending; set parser error/manual_review |
| review job failed without parseable changes_requested | keep approval pending; set manual_review |

Do not append duplicate manual-review history notes every sync. Use helper to avoid repeating same note if latest history already contains same parser/gate message.

---

## 6. Approval policy update

Modify `src/server/work-item-approvals.ts`.

Current low-risk auto-approval should not bypass Planner review when:

- work item has `planFilePath`; or
- work item has `reviewJobId`; or
- review phase is part of Planner-as-Reviewer flow.

Rule:

- Planner-reviewed work stays pending until parser/gate resolves it.
- Legacy non-Planner low-risk review auto-approval may remain if tests define it.

---

## 7. UI evidence

Modify `src/screens/projects/work-item-detail-screen.tsx`.

Add helpers:

```ts
reviewQualityGateLabel(status?: string): string
getReviewEvidenceAttentionMessage(workItemLike): string | null
```

Show in Planner Review Status panel:

- Review Decision
- Review Confidence
- Review Quality Gate
- Review Summary
- Parser Error
- Missing Evidence
- Gate Reasons

Messages:

- `Manual review required — Planner review completed without valid structured decision.`
- `Manual review required — approved decision failed quality gates.`
- `Review gate passed — structured Planner approval verified.`
- `Changes requested — Planner review found blockers or unmet criteria.`

---

## 8. TDD tasks

### Task 1 — Parser tests/module

Files:

- `src/server/work-item-review-decision.test.ts`
- `src/server/work-item-review-decision.ts`

Tests:

- valid approved JSON + final line parses;
- valid changes_requested JSON + final line parses;
- fenced JSON parses;
- missing JSON approval rejected/manual;
- decision-line-only changes_requested accepted as fallback;
- mismatched JSON/final line rejected;
- invalid confidence rejected;
- missing summary rejected;
- blockers/risks/criteria arrays required.

Run:

```bash
pnpm vitest run src/server/work-item-review-decision.test.ts
```

### Task 2 — Gate tests

Same files.

Tests:

- low-risk medium-confidence approval with evidence passes;
- low-risk without evidence manual_review;
- medium-risk without test evidence manual_review;
- high-risk approval manual_review;
- changes_requested autoResolvable true;
- blockers fail approval;
- unmet criteria fail approval;
- disabled project policy prevents positive auto-resolve;
- priority exceeds policy prevents positive auto-resolve.

### Task 3 — Store/API fields

Files:

- `src/server/work-items-store.test.ts`
- `src/server/work-items-store.ts`
- `src/routes/api/work-items.$workItemId.ts`
- `src/lib/projects-api.ts`

Tests:

- default arrays are empty;
- valid review fields normalize and round-trip;
- invalid enums ignored/defaulted;
- PATCH partial update does not wipe criteria/labels.

### Task 4 — Prompt update

Files:

- `src/server/work-item-launch.test.ts`
- `src/server/work-item-launch.ts`

Tests:

- prompt contains `REVIEW_DECISION_JSON`;
- prompt contains schema keys;
- prompt requires final `DECISION:`;
- prompt says missing structured output will not auto-approve.

### Task 5 — Execution integration

Files:

- `src/server/work-item-execution.test.ts`
- `src/server/work-item-execution.ts`

Tests:

- succeeded review with valid approved + gate pass resolves approval;
- succeeded review with invalid output keeps approval pending/manual;
- succeeded review with changes_requested returns to build;
- failed review without parseable decision keeps pending/manual;
- approved but gate failed remains pending;
- high-risk approved remains pending/manual;
- manual-review history note dedupes.

### Task 6 — Approval policy

Files:

- `src/server/work-item-approvals.test.ts`
- `src/server/work-item-approvals.ts`

Tests:

- low-risk Planner-reviewed item remains pending on review request;
- legacy non-Planner low-risk auto-approval still behaves as intended;
- parser-driven resolution notes persist.

### Task 7 — UI helper tests and panel

Files:

- `src/screens/projects/work-item-detail-screen.test.ts`
- `src/screens/projects/work-item-detail-screen.tsx`

Tests:

- manual review decision label;
- quality gate label;
- parser error attention message;
- missing evidence copy;
- passed gate copy.

---

## 9. Full verification

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
pnpm vitest run src/server/work-item-review-decision.test.ts src/server/work-item-execution.test.ts src/server/work-item-approvals.test.ts src/server/work-item-launch.test.ts src/server/work-items-store.test.ts src/screens/projects/work-item-detail-screen.test.ts
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Manual flow:

1. Create work item with planFilePath/reviewJobId scenario.
2. Mock or induce review succeeded with valid approved JSON; confirm deploy advance.
3. Mock review succeeded with no JSON; confirm approval remains pending and UI says manual review required.
4. Mock `DECISION: CHANGES_REQUESTED`; confirm return to build.
5. Set high risk; valid approved output should still require manual CEO review.

---

## 10. Definition of Done

- Succeeded review job alone never auto-approves.
- Positive auto-approval requires valid structured decision and passing gates.
- Negative `changes_requested` remains safe to auto-resolve.
- Manual-review cases are visible in work-item detail.
- Tests cover parser, gates, execution integration, approval policy, prompt, UI.
