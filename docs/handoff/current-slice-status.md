# Current Slice Execution Status

> Canonical continuation handoff for Builder sessions. Updated during Real Executions Runtime implementation after owner correction that `/executions` must be real live execution traces, not Scheduled Jobs.

## Active Plan

- **Project:** Hermes Workspace — Real Executions Runtime
- **Active implementation plan:** `docs/plans/2026-04-29-hermes-workspace-real-executions-runtime-plan.md`
- **Plan index:** `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
- **Previous package:** Production Dogfood Queue Hygiene + Real Idea Readiness completed; real idea work item created: `697d0059-a3ca-438e-b92c-481f39e7566b`

## Owner Correction / Why This Is Active

- D3n13r explicitly corrected Main/CEO: `/executions` must be real clickable live execution traces/results, **not** Scheduled Jobs or one-shot cron definitions.
- Scheduled Jobs are reusable/cron definitions only. Work Item launches must create real immediate execution/run records that show live progress, logs/output, artifacts, final response, and failures.

## Completed Tasks

- Task 1 — Locked Work Item execution terminology/routing regression coverage (`src/screens/projects/work-item-detail-screen.test.ts`, `src/server/work-item-execution.test.ts`, `src/server/work-item-run-timeline.test.ts`) ✅
  - `pnpm test src/screens/projects/work-item-detail-screen.test.ts src/server/work-item-execution.test.ts src/server/work-item-run-timeline.test.ts -- --runInBand` — PASS, 53 tests.
- Task 2 — Added immediate execution launch seam without Scheduled Job creation (`src/server/immediate-execution-launch.ts`, `src/server/immediate-execution-launch.test.ts`, `src/server/execution-runs-store.ts`) ✅
  - RED observed: `pnpm test src/server/immediate-execution-launch.test.ts -- --runInBand` failed with missing `./immediate-execution-launch` module.
  - GREEN: `pnpm test src/server/immediate-execution-launch.test.ts -- --runInBand` — PASS, 3 tests.
  - Adjacent: `pnpm test src/server/immediate-execution-launch.test.ts src/server/execution-runs-store.test.ts src/server/execution-runs-routes.test.ts -- --runInBand` — PASS, 15 tests.
- Task 3 — Routed Work Item planning/build launches through immediate executions (`src/server/work-item-planning.ts`, `src/server/work-item-launch.ts`, `src/server/work-item-orchestrator.ts`, tests) ✅
  - RED observed: `pnpm test src/server/work-item-planning.test.ts -- --runInBand` failed on old `launch.jobId` scheduled-job assumptions after immediate-launch test change.
  - GREEN focused/adjacent: `pnpm test src/server/immediate-execution-launch.test.ts src/server/work-item-launch.test.ts src/server/work-item-planning.test.ts src/server/work-item-run-timeline.test.ts src/screens/projects/work-item-detail-screen.test.ts src/server/work-item-orchestrator.test.ts -- --runInBand` — PASS after orchestrator compatibility fix, 82 tests.
  - Type/build: `pnpm exec tsc --noEmit --pretty false` — PASS; `pnpm build` — PASS with existing Vite chunk/dynamic-import warnings.
- Task 4 — Upgraded `/executions/:executionId` detail view model/UI to real live trace copy (`src/screens/executions/execution-detail-screen.tsx`, `.test.ts`) ✅
  - RED observed: `pnpm test src/screens/executions/execution-detail-screen.test.ts -- --runInBand` failed on missing live progress constants/viewmodel fields.
  - GREEN: `pnpm test src/screens/executions/execution-detail-screen.test.ts -- --runInBand` — PASS, 5 tests.
  - Adjacent + build: `pnpm test src/screens/executions/execution-detail-screen.test.ts src/server/immediate-execution-launch.test.ts src/server/work-item-launch.test.ts src/server/work-item-planning.test.ts src/server/work-item-run-timeline.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand` — PASS, 68 tests; `pnpm exec tsc --noEmit --pretty false` — PASS; `pnpm build` — PASS with existing Vite warnings.
- Task 5 — Updated Work Item Cockpit/timeline to consume real execution runs first (`src/server/work-item-run-timeline.ts`, `src/screens/projects/work-item-detail-screen.tsx`, tests) ✅
  - RED observed: `pnpm test src/server/work-item-run-timeline.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand` failed on immediate Planner profile copy, execution-first cockpit labels, and execution id summary copy.
  - GREEN focused/adjacent: `pnpm test src/server/work-item-run-timeline.test.ts src/server/work-item-execution.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand` — PASS, 56 tests.
  - Slice-adjacent: `pnpm test src/server/immediate-execution-launch.test.ts src/server/work-item-launch.test.ts src/server/work-item-planning.test.ts src/server/work-item-run-timeline.test.ts src/server/work-item-execution.test.ts src/screens/executions/execution-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand` — PASS, 87 tests.
  - Full gates: `pnpm vitest run` — PASS, 82 files / 526 tests after updating legacy route/orchestrator tests to mock/assert immediate executions; `pnpm exec tsc --noEmit --pretty false` — PASS; `pnpm exec eslint . --max-warnings=0` — PASS; `pnpm build` — PASS with existing Vite chunk/dynamic-import warnings; `git diff --check` — PASS.
- Task 6 — Migration/compatibility for existing Scheduled Job-backed runs (`src/server/work-item-execution.ts`, `src/server/work-item-run-timeline.ts`, tests) ✅
  - RED observed: `pnpm test src/server/work-item-execution.test.ts src/server/work-item-run-timeline.test.ts -- --runInBand` failed because imported `cron-legacy` execution runs were not labeled as legacy and imported local cron output did not persist summary/latest output/final response.
  - GREEN focused: `pnpm test src/server/work-item-execution.test.ts src/server/work-item-run-timeline.test.ts -- --runInBand` — PASS, 32 tests.
  - Slice-adjacent: `pnpm test src/server/immediate-execution-launch.test.ts src/server/work-item-launch.test.ts src/server/work-item-planning.test.ts src/server/work-item-run-timeline.test.ts src/server/work-item-execution.test.ts src/screens/executions/execution-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand` — PASS, 89 tests.
  - Full gates: `pnpm vitest run` — PASS, 82 files / 528 tests; `pnpm exec tsc --noEmit --pretty false` — PASS; `pnpm exec eslint . --max-warnings=0` — PASS; `pnpm build` — PASS with existing Vite chunk/dynamic-import warnings; `git diff --check` — PASS.
- Task 7 — Live dogfood acceptance gauntlet (`src/server/immediate-execution-launch.ts`, `src/server/hermes-api.ts`, `src/routes/executions.tsx`, `src/screens/executions/execution-detail-screen.tsx`, reports) ✅
  - RED observed: `pnpm test src/server/immediate-execution-launch.test.ts -- --runInBand` failed on missing direct chat-completion fallback for zero-fork gateway `POST /api/sessions: 404`; `pnpm test src/routes/-root-layout-state.test.ts -- --runInBand` failed because `/executions/:executionId` rendered the list route.
  - GREEN focused/adjacent: immediate execution fallback test PASS (4 tests); route/detail tests PASS (8 tests); slice-adjacent execution tests PASS (90 tests).
  - Live dogfood PASS: work item `a77f3914-26cd-4cb0-b2dd-fc06eba33e7d` created execution `7b217f97-691c-4976-a6f8-35041a26591b`; `/executions/7b217f97-691c-4976-a6f8-35041a26591b` showed `SUCCEEDED`, timestamps, and final response; Scheduled Jobs before/after stayed `[5e26a777bcd0, f5e71ec2a3f0]` (no added jobs).
  - Evidence: `dogfood-output/real-executions-runtime-final-latest.md`, `dogfood-output/real-executions-runtime-final-2026-04-30T06-18-00Z.md`, screenshot `/home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_8a169dfa537a4f6d881ebb770c84d576.png`.
  - Full final gates: `pnpm vitest run` — PASS, 82 files / 529 tests; `pnpm exec tsc --noEmit --pretty false` — PASS; `pnpm exec eslint . --max-warnings=0` — PASS; `pnpm build` — PASS with existing Vite chunk/dynamic-import warnings; `git diff --check` — PASS; service restart/API smoke — PASS.

## Current State / Evidence

- Real ABACUS idea exists: `Daddy Daily Brief — one-screen family runway for today` (`697d0059-a3ca-438e-b92c-481f39e7566b`).
- Immediate execution path:
  - `ExecutionRunRecord` supports `engine: 'hermes-session'`, `state: 'queued'`, role-specific Planner/Builder/Reviewer/Deployer records, optional `jobId`, `profile`, `summary`, `latestOutputText`, and `finalResponse`.
  - `launchImmediateExecution(...)` creates the durable run first, prefers Hermes session launch when `POST /api/sessions` is available, falls back to immediate `/v1/chat/completions` on the current zero-fork gateway, records running/succeeded/failed state transitions, returns `/executions/<executionRunId>`, and does not call `launchConductorMission`/Scheduled Jobs.
  - `prepareWorkItemWithPlanner(...)` now creates a PlanningDraft and launches Planner via immediate execution; draft `plannerLink` is `/executions/<executionRunId>`.
  - `launchWorkItemIntoConductor(...)` now uses immediate execution for research/build/review/deploy, stores `missionId=<executionRunId>`, `missionLink=/executions/<executionRunId>`, `missionState=running`, and no longer writes new scheduled-job ids for normal launches.
- `/executions/:executionId` detail now shows dynamic phase/profile/work-item title, live progress, started/last observed/finished, latest output, final response, error/recovery guidance, stale heartbeat warning, Refresh now, Open Work Item, Open Session, and legacy Scheduled Job definition only when a `jobId` exists.
- Work Item Cockpit timeline now prefers durable `ExecutionRunRecord` data, preserves Research/Planner execution links through accepted PlanningDrafts, shows run.profile (for example `researcher`) instead of hardcoding role names, leaves Build `not_started` until actual build launch, labels old `missionJobId` fallback as `Legacy scheduled-job output`, and labels imported `cron-legacy` run rows the same way.
- Legacy Scheduled Job-backed output can be imported into durable `ExecutionRunRecord` rows with `engine: 'cron-legacy'`, `summary: Imported legacy scheduled-job evidence.`, `latestOutputText`, and terminal `finalResponse`, keeping work item `697d0059-a3ca-438e-b92c-481f39e7566b` readable without normalizing cron-backed launches as the new architecture.
- Work Item detail cockpit copy now says `No execution launched` / `Execution queued`, includes durable execution ids before legacy job ids, and labels artifacts generically as execution artifacts rather than Builder-only changed files.

## Next Builder Task

**Next:** Real Executions Runtime plan complete and implementation index now marks R1 shipped/no active plan. Ask Main/CEO for the next Hermes Workspace implementation plan/slice before starting new product work.

## Verification Rules

- Preserve all previous green gates: `pnpm vitest run`, `pnpm exec tsc --noEmit --pretty false`, `pnpm exec eslint . --max-warnings=0`, `pnpm build`.
- Live browser dogfood is mandatory; constants-only tests are insufficient.
- Handoff must be updated after each completed task or before stopping.
