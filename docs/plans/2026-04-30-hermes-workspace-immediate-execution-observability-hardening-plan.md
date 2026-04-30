# Hermes Workspace — Immediate Execution Observability Hardening Plan

> **For Hermes Builder:** Use `test-driven-development` and `systematic-debugging`. Implement task-by-task. Update `docs/handoff/current-slice-status.md` after each completed task. Do not start any unrelated roadmap work.

**Goal:** Hardening slice after Real Executions Runtime: make immediate `/executions/<executionId>` runs observable while active, make Planner/Reviewer completion sync consume `ExecutionRunRecord` data instead of legacy Hermes Scheduled Job output, and produce a live evidence package proving normal Work Item Planner/Builder/Reviewer paths do not create Scheduled Jobs.

**Why this is next:** R1 shipped the owner-corrected architecture: Work Item launches now create first-class `/executions` records instead of one-shot Scheduled Jobs. Main/CEO review found the remaining roadmap gap is not another broad feature; it is the supervisor/observability seam from the roadmap: active runs need heartbeat/latest-output truth and review automation must stop assuming `reviewJobId` means a Scheduled Job id.

**Previous package:** `bf6706a` (`feat: add real executions runtime`).

---

## Non-negotiables

1. **No Scheduled Jobs for normal Work Item launches.** Research/build/review/deploy paths must not call `launchConductorMission()` or `createHermesJob()`.
2. **Keep `/jobs` as Scheduled Jobs only.** Work Item execution and review traces must link to `/executions/<executionRunId>`.
3. **Active execution observability.** Running immediate executions must show useful `latestOutputText`, `lastObservedAt`, engine/profile/session/fallback evidence, and stale/failed state transitions in `ExecutionRunRecord`.
4. **Review sync reads execution runs.** Planner/Reviewer auto-resolution must support `reviewJobId` values that are actually immediate execution IDs, while preserving legacy Scheduled Job review compatibility.
5. **No array wipe regressions.** Preserve PATCH partial-update safety and avoid updates that pass undefined arrays.
6. **Live dogfood required.** Unit tests are not enough; run a real Work Item through immediate execution/review evidence and click `/executions/<id>`.

---

## Current state from Main review

- `launchWorkItemIntoConductor(...)` now uses `launchImmediateExecution(...)` for normal phases.
- `launchPlannerReview(...)` was patched during Main review to call `launchImmediateExecution(...)` with role `reviewer`; regression test added in `src/server/work-item-launch.test.ts`.
- `/executions/:executionId` renders the real detail page and final response evidence.
- Remaining risk: active progress is mostly `queued/running -> final`, and `syncWorkItemExecutionState(...)` still primarily understands legacy Scheduled Job review output when auto-resolving review decisions.

---

## Task 1 — Lock immediate review sync with RED tests

**Objective:** Prove review completion can be parsed from an immediate `ExecutionRunRecord`, not only from Hermes Scheduled Job output.

**Files:**

- Modify: `src/server/work-item-execution.test.ts`
- Modify if needed: `src/server/work-item-execution.ts`
- Existing helpers: `src/server/execution-runs-store.ts`, `src/server/work-item-review-decision.ts`

**RED tests first:**

Add tests where a work item is `active/review`, has `reviewJobId: <executionRunId>`, and there is no Hermes job for that id:

1. `getHermesJobById(reviewJobId)` rejects/returns null.
2. `upsertExecutionRun({ id: reviewJobId, role: 'reviewer', phase: 'review', engine: 'hermes-session', state: 'succeeded', finalResponse: REVIEW_DECISION_JSON ... })` exists.
3. Pending review approval exists.
4. `syncWorkItemExecutionState(workItem.id)` parses the execution-run final response, evaluates quality gates, and sets `reviewDecision` / `reviewState` just like the legacy job path.
5. Add a negative test: running immediate review run leaves review pending and records "not ready"/manual state without pretending approval.

**Implementation guidance:**

- Add a helper in `work-item-execution.ts` such as `readReviewExecutionOutput(updated.reviewJobId)` that tries:
  1. `getExecutionRun(reviewJobId)` when the id is an execution id;
  2. legacy `getHermesJobById(reviewJobId)` / `getHermesJobRuns(reviewJobId)` only if no execution run exists.
- Use `finalResponse || latestOutputText || error || summary` as the parse source for immediate runs.
- Map execution states carefully: `succeeded/failed` are parse-ready; `queued/running/stale/unknown` are not ready.

**Focused command:**

```bash
pnpm test src/server/work-item-execution.test.ts -- --runInBand
```

---

## Task 2 — Stream/session heartbeat into `ExecutionRunRecord`

**Objective:** Make active `/executions/<id>` useful before terminal completion.

**Files:**

- Modify: `src/server/immediate-execution-launch.ts`
- Modify: `src/server/immediate-execution-launch.test.ts`
- Use existing: `streamChat(...)`, `getMessages(...)`, `sendImmediateChatCompletion(...)` in `src/server/hermes-api.ts`

**Tests:**

1. When session streaming is available, `launchImmediateExecution(...)` uses `streamChat(...)` or a small observer wrapper instead of fire-and-forget `sendChat(...)` for session-backed runs.
2. Each streamed event/message updates the run with:
   - `state: 'running'`
   - bumped `lastObservedAt`
   - `latestOutputText` containing the latest assistant/tool/progress text excerpt
   - `sessionKey`
3. Terminal stream completion updates `state: 'succeeded'`, `finishedAt`, and `finalResponse`.
4. Stream failure updates `state: 'failed'`, `error`, `finishedAt`, and preserves the latest output excerpt.
5. Zero-fork `/v1/chat/completions` fallback records explicit fallback observability: `latestOutputText` should say it is waiting on immediate chat completion while running, then final response on completion.

**Implementation guidance:**

- Prefer `streamChat(sessionKey, { message, model }, { onEvent })` when `createSession(...)` succeeds.
- Keep `sendImmediateChatCompletion(...)` as fallback for gateways without `POST /api/sessions`.
- Do not block the launch response until completion; return `/executions/<id>` immediately after the running record exists.
- Bound excerpts to a safe length (for example 8–16 KB) so JSON store does not balloon.

**Focused command:**

```bash
pnpm test src/server/immediate-execution-launch.test.ts -- --runInBand
```

---

## Task 3 — Work Item timeline/UI regression coverage for active immediate runs

**Objective:** The Work Item Cockpit and execution detail page must show immediate run heartbeat/final output consistently.

**Files:**

- Modify: `src/server/work-item-run-timeline.test.ts`
- Modify: `src/server/work-item-run-timeline.ts`
- Modify: `src/screens/executions/execution-detail-screen.test.ts`
- Modify if needed: `src/screens/executions/execution-detail-screen.tsx`

**Tests:**

1. Running immediate Planner/Builder/Reviewer execution rows show latest output and profile/phase, not legacy Scheduled Job wording.
2. Review rows with immediate execution ids link to `/executions/<id>`.
3. Detail page renders latest output while running, final response when succeeded, and error/recovery guidance when failed.
4. Legacy `cron-legacy` rows still label themselves as legacy and remain readable.

**Focused command:**

```bash
pnpm test src/server/work-item-run-timeline.test.ts src/screens/executions/execution-detail-screen.test.ts -- --runInBand
```

---

## Task 4 — Live dogfood gauntlet and evidence

**Objective:** Prove the full path in the running service.

**Steps:**

1. Run focused tests from Tasks 1–3.
2. Run full gates:

```bash
pnpm vitest run
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm build
git diff --check
```

3. Restart and smoke:

```bash
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-smoke.html
```

4. Live browser/API dogfood:
   - create or reuse a low-risk ABACUS/Hermes Workspace work item;
   - trigger `Prepare Idea with Researcher` or a review-capable immediate execution;
   - open `/executions/<executionRunId>` while running if possible;
   - confirm Latest Output/Last Observed changes and final response appears after completion;
   - confirm `/api/hermes-jobs` before/after did not gain a new Work Item execution/review job;
   - capture screenshot path and API JSON evidence.

5. Write final report:

```text
dogfood-output/immediate-execution-observability-final-latest.md
dogfood-output/immediate-execution-observability-final-<timestamp>.md
```

Report must include: command results, before/after job ids, execution id(s), work item id, screenshot path, and any remaining limitations.

---

## Required final verification package

Builder final message must include:

- tests/build/lint results;
- service smoke result;
- live dogfood work item id and execution id;
- Scheduled Jobs before/after IDs showing no new Work Item job;
- final report path;
- updated `docs/handoff/current-slice-status.md` state.

---

## Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, this plan, then implement Task 1 only before moving to Task 2.
