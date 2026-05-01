# Hermes Workspace — R6 Release Supervisor Audit Gate Plan

> **For Builder:** Start only after reading `docs/handoff/current-slice-status.md` and the implementation index. This is the next roadmap task after R5 proved the real ABACUS work item can reach `done / deploy` through validated branch evidence and Merge-Healer.

## 1. CEO intent

R5 proved deterministic Merge-Healer can integrate a real product item when branch evidence is present. The updated roadmap’s next release-lane gap is the missing **Supervisor audit/veto gate** between Reviewer approval and Merge-Healer/deploy.

Target product flow:

```text
Planner prepares acceptance criteria
  → Builder implements on feature branch
  → Reviewer approves/requests changes
  → Supervisor audits release evidence and can veto
  → Merge-Healer integrates only when policy + evidence gates pass
  → evidence remains visible on the Work Item
```

This slice makes Supervisor/deploy safety explicit in code and UI without pretending a dedicated Supervisor runtime profile already exists.

## 2. Scope

Implement a first-class **release supervisor audit gate** for Work Items in deploy phase.

### In scope

1. Work Item model fields for release audit evidence, for example:
   - `releaseAuditState`: `not_required | pending | running | approved | vetoed | failed | manual_review`
   - `releaseAuditExecutionId` / `releaseAuditMissionId`
   - `releaseAuditProfile`
   - `releaseAuditDecision`
   - `releaseAuditSummary`
   - `releaseAuditReasons[]`
   - `releaseAuditMissingEvidence[]`
   - `releaseAuditObservedAt`
2. A testable gate helper used before Merge-Healer runs.
3. Policy behavior:
   - low-risk/project policy can allow deterministic/manual-system gate for now;
   - medium/high-risk or explicit policy should require `approved` release audit before Merge-Healer;
   - `vetoed`, `failed`, or missing required audit blocks Merge-Healer truthfully.
4. Optional launch seam for a Supervisor audit using immediate executions **only if a Supervisor profile is explicitly mapped/available**.
5. UI/operator evidence in the Work Item cockpit and/or deploy section:
   - show release audit status;
   - show whether Merge-Healer is waiting on audit, approved, vetoed, or manual/system-gated;
   - never hide this under raw execution IDs only.
6. API/sync behavior preserving PATCH partial-update safety and existing immediate execution semantics.
7. Final evidence report under `dogfood-output/release-supervisor-audit-gate-latest.md` plus a timestamped copy.

### Out of scope / non-negotiables

- Do **not** create new Hermes profiles, gateways, or profile directories.
- Do **not** map Deploy or Supervisor to `builder` as a convenience fallback.
- Do **not** enable always-on/retry/PR publishing/cleanup automation.
- Do **not** run another real ABACUS merge unless Main/CEO explicitly authorizes a new real product work item.
- Do **not** manually mark release audit or merge success in JSON; use APIs/helpers and preserve evidence.
- Do **not** regress R5 branch-evidence recovery or real `/executions` behavior.

## 3. Implementation seams to inspect first

- `src/server/work-items-store.ts`
- `src/server/work-item-orchestrator.ts`
- `src/server/work-item-merge-healer.ts`
- `src/server/work-item-execution.ts`
- `src/server/work-item-launch.ts`
- `src/server/work-item-review-decision.ts`
- `src/server/execution-runs-store.ts`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/server/work-item-run-timeline.ts`
- Existing tests around orchestrator, merge healer, execution sync, and work item detail UI.

## 4. Task plan

### Task 1 — RED tests for release-audit gate semantics

Add focused tests before implementation.

Required cases:

1. Approved Reviewer + deploy phase + policy requiring audit + no audit approval => orchestrator does **not** run Merge-Healer and records a truthful waiting/blocked reason.
2. Approved release audit => orchestrator may run Merge-Healer when existing branch/policy gates pass.
3. `vetoed` release audit => work item remains blocked/deploy with clear release-audit blocker; Merge-Healer is not launched.
4. Missing Supervisor profile must not silently fallback to Builder; behavior is manual/system gate or blocked based on policy.
5. Existing R5 happy path remains valid when audit is not required or manually/system approved by conservative policy.
6. Repeated reconcile is idempotent and does not duplicate audit/merge state.

Suggested focused command:

```bash
pnpm vitest run src/server/work-item-orchestrator.test.ts src/server/work-item-merge-healer.test.ts
```

### Task 2 — Add model/types and policy helper

Implement the smallest durable model extension and a helper such as `evaluateReleaseAuditGate(workItem, project)`.

The helper should return structured output, not just booleans:

```ts
type ReleaseAuditGateDecision =
  | { status: 'not_required'; reason: string }
  | { status: 'approved'; reason: string }
  | { status: 'waiting'; reason: string; missingEvidence: string[] }
  | { status: 'blocked'; reason: string; missingEvidence: string[] }
```

Preserve backward compatibility with existing Work Items that lack these fields.

### Task 3 — Wire orchestrator/Merge-Healer gate

Before `run_merge_healer`, call the release-audit gate helper.

- If gate is `approved` or `not_required`, existing Merge-Healer behavior continues.
- If gate is `waiting` or `blocked`, return a reconcile event with a clear action/status and mutate only intended Work Item fields.
- Do not clobber branch evidence, review evidence, acceptance criteria, or merge evidence.

### Task 4 — Optional Supervisor audit launch seam

If current code already has profile discovery/mapping support for Supervisor, add a narrow launch seam. If not, implement only the explicit state/gate/UI and document Supervisor profile launch as future follow-up.

Required safety:

- no `supervisor -> builder` fallback;
- no profile directory creation;
- no hidden automatic launch unless policy and profile mapping are explicit;
- structured parse or manual-review fallback for audit output.

### Task 5 — UI evidence and operator action copy

Update Work Item detail/cockpit so deploy-phase items show release-audit truth before/near Merge-Healer evidence.

The UI must make these states visible:

- audit not required / conservative manual-system gate;
- audit pending/running;
- audit approved;
- audit vetoed/failed;
- waiting on missing Supervisor profile or owner approval.

Raw execution IDs may remain in advanced details, but first-viewport/operator copy must be understandable.

### Task 6 — Verification and dogfood report

Run and record:

```bash
pnpm vitest run src/server/work-item-orchestrator.test.ts src/server/work-item-merge-healer.test.ts
pnpm vitest run
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl --max-time 12 -fsS http://127.0.0.1:3456/ -o /tmp/hermes-workspace-root.html && wc -c /tmp/hermes-workspace-root.html
```

Also perform a live browser/DOM check on a Work Item detail page that proves the release-audit panel/copy appears.

Write:

- `dogfood-output/release-supervisor-audit-gate-latest.md`
- `dogfood-output/release-supervisor-audit-gate-<timestamp>.md`

Report must include:

- changed files;
- exact tests/build/service/browser evidence;
- whether Supervisor profile launch was implemented or intentionally deferred;
- explicit statement that no new Hermes profiles/gateways were created;
- whether R5/R4/R3 behavior remains compatible.

## 5. Acceptance criteria

- [ ] Merge-Healer cannot run for an audit-required approved-review deploy item unless release audit is approved or explicitly not required by policy.
- [ ] Audit veto/failure blocks deploy truthfully and visibly.
- [ ] Missing Supervisor profile never falls back to Builder.
- [ ] Work Item detail UI exposes release audit state and next action in operator-readable copy.
- [ ] Existing R5 branch evidence recovery and Merge-Healer behavior remain covered by tests.
- [ ] Full regression, typecheck, lint, build, diff-check, service smoke, and live UI check are recorded.
- [ ] Handoff and implementation index are updated after completion.

## 6. Copy-paste Builder prompt

```text
proceed on Hermes Workspace

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Read first: docs/handoff/current-slice-status.md
Active plan: docs/plans/2026-05-01-hermes-workspace-r6-release-supervisor-audit-gate-plan.md

Implement R6 Release Supervisor Audit Gate exactly as planned. Start with RED tests for orchestrator/Merge-Healer gate semantics. Do not create Deploy/Supervisor profiles or map Supervisor to builder. Do not enable always-on/retry/PR/cleanup. Preserve R5 branch-evidence recovery and real /executions behavior. Update docs/handoff/current-slice-status.md and write dogfood-output/release-supervisor-audit-gate-latest.md before stopping.
```
