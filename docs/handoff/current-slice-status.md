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

## Current State
- Slice R/S PR 1–7 implementation complete.
- Durable execution-run store writes `work-item-execution-runs.json` under `HERMES_HOME`, supports create/upsert, dedupe by `workItemId + role + jobId + runId` (or without runId), filters, deletion by work item/project, and invalid JSON safe fallback.
- Work-item launch now records scheduled mission execution runs; execution sync records mission run state/evidence/session details; structured review sync records review run details.
- New API route/client helper: `GET /api/work-items/:workItemId/execution-runs` → `{ workItemId, runs }`.
- Supervisor helper module exports default thresholds, candidate detection, stale/failed/job-missing finding derivation, and reconcile functions that call execution sync then report findings without stale-only status mutation or retry.
- New supervisor reconcile API route/client helper: `POST /api/work-items/supervisor/reconcile` with optional `?workItemId=...` → `{ checked, findings }`; authenticated route returns `401` when required credentials are missing.
- New attention queue store writes `attention-queue.json` under `HERMES_HOME`, upserts by `dedupeKey`, reopens resolved items when seen again, and sorts open critical items before warnings/resolved items.
- New attention queue builder derives pending approvals, failed missions/reviews, blocked work, supervisor stale findings, and capacity advisory items; `GET /api/attention-queue?refresh=true` refreshes/persists open queue items and `src/lib/attention-queue-api.ts` exposes the client helper.
- Dashboard now fetches the persisted/refreshed global attention queue, renders an operator-facing Global attention card with open count, calm empty state, severity badges, critical-first ordering, refresh action, and project/work-item navigation.
- New role capacity policy store/evaluator writes `role-capacity-policy.json` under `HERMES_HOME`, exposes default advisory capacities (`research=1`, `build=2`, `review=1`, `deploy=1`, `supervisor=1`), normalizes invalid `maxActive`, counts active phase-matching work items, and exposes `GET /api/role-capacity-policy` plus `fetchRoleCapacityPolicy()`.
- Tests passing: PR 7 role capacity focused tests (`role-capacity-policy`) → **6/6**; adjacent PR 1–7 targeted verification (`attention-queue*`, `work-item-supervisor*`, `execution-runs*`, `role-capacity-policy`) → **31/31**; full `pnpm vitest run` → **259/259**.
- Build passing: `pnpm build` with existing Vite chunk/dynamic-import warnings.
- Service status: restarted after PR 7 route addition; `hermes-workspace.service` is active.
- Live API smoke: `GET /api/role-capacity-policy` returned `200` with roles `research, build, review, deploy, supervisor`.

## Next Steps
**Next:** Slice R/S PR 8 — Launch advisory integration (`src/server/work-item-launch.ts`, `src/server/work-item-launch.test.ts`, `src/lib/work-item-launch-api.ts`).

## Notes
- Build still emits existing Vite chunk-size/dynamic-import warnings; build exits successfully.
