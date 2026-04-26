# Current Slice Execution Status

> Canonical continuation handoff for Builder sessions.

## Active Plan
- **Project:** Hermes Workspace — Dream Mission Control
- **Slice:** R/S — Execution Runs + Supervisor
- **Plan file:** `docs/plans/2026-04-25-hermes-workspace-slice-r-s-execution-runs-supervisor-plan.md`
- **Plan index:** `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`

## Completed Tasks
- Slice T/U Task 1 — Parser tests/module (`src/server/work-item-review-decision.ts`, `src/server/work-item-review-decision.test.ts`) ✅
- Slice T/U Task 2 — Quality gate tests (`src/server/work-item-review-decision.test.ts`) ✅
- Slice T/U Task 3 — Review gate store/API fields (`src/server/work-items-store.ts`, `src/lib/projects-api.ts`, PATCH route) ✅
- Slice T/U Task 4 — Planner review prompt structured output requirement (`src/server/work-item-launch.ts`) ✅
- Slice T/U Task 5 — Execution integration for structured review auto-resolution (`src/server/work-item-execution.ts`, `src/server/work-item-execution.test.ts`) ✅
- Slice T/U Task 6 — Approval policy guards so Planner-reviewed items stay pending until structured review resolves (`src/server/work-item-approvals.ts`) ✅
- Slice T/U Task 7 — Work item detail UI review gate labels, attention messages, and status panel fields (`src/screens/projects/work-item-detail-screen.tsx`) ✅
- Slice R/S PR 1 — Execution runs file-backed store and tests (`src/server/execution-runs-store.ts`, `src/server/execution-runs-store.test.ts`) ✅
- Slice R/S PR 2 — Execution runs launch/sync integration and work-item API route (`src/server/work-item-launch.ts`, `src/server/work-item-execution.ts`, `src/routes/api/work-items.$workItemId.execution-runs.ts`, `src/lib/work-item-execution-runs-api.ts`) ✅
- Slice R/S PR 3 — Supervisor pure helpers (`src/server/work-item-supervisor.ts`, `src/server/work-item-supervisor.test.ts`) ✅
- Slice R/S PR 4 — Supervisor reconcile route/client (`src/routes/api/work-items.supervisor.reconcile.ts`, `src/lib/work-item-supervisor-api.ts`, `src/server/work-item-supervisor-routes.test.ts`) ✅
- Slice R/S PR 5 — Attention queue store/builder/route (`src/server/attention-queue-store.ts`, `src/server/attention-queue.ts`, `src/routes/api/attention-queue.ts`, `src/lib/attention-queue-api.ts`) ✅
- Slice R/S PR 6 — Dashboard attention surface (`src/screens/dashboard/dashboard-screen.tsx`, `src/screens/dashboard/dashboard-screen.test.ts`) ✅
- Slice R/S PR 7 — Role capacity store/evaluator (`src/server/role-capacity-policy-store.ts`, `src/server/role-capacity-policy.ts`, `src/routes/api/role-capacity-policy.ts`, `src/lib/role-capacity-policy-api.ts`) ✅
- Slice R/S PR 8 — Launch advisory integration (`src/server/work-item-launch.ts`, `src/server/work-item-launch.test.ts`, `src/lib/work-item-launch-api.ts`) ✅

## Current State
- Slice R/S PR 1–8 implementation complete; all currently planned Dream Mission Control slices (N/O, P/Q, T/U, R/S) are shipped.
- Durable execution-run store writes `work-item-execution-runs.json` under `HERMES_HOME`, supports create/upsert, dedupe by `workItemId + role + jobId + runId` (or without runId), filters, deletion by work item/project, and invalid JSON safe fallback.
- Work-item launch now records scheduled mission execution runs; execution sync records mission run state/evidence/session details; structured review sync records review run details.
- Supervisor helper module + reconcile API detect/report stale/failed/missing execution without automatic retry or stale-only status mutation.
- Global attention queue persists `attention-queue.json`, derives approvals/failed/blocked/stale/capacity items, and Dashboard renders the refreshed Global attention card.
- Role capacity policy persists `role-capacity-policy.json`, exposes advisory defaults (`research=1`, `build=2`, `review=1`, `deploy=1`, `supervisor=1`), and evaluates over-capacity launches without blocking them.
- Launch advisory integration now evaluates capacity before launch, includes `capacityDecision` in launch responses/client type, appends over-capacity advisory text to launch history, and upserts a `capacity_exceeded` attention item while still launching.
- Tests passing: PR 8 focused capacity tests → **2/2**; adjacent launch/capacity/attention tests → **29/29**; full `pnpm vitest run` → **261/261**.
- Build passing: `pnpm build` with existing Vite chunk/dynamic-import warnings.
- Service status: restarted after PR 8; `hermes-workspace.service` is active.
- Live API smoke: `GET /api/role-capacity-policy` returned `200`; `GET /api/attention-queue` returned `200 {"items":[]}` on current live data.

## Next Steps
**Next:** All 4 planned Dream Mission Control slices are complete. Ask Main/Architect to create the next cycle of slice plans before Builder starts new feature work.

## Notes
- Build still emits existing Vite chunk-size/dynamic-import warnings; build exits successfully.
