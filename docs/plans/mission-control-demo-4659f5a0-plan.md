# Phase 1 Plan — Mission Control Demo Work Item 4659f5a0

Work item ID: `4659f5a0-4948-4f53-8e4d-412f33535ea9`  
Project: Mission Control Demo  
Title: Autonomous orchestrator live smoke autonomy-smoke-20260427T175044Z  
Repository: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

## Context and objective

This is a Phase 1 planning-only artifact for work item `4659f5a0-4948-4f53-8e4d-412f33535ea9`. The work item description says it is a temporary API smoke item created by Task 14 to verify that orchestrator reconcile launches Planner without manual status or phase mutation. The stated acceptance criterion is: “Planner launch evidence is recorded by orchestrator reconcile.” Operator notes also mention that a Planner markdown artifact already exists at `docs/plans/mission-control-demo-4659f5a0-planner-draft.md` and that the broader automation may proceed to Builder.

Repository inspection confirms the relevant implementation lives in `src/server/work-item-orchestrator.ts`. The explicit API entry point is `src/routes/api/work-items.orchestrator.reconcile.ts`. Existing smoke evidence is recorded in `dogfood-output/autonomous-orchestrator-live-api-smoke-2026-04-27T17-51Z.md`, which states that the work item was created as `inbox/research`, that no manual lifecycle mutation was performed, and that the first reconcile call returned an event with action `launch_planner`, Planner job `0eac4b039e43`, and planning draft `89ef9e12-2418-45c5-8f2c-1f8eba8e9253`. The same report records a second reconcile returning `noop`, showing duplicate Planner launch suppression while a running draft exists.

## Implementation approach

No product code should be changed during Phase 1. The authoritative Builder plan is to preserve and verify the existing orchestrator behavior rather than redesign it:

1. Treat `reconcileWorkItemAutonomy(workItemId)` as the source of truth for single-item autonomous progression.
2. For an `inbox/research` work item with no active planning draft, confirm that the orchestrator calls `prepareWorkItemWithPlanner` and returns a `launch_planner` event containing work item, project, draft, and job evidence.
3. Keep the active-draft guard intact. `latestActivePlanningDraft` treats `requested`, `running`, and `structured_ready` drafts as active, so repeated reconciles should not create duplicate Planner jobs.
4. Keep API behavior aligned with the server function: `POST /api/work-items/orchestrator/reconcile?workItemId=...` should return `checked`, `changed`, `events`, `findings`, and optional `blocked` fields so smoke evidence can be captured directly from the response body.
5. Use the existing Planner artifact fallback path only after a Planner draft exists and output stream data is unavailable. That path can synthesize structured Planner output from `docs/plans/<project-slug>-<work-item-prefix>-planner-draft.md`, but it is not required to prove the initial launch criterion.

If Phase 2 is asked to implement anything, it should be a narrow hardening/test slice: assert that the live reconcile event and route response record enough Planner launch evidence and that idempotency remains protected. Do not broaden the task into full Builder/review/deploy autonomy unless acceptance criteria are expanded.

## Files to change

For Phase 1, only this plan file is created:

- `docs/plans/mission-control-demo-4659f5a0-plan.md`

Likely Phase 2 files if additional hardening is required:

- `src/server/work-item-orchestrator.ts` — single-item reconcile state machine, event construction, Planner launch action, active draft guard, Planner output ingestion, and later Builder launch transitions.
- `src/routes/api/work-items.orchestrator.reconcile.ts` — route response shape and propagation of orchestrator events for live smoke evidence.
- `src/server/work-item-orchestrator.test.ts` — unit coverage for `launch_planner`, no duplicate launch, Planner artifact ingestion, auto-accept, Builder launch, and no-op states.
- `src/server/work-item-orchestrator-routes.test.ts` — API route coverage for reconcile responses, authorization, targeted work item reconciliation, and evidence fields.
- `src/server/work-item-planning.ts` and `src/server/planning-drafts-store.ts` — only if the Planner launch record itself is missing draft/job metadata.
- `src/server/work-item-run-timeline.test.ts` and `src/server/work-item-detail-route.test.ts` — if UI/detail/timeline evidence must also be asserted.
- `dogfood-output/autonomous-orchestrator-live-api-smoke-2026-04-27T17-51Z.md` — historical evidence reference only; avoid changing unless a new live smoke is intentionally recorded.

## Test strategy

Because this phase does not implement code, the required verification is the plan-file contract listed in the dispatch instructions. For a Phase 2 Builder hardening slice, use focused automated tests before any broad build:

```bash
pnpm test src/server/work-item-orchestrator.test.ts \
  src/server/work-item-orchestrator-routes.test.ts \
  src/server/hermes-job-output.test.ts \
  src/server/work-item-run-timeline.test.ts \
  src/server/work-item-detail-route.test.ts
```

Recommended new or confirmed assertions:

- `reconcileWorkItemAutonomy` on a new `inbox/research` work item with no active draft returns `changed: true` and an event whose `action` is `launch_planner`.
- The event includes Planner evidence (`draftId` and/or `jobId`) when `prepareWorkItemWithPlanner` returns it.
- A second reconcile while a draft is `requested`, `running`, or `structured_ready` does not call Planner launch again and returns `noop` or ingestion/acceptance behavior as appropriate.
- The route `POST /api/work-items/orchestrator/reconcile?workItemId=<id>` preserves the event data in the JSON response so live smoke artifacts can record it.
- Existing Planner output ingestion and auto-accept tests continue to pass so Builder progression is not regressed.

Run `pnpm build` only for a code-changing Phase 2 or release validation; it is unnecessary for this planning-only artifact.

## How to verify acceptance criteria

Acceptance criterion: “Planner launch evidence is recorded by orchestrator reconcile.”

Verification approach:

1. Inspect live smoke evidence in `dogfood-output/autonomous-orchestrator-live-api-smoke-2026-04-27T17-51Z.md` for work item `4659f5a0-4948-4f53-8e4d-412f33535ea9`.
2. Confirm the work item was created at `inbox/research` and the report states no manual PATCH/lifecycle status or phase mutation occurred.
3. Confirm the first targeted reconcile response recorded `checked=1`, `changed=1`, event action `launch_planner`, Planner job id `0eac4b039e43`, planning draft id `89ef9e12-2418-45c5-8f2c-1f8eba8e9253`, and message `Auto-launched Planner for inbox research work item.`
4. Confirm the detail/timeline evidence showed research running with Planner job `0eac4b039e43` while build, review, and deploy remained not started.
5. Confirm the second reconcile was idempotent: `checked=1`, `changed=0`, event action `noop`, and no duplicate Planner job while the draft remained running.
6. For regression protection, run the focused tests above and verify the `auto-launches Planner for a new inbox research item with no planning draft` and `does not launch a duplicate Planner when an active planning draft already exists` cases pass.

## Drafted / clarified acceptance criteria

The single existing acceptance criterion is usable but broad. Suggested explicit acceptance criteria for Builder or QA are:

1. Given work item `4659f5a0-4948-4f53-8e4d-412f33535ea9` or an equivalent new `inbox/research` item with no active draft, targeted orchestrator reconcile returns an event with `action: launch_planner`.
2. The reconcile response records Planner launch evidence, including at least the work item id and either a Planner job id or planning draft id.
3. The Planner is launched without any manual status/phase mutation before reconcile.
4. A repeated reconcile while the planning draft is active does not create a duplicate Planner launch.
5. Evidence is available either in the API response body, the work-item timeline/detail API, or an archived smoke report.

## Open questions, constraints, and recommended build slice breakdown

Open questions:

- Is the historical Task 14 smoke report sufficient evidence, or should Phase 2 run a fresh live API smoke and write a new dogfood report?
- Should the orchestrator persist reconcile events to a durable audit log, or is response-body plus timeline/detail evidence sufficient?
- Should `launch_planner` events require both `jobId` and `draftId`, or is one identifier acceptable if a Planner launch implementation cannot synchronously provide both?
- Should the Planner artifact fallback be considered part of this work item or a separate hardening concern?

Constraints:

- Phase 1 must not implement code or start long-running services.
- Existing uncommitted repository changes must not be overwritten.
- Work must stay inside `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace` and `/tmp/dispatch-mission-control-demo-4659f5a0/phase1`.
- The acceptance criterion is about Planner launch evidence, not full autonomous Builder completion.

Recommended build slices if Phase 2 proceeds:

1. Test-only confirmation slice: add/adjust targeted tests proving `launch_planner` evidence and duplicate prevention.
2. Evidence-shape hardening slice: if tests reveal missing fields, update event creation or route serialization to include `jobId`, `draftId`, status/phase before/after, and message.
3. Live-smoke documentation slice: optionally rerun the explicit reconcile smoke in an already-running environment and archive a new dogfood report.
4. Full autonomy slice: only if new acceptance criteria require it, validate Planner output ingestion, draft acceptance, and Builder launch separately from this smoke item.
