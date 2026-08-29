# Slice R/S/V/X Implementation Plan — Execution Runs, Supervisor, Attention Queue, Role Capacity

> **For Hermes:** Use `subagent-driven-development`. This is a staged reliability/cockpit plan. It should be implemented after Slice T/U unless stale execution is the immediate pain.

**Goal:** Make autonomous execution observable and calm: durable run timeline, stale detection, global attention queue, and advisory role/capacity policy.

**Architecture:** Add file-backed execution run records and supervisor findings without changing Work Item as the system of record. Then derive a global attention queue. Capacity policy is advisory-only in the first implementation.

**Tech Stack:** TypeScript, file-backed JSON stores, existing work-item launch/execution/job helpers, dashboard/project UI, Vitest.

---

## 1. Scope boundaries

First implementation must **not**:

- automatically retry failed jobs;
- auto-relaunch builds;
- mark stale items blocked without operator action;
- replace existing `missionState` / `reviewState` fields;
- make capacity hard-block launches.

It **does**:

- record every launch/sync as durable run evidence;
- detect stale/failed/missing execution;
- surface attention items;
- advise when roles/profiles are overloaded.

---

## 2. Slice R — Execution Run Records

### Create `src/server/execution-runs-store.ts`

Back file:

```ts
path.join(HERMES_HOME, 'work-item-execution-runs.json')
```

Types:

```ts
export type ExecutionEngine = 'conductor' | 'hermes-cron'
export type ExecutionRunRole = 'mission' | 'review' | 'supervisor'
export type ExecutionRunState = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'stale' | 'unknown'

export type ExecutionRunRecord = {
  id: string
  workItemId: string
  projectId: string
  role: ExecutionRunRole
  phase?: WorkItemPhase
  engine: ExecutionEngine
  jobId: string
  jobName?: string
  runId?: string
  state: ExecutionRunState
  sessionKey?: string
  sessionKeyPrefix?: string
  startedAt?: string
  finishedAt?: string
  lastObservedAt: string
  lastRunAt?: string
  error?: string
  branchName?: string
  prUrl?: string
  artifactPaths: Array<string>
  createdAt: string
  updatedAt: string
}
```

Functions:

```ts
listExecutionRuns(filters?)
getExecutionRun(id)
upsertExecutionRun(input)
deleteExecutionRunsForWorkItem(workItemId)
deleteExecutionRunsForProject(projectId)
```

Dedup key:

- `workItemId + role + jobId + runId`; if no runId, `workItemId + role + jobId`.

### Integrate with launch/sync

Modify:

- `src/server/work-item-launch.ts`:
  - after `launchConductorMission`, upsert scheduled `role='mission'` run.
- `src/server/work-item-execution.ts`:
  - after mission job/runs sync, upsert mission run with state/evidence;
  - when review job is checked, upsert `role='review'` run.

### API/client

Create:

```txt
src/routes/api/work-items.$workItemId.execution-runs.ts
src/lib/work-item-execution-runs-api.ts
```

Route:

- `GET /api/work-items/:workItemId/execution-runs` → `{ workItemId, runs }`.

---

## 3. Slice S — Supervisor/Stale Detection

Create:

```txt
src/server/work-item-supervisor.ts
src/server/work-item-supervisor.test.ts
src/routes/api/work-items.supervisor.reconcile.ts
src/lib/work-item-supervisor-api.ts
```

Types:

```ts
export type SupervisorFindingKind = 'mission_failed' | 'review_failed' | 'mission_stale' | 'review_stale' | 'job_missing' | 'sync_error'
export type SupervisorFindingSeverity = 'info' | 'warning' | 'critical'
export type SupervisorFinding = {
  id: string
  workItemId: string
  projectId: string
  kind: SupervisorFindingKind
  severity: SupervisorFindingSeverity
  message: string
  jobId?: string
  role?: 'mission' | 'review'
  observedAt: string
}
```

Thresholds:

```ts
scheduledMs: 30 * 60 * 1000
runningMs: 4 * 60 * 60 * 1000
reviewRunningMs: 2 * 60 * 60 * 1000
```

Functions:

```ts
isWorkItemExecutionCandidate(workItem)
detectStaleExecution(params)
reconcileWorkItemExecution(workItemId)
reconcileAllWorkItemExecutions()
```

Candidate work items:

- `status='active'`; or
- `missionState` in `scheduled|running|failed`; or
- `reviewState` in `scheduled|running|failed`.

Reconcile behavior:

1. call existing `syncWorkItemExecutionState`;
2. read latest work item and execution runs;
3. emit findings;
4. do not mutate status for stale-only findings;
5. do not retry.

Route:

- `POST /api/work-items/supervisor/reconcile`
- optional query `?workItemId=...`
- response `{ checked, findings }`.

---

## 4. Slice V — Global Attention Queue

Create:

```txt
src/server/attention-queue-store.ts
src/server/attention-queue.ts
src/server/attention-queue.test.ts
src/routes/api/attention-queue.ts
src/lib/attention-queue-api.ts
```

Types:

```ts
export type AttentionKind = 'approval_pending' | 'mission_failed' | 'review_failed' | 'execution_stale' | 'blocked_work' | 'capacity_exceeded'
export type AttentionSeverity = 'info' | 'warning' | 'critical'
export type AttentionQueueItem = {
  id: string
  dedupeKey: string
  kind: AttentionKind
  severity: AttentionSeverity
  projectId: string
  workItemId?: string
  title: string
  detail: string
  href: string
  source: 'derived' | 'supervisor' | 'capacity'
  status: 'open' | 'resolved'
  firstSeenAt: string
  lastSeenAt: string
}
```

Derived sources:

- pending approvals → `approval_pending`;
- blocked items → `blocked_work`;
- `missionState='failed'` → `mission_failed`;
- `reviewState='failed'` or review manual/fail → `review_failed`;
- supervisor stale findings → `execution_stale`;
- capacity overage → `capacity_exceeded`.

Route:

- `GET /api/attention-queue`
- `GET /api/attention-queue?refresh=true`

Dashboard integration:

- Modify `src/screens/dashboard/dashboard-screen.tsx` to display queue and count.
- Add helper tests to `src/screens/dashboard/dashboard-screen.test.ts`.

---

## 5. Slice X — Role/Capacity Policy

Create:

```txt
src/server/role-capacity-policy-store.ts
src/server/role-capacity-policy.ts
src/server/role-capacity-policy.test.ts
src/routes/api/role-capacity-policy.ts
src/lib/role-capacity-policy-api.ts
```

Types:

```ts
export type ExecutionRole = 'research' | 'build' | 'review' | 'deploy' | 'supervisor'
export type RoleCapacityRule = {
  role: ExecutionRole
  profile?: string
  maxActive: number
  enabled: boolean
}
```

Defaults:

```ts
research: 1
build: 2
review: 1
deploy: 1
supervisor: 1
```

Evaluator:

```ts
evaluateLaunchCapacity({ role, profile }): {
  role: ExecutionRole
  profile?: string
  activeCount: number
  maxActive: number
  allowed: boolean
  advisoryOnly: true
  message?: string
}
```

Integration:

- In `src/server/work-item-launch.ts`, call evaluator before launch.
- First implementation: do not throw. Include advisory in launch response and history.
- If attention queue exists, upsert `capacity_exceeded` item.

---

## 6. TDD implementation tasks

### PR 1 — Execution runs store only

Files:

- `src/server/execution-runs-store.test.ts`
- `src/server/execution-runs-store.ts`

Tests:

- empty file/list;
- create/upsert;
- no duplicates by dedupe key;
- preserve createdAt;
- filter by workItemId/projectId/role;
- invalid backing JSON safe fallback.

Run:

```bash
pnpm vitest run src/server/execution-runs-store.test.ts
```

### PR 2 — Execution runs launch/sync integration

Files:

- `src/server/work-item-launch.test.ts`
- `src/server/work-item-launch.ts`
- `src/server/work-item-execution.test.ts`
- `src/server/work-item-execution.ts`
- `src/routes/api/work-items.$workItemId.execution-runs.ts`
- `src/lib/work-item-execution-runs-api.ts`

Tests:

- launch records scheduled mission run;
- sync records mission state/evidence/session;
- review sync records review run;
- API returns runs for work item.

### PR 3 — Supervisor pure helpers

Files:

- `src/server/work-item-supervisor.test.ts`
- `src/server/work-item-supervisor.ts`

Tests:

- ignores inactive/done/no-execution items;
- detects stale scheduled mission;
- detects stale running mission;
- detects failed mission critical;
- detects stale/failed review separately;
- sync error becomes finding;
- stale detection does not change work-item status.

### PR 4 — Supervisor route

Files:

- `src/routes/api/work-items.supervisor.reconcile.ts`
- `src/lib/work-item-supervisor-api.ts`

Tests/verification:

- unauthorized → 401;
- reconcile one item;
- reconcile all;
- response shape stable.

### PR 5 — Attention queue store/builder

Files:

- `src/server/attention-queue-store.test.ts`
- `src/server/attention-queue-store.ts`
- `src/server/attention-queue.test.ts`
- `src/server/attention-queue.ts`
- `src/routes/api/attention-queue.ts`
- `src/lib/attention-queue-api.ts`

Tests:

- upsert dedupes by key;
- pending approval creates attention;
- failed mission creates critical attention;
- blocked item creates warning;
- stale finding creates execution_stale;
- resolved item reopens if seen again;
- sort deterministic.

### PR 6 — Dashboard attention surface

Files:

- `src/screens/dashboard/dashboard-screen.test.ts`
- `src/screens/dashboard/dashboard-screen.tsx`

Tests:

- attention count renders;
- critical item renders first;
- empty state is calm;
- item href points to work item/project.

### PR 7 — Role capacity store/evaluator

Files:

- `src/server/role-capacity-policy-store.test.ts`
- `src/server/role-capacity-policy-store.ts`
- `src/server/role-capacity-policy.test.ts`
- `src/server/role-capacity-policy.ts`
- `src/routes/api/role-capacity-policy.ts`
- `src/lib/role-capacity-policy-api.ts`

Tests:

- default policy;
- normalize invalid maxActive;
- count active build work;
- under-capacity allowed;
- over-capacity advisory;
- API returns policy.

### PR 8 — Launch advisory integration

Files:

- `src/server/work-item-launch.test.ts`
- `src/server/work-item-launch.ts`
- `src/lib/work-item-launch-api.ts`

Tests:

- launch response includes capacity decision;
- over-capacity does not block launch;
- history note includes capacity advisory;
- attention item created if queue exists.

---

## 7. Full verification

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
pnpm vitest run src/server/execution-runs-store.test.ts src/server/work-item-launch.test.ts src/server/work-item-execution.test.ts src/server/work-item-supervisor.test.ts src/server/attention-queue.test.ts src/server/role-capacity-policy.test.ts src/screens/dashboard/dashboard-screen.test.ts
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Manual flow:

1. Launch a work item.
2. Confirm execution run appears via API.
3. Sync execution.
4. Confirm run state/evidence updates.
5. Trigger supervisor reconcile.
6. Confirm findings for failed/stale test scenarios.
7. Open dashboard.
8. Confirm global attention queue renders.
9. Configure low build capacity and launch over it.
10. Confirm launch proceeds with advisory.

---

## 8. Definition of Done

- Every launch/sync creates durable execution run records.
- Supervisor can detect stale/failed/missing execution without auto-retry.
- Attention queue gives one global operator queue.
- Dashboard shows attention clearly.
- Capacity policy is advisory and visible.
- Tests/build/live verification pass.
