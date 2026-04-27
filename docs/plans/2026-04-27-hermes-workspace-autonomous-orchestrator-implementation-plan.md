# Hermes Workspace Autonomous Orchestrator Implementation Plan

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task. Use strict `test-driven-development`: every production behavior change needs a failing test first. Do not manually move work-item status/phase in the final E2E harness.

**Goal:** Implement a real autonomous Mission Control work-item orchestrator so creating a work item automatically launches the correct Hermes profile, ingests profile output, advances phases, launches Builder, records real run evidence, and proves the workflow with one real work item without manual status/phase moves.

**Architecture:** Add a server-side idempotent orchestrator module that reconciles work items by state, owns auto-launch decisions, ingests completed Planner/Builder outputs, and records auditable phase transitions. Reuse existing seams (`prepareWorkItemWithPlanner`, `recordPlannerOutput`, `applyPlanningDraftToWorkItem`, `launchWorkItemIntoConductor`, `syncWorkItemExecutionState`, approval helpers) instead of duplicating launch/lifecycle logic. Expose the orchestrator through a reconcile API, an optional background loop, Work Item detail run visibility, and a strict real E2E harness that forbids manual phase mutation.

**Tech Stack:** TanStack Start routes, TypeScript server helpers, file-backed stores under `~/.hermes`, Vitest, Playwright/browser smoke, Hermes cron/dashboard jobs, existing Mission Control WorkItem/Project stores.

---

## 0. Non-negotiable acceptance rules

Builder must implement this exact behavior:

1. **Create work item → workflow starts automatically**
   - A newly created `inbox/research` item must be detected by the orchestrator and auto-launch Planner/Research.
   - The tester must not call lifecycle endpoints or PATCH status/phase to force progress.

2. **Planner output is ingested**
   - Running planning drafts must be reconciled from actual Hermes cron/job output.
   - If Planner emitted valid structured JSON, `recordPlannerOutput(...)` marks the draft `structured_ready`.
   - If policy allows auto-accept, `applyPlanningDraftToWorkItem(...)` moves the same work item to `ready/build`.

3. **Ready/Build → Builder launches automatically**
   - `ready/build` work item with accepted plan must trigger `launchWorkItemIntoConductor(... phase: 'build')` automatically.
   - Launch must record job/run/session evidence.

4. **Build output drives next state**
   - A successful Builder run must update execution evidence and move work item into review via existing sync/review logic.
   - Builder output must include real candidate repo code/test changes for the final production E2E.

5. **No duplicate launches**
   - Re-running orchestrator repeatedly must not create duplicate Planner/Builder jobs for the same work item phase.
   - Launch idempotency must be proven by tests.

6. **Real-time run visibility**
   - Work item detail API/UI must expose enough state to answer: “what is each profile doing right now?”
   - At minimum expose phase timeline rows for research/build/review/deploy with job id, run id/session, state, last observed/heartbeat, output summary, artifacts, error, and next expected action.

7. **Final E2E harness forbids cheating**
   - It creates exactly one work item.
   - It calls only create + orchestrator reconcile/poll endpoints.
   - It fails if it performs any direct status/phase PATCH or lifecycle phase move.
   - It fails if candidate repo has no product-code/test diff from Builder.

---

## 1. Current implementation seams to reuse

Do not invent duplicate logic before checking these files:

- Work item create/list/update:
  - `src/routes/api/work-items.ts`
  - `src/routes/api/work-items.$workItemId.ts`
  - `src/server/work-items-store.ts`
- Planner preparation/output:
  - `src/server/work-item-planning.ts`
  - `src/server/planning-drafts-store.ts`
  - `src/routes/api/work-items.$workItemId.prepare.ts`
  - `src/routes/api/planning-drafts.$draftId.output.ts`
  - `src/routes/api/planning-drafts.$draftId.accept.ts`
- Launch/build:
  - `src/server/work-item-launch.ts`
  - `src/server/conductor-launch.ts`
  - `src/routes/api/work-items.$workItemId.launch.ts`
- Execution sync:
  - `src/server/work-item-execution.ts`
  - `src/server/work-item-supervisor.ts`
  - `src/routes/api/work-items.supervisor.reconcile.ts`
  - `src/server/execution-runs-store.ts`
  - `src/server/hermes-jobs.ts`
- Approvals/review:
  - `src/server/work-item-approvals.ts`
  - `src/server/work-item-review-decision.ts`
  - `src/routes/api/work-item-approvals.$approvalId.ts`
- UI/run visibility:
  - `src/screens/projects/work-item-detail-screen.tsx`
  - `src/lib/projects-api.ts`
  - `src/lib/work-item-execution-api.ts`
  - `src/lib/work-item-execution-runs-api.ts`

---

## 2. New architecture to implement

### 2.1 Orchestrator module

Create:

```text
src/server/work-item-orchestrator.ts
src/server/work-item-orchestrator.test.ts
src/routes/api/work-items.orchestrator.reconcile.ts
src/server/work-item-orchestrator-routes.test.ts
src/lib/work-item-orchestrator-api.ts
```

Core exported function:

```ts
export type WorkItemOrchestratorAction =
  | 'launch_planner'
  | 'ingest_planner_output'
  | 'accept_planning_draft'
  | 'launch_builder'
  | 'sync_execution'
  | 'request_review'
  | 'launch_review'
  | 'request_deploy_approval'
  | 'mark_done'
  | 'noop'

export type WorkItemOrchestratorEvent = {
  workItemId: string
  projectId: string
  action: WorkItemOrchestratorAction
  statusBefore?: string
  phaseBefore?: string
  statusAfter?: string
  phaseAfter?: string
  jobId?: string
  draftId?: string
  runId?: string
  message: string
  observedAt: string
}

export type ReconcileWorkItemAutonomyResult = {
  workItemId: string
  events: Array<WorkItemOrchestratorEvent>
  changed: boolean
  blocked?: boolean
}

export type ReconcileAllWorkItemAutonomyResult = {
  checked: number
  changed: number
  events: Array<WorkItemOrchestratorEvent>
  findings: Array<unknown>
}

export async function reconcileWorkItemAutonomy(workItemId: string): Promise<ReconcileWorkItemAutonomyResult>
export async function reconcileAllWorkItemAutonomy(): Promise<ReconcileAllWorkItemAutonomyResult>
```

### 2.2 Orchestrator decision order

For each work item, do at most one high-impact action per reconcile pass. This keeps each pass auditable and avoids surprise cascades. The poller/E2E can call repeatedly.

Decision order:

1. If terminal (`done`, `cancelled`) → `noop`.
2. If `inbox/research` and no active/running planning draft → auto-launch Planner.
3. If `inbox/research` or `active/research` and a planning draft is running → inspect job output and ingest if available.
4. If latest planning draft is `structured_ready` and auto-accept policy allows → accept draft to `ready/build`.
5. If `ready/build` and no active build mission → launch Builder via `launchWorkItemIntoConductor`.
6. If active with mission job → sync execution via `syncWorkItemExecutionState`.
7. If active/review with pending review or review job → sync/resolve review via existing review logic.
8. If active/deploy with approval policy satisfied → request/resolve deploy approval and mark done only with evidence.

### 2.3 Idempotency keys

Do not add a new durable store unless needed. Prefer existing fields and stores:

- Planner launch idempotency:
  - latest draft for work item has `status in ['requested', 'running', 'structured_ready']` → do not launch another Planner.
- Build launch idempotency:
  - work item has `missionJobId` and `missionState in ['scheduled','running','unknown']` for current `phase='build'` → do not launch another Builder.
  - `execution-runs-store` has role=`mission`, phase=`build`, state scheduled/running → do not launch another Builder.
- Review launch idempotency:
  - work item has `reviewJobId` and `reviewState in ['scheduled','running']` → do not launch another Reviewer.

### 2.4 Output ingestion source

Planner and Builder are Hermes cron jobs. The orchestrator must pull output from the actual jobs/runs, not rely on fake state.

Preferred helper additions:

```text
src/server/hermes-job-output.ts
src/server/hermes-job-output.test.ts
```

Responsibilities:

```ts
export type HermesJobOutputSnapshot = {
  jobId: string
  latestRunId?: string
  latestStatus?: string
  latestOutputText?: string
  latestOutputJson?: unknown
  latestOutputPath?: string
  latestSessionKey?: string
  lastObservedAt: string
}

export async function getLatestHermesJobOutput(jobId: string): Promise<HermesJobOutputSnapshot | null>
```

Implementation strategy:

1. First use existing `getHermesJobRuns(jobId)` from `src/server/hermes-jobs.ts`.
2. Extract from latest run fields if available:
   - `output`, `summary`, `finalResponse`, `content`, `markdown`, `rawOutput`.
3. If dashboard runs do not include output text, add a controlled fallback to read local cron output files under:
   - `~/.hermes/cron/output/<jobId>/*.md`
4. Return the newest readable output by timestamp/file name.

Do not parse arbitrary sessions as the first path. Use job/run/cron output first.

### 2.5 Auto-accept policy for planning

Initial implementation should be conservative but useful.

Add small helper in orchestrator:

```ts
function shouldAutoAcceptPlanningDraft(draft: PlanningDraftRecord, workItem: WorkItemRecord): boolean {
  return draft.status === 'structured_ready' && draft.structuredOutput?.suggestedPhase === 'build'
}
```

If suggestedPhase is `research`, leave item active/research with a clear event: `Planner requested more research; not auto-accepting`.

### 2.6 Background loop

Add optional server-side loop that can be enabled safely:

```text
src/server/work-item-orchestrator-loop.ts
src/server/work-item-orchestrator-loop.test.ts
```

Requirements:

- exports `startWorkItemOrchestratorLoop()` and `stopWorkItemOrchestratorLoop()`.
- idempotent: calling start twice does not start two intervals.
- interval default: 30 seconds.
- disabled in tests unless explicitly called.
- controlled by env/config:
  - `HERMES_WORKSPACE_WORK_ITEM_AUTONOMY=1`
- no unhandled promise rejections.

Wire into the server entry only if a clear app bootstrap file exists. If not obvious, create API reconcile first and leave loop opt-in documented. Do not guess a risky bootstrap import.

### 2.7 Reconcile API

Create route:

```text
src/routes/api/work-items.orchestrator.reconcile.ts
```

Path should become:

```text
POST /api/work-items/orchestrator/reconcile
POST /api/work-items/orchestrator/reconcile?workItemId=<id>
```

Payload:

```json
{
  "dryRun": false,
  "maxItems": 20
}
```

Response:

```json
{
  "checked": 1,
  "changed": 1,
  "events": [ ... ],
  "findings": []
}
```

This is not a manual phase move. It is the orchestrator trigger/poll endpoint used by the E2E harness and optional UI.

---

## 3. Work Item real-time execution visibility

This plan focuses first on backend orchestration, but Builder must include enough visibility for operator trust.

### 3.1 Server view model

Create:

```text
src/server/work-item-run-timeline.ts
src/server/work-item-run-timeline.test.ts
```

Export:

```ts
export type WorkItemRunTimelinePhase = 'research' | 'build' | 'review' | 'deploy'
export type WorkItemRunTimelineState =
  | 'not_started'
  | 'scheduled'
  | 'running'
  | 'output_ready'
  | 'succeeded'
  | 'failed'
  | 'stale'
  | 'waiting_for_approval'
  | 'unknown'

export type WorkItemRunTimelineRow = {
  phase: WorkItemRunTimelinePhase
  profile?: string
  state: WorkItemRunTimelineState
  jobId?: string
  jobName?: string
  runId?: string
  sessionKey?: string
  sessionKeyPrefix?: string
  link?: string
  lastObservedAt?: string
  heartbeatLabel: string
  summary: string
  artifactPaths: Array<string>
  branchName?: string
  prUrl?: string
  error?: string
  nextExpectedAction: string
}

export function buildWorkItemRunTimeline(workItem: WorkItemRecord): Array<WorkItemRunTimelineRow>
```

Use:

- `workItem.missionJobId`, `missionJobName`, `missionState`, `missionLink`, `missionLastRunAt`, `missionLastError`
- `workItem.reviewJobId`, `reviewState`
- `listExecutionRuns({ workItemId })`
- `getLatestPlanningDraftForWorkItem(workItem.id)`
- `listWorkItemApprovals(workItem.id)`

### 3.2 API payload enrichment

Modify `src/routes/api/work-items.$workItemId.ts` to include:

```ts
runTimeline: buildWorkItemRunTimeline(workItem)
orchestration?: latest orchestrator events if persisted/available
```

If no event persistence is added, timeline is enough for first slice.

### 3.3 UI first slice

Modify `src/screens/projects/work-item-detail-screen.tsx`:

- Add section title: `Runs / Agents`.
- Render four timeline rows: Research, Build, Review, Deploy.
- Each row shows:
  - phase/profile
  - precise state label
  - heartbeat/last observed
  - job/session id short text
  - summary
  - link button if `link` or `sessionKey` exists
  - error text if present
- Use theme tokens, no hard-coded `bg-white` dark-mode regressions.

Add pure helper tests to existing:

```text
src/screens/projects/work-item-detail-screen.test.ts
```

At minimum test that section constants/labels exist and state copy is honest:

- `No job launched`
- `Planner output waiting for ingestion`
- `Builder changed files` / `No code evidence yet`
- `Stuck: no heartbeat` if stale

---

## 4. Detailed implementation tasks

### Task 1: Add Hermes job output reader tests

**Objective:** Prove the system can read actual latest job output from a cron output directory or run payload.

**Files:**
- Create: `src/server/hermes-job-output.ts`
- Create: `src/server/hermes-job-output.test.ts`

**Step 1: Write failing test**

Add tests that:

1. creates temp `HERMES_HOME`, writes:
   - `.hermes/cron/output/job-123/2026-04-27_17-29-03.md`
2. calls `getLatestLocalCronOutput('job-123')` or exported `getLatestHermesJobOutput('job-123')` with mocked `getHermesJobRuns` returning empty.
3. expects latest output text to contain structured JSON.

Also test newest file wins if two files exist.

**Step 2: Run RED**

```bash
pnpm test src/server/hermes-job-output.test.ts
```

Expected: FAIL because module does not exist.

**Step 3: Implement minimal helper**

Implementation notes:

- `getHermesHome()` must respect `process.env.HERMES_HOME`.
- Use `fs.readdirSync` / `fs.statSync` sorted by name or mtime descending.
- Do not throw if folder missing; return `null`.
- Export a small local-output helper if useful for tests.

**Step 4: Verify GREEN**

```bash
pnpm test src/server/hermes-job-output.test.ts
```

Expected: PASS.

---

### Task 2: Add planner-output ingestion tests in orchestrator

**Objective:** A running planning draft with completed Planner output is ingested to `structured_ready`.

**Files:**
- Create: `src/server/work-item-orchestrator.ts`
- Create: `src/server/work-item-orchestrator.test.ts`

**Step 1: Write failing tests**

Test scenario:

1. temp `HERMES_HOME`.
2. create project.
3. create work item `active/research`.
4. create planning draft:
   - `status: 'running'`
   - `plannerJobId: 'job-planner-1'`
5. mock `getLatestHermesJobOutput('job-planner-1')` to return final text with valid JSON:

```json
{
  "title": "Prepared title",
  "description": "Prepared description",
  "priority": "medium",
  "riskLevel": "low",
  "labels": ["planner"],
  "acceptanceCriteria": ["Criterion one"],
  "notes": ["Planner note"],
  "planFilePath": "docs/plans/prepared.md",
  "openQuestions": [],
  "suggestedPhase": "build"
}
```

6. call `reconcileWorkItemAutonomy(workItem.id)`.
7. expect:
   - event `ingest_planner_output`
   - latest draft status `structured_ready`
   - work item still same id

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-orchestrator.test.ts
```

Expected: FAIL because orchestrator does not exist.

**Step 3: Implement minimal orchestrator ingestion path**

Use existing:

```ts
recordPlannerOutput(draft.id, output.latestOutputText)
```

Do not yet auto-accept in this task.

**Step 4: Verify GREEN**

```bash
pnpm test src/server/work-item-orchestrator.test.ts
```

---

### Task 3: Add auto-launch Planner for new inbox/research items

**Objective:** A new inbox/research work item with no planning draft is automatically prepared via Planner exactly once.

**Files:**
- Modify: `src/server/work-item-orchestrator.ts`
- Modify: `src/server/work-item-orchestrator.test.ts`

**Step 1: Write failing tests**

Mock `prepareWorkItemWithPlanner`.

Test A:

- work item: `status='inbox'`, `phase='research'`
- no planning drafts
- call reconcile
- expect `prepareWorkItemWithPlanner(workItem.id, expect.any(Object))`
- event `launch_planner`

Test B idempotency:

- same state but existing draft `status='running'`
- call reconcile
- expect no `prepareWorkItemWithPlanner`
- event `noop` or no changed event

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-orchestrator.test.ts
```

**Step 3: Implement**

Rules:

```ts
const latestDraft = getLatestPlanningDraftForWorkItem(workItem.id)
const hasActiveDraft = latestDraft && ['requested','running','structured_ready'].includes(latestDraft.status)
if (workItem.status === 'inbox' && workItem.phase === 'research' && !hasActiveDraft) {
  await prepareWorkItemWithPlanner(workItem.id, {})
}
```

Do not change work item status manually here. `prepareWorkItemWithPlanner` appends history and creates draft. If product later wants `active/research` on planner launch, do it inside the planning helper with a test, not ad hoc in orchestrator.

**Step 4: Verify**

```bash
pnpm test src/server/work-item-orchestrator.test.ts src/server/work-item-planning.test.ts
```

---

### Task 4: Auto-accept structured Planner draft to Ready/Build

**Objective:** Structured planner output with `suggestedPhase='build'` advances the same work item to `ready/build` through the existing acceptance helper.

**Files:**
- Modify: `src/server/work-item-orchestrator.ts`
- Modify: `src/server/work-item-orchestrator.test.ts`

**Step 1: Write failing tests**

Create:

- work item `active/research` or `inbox/research`
- planning draft `structured_ready` with structuredOutput suggestedPhase `build`

Call reconcile and expect:

- event `accept_planning_draft`
- draft status `accepted`
- work item status `ready`
- work item phase `build`
- `planFilePath` persisted

Also test `suggestedPhase='research'`:

- does not accept
- event message says more research/manual review needed

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-orchestrator.test.ts
```

**Step 3: Implement**

Use existing:

```ts
applyPlanningDraftToWorkItem(draft.id)
```

Do not manually mutate fields.

**Step 4: Verify**

```bash
pnpm test src/server/work-item-orchestrator.test.ts src/server/work-item-planning.test.ts
```

---

### Task 5: Auto-launch Builder for Ready/Build items

**Objective:** A `ready/build` work item with an accepted plan launches Builder exactly once through the existing launch helper.

**Files:**
- Modify: `src/server/work-item-orchestrator.ts`
- Modify: `src/server/work-item-orchestrator.test.ts`

**Step 1: Write failing tests**

Mock `launchWorkItemIntoConductor`.

Test A:

- work item `status='ready'`, `phase='build'`, `planFilePath='docs/plans/x.md'`
- no active mission job/run
- reconcile
- expect launch called with:

```ts
launchWorkItemIntoConductor(workItem.id, expect.objectContaining({ phase: 'build' }))
```

- event `launch_builder`

Test B idempotency:

- same state but `missionJobId='job-build-1'`, `missionState='scheduled'`
- reconcile
- expect launch not called

Test C no plan:

- `ready/build`, no `planFilePath`
- no launch; event says missing plan

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-orchestrator.test.ts
```

**Step 3: Implement**

Use helper:

```ts
function hasActiveMission(workItem) {
  return Boolean(workItem.missionJobId && ['scheduled','running','unknown'].includes(workItem.missionState ?? 'unknown'))
}
```

Be careful: `unknown` with a job id can mean job resolution failed. For first slice, avoid duplicate launches and surface as stale/unknown. Do not relaunch automatically until recovery policy exists.

**Step 4: Verify**

```bash
pnpm test src/server/work-item-orchestrator.test.ts src/server/work-item-launch.test.ts
```

---

### Task 6: Integrate execution sync into orchestrator

**Objective:** Active items with mission jobs are synced by orchestrator; success/failure transitions continue using existing `syncWorkItemExecutionState` behavior.

**Files:**
- Modify: `src/server/work-item-orchestrator.ts`
- Modify: `src/server/work-item-orchestrator.test.ts`

**Step 1: Write failing tests**

Mock `syncWorkItemExecutionState`.

Scenario:

- work item `active/build`, `missionJobId='job-build-1'`, `missionState='running'`
- mock sync returns workItem with `status='active'`, `phase='review'`, transition `build->review`
- reconcile
- expect event `sync_execution`
- expect event statusAfter/phaseAfter from returned work item

Failure scenario:

- mock sync throws
- reconcile should not crash all; event/finding records sync error

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-orchestrator.test.ts
```

**Step 3: Implement**

Call existing:

```ts
await syncWorkItemExecutionState(workItem.id)
```

Do not duplicate transition logic.

**Step 4: Verify**

```bash
pnpm test src/server/work-item-orchestrator.test.ts src/server/work-item-execution.test.ts
```

---

### Task 7: Add orchestrator reconcile API route

**Objective:** Expose the orchestrator through an API used by live tests and optional UI polling.

**Files:**
- Create: `src/routes/api/work-items.orchestrator.reconcile.ts`
- Create: `src/server/work-item-orchestrator-routes.test.ts`
- Modify: `src/routeTree.gen.ts` only if generated by existing tooling/build; do not hand-edit if generator handles it.

**Step 1: Write failing route tests**

Use existing route test style from `src/server/work-item-supervisor-routes.test.ts`.

Test:

- POST `/api/work-items/orchestrator/reconcile?workItemId=<id>` calls `reconcileWorkItemAutonomy(id)`.
- POST without id calls `reconcileAllWorkItemAutonomy()`.
- unauthorized request returns 401 if auth helper requires it in test setup.

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-orchestrator-routes.test.ts
```

**Step 3: Implement route**

Route shape:

```ts
export const Route = createFileRoute('/api/work-items/orchestrator/reconcile')({ ... })
```

Do not call lifecycle endpoints from this route. It only invokes orchestrator.

**Step 4: Verify**

```bash
pnpm test src/server/work-item-orchestrator-routes.test.ts
```

---

### Task 8: Add optional background orchestrator loop

**Objective:** Provide a real always-on mode without forcing it on in tests/dev unexpectedly.

**Files:**
- Create: `src/server/work-item-orchestrator-loop.ts`
- Create: `src/server/work-item-orchestrator-loop.test.ts`
- Modify bootstrap file only after identifying the correct server entry point.

**Step 1: Write failing tests**

Tests:

1. `startWorkItemOrchestratorLoop({ intervalMs: 1000 })` starts one interval.
2. calling start twice does not create two intervals.
3. `stopWorkItemOrchestratorLoop()` clears interval.
4. reconcile errors are caught/logged, not thrown globally.

Use fake timers if Vitest setup supports it.

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-orchestrator-loop.test.ts
```

**Step 3: Implement loop**

Export:

```ts
export function startWorkItemOrchestratorLoop(options?: { intervalMs?: number }): void
export function stopWorkItemOrchestratorLoop(): void
export function isWorkItemOrchestratorLoopRunning(): boolean
```

Guard:

```ts
if (process.env.HERMES_WORKSPACE_WORK_ITEM_AUTONOMY !== '1') return
```

**Step 4: Bootstrap carefully**

Search for app startup file. If no safe bootstrap is obvious, do not wire automatically in this task. Instead document that systemd env must set `HERMES_WORKSPACE_WORK_ITEM_AUTONOMY=1` once bootstrap is wired in a later task.

**Step 5: Verify**

```bash
pnpm test src/server/work-item-orchestrator-loop.test.ts
```

---

### Task 9: Add run timeline server helper

**Objective:** Create a reliable server view model for Work Item “Runs / Agents” visibility.

**Files:**
- Create: `src/server/work-item-run-timeline.ts`
- Create: `src/server/work-item-run-timeline.test.ts`

**Step 1: Write failing tests**

Cases:

1. Fresh inbox item with no jobs returns four rows; research row state `not_started` or `No job launched` summary.
2. Running planning draft returns research row state `running` or `scheduled`, profile planner, planner job id/link.
3. Active build with execution run returns build row with job id, session key, heartbeat label.
4. Failed mission returns error and next expected action.
5. Accepted planning draft/ready build says next expected action is Builder launch.

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-run-timeline.test.ts
```

**Step 3: Implement helper**

Use existing stores:

```ts
getLatestPlanningDraftForWorkItem
listExecutionRuns
listWorkItemApprovals
```

Do not fetch network/dashboard here. Timeline should render persisted local state only; orchestrator/sync updates persistence.

**Step 4: Verify GREEN**

```bash
pnpm test src/server/work-item-run-timeline.test.ts
```

---

### Task 10: Enrich work-item detail API with run timeline

**Objective:** Work item detail response includes run timeline evidence.

**Files:**
- Modify: `src/routes/api/work-items.$workItemId.ts`
- Modify: `src/server/work-item-detail-route.test.ts`
- Modify: `src/lib/projects-api.ts` if client types need update.

**Step 1: Write failing tests**

Extend detail route test to assert `runTimeline` exists and includes four phase rows.

**Step 2: Run RED**

```bash
pnpm test src/server/work-item-detail-route.test.ts
```

**Step 3: Implement**

Import `buildWorkItemRunTimeline` and include:

```ts
runTimeline: buildWorkItemRunTimeline(workItemWithApprovals)
```

Keep existing approval enrichment.

**Step 4: Verify**

```bash
pnpm test src/server/work-item-detail-route.test.ts src/server/work-item-run-timeline.test.ts
```

---

### Task 11: Add Work Item detail “Runs / Agents” cockpit first slice

**Objective:** Operators can see what each profile is doing from inside the Work Item.

**Files:**
- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`

**Step 1: Write failing tests for pure helpers/constants**

Add/export constants/helpers such as:

```ts
export const WORK_ITEM_RUNS_SECTION_TITLE = 'Runs / Agents'
export function getRunTimelineStateLabel(state: WorkItemRunTimelineState): string
```

Test labels:

- `not_started` → `No job launched`
- `scheduled` → `Job scheduled`
- `running` → `Agent session running`
- `output_ready` → `Output ready for ingestion`
- `failed` → `Failed`
- `stale` → `Stuck / stale`

**Step 2: Run RED**

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts
```

**Step 3: Implement UI**

Render section near existing execution controls, not buried at bottom.

Minimum row content:

- phase name
- state label
- profile/job id if present
- heartbeatLabel
- summary
- error if present
- link button for job/session if present

Use theme tokens. Avoid `bg-white`, `text-primary-800` hardcoded light classes.

**Step 4: Verify**

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts
pnpm build
```

---

### Task 12: Update project board card signals for autonomous runs

**Objective:** Kanban cards show whether a work item is actually doing anything.

**Files:**
- Modify: `src/lib/projects-view-model.ts`
- Modify: `src/screens/projects/project-detail-screen.tsx`
- Modify tests around project view model/screen if present.

**Step 1: Write failing tests**

Extend signal helper tests to include:

- `No job launched`
- `Planner running`
- `Builder running`
- `Output ready`
- `Stale execution`
- `Code diff detected`

**Step 2: Run RED**

```bash
pnpm test src/lib/projects-view-model.test.ts src/screens/projects/project-detail-screen.test.ts
```

If exact test files differ, locate them with `search_files` first.

**Step 3: Implement**

Render compact badges on board cards. Do not overbuild filters in this slice.

**Step 4: Verify**

```bash
pnpm test src/lib/projects-view-model.test.ts src/screens/projects/project-detail-screen.test.ts
```

---

### Task 13: Replace/extend the broken E2E harness with autonomous-only contract tests

**Objective:** Prevent future fake E2E reports that manually PATCH lifecycle state.

**Files:**
- Modify: `src/server/production-e2e-work-item-workflow-script.test.ts`
- Modify: `scripts/mission-control-work-item-e2e.mjs` or create new `scripts/mission-control-autonomous-work-item-e2e.mjs`

**Step 1: Write failing contract tests**

Add tests asserting the harness source does **not** contain forbidden calls for autonomous mode:

Forbidden in autonomous harness:

```text
PATCH /api/work-items/:id with status/phase
POST /api/work-items/:id/lifecycle for phase movement
manual builder CLI invocation
```

Required in autonomous harness:

```text
POST /api/work-items
POST /api/work-items/orchestrator/reconcile
poll GET /api/work-items/:id
candidate repo git diff --name-only
createdWorkItemIds.length === 1
```

**Step 2: Run RED**

```bash
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
```

Expected: FAIL until harness is rewritten.

**Step 3: Implement autonomous harness**

Recommended new script:

```text
scripts/mission-control-autonomous-work-item-e2e.mjs
```

Do not delete old script immediately; mark old script/report as lifecycle-smoke only.

Harness flow:

1. Verify candidate repo branch.
2. Record `git status --short` and `git diff --name-only` before.
3. Create exactly one work item with unique `e2eRunId`.
4. Loop until timeout:
   - POST `/api/work-items/orchestrator/reconcile?workItemId=<id>`
   - GET `/api/work-items/<id>?syncExecution=true`
   - GET execution runs endpoint if needed
   - record timeline rows and events
5. Fail if no Planner launch evidence.
6. Fail if no Planner output ingestion evidence.
7. Fail if no Builder launch evidence.
8. Fail if final candidate repo diff has no product-code/test files.
9. Fail if final work item is not `done` for full E2E mode.
10. Write report and screenshot.

**Step 4: Verify contract tests**

```bash
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
```

---

### Task 14: Live API smoke for autonomous orchestrator

**Objective:** Verify service exposes the orchestrator and timeline APIs after build/restart.

**Files:**
- No production file unless fixing discovered bug.
- Update report/handoff after run.

**Commands:**

```bash
pnpm test src/server/work-item-orchestrator.test.ts \
  src/server/work-item-orchestrator-routes.test.ts \
  src/server/hermes-job-output.test.ts \
  src/server/work-item-run-timeline.test.ts \
  src/server/work-item-detail-route.test.ts

pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/api/projects -o /tmp/hermes-projects.json
```

Create a temporary work item via API, then call orchestrator reconcile. This live smoke may create a Planner job; record the ID and cleanly report it.

Do not manually PATCH status/phase.

---

### Task 15: Real autonomous E2E on family_command_center-ABACUS

**Objective:** Prove one work item autonomously delivers real code changes.

**Files:**
- `scripts/mission-control-autonomous-work-item-e2e.mjs`
- `dogfood-output/autonomous-work-item-e2e-*.md`
- screenshot in `dogfood-output/`
- update `docs/handoff/current-slice-status.md`

**Preconditions:**

- Candidate repo on `test-hermes-workspace`.
- Candidate repo status reviewed. If there are existing manual changes, either commit/stash with explicit user approval or make harness isolate a new branch/worktree. Do not destroy user changes.
- Project phase profiles set:
  - research → planner
  - build → builder
  - review → reviewer/builder as configured

**E2E command:**

```bash
node scripts/mission-control-autonomous-work-item-e2e.mjs
```

**Required report evidence:**

- work item id
- e2eRunId
- createdWorkItemIds exactly one
- no manual phase mutation list
- orchestrator event timeline
- planner job id/run/session/output ingestion evidence
- builder job id/run/session evidence
- candidate repo before/after status
- changed files list
- affected test command output
- final work item status/phase
- screenshot path

**Verdict rules:**

- `AUTONOMOUS WORKFLOW PASS`: all phase/profile events occurred without manual phase mutation.
- `AUTONOMOUS CODE DELIVERY PASS`: workflow pass + real candidate product-code/test diff + grounded test output.
- Anything else is FAIL.

---

## 5. Definition of done

Builder may report this plan complete only when all are true:

1. `src/server/work-item-orchestrator.ts` exists and has TDD coverage.
2. Orchestrator can auto-launch Planner for new inbox/research item.
3. Orchestrator can ingest Planner output from actual Hermes job/cron output.
4. Orchestrator can auto-accept build-ready Planner draft.
5. Orchestrator can auto-launch Builder for ready/build item.
6. Orchestrator can sync execution and not duplicate launches.
7. API route `/api/work-items/orchestrator/reconcile` exists and is tested.
8. Work Item detail API includes run timeline.
9. Work Item UI has a `Runs / Agents` cockpit section.
10. E2E harness forbids manual status/phase movement.
11. Service builds and restarts.
12. Real E2E against `family_command_center-ABACUS` either passes or fails honestly with first blocker.
13. `docs/handoff/current-slice-status.md` is updated with exact verdict and report paths.

---

## 6. Required verification command block

Run these before final handoff:

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace

pnpm test src/server/hermes-job-output.test.ts \
  src/server/work-item-orchestrator.test.ts \
  src/server/work-item-orchestrator-routes.test.ts \
  src/server/work-item-orchestrator-loop.test.ts \
  src/server/work-item-run-timeline.test.ts \
  src/server/work-item-detail-route.test.ts \
  src/server/work-item-planning.test.ts \
  src/server/work-item-execution.test.ts \
  src/server/work-item-launch.test.ts

pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm vitest run
pnpm build

systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/api/projects -o /tmp/hermes-workspace-projects-autonomy.json
node scripts/mission-control-autonomous-work-item-e2e.mjs
```

If full `pnpm vitest run` or candidate repo tests fail due to known baseline issues, Builder must isolate and document exact unrelated failures. Baseline failures do not excuse missing autonomous workflow proof.

---

## 7. Builder execution prompt

Use this exact prompt for Builder:

```text
Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Branch: my-hermes-workspace-dev

Read first:
1. docs/handoff/current-slice-status.md
2. docs/plans/2026-04-27-hermes-workspace-autonomous-orchestrator-realtime-runs-focus.md
3. docs/plans/2026-04-27-hermes-workspace-autonomous-orchestrator-implementation-plan.md
4. src/server/work-item-planning.ts
5. src/server/work-item-launch.ts
6. src/server/work-item-execution.ts
7. src/server/work-item-supervisor.ts

Implement the plan task-by-task using strict TDD. Do not manually patch work-item status/phase in tests except existing legacy unit tests that specifically test partial update behavior. The final autonomous E2E harness must create one work item and only drive the orchestrator/reconcile loop; it must fail if it manually moves lifecycle state.

After each task, run targeted tests and update docs/handoff/current-slice-status.md if stopping. Final verification must include targeted tests, full vitest, build, service restart, and real autonomous E2E against /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS on branch test-hermes-workspace.
```
