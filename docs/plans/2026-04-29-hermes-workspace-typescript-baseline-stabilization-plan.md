# Hermes Workspace — TypeScript Baseline Stabilization Plan

> **For Hermes:** Use `test-driven-development` and `systematic-debugging` where practical. This is a quality/stabilization slice, not a product feature cycle. Builder should execute task-by-task, update `docs/handoff/current-slice-status.md` after each task, and stop after full `pnpm exec tsc --noEmit --pretty false` is green or any genuinely risky product-code ambiguity needs Main/CEO review.

## 1. CEO decision / why this is next

Operator UX Clarity P0/P1/P2/P3 plus H1 is committed and pushed at `3384ccb` on `my-hermes-workspace-dev`.

Roadmap review after that package:

- The GochevBot-inspired Operator UX roadmap P0–P3 is now complete: terminology/deep-link sanity, Work Item Cockpit progressive disclosure, dedicated Executions surface, and Morning Review.
- The earlier Next Cycle gaps V/W, X/Y, Z/AA, and AB/AC are already shipped in the implementation index.
- The remaining blocker repeated across both merge-readiness reviews is **repo-wide TypeScript baseline debt**. It does not block the committed Operator UX package because changed-file blockers were cleared, but it prevents `tsc --noEmit` from becoming a trustworthy hard gate for future autonomous work.

Therefore the next Builder-ready cycle is **TypeScript Baseline Stabilization**: make full `pnpm exec tsc --noEmit --pretty false` pass without adding new product features.

## 2. Current baseline

Command run by Main/CEO after commit `3384ccb`:

```bash
pnpm exec tsc --noEmit --pretty false > /tmp/hermes-workspace-tsc-after-operator-ux-commit.txt 2>&1
```

Result: exit `2`, 187 output lines, 21 files with errors:

```text
src/routes/api/work-items.$workItemId.ts
src/screens/chat/hooks/use-session-events-refresh.ts
src/server/attention-queue-routes.test.ts
src/server/autopilot-scout-prompts.test.ts
src/server/autopilot-suggestions-routes.test.ts
src/server/hermes-jobs.ts
src/server/profile-readiness-routes.test.ts
src/server/profile-readiness.test.ts
src/server/role-capacity-policy.test.ts
src/server/session-telemetry-routes.test.ts
src/server/work-item-approvals.test.ts
src/server/work-item-approvals.ts
src/server/work-item-detail-route.test.ts
src/server/work-item-execution.ts
src/server/work-item-launch.test.ts
src/server/work-item-lifecycle.ts
src/server/work-item-orchestrator-routes.test.ts
src/server/work-item-orchestrator.ts
src/server/work-item-recovery-actions-routes.test.ts
src/server/work-item-recovery-actions.test.ts
src/server/work-item-supervisor-routes.test.ts
```

Error families observed:

1. **TanStack route handler test typing** — `options.server` / `handlers` possibly undefined and `GET`/`POST` property access typing in route tests.
2. **Fixture drift after normalized required fields** — test fixture builders missing required `ProjectRecord`, `WorkItemRecord`, or `AttentionQueueItem` fields.
3. **Nullability mismatches** — functions returning `null` where declared types expect `undefined` or non-null records.
4. **API/type contract drift** — Hermes jobs API types, PATCH payload typing, browser timer type.
5. **Legacy policy type mismatch** — Autopilot scout prompt tests still include fields no longer in the picked policy type.

## 3. Non-negotiables

- No new product feature UI in this slice.
- No broad type-safety weakening. Avoid `as any`; if a cast is unavoidable at a route-test boundary, isolate it in a small typed helper and document why.
- Preserve `/api/work-items/$workItemId` true partial-update safety. Do not reintroduce undefined-field payloads that can wipe arrays like `acceptanceCriteria`.
- Preserve all Operator UX semantics from the accepted package: Scheduled Jobs are definitions, Executions are actual attempts, Morning Review is read-only, no auto Discord loop.
- Keep patches small by error family. Run focused tests after each family.
- Do not broad-format unrelated files.

## 4. Implementation tasks

### Task 1 — Create a durable TypeScript baseline report

Files:

- Create: `dogfood-output/typescript-baseline-stabilization-YYYY-MM-DDTHH-MM-SSZ.md`
- Update alias: `dogfood-output/typescript-baseline-stabilization-latest.md`
- Update: `docs/handoff/current-slice-status.md`

Steps:

1. Run:

```bash
pnpm exec tsc --noEmit --pretty false 2>&1 | tee /tmp/hermes-workspace-tsc-baseline-stabilization.txt
```

2. Parse unique error files and group each error family.
3. Record the baseline count and proposed order.
4. Update handoff with the report path.

Acceptance: report exists and tells the next task exactly which error family is next.

### Task 2 — Route handler test helper cleanup

Likely files:

- `src/server/attention-queue-routes.test.ts`
- `src/server/autopilot-suggestions-routes.test.ts`
- `src/server/profile-readiness-routes.test.ts`
- `src/server/role-capacity-policy.test.ts`
- `src/server/session-telemetry-routes.test.ts`
- `src/server/work-item-detail-route.test.ts`
- `src/server/work-item-orchestrator-routes.test.ts`
- `src/server/work-item-recovery-actions-routes.test.ts`
- `src/server/work-item-supervisor-routes.test.ts`

Objective: remove repeated TanStack `Route.options.server.handlers.GET/POST` type errors in tests without weakening product route types.

Suggested approach:

- Inspect newer passing route tests such as `src/server/morning-review-routes.test.ts` and `src/server/execution-runs-routes.test.ts` for the current import/cast pattern.
- Extract or locally reuse a typed helper pattern that treats the route handler as a test subject.
- Prefer small `type RouteGetHandler = ...` / `type RoutePostHandler = ...` helpers over `any`.

Verification:

```bash
pnpm test src/server/attention-queue-routes.test.ts src/server/autopilot-suggestions-routes.test.ts src/server/profile-readiness-routes.test.ts src/server/role-capacity-policy.test.ts src/server/session-telemetry-routes.test.ts src/server/work-item-detail-route.test.ts src/server/work-item-orchestrator-routes.test.ts src/server/work-item-recovery-actions-routes.test.ts src/server/work-item-supervisor-routes.test.ts -- --runInBand
pnpm exec tsc --noEmit --pretty false
```

Acceptance: none of the route-handler test files remain in the tsc error list.

### Task 3 — Normalize stale fixtures

Likely files:

- `src/server/profile-readiness.test.ts`
- `src/server/profile-readiness-routes.test.ts`
- `src/server/work-item-launch.test.ts`
- `src/server/work-item-recovery-actions.test.ts`
- `src/server/work-item-approvals.test.ts`
- `src/server/autopilot-scout-prompts.test.ts`

Objective: align old fixture literals/builders with current required model fields instead of relaxing production types.

Known examples from tsc output:

- `ProjectRecord` fixtures missing `runtimeProfiles`, `autopilotPolicy`, or `autonomyLanePolicy`.
- `WorkItemRecord` fixtures missing `labels`, `sourceSuggestionEvidence`, `reviewQualityGateReasons`, `reviewMissingEvidence`, `criteriaStatus`.
- `AttentionQueueItem` fixtures missing required `recommendedActions`.
- Autopilot scout prompt tests include `enabled` in a `Pick<ProjectAutopilotPolicy, 'scoutSources' | 'suggestionLimit'>` object.
- Approval test variables need null-safe assertions or helper that throws when a fixture approval is unexpectedly null.

Verification:

```bash
pnpm test src/server/profile-readiness.test.ts src/server/profile-readiness-routes.test.ts src/server/work-item-launch.test.ts src/server/work-item-recovery-actions.test.ts src/server/work-item-approvals.test.ts src/server/autopilot-scout-prompts.test.ts -- --runInBand
pnpm exec tsc --noEmit --pretty false
```

Acceptance: fixture/test files above no longer appear in tsc output and their tests still pass.

### Task 4 — Product-code nullability and contract fixes

Likely files:

- `src/server/work-item-approvals.ts`
- `src/server/work-item-execution.ts`
- `src/server/work-item-lifecycle.ts`
- `src/server/work-item-orchestrator.ts`
- `src/server/hermes-jobs.ts`
- `src/screens/chat/hooks/use-session-events-refresh.ts`
- `src/routes/api/work-items.$workItemId.ts`

Objective: fix real product-code typing without changing runtime semantics.

Guidance:

- `work-item-approvals.ts`: ensure mapped inbox entries filter nulls with a type predicate that matches optional fields correctly; avoid returning `(Entry | null)[]` as `Entry[]`.
- `work-item-execution.ts`: handle `updateWorkItem(...)` nullable return before dereferencing. If null would indicate impossible missing work item, return/throw with explicit error path consistent with existing behavior.
- `work-item-lifecycle.ts`: convert `null` approvals to `undefined` where declared return types expect optional records, or adjust types if null is truly part of contract.
- `work-item-orchestrator.ts`: avoid assigning `null` to fields typed `string | undefined`; preserve persistence format conventions.
- `hermes-jobs.ts`: update cron job/run API types to current Hermes Agent API shape or defensively normalize unknown records.
- `use-session-events-refresh.ts`: use a browser-safe timer type such as `ReturnType<typeof window.setTimeout>` or the existing project convention.
- `work-items.$workItemId.ts`: narrow PATCH payload unions so `reviewState` remains `WorkItemReviewState | undefined`; preserve partial-update behavior by conditionally building payload keys.

Focused verification:

```bash
pnpm test src/server/work-item-approvals.test.ts src/server/work-item-execution.test.ts src/server/work-item-lifecycle.test.ts src/server/work-item-orchestrator.test.ts src/server/hermes-job-output.test.ts src/screens/chat/hooks/use-session-events-refresh.test.ts src/server/work-item-detail-route.test.ts -- --runInBand
pnpm exec tsc --noEmit --pretty false
```

Acceptance: no product-code tsc errors remain; focused tests pass.

### Task 5 — Legacy Executions fallback link cleanup

Context: independent merge-readiness review of the Operator UX package noted a non-blocking legacy fallback issue: the Executions no-record landing path can build an unscoped `/work-items/:id` href when only `workItemId` is known. Verified Morning Review and execution detail links are correct, but this should be cleaned while the TypeScript baseline is being stabilized.

Likely files:

- `src/screens/executions/executions-screen.tsx`
- `src/screens/executions/executions-screen.test.ts`

Steps:

1. Add RED test for legacy `/executions?jobId=...&workItemId=...` no-record state when only `workItemId` exists.
2. Ensure the UI does not render an invalid `/work-items/:id` route.
3. If project ID is absent, show copy explaining that a Work Item link needs project context; keep Scheduled Job fallback if `jobId` exists.
4. If both project ID and work item ID are present, link to `/projects/:projectId/work-items/:workItemId`.

Verification:

```bash
pnpm test src/screens/executions/executions-screen.test.ts -- --runInBand
```

Acceptance: no invalid unscoped Work Item link remains in legacy no-record fallback.

### Task 6 — Final full verification

Run:

```bash
pnpm exec tsc --noEmit --pretty false
pnpm vitest run
pnpm build
git diff --check
pnpm exec eslint src/routes/api/work-items.$workItemId.ts src/screens/chat/hooks/use-session-events-refresh.ts src/server/attention-queue-routes.test.ts src/server/autopilot-scout-prompts.test.ts src/server/autopilot-suggestions-routes.test.ts src/server/hermes-jobs.ts src/server/profile-readiness-routes.test.ts src/server/profile-readiness.test.ts src/server/role-capacity-policy.test.ts src/server/session-telemetry-routes.test.ts src/server/work-item-approvals.test.ts src/server/work-item-approvals.ts src/server/work-item-detail-route.test.ts src/server/work-item-execution.ts src/server/work-item-launch.test.ts src/server/work-item-lifecycle.ts src/server/work-item-orchestrator-routes.test.ts src/server/work-item-orchestrator.ts src/server/work-item-recovery-actions-routes.test.ts src/server/work-item-recovery-actions.test.ts src/server/work-item-supervisor-routes.test.ts src/screens/executions/executions-screen.tsx src/screens/executions/executions-screen.test.ts
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-smoke-tsc-stabilization.html
```

Live browser smoke:

- Dashboard loads.
- Projects page loads.
- A Work Item detail page still loads for an existing project/work-item if data is available.
- `/executions?jobId=missing&workItemId=some-id` no-record fallback does not show an invalid unscoped Work Item route.

Final report:

- Write `dogfood-output/typescript-baseline-stabilization-final-YYYY-MM-DDTHH-MM-SSZ.md` and `dogfood-output/typescript-baseline-stabilization-final-latest.md`.
- Update handoff with PASS/FAIL and exact remaining errors if any.

## 5. Acceptance criteria

This slice is accepted only when:

1. `pnpm exec tsc --noEmit --pretty false` exits 0.
2. Focused tests for touched areas pass.
3. Full `pnpm vitest run` passes.
4. `pnpm build` passes.
5. `git diff --check` passes.
6. Targeted ESLint on touched files has no errors.
7. Service restart/root smoke passes.
8. Handoff and final report are updated.

## 6. Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, then this active plan, and start with Task 1.
