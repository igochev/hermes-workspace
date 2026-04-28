# Hermes Workspace — P0 Terminology Cleanup and Deep-Link Sanity Implementation Plan

> **For Hermes:** Use `test-driven-development` for code changes where practical. Builder should implement this plan task-by-task, update `docs/handoff/current-slice-status.md` after each completed task, and stop after P0 is verified. Do not start P1/P2/P3 without Main/CEO updating the active handoff.

**Goal:** Remove the immediate Mission Control UX confusion between scheduled jobs, work-item execution jobs, runs, and mission vocabulary without changing backend execution behavior.

**Architecture:** This is a bounded UX clarity slice. Keep internal `mission*` persistence fields unless a small display adapter/helper avoids repeated label strings. Change user-facing copy and deep-link behavior only. `/jobs` remains the scheduled-job manager, but `/jobs?jobId=<id>` must become a sane temporary execution-trace landing path until a dedicated Runs/Executions surface exists.

**Tech Stack:** TanStack Start/React, TypeScript, TanStack Query, Vitest, existing Hermes Workspace file-backed APIs.

---

## 0. Context and source documents

Read in this order:

1. `docs/handoff/current-slice-status.md`
2. `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
3. This plan
4. Source UX roadmap for P0/P1/P2/P3 context only: `docs/plans/2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md`

This plan starts the Operator UX Clarity cycle:

| Order | Slice | Status |
|---:|---|---|
| P0 | Terminology cleanup and deep-link sanity | Active |
| P1 | Work Item Cockpit progressive disclosure | Queued for Main/CEO detailed plan after P0 review |
| P2 | Dedicated Runs/Executions surface | Queued for Main/CEO architecture plan after P1 |
| P3 | Morning Review / overnight operator digest | Queued for Main/CEO architecture plan after P2 |

## 1. Non-negotiables

1. Preserve existing backend/store fields for this slice. Do **not** rename `missionId`, `missionJobId`, `missionLink`, `missionState`, etc. internally.
2. Preserve existing launch/orchestrator behavior. This slice changes labels, helper copy, and `/jobs?jobId=...` landing behavior only.
3. Preserve PATCH partial-update safety; never include undefined fields in API update payloads.
4. Do not introduce a new `/runs` or `/executions` route in P0. That is P2.
5. Do not move raw IDs out of the Work Item summary into a collapsed advanced section in P0 unless it is trivial and well-tested. That is P1.
6. User-facing vocabulary should prefer:
   - **Scheduled Job** for `/jobs` definitions.
   - **Execution** / **Execution Trace** for work-item launched jobs or evidence links.
   - **Run** for a single invocation/attempt when actual run data is shown.
7. Constants-only tests are not enough for final acceptance. Builder must live verify the actual UI/DOM after build/restart.

## 2. Current inspected baseline

Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
Branch: `my-hermes-workspace-dev`
Baseline commit when Main created this plan: `d3026c4`

Observed gaps:

- `src/screens/jobs/jobs-screen.tsx` heading still says `Jobs`, add button says `New Job`, placeholder says `Search jobs...`, and no code reads `jobId` from URL search params.
- `src/screens/projects/work-item-detail-screen.tsx` still exposes `Mission Control Summary`, `Mission ID`, `Hermes Job ID`, `Mission Link`, `Mission State`, `Mission Last Run`, and `Mission Last Error` in the main summary.
- `src/screens/dashboard/dashboard-screen.tsx` still exposes `Failed missions` and `Running missions` labels.
- `src/server/work-item-notification-digest.ts` still has internal comment/copy around failed missions; only change if user-facing digest text contains “mission” in rendered output/tests.

Likely files:

- `src/screens/jobs/jobs-screen.tsx`
- `src/screens/jobs/jobs-screen.test.tsx` or `.test.ts` — create if no existing Jobs screen test exists
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.test.ts`
- `src/screens/dashboard/dashboard-screen.tsx`
- `src/screens/dashboard/dashboard-screen.test.ts`
- Optional: `src/components/mobile-tab-bar.tsx`, `src/components/mobile-hamburger-menu.tsx`, `src/screens/chat/components/chat-sidebar.tsx`, `src/lib/i18n.ts` if visible navigation copy still says bare `Jobs`
- `docs/handoff/current-slice-status.md`

## 3. Acceptance criteria

P0 is accepted only when all are true:

1. Main Mission Control surfaces no longer use visible labels `Mission Link`, `Hermes Job ID`, `Mission State`, `Mission Last Run`, `Mission Last Error`, `Failed missions`, or `Running missions`.
2. Work Item detail uses execution vocabulary:
   - `Mission Control Summary` → `Execution Summary` or `Operator Summary`.
   - `Mission ID` → `Execution ID` or `Execution record ID`.
   - `Hermes Job ID` → `Scheduled Job ID` or `Execution Job ID`.
   - `Hermes Job Name` → `Execution Job Name`.
   - `Session Prefix` → `Execution Session Prefix`.
   - `Mission Link` → `Execution Trace`.
   - `Mission State` → `Execution State`.
   - `Mission Last Run` → `Last Execution`.
   - `Mission Last Error` → `Execution Error`.
3. Jobs page clearly labels itself as `Scheduled Jobs` and includes helper copy similar to:
   > Scheduled/repeating jobs. Work-item execution traces may link here until a dedicated Runs view exists.
4. `/jobs?jobId=<known-id>` filters or highlights the matching job, expands its run/output area, and shows clear copy that the page was opened from an execution trace.
5. `/jobs?jobId=<missing-id>` shows a precise not-found message for that id, not a generic empty state.
6. Normal free-text search continues to search job name and prompt. If practical, also match job id.
7. Tests cover constants/helper behavior and the `jobId` deep-link behavior.
8. Final verification includes targeted tests, `pnpm build`, service restart, root smoke, and browser/DOM checks for Jobs and Work Item detail.

## 4. Implementation tasks

### Task 1 — Add visible copy constants and baseline tests for terminology

**Objective:** Make the expected P0 vocabulary explicit so future changes do not regress back to ambiguous Mission/Job labels.

**Files:**

- Modify: `src/screens/jobs/jobs-screen.tsx`
- Create or modify: `src/screens/jobs/jobs-screen.test.tsx` or `src/screens/jobs/jobs-screen.test.ts`
- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`
- Modify: `src/screens/dashboard/dashboard-screen.tsx`
- Modify: `src/screens/dashboard/dashboard-screen.test.ts`

**Steps:**

1. Add/export constants for Jobs page copy in `jobs-screen.tsx`, for example:
   - `JOBS_SCREEN_TITLE = 'Scheduled Jobs'`
   - `JOBS_SCREEN_HELP_COPY = 'Scheduled/repeating jobs. Work-item execution traces may link here until a dedicated Runs view exists.'`
   - `JOBS_SCREEN_NEW_JOB_LABEL = 'New Scheduled Job'`
   - `JOBS_SCREEN_SEARCH_PLACEHOLDER = 'Search scheduled jobs...'`
2. Add/export constants for Work Item detail display labels in `work-item-detail-screen.tsx`, for example:
   - `WORK_ITEM_EXECUTION_SUMMARY_TITLE = 'Execution Summary'` or `Operator Summary` if Builder confirms it reads better in the UI.
   - `WORK_ITEM_EXECUTION_TRACE_LABEL = 'Execution Trace'`
   - `WORK_ITEM_EXECUTION_STATE_LABEL = 'Execution State'`
   - `WORK_ITEM_LAST_EXECUTION_LABEL = 'Last Execution'`
   - `WORK_ITEM_EXECUTION_ERROR_LABEL = 'Execution Error'`
3. Change dashboard label constants from `Failed missions` / `Running missions` to `Failed executions` / `Running executions`.
4. Write/update tests that assert the exported constants and audit descriptors use the new labels.
5. Run focused tests and confirm they fail before implementation if using TDD changes first, then pass after labels are updated.

**Verification commands:**

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts src/screens/dashboard/dashboard-screen.test.ts -- --runInBand
```

If a new Jobs screen test is created, include it:

```bash
pnpm test src/screens/jobs/jobs-screen.test.tsx src/screens/projects/work-item-detail-screen.test.ts src/screens/dashboard/dashboard-screen.test.ts -- --runInBand
```

### Task 2 — Implement `/jobs?jobId=...` deep-link behavior

**Objective:** Make temporary execution links into `/jobs` useful instead of ambiguous raw strings.

**Files:**

- Modify: `src/screens/jobs/jobs-screen.tsx`
- Create/modify: `src/screens/jobs/jobs-screen.test.tsx` or `.test.ts`

**Expected behavior:**

1. Parse `jobId` from the current browser URL. Use the repo’s existing router/location pattern if one exists; otherwise, a guarded client-side read from `window.location.search` is acceptable because this file is already `'use client'`.
2. If `jobId` is present:
   - exact-match `job.id === jobId`;
   - show a small banner/copy: `Opened execution trace for scheduled job <jobId>` or similar;
   - filter the list down to the matching job or at minimum sort/highlight it first;
   - automatically expand that job card so run history/output is visible;
   - if no job matches after loading, show: `No scheduled job found for execution trace <jobId>`.
3. If free-text search is also present, do not let it hide the deep-linked job. Prefer `jobId` as the primary filter and let the search box show the id or stay empty with a banner.
4. Add visible styling for the highlighted job card. Keep it accessible via text/border/title; do not rely on color only.

**Implementation hint:**

Refactor `JobCard` props to accept:

```ts
isHighlighted?: boolean
initialExpanded?: boolean
highlightReason?: string
```

Then initialize expanded state from `initialExpanded` and keep it in sync if the deep-linked id changes:

```ts
const [expanded, setExpanded] = useState(initialExpanded ?? false)
useEffect(() => {
  if (initialExpanded) setExpanded(true)
}, [initialExpanded])
```

Remember to import `useEffect` if needed.

**Testing guidance:**

If rendering the full `JobsScreen` is awkward because of TanStack Query/motion dependencies, extract pure helpers and test them:

```ts
export function getJobsScreenDeepLinkJobId(search: string): string | null
export function buildScheduledJobsViewModel(jobs: Array<HermesJob>, options: { search: string; jobId: string | null }): { filteredJobs: Array<HermesJob>; matchedJobId: string | null; missingJobId: string | null }
```

Test cases:

- no `jobId`, no search → all jobs;
- search text matches name/prompt/id → filtered jobs;
- `jobId` matches → only/highlight that job and `matchedJobId` set;
- `jobId` missing → empty jobs and `missingJobId` set;
- `jobId` present plus search that does not match → jobId still wins.

**Verification command:**

```bash
pnpm test src/screens/jobs/jobs-screen.test.tsx -- --runInBand
```

Adjust extension to `.test.ts` if Builder creates a pure helper test instead.

### Task 3 — Rename visible Work Item execution labels without changing model fields

**Objective:** Keep internal model compatibility while making the Work Item page read like an operator cockpit rather than a database record.

**Files:**

- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`

**Steps:**

1. Replace panel/audit descriptor `Mission Control Summary` with `Execution Summary` or `Operator Summary`.
2. Replace displayed labels:
   - `Mission ID` → `Execution ID`
   - `Hermes Job ID` → `Execution Job ID` or `Scheduled Job ID`; choose one and keep consistent with Jobs helper copy.
   - `Hermes Job Name` → `Execution Job Name`
   - `Session Prefix` → `Execution Session Prefix`
   - `Mission Link` → `Execution Trace`
   - `Mission State` → `Execution State`
   - `Mission Last Run` → `Last Execution`
   - `Mission Last Error` → `Execution Error`
3. If the `missionLink` value looks like `/jobs?jobId=...`, render it as an actionable link/button labelled `Open execution trace` rather than only raw text, while preserving the raw href in the value or title if useful.
4. Keep `workItem.mission*` field access unchanged.
5. Update tests/audit descriptors to match new visible labels.

**Verification command:**

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts -- --runInBand
```

### Task 4 — Rename dashboard and navigation copy where visible

**Objective:** Remove the most prominent remaining `missions` language from high-level Mission Control surfaces.

**Files:**

- Modify: `src/screens/dashboard/dashboard-screen.tsx`
- Modify: `src/screens/dashboard/dashboard-screen.test.ts`
- Inspect/modify if needed:
  - `src/lib/i18n.ts`
  - `src/components/mobile-tab-bar.tsx`
  - `src/components/mobile-hamburger-menu.tsx`
  - `src/screens/chat/components/chat-sidebar.tsx`
  - `src/screens/agents/components/operations-agent-jobs.tsx`

**Steps:**

1. Change dashboard summary labels:
   - `Failed missions` → `Failed executions`
   - `Running missions` → `Running executions`
2. Search visible UI files for bare `/jobs` labels. Rename to `Scheduled Jobs` where space allows. Do not rename internal route ids or API names.
3. Avoid broad sweeping rename of “Mission Control” as the product concept; this P0 only removes confusing mission/job/run labels on execution details and dashboard metrics.
4. Update focused tests.

**Verification commands:**

```bash
pnpm test src/screens/dashboard/dashboard-screen.test.ts -- --runInBand
```

Search checks:

```bash
rg "Mission Link|Hermes Job ID|Mission State|Mission Last Run|Mission Last Error|Failed missions|Running missions" src/screens src/components src/lib
```

Expected: no user-facing occurrences in key Mission Control surfaces. If test fixture strings remain, document why or rename them too.

### Task 5 — Full functional verification and handoff update

**Objective:** Prove the slice is safe and prepare Main/CEO for P1 planning.

**Files:**

- Modify: `docs/handoff/current-slice-status.md`
- Optional report: `dogfood-output/p0-terminology-deeplink-sanity-<timestamp>.md` and latest alias if Builder runs a browser gauntlet/manual report.

**Required commands:**

```bash
pnpm test src/screens/jobs/jobs-screen.test.tsx src/screens/projects/work-item-detail-screen.test.ts src/screens/dashboard/dashboard-screen.test.ts -- --runInBand
pnpm vitest run
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-root-smoke.html
```

If the Jobs screen test is `.test.ts`, adjust the first command accordingly.

**Live verification:**

Use browser/DOM verification, not constants alone:

1. Open `http://localhost:3456/jobs`.
   - Confirm title/helper copy says Scheduled Jobs.
2. Open `http://localhost:3456/jobs?jobId=<known job id>`.
   - Confirm target job is visible/highlighted/expanded.
3. Open `http://localhost:3456/jobs?jobId=missing-p0-smoke`.
   - Confirm precise not-found copy.
4. Open a Work Item detail page with execution metadata if available.
   - Confirm `Execution Trace`, `Execution State`, `Last Execution`, and no old `Mission Link` label.
5. Open dashboard.
   - Confirm `Failed executions` / `Running executions` labels.
6. Check browser console for JS/network errors.

**Handoff update after P0:**

When P0 is done, update `docs/handoff/current-slice-status.md` with:

- P0 implemented and verified evidence;
- exact commands run and result;
- live verification notes;
- explicit next step: **Main/CEO review P0 and authorize/create P1 detailed plan**.

Do not set P1 as active from Builder. Main/CEO will prepare P1/P2/P3 in sequence.

## 5. Future slice readiness notes for Main/CEO

Builder should not implement these yet, but P0 should leave the code ready for them:

### P1 — Work Item Cockpit progressive disclosure

Likely next detailed plan. It should:

- replace the dense summary with a true first-viewport Operator Summary;
- move raw IDs to collapsed `Advanced execution metadata`;
- promote branch/merge/test/PR/evidence and next action;
- keep existing recovery/sync/launch controls reachable;
- require real browser proof that first viewport answers “what is happening / what should I do next?” without scrolling.

### P2 — Dedicated Runs / Executions surface

Needs Main/CEO architecture before Builder:

- decide `/runs/:id` vs `/executions/:id` route;
- define whether the id is run id, job id, work-item phase id, or a normalized execution-attempt id;
- route Work Item timeline rows to this surface rather than `/jobs?jobId=...`;
- keep `/jobs` only for scheduled definitions.

### P3 — Morning Review / overnight operator digest

Needs Main/CEO architecture after P1/P2:

- daily summary: done / failed / parked / needs approval / merged;
- per-project lane summary;
- “open next attention item” flow;
- must be grounded in actual lane/work-item evidence, not markdown-only summaries.

## 6. Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, then this active plan, and implement Task 1 first.
