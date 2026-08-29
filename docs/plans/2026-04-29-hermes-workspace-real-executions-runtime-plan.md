# Hermes Workspace — Real Executions Runtime Plan

> **For Hermes Builder:** Use `test-driven-development`, `systematic-debugging`, and the Hermes Workspace project skills. Implement task-by-task. Update `docs/handoff/current-slice-status.md` after each completed task.

**Goal:** Replace the current Scheduled Jobs-backed work-item execution illusion with first-class, clickable, real-time `/executions` runs that show live progress, logs, status, artifacts, final results, and failures.

**CEO correction:** D3n13r asked for `/executions`, not for executions to be implemented as one-shot Scheduled Jobs. Scheduled Jobs are reusable/cron definitions only. Work-item executions must be real runs/attempts that users can click, inspect while running, and review after completion.

**Architecture:** Keep Scheduled Jobs (`/jobs`) as schedule definitions. Add/finish a distinct immediate execution pipeline for Work Items: launch creates an `ExecutionRunRecord` first, starts an immediate tracked process/session, streams/polls progress into the run record, and `/executions/:executionId` renders the live trace and final output. Cron-backed launch can remain as legacy fallback only behind explicit naming and tests that prevent it from being the normal Work Item path.

**Tech Stack:** TanStack Start / React / TypeScript, file-backed JSON stores, Hermes gateway/session APIs, existing `execution-runs-store`, Work Item server routes, existing `/executions` UI.

---

## Non-negotiables

1. **Do not route normal Work Item launches through Scheduled Jobs.** No `createHermesJob(... schedule: nowPlusSecondsIso(5))` for Work Item execution as the primary path.
2. **`/jobs` is Scheduled Jobs only.** No user-facing work-item execution trace should land on `/jobs?jobId=...`.
3. **`/executions` is real runs.** It must show live/running state, heartbeat/progress, session/log/output evidence, final response, artifacts, and error details.
4. **One operator intent, one button.** Rough idea planning uses one visible CTA: `Prepare Idea with Researcher`.
5. **No fake timeline rows.** A Research run must not show Builder scheduled; Build must remain `not_started` until actual build launch.
6. **Preserve PATCH partial-update safety.** Do not include `undefined` keys that wipe arrays.
7. **Live dogfood required.** Unit tests are not enough; verify by launching a real Family Command Center ABACUS idea/run and clicking `/executions/:id`.

---

## Current problem state

The current code has two concepts that were blurred:

- `Scheduled Jobs` — durable cron/job definitions, surfaced under `/jobs`.
- `Executions` — intended run traces, surfaced under `/executions`.

Bad current/legacy behavior to remove from the main path:

- `src/server/conductor-launch.ts` creates Hermes jobs with `schedule: nowPlusSecondsIso(5)`.
- Work Item launch uses that path, so a user action creates a Scheduled Job definition even for an immediate execution.
- UI then tries to reinterpret this as an execution using local output fallback.
- The user cannot reliably click a row and see real-time progress/details.

Existing useful seams to build on:

- `src/server/execution-runs-store.ts`
- `src/routes/api/work-items.$workItemId.execution-runs.ts`
- `src/server/work-item-run-timeline.ts`
- `src/screens/executions/executions-screen.tsx`
- `src/screens/executions/execution-detail-screen.tsx`
- `src/routes/executions.tsx`, `src/routes/executions.$executionId.tsx`
- `src/server/work-item-execution.ts`
- `src/server/work-item-launch.ts`
- `src/server/work-item-planning.ts`
- `src/screens/projects/work-item-detail-screen.tsx`

---

## Desired user story

As D3n13r, when I create a rough idea/work item and click **Prepare Idea with Researcher**:

1. The work item starts a real immediate execution run.
2. I am taken to or can click an `/executions/<executionId>` trace.
3. The trace shows:
   - status: queued/running/succeeded/failed/stale;
   - phase/profile: Researcher/Builder/Reviewer/etc.;
   - timestamps and heartbeat;
   - live/session output or latest known progress;
   - final response when done;
   - artifacts and plan/result paths;
   - errors/recovery guidance when failed.
4. The Work Item cockpit updates without me guessing whether a Scheduled Job ran.
5. `/jobs` is not part of this flow unless I intentionally created a reusable scheduled job.

---

## Data model target

Extend `ExecutionRunRecord` if fields are missing. Use the existing store conventions.

Likely fields:

```ts
type ExecutionRunRecord = {
  id: string
  workItemId?: string
  projectId?: string
  role: 'planner' | 'builder' | 'reviewer' | 'deployer' | 'mission' | 'supervisor'
  phase?: 'research' | 'build' | 'review' | 'deploy'
  engine: 'hermes-session' | 'conductor' | 'cron-legacy'
  state: 'queued' | 'scheduled' | 'running' | 'succeeded' | 'failed' | 'stale' | 'unknown'
  profile?: string
  sessionKey?: string
  sessionKeyPrefix?: string
  startedAt?: string
  lastObservedAt: string
  finishedAt?: string
  summary?: string
  latestOutputText?: string
  finalResponse?: string
  error?: string
  artifactPaths: string[]
  createdAt: string
  updatedAt: string
}
```

Use `cron-legacy` only for old records or explicit scheduled-job integration. New Work Item actions should use `hermes-session`/immediate execution semantics.

---

## Task 1 — Lock terminology and routing with RED tests

**Objective:** Ensure Work Item execution links never point to Scheduled Jobs and rough idea planning uses one CTA.

**Files:**
- Modify tests: `src/screens/projects/work-item-detail-screen.test.ts`
- Modify tests: `src/server/work-item-execution.test.ts`
- Modify tests: `src/server/work-item-run-timeline.test.ts`

**Steps:**

1. Add/extend tests asserting:
   - `buildMissionLink('abc')` or equivalent Work Item link resolves to `/executions?jobId=abc` or `/executions/<executionId>`, never `/jobs?jobId=abc`.
   - `getAvailableWorkItemLifecycleActions({ status:'inbox', phase:'research' })` does not include `send_to_planning`.
   - `getWorkItemPrimaryLaunchLabel({ status:'inbox', phase:'research' }) === 'Prepare Idea with Researcher'`.
   - A research mission fallback affects only the research row, not the build row.

2. Run:

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts src/server/work-item-execution.test.ts src/server/work-item-run-timeline.test.ts -- --runInBand
```

Expected: FAIL before implementation if any regression exists; PASS after hotfix remains intact.

---

## Task 2 — Introduce an immediate execution launch seam

**Objective:** Create a server helper that launches an immediate execution run without creating a Scheduled Job definition.

**Files:**
- Create or modify: `src/server/immediate-execution-launch.ts`
- Test: `src/server/immediate-execution-launch.test.ts`
- Modify if needed: `src/server/execution-runs-store.ts`

**Design:**

Add a helper with a narrow contract:

```ts
export type ImmediateExecutionLaunchInput = {
  projectId: string
  workItemId: string
  phase: WorkItemPhase
  role: 'planner' | 'builder' | 'reviewer' | 'deployer'
  profile?: string
  goal: string
  repoPath: string
}

export type ImmediateExecutionLaunchResult = {
  executionRunId: string
  sessionKey?: string
  state: 'queued' | 'running'
  link: string // /executions/<executionRunId>
}
```

Implementation guidance:

- Create `ExecutionRunRecord` before launch with `state: 'queued'` and `engine: 'hermes-session'`.
- Start the actual Hermes work through the best available immediate/session API in this repo/gateway, not cron job creation.
- If immediate API does not exist yet, add a contained adapter that records a clear `failed` state explaining missing immediate executor. Do **not** silently fall back to Scheduled Jobs as if it were normal.
- Persist `sessionKey` as soon as available.
- Return `/executions/<executionRunId>`.

**Tests:**

- Creating a launch writes an execution run first.
- Returned link is `/executions/<executionRunId>`.
- No call to cron job creation is made. Mock old `createHermesJob`/`launchConductorMission` and assert not called.
- Failure records `state: 'failed'` with error text visible in run record.

---

## Task 3 — Route Work Item planning/build launches through immediate executions

**Objective:** Make Work Item primary actions use real executions.

**Files:**
- Modify: `src/server/work-item-planning.ts`
- Modify: `src/server/work-item-launch.ts`
- Modify: `src/routes/api/work-items.$workItemId.prepare.ts`
- Modify: `src/routes/api/work-items.$workItemId.launch.ts`
- Tests:
  - `src/server/work-item-planning.test.ts`
  - `src/server/work-item-launch.test.ts`
  - add new focused tests if needed

**Rules:**

- `prepareWorkItemWithPlanner(...)` should create a PlanningDraft and an immediate execution run linked to that draft.
- `launchWorkItemIntoConductor(...)` should create an immediate execution run for Build/Review/Deploy, not a Scheduled Job.
- Persist on work item:
  - `missionId` may temporarily mirror `executionRunId` for compatibility;
  - prefer adding explicit `executionRunId` / `executionLink` if the model supports it;
  - `missionLink` must point to `/executions/<executionRunId>` or `/executions?jobId=...` only for legacy.
- History notes should say `Execution started`, not `Scheduled job created`.

**Tests:**

- Prepare rough idea creates exactly one planner draft and one execution run.
- Work item cockpit link points to `/executions/<id>`.
- No Scheduled Job appears in `/api/hermes-jobs` because of Work Item launch.
- Failed launch leaves visible failed execution record.

---

## Task 4 — Make `/executions/:executionId` a real live trace

**Objective:** Make the execution detail page useful while running and after completion.

**Files:**
- Modify: `src/screens/executions/execution-detail-screen.tsx`
- Modify: `src/routes/executions.$executionId.tsx`
- Modify/add API route if missing: `src/routes/api/executions.$executionId.ts`
- Modify: `src/lib/executions-api.ts` or equivalent
- Tests: `src/screens/executions/execution-detail-screen.test.ts`

**UI requirements:**

The detail page must show first-screen operator value:

- Title: phase/profile/work item title.
- Status badge: queued/running/succeeded/failed/stale.
- Live progress card:
  - started/last observed/finished;
  - current session key if any;
  - latest output excerpt;
  - final response when completed;
  - error when failed.
- Buttons:
  - `Refresh now`;
  - `Open Work Item` when work item id exists;
  - `Open Session` when session key exists.
- Artifacts/results:
  - plan file paths;
  - output report paths;
  - branch/PR/test evidence for build.

**Real-time/polling:**

- Poll active executions every 2-5 seconds.
- Stop/reduce polling when terminal.
- Show `Last updated X seconds ago`.
- If no heartbeat for threshold, show stale warning.

**Tests:**

- Running run renders live progress and refresh copy.
- Succeeded run renders final response/artifacts.
- Failed run renders error and recovery guidance.
- Work item link and session link are clickable when fields exist.

---

## Task 5 — Update Work Item Cockpit to consume real execution runs

**Objective:** Work Item detail should summarize real execution records, not Scheduled Job state.

**Files:**
- Modify: `src/server/work-item-run-timeline.ts`
- Modify: `src/server/work-item-execution.ts`
- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Tests:
  - `src/server/work-item-run-timeline.test.ts`
  - `src/server/work-item-execution.test.ts`
  - `src/screens/projects/work-item-detail-screen.test.ts`

**Requirements:**

- Timeline rows derive from `ExecutionRunRecord` first.
- Legacy cron/job fallback is explicitly labeled `Legacy scheduled-job output` and never shown as normal for new runs.
- Research success should produce Research row `succeeded`, Build row `not_started`.
- Build success should transition to Review only with structured build evidence.
- Planning draft status should connect to the execution run that generated it.

---

## Task 6 — Migration/compatibility for existing Scheduled Job-backed runs

**Objective:** Keep old evidence readable without pretending it is the correct architecture.

**Files:**
- Modify: `src/server/work-item-execution.ts`
- Modify: `src/server/work-item-run-timeline.ts`
- Tests: add legacy fallback cases

**Requirements:**

- Existing work item `697d0059-a3ca-438e-b92c-481f39e7566b` should remain readable.
- Its legacy cron output should appear as imported/legacy execution evidence.
- UI copy should make clear it was a legacy scheduled-job-backed run.
- Future launches must not create new scheduled-job-backed runs by default.

---

## Task 7 — Live dogfood acceptance gauntlet

**Objective:** Prove the fix with a real rough idea and clickable execution trace.

**Procedure:**

1. Ensure service is running:

```bash
pnpm test src/server/immediate-execution-launch.test.ts src/server/work-item-launch.test.ts src/server/work-item-planning.test.ts src/server/work-item-run-timeline.test.ts src/screens/executions/execution-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

2. Create or use a fresh real Family Command Center ABACUS idea work item.

3. Browser verify:
   - Work Item detail shows one primary CTA: `Prepare Idea with Researcher`.
   - Clicking it creates an `/executions/<executionId>` run.
   - `/executions/<executionId>` is clickable and shows live status.
   - During run: status/progress/last observed updates.
   - After run: final response/result/artifacts are visible.
   - `/jobs` does not receive a new Work Item execution entry.

4. API verify:

```bash
curl -sS http://127.0.0.1:3456/api/work-items/<id>?syncExecution=true
curl -sS http://127.0.0.1:3456/api/work-items/<id>/execution-runs
curl -sS http://127.0.0.1:3456/api/executions/<executionRunId>
```

5. Write evidence report under:

```text
dogfood-output/real-executions-runtime-final-latest.md
dogfood-output/real-executions-runtime-final-<timestamp>.md
```

Report must include screenshots/paths, exact work item id, execution id, statuses observed, output/artifact evidence, and whether any Scheduled Job was created.

---

## Final verification commands

```bash
pnpm test src/server/immediate-execution-launch.test.ts src/server/work-item-launch.test.ts src/server/work-item-planning.test.ts src/server/work-item-run-timeline.test.ts src/server/work-item-execution.test.ts src/screens/executions/execution-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand
pnpm vitest run
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Then live browser dogfood is mandatory.

---

## Definition of done

This plan is complete only when:

- Work Item execution launch path no longer creates Scheduled Jobs by default.
- `/executions/:executionId` shows clickable, real-time, useful run details.
- Finished executions show final response/results/artifacts/errors.
- Work Item cockpit links point to real execution detail pages.
- Legacy scheduled-job-backed runs remain readable but clearly marked legacy.
- Real Family Command Center ABACUS dogfood proves the full path.
- Handoff/index are updated with final verdict and evidence report path.

---

## Builder prompt

Use this exact prompt for Builder:

```text
Proceed on Hermes Workspace real executions runtime.

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Read first:
1. docs/handoff/current-slice-status.md
2. docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md
3. docs/plans/2026-04-29-hermes-workspace-real-executions-runtime-plan.md

Owner correction: /executions must be real clickable live execution traces/results, not Scheduled Jobs or cron definitions. Scheduled Jobs are reusable/cron definitions only.

Implement task-by-task with TDD. Update docs/handoff/current-slice-status.md after each completed task. Do not stop until tests/build/service/live dogfood evidence are recorded or you hit a hard blocker with exact evidence.
```
