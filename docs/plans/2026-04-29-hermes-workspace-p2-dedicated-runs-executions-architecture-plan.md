# Hermes Workspace — P2 Dedicated Runs / Executions Architecture Plan

> **For Hermes:** Use `test-driven-development` for code changes where practical. Builder should implement this plan task-by-task, update `docs/handoff/current-slice-status.md` after each completed task, and stop after P2 is verified. Do not start P3 without Main/CEO updating the active handoff.

**Goal:** Stop routing work-item execution traces to the Scheduled Jobs manager by adding a dedicated operator-facing Executions surface for actual Planner/Builder/Reviewer/Merge-Healer attempts.

**Architecture:** Keep Scheduled Jobs as scheduled/repeating job definitions. Promote the existing `ExecutionRunRecord` store into the route/API/UI source for execution attempts, with a compatibility bridge from current work-item `mission*` fields and legacy `/jobs?jobId=...` links. The selected route vocabulary is **Executions** (`/executions`, `/executions/$executionId`) rather than `/runs`, because it is clearer to the operator and avoids collision with low-level run/session terminology.

**Tech Stack:** TanStack Start/React, TypeScript, TanStack Query, Vitest, existing file-backed stores under `src/server`, existing Hermes gateway jobs/session APIs only as secondary evidence providers.

---

## 0. Context and source documents

Read in this order:

1. `docs/handoff/current-slice-status.md`
2. `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
3. This plan
4. Source UX roadmap for context only: `docs/plans/2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md`
5. Recently shipped P1 plan for cockpit constraints: `docs/plans/2026-04-28-hermes-workspace-p1-work-item-cockpit-progressive-disclosure-plan.md`

This plan continues the Operator UX Clarity cycle:

| Order | Slice | Status |
|---:|---|---|
| P0 | Terminology cleanup and deep-link sanity | Shipped / Main-reviewed |
| P1 | Work Item Cockpit progressive disclosure | Shipped / Main-reviewed |
| P2 | Dedicated Runs/Executions surface | Active |
| P3 | Morning Review / overnight digest | Queued for Main/CEO architecture plan after P2 |

## 1. Main/CEO P1 review baseline

Main reviewed the P1 implementation before authorizing this plan:

- Repo remained on branch `my-hermes-workspace-dev` at baseline commit `5afe861` with uncommitted P0/P1 changes.
- Focused P1 test passed: `pnpm test src/screens/projects/work-item-detail-screen.test.ts -- --runInBand` — 1 file / 25 tests.
- Full regression passed: `pnpm vitest run` — 73 files / 473 tests.
- Build passed: `pnpm build`.
- Whitespace check passed: `git diff --check`.
- Service restarted and became active: `systemctl --user restart hermes-workspace.service && systemctl --user is-active hermes-workspace.service` returned `active`.
- Root smoke passed after readiness: `curl -fsS http://127.0.0.1:3456/` returned HTTP 200.
- Live browser/DOM P1 verification passed for work item `7a0c4615-5e2f-468c-a5cf-0c8ae53eb645`:
  - first viewport includes `Operator Summary` with status/phase, lane/execution, branch snapshot, latest evidence, attention, and recommended next action;
  - `Execution Evidence` is visible before advanced metadata;
  - `Advanced execution metadata` exists and is collapsed by default;
  - expanding it exposes execution ID, scheduled job ID, execution job name, session prefix, raw `/jobs?jobId=9c1126f62ea6` trace link, launch sessions, timestamps, and raw policy/parser fields;
  - browser console was clean.
- Current known UX debt that P2 must resolve: `Open execution trace` still points to `/jobs?jobId=...`; `/jobs?jobId=9c1126f62ea6` shows the Scheduled Jobs page and a not-found state because local Jobs currently returns zero jobs.

## 2. Terminology decisions and data model boundaries

Use this vocabulary consistently in visible UI and tests:

| Concept | Meaning | Current data seam |
|---|---|---|
| Work Item | Product unit of work and lane state source of truth | `WorkItemRecord` |
| Execution | Operator-facing attempt for a work-item phase | `ExecutionRunRecord` plus work-item fallback |
| Scheduled Job | Hermes cron/job definition | gateway jobs API and `/jobs` |
| Session | Hermes agent/chat session key | `sessionKey` / `sessionKeyPrefix` |
| Engine | The runtime that launched the attempt | `conductor`, `hermes-cron` |

Architecture decisions:

1. Use `/executions` and `/executions/$executionId` as the new product routes.
2. Keep `/jobs` only for scheduled/repeating job definitions.
3. `ExecutionRunRecord.id` is the canonical route ID when a durable run record exists.
4. Legacy work-item `missionJobId` / `missionLink` data must be bridged without renaming internal fields in this slice.
5. The bridge route may support `/executions?jobId=<jobId>&workItemId=<workItemId>` so old work-item data can land on a useful execution-trace screen even before a durable `ExecutionRunRecord` exists.
6. Do not add parallel worktrees, swarm graphs, or a separate Missions page.

## 3. Current inspected baseline

Relevant existing seams:

- Durable store: `src/server/execution-runs-store.ts`
  - record fields include `id`, `workItemId`, `projectId`, `role`, `phase`, `engine`, `jobId`, `jobName`, `runId`, `state`, `sessionKey`, `sessionKeyPrefix`, timestamps, branch/PR/artifact evidence.
- Existing work-item API: `src/routes/api/work-items.$workItemId.execution-runs.ts`
  - returns `{ workItemId, runs: listExecutionRuns({ workItemId }) }`.
- Timeline builder: `src/server/work-item-run-timeline.ts`
  - already merges execution-run records, planning drafts, approvals, merge-healer state, and mission fallback into Planner/Builder/Reviewer/Deployer rows.
  - current `WorkItemRunTimelineRow` has `jobId`, `runId`, `sessionKey`, and `link`, but does **not** expose the durable `ExecutionRunRecord.id`.
- Work-item detail UI: `src/screens/projects/work-item-detail-screen.tsx`
  - P1 now shows `Operator Summary`, `Execution Evidence`, and collapsed `Advanced execution metadata`.
  - existing trace links still point to `/jobs?jobId=...`.
- Scheduled Jobs route/screen: `src/routes/jobs.tsx`, `src/screens/jobs/jobs-screen.tsx`
  - intentionally keeps Scheduled Jobs vocabulary and temporary helper copy.

## 4. Acceptance criteria

P2 is accepted only when all are true:

1. A dedicated top-level `Executions` route exists at `/executions` and is reachable from the desktop/mobile navigation.
2. A detail route exists for a single execution at `/executions/$executionId`.
3. Work Item `Execution Evidence` and `Advanced execution metadata` trace links prefer `/executions/...`, not `/jobs?jobId=...`.
4. Legacy/fallback work items with only `missionJobId` still land on a useful `/executions?jobId=...&workItemId=...` screen instead of a Scheduled Jobs not-found page.
5. `/jobs` remains Scheduled Jobs only and its helper copy can be updated from temporary to stable language.
6. The Executions list can filter by work item, project, phase/role, state, and job/session text where data exists.
7. The Execution detail page shows operator-readable evidence:
   - work item/project context;
   - phase and actor/profile role;
   - state and timestamps;
   - job ID/job name and session key/prefix;
   - run ID when present;
   - branch, PR, artifacts, and errors;
   - direct back-links to Work Item and Scheduled Job definition as secondary actions.
8. Existing work-item lifecycle, launch/sync/recovery/approvals behavior is unchanged.
9. Focused tests cover route-link helper behavior, list/detail view-models, fallback lookup, and Scheduled Jobs copy separation.
10. Full verification includes focused tests, full regression, build, service restart/root smoke, and live browser/DOM checks for Work Item → Executions navigation.

## 5. Implementation tasks

### Task 1 — Define execution trace link/view-model helpers with RED tests

**Objective:** Make the route decision explicit and testable before touching UI.

**Files:**

- Modify: `src/server/work-item-run-timeline.ts`
- Modify: `src/server/work-item-run-timeline.test.ts`
- Create or modify: `src/screens/executions/executions-view-model.ts`
- Create: `src/screens/executions/executions-view-model.test.ts`

**Steps:**

1. Add `executionRunId?: string` to `WorkItemRunTimelineRow`.
2. In `rowFromRun`, set `executionRunId: run.id`.
3. Add/export a helper such as:

```ts
export function buildExecutionTraceHref(input: {
  executionRunId?: string
  jobId?: string
  workItemId?: string
}): string | null {
  if (input.executionRunId) return `/executions/${encodeURIComponent(input.executionRunId)}`
  if (input.jobId) {
    const params = new URLSearchParams({ jobId: input.jobId })
    if (input.workItemId) params.set('workItemId', input.workItemId)
    return `/executions?${params.toString()}`
  }
  return null
}
```

4. Add an Executions view-model helper that can parse:
   - route params: `{ executionId?: string }`;
   - search params: `jobId`, `workItemId`, `projectId`, `state`, `phase`, `q`.
5. RED tests must assert:
   - durable execution ID wins: `/executions/<id>`;
   - legacy job fallback produces `/executions?jobId=...&workItemId=...`;
   - no trace link is emitted when no execution/job data exists;
   - list filters can match job ID, session key, state, phase, work item ID.

**Verification command:**

```bash
pnpm test src/server/work-item-run-timeline.test.ts src/screens/executions/executions-view-model.test.ts -- --runInBand
```

### Task 2 — Add API routes for execution list/detail/legacy lookup

**Objective:** Give the UI a dedicated execution API without coupling it to the Scheduled Jobs gateway API.

**Files:**

- Create: `src/routes/api/execution-runs.ts`
- Create: `src/routes/api/execution-runs.$executionRunId.ts`
- Modify: `src/server/execution-runs-store.ts` only if a small lookup helper is needed.
- Create or modify tests: `src/server/execution-runs-routes.test.ts`

**Steps:**

1. Add `GET /api/execution-runs` with optional filters: `workItemId`, `projectId`, `state`, `phase`, `role`, `jobId`, `q`.
2. Add `GET /api/execution-runs/$executionRunId` returning the exact durable run or 404.
3. For `GET /api/execution-runs?jobId=...&workItemId=...`, return:
   - matching durable runs when available;
   - a clear empty/fallback payload when none exists, so the UI can still render a legacy trace landing page.
4. Preserve existing `GET /api/work-items/$workItemId/execution-runs` for current work-item consumers.
5. Tests must cover auth, filtering, exact detail lookup, 404, and legacy `jobId` no-match payload.

**Verification command:**

```bash
pnpm test src/server/execution-runs-store.test.ts src/server/execution-runs-routes.test.ts -- --runInBand
```

### Task 3 — Build `/executions` list and legacy trace landing screen

**Objective:** Create the operator-facing Executions surface where old `/jobs?jobId=...` traces should have landed.

**Files:**

- Create: `src/routes/executions.tsx`
- Create: `src/screens/executions/executions-screen.tsx`
- Create: `src/screens/executions/executions-screen.test.ts`
- Modify navigation files:
  - `src/components/workspace-shell.tsx`
  - `src/components/mobile-tab-bar.tsx`
  - `src/components/mobile-hamburger-menu.tsx`
  - optional i18n constants in `src/lib/i18n.ts`

**Steps:**

1. Add route `/executions` with page title `Executions`.
2. Screen copy should say: `Work-item execution attempts for Planner, Builder, Reviewer, and Merge-Healer.`
3. Implement a list grouped or sortable by newest observed timestamp first.
4. Render filters for state/phase and a search input for job/session/work-item text.
5. If `jobId` search param is present and no durable run matches, render a clear legacy landing state:
   - title: `Execution trace not yet recorded`
   - copy: `Scheduled job <jobId> was referenced by a work item, but no durable execution run record exists yet.`
   - include Work Item link when `workItemId` is present.
6. Add navigation label `Executions` while keeping `Scheduled Jobs` separate.
7. Tests should assert copy, filters, legacy no-match state, and no Scheduled Jobs terminology leakage except where explicitly linking to the scheduled definition.

**Verification command:**

```bash
pnpm test src/screens/executions/executions-screen.test.ts src/routes/-root-layout-state.test.ts -- --runInBand
```

### Task 4 — Build `/executions/$executionId` detail screen

**Objective:** Show one actual attempt as a trace/evidence page, not as a scheduled-job definition.

**Files:**

- Create: `src/routes/executions/$executionId.tsx`
- Create: `src/screens/executions/execution-detail-screen.tsx`
- Create: `src/screens/executions/execution-detail-screen.test.ts`

**Steps:**

1. Load `GET /api/execution-runs/$executionRunId`.
2. Render header with:
   - execution state;
   - phase and role;
   - work item/project IDs with links when available;
   - last observed / started / finished timestamps.
3. Render evidence sections:
   - Session / engine evidence (`sessionKey`, `sessionKeyPrefix`, `engine`);
   - Job definition evidence (`jobId`, `jobName`, secondary `Open Scheduled Job` link);
   - Run evidence (`runId` if present);
   - Branch/PR/artifact/error evidence.
4. Add obvious actions:
   - `Back to Work Item` when context exists;
   - `Open Scheduled Job` as secondary, never primary;
   - future placeholder `Open Session` only if a valid session route exists.
5. Tests should assert the detail screen does not call the page `Scheduled Jobs` and does not expose old `Mission Link` / `Hermes Job ID` labels.

**Verification command:**

```bash
pnpm test src/screens/executions/execution-detail-screen.test.ts -- --runInBand
```

### Task 5 — Rewire Work Item trace links away from `/jobs?jobId=...`

**Objective:** Make the Work Item Cockpit and advanced metadata use the new Executions route.

**Files:**

- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`
- Modify if needed: `src/server/work-item-run-timeline.ts`

**Steps:**

1. Replace hard-coded or helper-built `/jobs?jobId=...` trace links with `buildExecutionTraceHref(...)`.
2. Timeline rows with durable `executionRunId` should link to `/executions/$executionId`.
3. Legacy work-item mission fallback should link to `/executions?jobId=<missionJobId>&workItemId=<workItemId>`.
4. Advanced metadata may still display `Scheduled Job ID` as raw data, but the primary `Open execution trace` action must route to `/executions...`.
5. Update tests to assert:
   - `Open execution trace` href starts with `/executions`;
   - raw scheduled job ID remains available under advanced metadata;
   - P0/P1 visible vocabulary does not regress.

**Verification command:**

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts src/server/work-item-run-timeline.test.ts -- --runInBand
```

### Task 6 — Stabilize Scheduled Jobs copy after migration

**Objective:** Remove the temporary “execution traces may link here” language once traces land in Executions.

**Files:**

- Modify: `src/screens/jobs/jobs-screen.tsx`
- Modify: `src/screens/jobs/jobs-screen.test.ts`
- Optional: `src/routes/jobs.tsx`

**Steps:**

1. Change the Scheduled Jobs helper copy to stable language, for example:

```ts
export const JOBS_SCREEN_HELP_COPY =
  'Scheduled/repeating job definitions. Work-item execution attempts live in Executions.'
```

2. Keep `jobId` query support temporarily as a defensive fallback, but the not-found state should point users to `/executions?jobId=...`.
3. Tests must assert Scheduled Jobs remains distinct from Executions.

**Verification command:**

```bash
pnpm test src/screens/jobs/jobs-screen.test.ts -- --runInBand
```

### Task 7 — Full regression and live Work Item → Executions verification

**Objective:** Prove P2 solved the confusing trace destination without breaking scheduled-job management or work-item controls.

**Required commands:**

```bash
pnpm test src/screens/executions/executions-view-model.test.ts src/screens/executions/executions-screen.test.ts src/screens/executions/execution-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts src/screens/jobs/jobs-screen.test.ts src/server/work-item-run-timeline.test.ts src/server/execution-runs-routes.test.ts -- --runInBand
pnpm vitest run
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-smoke.html
```

**Live verification:**

Use browser/DOM verification, not constants alone:

1. Open the known work item:
   `http://127.0.0.1:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906/work-items/7a0c4615-5e2f-468c-a5cf-0c8ae53eb645`.
2. Confirm `Operator Summary`, `Execution Evidence`, and collapsed `Advanced execution metadata` still render.
3. Confirm every `Open execution trace` link has an `/executions...` href, not `/jobs?jobId=...`.
4. Click `Open execution trace` and confirm it lands on `/executions` or `/executions/$executionId` with execution-focused copy.
5. Confirm `/executions?jobId=9c1126f62ea6&workItemId=7a0c4615-5e2f-468c-a5cf-0c8ae53eb645` renders a useful execution landing state even when no durable run exists.
6. Confirm `/jobs` still renders Scheduled Jobs and no longer claims work-item execution traces belong there.
7. Confirm P0-banned labels do not return in key surfaces: `Mission Link`, `Hermes Job ID`, `Failed missions`, `Running missions`.
8. Check browser console for JS/network errors.

**Handoff update after P2:**

When P2 is done, update `docs/handoff/current-slice-status.md` with:

- P2 implemented and verified evidence;
- exact commands run and result;
- live Work Item → Executions navigation evidence;
- explicit next step: **Main/CEO review P2 and create the P3 Morning Review / overnight digest architecture plan**.

Do not set P3 as active from Builder. Main/CEO will prepare P3 after review.

## 6. Risks and guardrails

- **Risk:** The product gains another page but still cannot find legacy traces. Guardrail: `/executions?jobId=...&workItemId=...` must render a useful no-record/fallback state and link back to the work item.
- **Risk:** Confusing Scheduled Job vs Execution terminology returns. Guardrail: visible labels and tests must keep `Scheduled Jobs` for definitions and `Executions` for work-item attempts.
- **Risk:** Overbuilding a run theater. Guardrail: no streaming terminal, no tool-call graph, no swarm map in P2. Keep it list/detail/evidence only.
- **Risk:** Breaking current work-item controls. Guardrail: do not change lifecycle, launch/sync, approvals, recovery, or store mutation semantics.
- **Risk:** Route generation/build drift. Guardrail: run `pnpm build` and inspect generated route artifacts if TanStack route generation changes tracked files.
- **Risk:** PATCH update safety regression. Guardrail: avoid touching `src/routes/api/work-items.$workItemId.ts`; if touched, verify conditional payload construction still preserves `acceptanceCriteria` and arrays.

## 7. Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, then this active plan, and implement Task 1 first.
