# Planner Enrichment Draft — Mission Control Demo Work Item 4659f5a0

- Work item ID: `4659f5a0-4948-4f53-8e4d-412f33535ea9`
- Project: `Mission Control Demo` (`46b401f9-9243-472f-b5b7-04bf34596906`)
- Title: `Autonomous orchestrator live smoke autonomy-smoke-20260427T175044Z`
- Repository path: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Planner profile: `researcher`
- Planning scope: planner enrichment only; no source-code changes, no Builder launch, no deploy mission.

## Implementation approach

This work item is a live smoke/enrichment target for the autonomous work-item orchestrator. The repository already contains evidence in `dogfood-output/autonomous-orchestrator-live-api-smoke-2026-04-27T17-51Z.md` showing that work item `4659f5a0-4948-4f53-8e4d-412f33535ea9` was created under Mission Control Demo at `inbox/research`, then reconciled with `POST /api/work-items/orchestrator/reconcile?workItemId=4659f5a0-4948-4f53-8e4d-412f33535ea9`. The first reconcile returned `launch_planner`, created planner job `0eac4b039e43`, and associated planning draft `89ef9e12-2418-45c5-8f2c-1f8eba8e9253`; the second reconcile was idempotent with `noop` and no duplicate Planner job.

The planning recommendation is therefore not to implement code in this worker, but to preserve this artifact as the Planner enrichment output and use it to guide a future build-phase hardening task if needed. The relevant code path is centered on `src/server/work-item-orchestrator.ts`, where `reconcileWorkItemAutonomy` launches Planner for `inbox/research` items without an active planning draft, ingests completed Planner output via `getLatestHermesJobOutput`, auto-accepts structured Planner drafts whose `suggestedPhase` is `build`, launches Builder for `ready/build` items with a plan file, and syncs active mission execution. The periodic loop is guarded by `HERMES_WORKSPACE_WORK_ITEM_AUTONOMY === '1'` in `src/server/work-item-orchestrator-loop.ts`, while the explicit smoke endpoint is exposed at `src/routes/api/work-items.orchestrator.reconcile.ts`.

For this exact work item, the safest enrichment outcome is to mark the smoke as research-complete/plan-ready, with acceptance focused on proving Planner launch behavior and idempotency rather than attempting source modifications. A later Builder task should only be considered if the product goal changes from smoke verification to full autonomous E2E completion.

## Files likely to change

No files should change as part of this planner-only worker except this markdown artifact:

- `docs/plans/mission-control-demo-4659f5a0-planner-draft.md` — created as the required Planner enrichment plan.

If a future build-phase task is authorized, the likely implementation and verification surface would be:

- `src/server/work-item-orchestrator.ts` — orchestrator state transitions, Planner ingestion, auto-accept, Builder launch, and execution sync behavior.
- `src/server/work-item-orchestrator-loop.ts` — autonomy loop enablement and interval behavior.
- `src/routes/api/work-items.orchestrator.reconcile.ts` — manual/API reconcile entry point.
- `src/server/hermes-job-output.ts` — local/API job output discovery for Planner output ingestion.
- `src/server/work-item-orchestrator.test.ts`, `src/server/work-item-orchestrator-routes.test.ts`, `src/server/work-item-orchestrator-loop.test.ts`, and related work-item timeline/detail tests — regression coverage for the autonomous state machine.
- `scripts/mission-control-autonomous-work-item-e2e.mjs` — broader E2E validation if the goal expands beyond this smoke work item.

## Test strategy

For this planner-only artifact, validation is limited to file existence, size, and content checks required by the worker contract. No source tests are necessary because no source files are modified.

For future implementation or regression validation, use the existing focused test set recorded by the live smoke report:

```bash
pnpm test src/server/work-item-orchestrator.test.ts \
  src/server/work-item-orchestrator-routes.test.ts \
  src/server/hermes-job-output.test.ts \
  src/server/work-item-run-timeline.test.ts \
  src/server/work-item-detail-route.test.ts
```

The live smoke report recorded this set as PASS with 5 files / 24 tests. If behavior changes, add or update tests for: initial Planner launch from `inbox/research`, duplicate reconcile idempotency, ingestion of real Hermes job output into planning drafts, auto-accept only for structured drafts with `suggestedPhase: build`, blocked behavior when the Planner requests more research, and no Builder launch until a valid plan file exists. Build validation with `pnpm build` should be reserved for a future code-change task.

## Risks and mitigations

- Risk: The smoke work item may be interpreted as requiring Builder execution. Mitigation: keep this plan scoped to Planner enrichment; the supplied constraints explicitly prohibit Builder or implementation/deploy missions.
- Risk: Planner output ingestion may depend on local cron output availability and job store state. Mitigation: cite the existing smoke evidence and recommend focused `hermes-job-output` regression tests for future code work.
- Risk: The autonomous loop may not run unless `HERMES_WORKSPACE_WORK_ITEM_AUTONOMY=1`. Mitigation: distinguish explicit reconcile endpoint smoke verification from always-on loop behavior.
- Risk: Auto-accepting Planner drafts too aggressively could route incomplete research into build. Mitigation: preserve the current policy of only auto-accepting `structured_ready` drafts that suggest the build phase, and block/noop when the Planner requests more research.
- Risk: This worker is running through standard delegation fallback rather than the preferred ACP subprocess transport. Mitigation: treat that only as execution trace context; the plan remains grounded in repository evidence and does not rely on transport-specific behavior.

## Acceptance criteria rationale

The acceptance criteria for work item `4659f5a0-4948-4f53-8e4d-412f33535ea9` should demonstrate that the orchestrator can launch Planner without manual lifecycle/status/phase mutation, because that is the stated description: “Temporary API smoke work item created by Task 14. Verify orchestrator reconcile launches planner without manual status/phase mutation.” The repository evidence indicates this has already been proven for the smoke item: creation left the item at `inbox/research`; explicit reconcile produced `launch_planner`; detail/timeline returned research as running with planner job `0eac4b039e43`; a second reconcile returned `noop` and did not duplicate the Planner job.

Therefore, the primary acceptance rationale is smoke-level confidence in the Planner launch seam and idempotency, not full autonomous delivery. The plan file itself is accepted when it documents the implementation surface, likely files, test strategy, risks, and open questions while explicitly referencing both `4659f5a0-4948-4f53-8e4d-412f33535ea9` and `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`.

Suggested acceptance criteria for the item:

1. The Planner enrichment artifact exists at `docs/plans/mission-control-demo-4659f5a0-planner-draft.md` and is over 1200 bytes.
2. The artifact explicitly references work item `4659f5a0-4948-4f53-8e4d-412f33535ea9` and repository path `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`.
3. The artifact summarizes that Task 14 smoke evidence showed first reconcile action `launch_planner` and second reconcile idempotent `noop`.
4. No source-code files are modified by this planner-only worker.
5. Future build work, if authorized, is clearly separated from this research/planner task.

## Open questions

- Should the Mission Control Demo smoke item remain as a historical evidence artifact, or should it be cleaned up after validation?
- Is the intended next phase for the broader initiative still Task 15/full real autonomous E2E against the family command center candidate repo, as noted in the smoke report?
- Should the always-on orchestrator loop be part of smoke acceptance, or is explicit reconcile endpoint behavior sufficient for this work item?
- Should Planner draft auto-accept require additional approval policy checks beyond `suggestedPhase: build` before launching Builder in future work?
- Should live smoke reports be linked back into work-item metadata automatically so detail/timeline views can surface the evidence without manually consulting `dogfood-output`?
