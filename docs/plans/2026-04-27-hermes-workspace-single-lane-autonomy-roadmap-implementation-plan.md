# Hermes Workspace Single-Lane Autonomous Project Lane Implementation Plan

> **For Hermes / Builder:** Use `subagent-driven-development` only if it helps, but implement task-by-task with `test-driven-development`. This plan intentionally replaces the default mental model of “parallel worktree swarm” with **stable one-work-item-at-a-time per repo/project autonomy**. Do not implement parallel worktrees from this plan.

**Goal:** Make Hermes Workspace useful by delivering stable autonomous help: each project/repo has one visible autonomous lane that processes one work item at a time on a dedicated feature branch, with Planner → Builder → Reviewer → Merge-Healer phases, persistent evidence, operator visibility, and blocked-item recovery.

**Architecture:** Introduce a project-level lane policy and reconciler that selects at most one runnable work item per project, prepares plans from current code when an item enters the lane, creates/uses a feature branch in the canonical repo path, launches Builder, ingests structured build evidence, runs review, runs Merge-Healer, and only frees the lane after integration or explicit blocked/parked state. Parallelism comes from running multiple independent project lanes, not from multiple worktrees in the same repo.

**Tech Stack:** TanStack Start routes, TypeScript server helpers, JSON-backed stores under `~/.hermes`, Vitest, existing Projects/WorkItems/PlanningDrafts/ExecutionRuns/Approvals stores, Hermes profile jobs.

---

## 0. Final analysis / clarified product direction

### What is now clear

The north star is:

> A single-user Mission Control console where each project/repo has a stable autonomous lane. The lane processes one work item at a time on a dedicated feature branch, with Planner/Builder/Reviewer/Merge-Healer phases, persistent evidence, UI visibility, and operator recovery controls. Parallel worktrees are an optional future optimization after single-lane autonomy and merge healing are proven.

This still gives parallel help: if there are 2–3 independent projects, Hermes Workspace can run 2–3 stable lanes at once, **one active work item per project**. That is useful and avoids the merge/repo-path/dependency bloat chaos of many parallel worktrees inside the same repo.

### What we learned from Task 15

Task 15 proved useful partial infrastructure but failed the real goal:

- ✅ Create one work item.
- ✅ Auto-launch Planner.
- ✅ Ingest Planner artifact fallback.
- ✅ Auto-accept draft.
- ✅ Auto-launch Builder.
- ❌ Did not observe Builder product/test diff before timeout.
- ❌ Work item stayed `active/build`, not `done`.
- ❌ Current flow used an isolated worktree and created dependency/build-output ambiguity.
- ❌ We do not yet have reliable Builder heartbeat / structured completion / merge-healing evidence.

### What must change

Stop treating “parallel isolated worktrees” as the default acceptance path. The next Builder work should implement a **branch-based single-lane project autonomy model** first. Worktrees can remain an advanced/future isolation mode, but not the core path.

### Blocked-item rule

A blocked item should not freeze an entire project forever. The correct model is:

```text
current item blocked → park with explicit blocked evidence/recovery action → lane can pick next queued item if repo branch is safely reset/clean and no merge burden is hidden
```

The lane must never silently continue by stacking unrelated work on a dirty/blocked branch.

---

## 1. Existing code seams to reuse

Inspect these before adding anything new:

### Project/policy/store

- `src/server/projects-store.ts`
- `src/lib/projects-api.ts`
- `src/routes/api/projects.ts`
- `src/routes/api/projects.$projectId.ts`
- `src/screens/projects/project-detail-screen.tsx`

### Work items/lifecycle

- `src/server/work-items-store.ts`
- `src/server/work-item-lifecycle.ts`
- `src/routes/api/work-items.ts`
- `src/routes/api/work-items.$workItemId.ts`
- `src/routes/api/work-items.$workItemId.lifecycle.ts`

### Planner/build/review/execution

- `src/server/work-item-planning.ts`
- `src/server/planning-drafts-store.ts`
- `src/server/work-item-launch.ts`
- `src/server/work-item-execution.ts`
- `src/server/work-item-orchestrator.ts`
- `src/server/work-item-orchestrator-loop.ts`
- `src/server/hermes-job-output.ts`
- `src/server/execution-runs-store.ts`
- `src/server/work-item-run-timeline.ts`
- `src/server/work-item-approvals.ts`
- `src/server/work-item-review-decision.ts`

### Current E2E/harness

- `scripts/mission-control-autonomous-work-item-e2e.mjs`
- `src/server/production-e2e-work-item-workflow-script.test.ts`

---

## 2. Non-negotiable acceptance rules

1. **Default per project:** one active autonomous work item at a time.
2. **Default isolation:** feature branch in the canonical repo path, not worktree.
3. **Parallelism source:** multiple projects can each run one lane; do not run multiple active branches/worktrees in the same repo by default.
4. **Planning timing:** Planner runs when a work item enters the lane, after previous successful work is merged/integrated, so it sees current code/docs.
5. **Blocked behavior:** blocked work items are parked with evidence and recovery controls; lane may continue next queued item only after repo/branch state is clean or reset to a safe base.
6. **Builder evidence:** Builder success requires structured output with matching work item id, product/test changed files, tests run, test result, branch, commit/diff evidence, and artifact paths.
7. **Merge-Healer is first-class:** work is not complete until merge/rebase/test/conflict healing succeeds or blocks with evidence.
8. **No manual lifecycle cheating:** final E2E cannot PATCH status/phase or call lifecycle endpoints to simulate progress.
9. **No docs-only code delivery:** docs/plans artifacts alone do not satisfy code-writing E2E.
10. **No hidden worktree bloat:** if worktrees are used in any fallback path, report dependency/build-output sizes and cleanup.

---

## 3. Target data model additions

Prefer extending existing JSON-backed records instead of adding a database.

### Project lane policy fields

Add to project records/types where project policies already live:

```ts
export type ProjectAutonomyLanePolicy = {
  enabled: boolean
  mode: 'single_lane'
  isolation: 'branch'
  maxActiveWorkItems: 1
  baseBranch?: string
  branchPrefix?: string
  plannerTiming: 'on_lane_entry'
  blockedBehavior: 'park_and_continue_when_repo_clean'
  mergeHealerEnabled: boolean
  allowParallelWorktrees: false
}
```

Defaults:

```ts
{
  enabled: false,
  mode: 'single_lane',
  isolation: 'branch',
  maxActiveWorkItems: 1,
  baseBranch: project.defaultBranch ?? 'main',
  branchPrefix: 'mission',
  plannerTiming: 'on_lane_entry',
  blockedBehavior: 'park_and_continue_when_repo_clean',
  mergeHealerEnabled: true,
  allowParallelWorktrees: false,
}
```

### Work item lane fields

Add only if missing / not already represented:

```ts
laneState?: 'queued' | 'preparing' | 'building' | 'reviewing' | 'merge_healing' | 'blocked' | 'done'
laneEnteredAt?: string
laneParkedAt?: string
laneBlockedReason?: string
baseBranch?: string
branchName?: string
branchCreatedAt?: string
mergeState?: 'not_started' | 'running' | 'merged' | 'conflict' | 'failed'
mergeCommit?: string
mergeBaseCommit?: string
mergeTargetBranch?: string
```

Do not overwrite existing `branchName`, `prUrl`, `artifactPaths`, or mission fields if already present.

---

## 4. Task plan for Builder

### Task 1 — Add project single-lane policy normalization

**Objective:** Every project has a safe default autonomy lane policy, but it does not enable automation silently.

**Files:**

- Modify: `src/server/projects-store.ts`
- Modify: `src/lib/projects-api.ts`
- Test: `src/server/projects-store.test.ts` or existing project policy tests
- Test: relevant client API/project tests if present

**Steps:**

1. Add types/defaults for `autonomyLanePolicy`.
2. Normalize missing project records to default disabled single-lane policy.
3. Preserve PATCH partial-update safety; do not wipe existing project fields.
4. Add tests:
   - missing policy normalizes to disabled branch single-lane;
   - partial project update does not wipe policy;
   - policy can be enabled with `maxActiveWorkItems=1` only;
   - `allowParallelWorktrees` remains false by default.

**Commands:**

```bash
pnpm test src/server/projects-store.test.ts -- --runInBand
```

Expected: focused project store tests pass.

---

### Task 2 — Add lane selector: one runnable item per project

**Objective:** The orchestrator can select exactly one active/runnable work item for each project lane.

**Files:**

- Create or modify: `src/server/project-autonomy-lane.ts`
- Test: `src/server/project-autonomy-lane.test.ts`
- Modify: `src/server/work-item-orchestrator.ts`

**Core helper:**

```ts
export function selectNextLaneWorkItem(params: {
  project: ProjectRecord
  workItems: WorkItemRecord[]
}): {
  active: WorkItemRecord | null
  next: WorkItemRecord | null
  parked: WorkItemRecord[]
  reason: string
}
```

**Selection rules:**

1. If a non-blocked item is already in lane states `preparing/building/reviewing/merge_healing` or status `active`, return it as `active`.
2. If active item is blocked and safely parked, do not treat it as active.
3. Pick next queued work item by priority/risk/createdAt policy.
4. Do not pick more than one item.
5. Do not pick next if repo state is unsafe/dirty from blocked item; return blocked reason instead.

**Tests:**

- one active build item prevents new item selection;
- blocked parked item allows next queued item;
- dirty repo safety result prevents next item;
- priority ordering works;
- multiple projects can each select one item independently.

**Commands:**

```bash
pnpm test src/server/project-autonomy-lane.test.ts src/server/work-item-orchestrator.test.ts -- --runInBand
```

---

### Task 3 — Add branch manager for canonical repo path

**Objective:** Create/check/use one feature branch per work item in the project repo path without worktrees.

**Files:**

- Create: `src/server/project-branch-manager.ts`
- Test: `src/server/project-branch-manager.test.ts`
- Modify: `src/server/work-item-orchestrator.ts`

**Core helpers:**

```ts
export type ProjectBranchState = {
  repoPath: string
  baseBranch: string
  currentBranch: string
  isClean: boolean
  headCommit: string
  changedFiles: string[]
}

export function buildWorkItemBranchName(workItem: WorkItemRecord, prefix = 'mission'): string
export async function inspectProjectRepoState(repoPath: string): Promise<ProjectBranchState>
export async function ensureWorkItemBranch(params: {
  repoPath: string
  baseBranch: string
  branchName: string
}): Promise<ProjectBranchState>
```

**Rules:**

- No destructive checkout if repo is dirty and dirty files are unrelated to the same work item.
- Branch name format: `mission/<workItemId-short>-<slug>`.
- Use project `defaultBranch` or lane `baseBranch`.
- Record `branchName`, `baseBranch`, `branchCreatedAt`, and repo commit evidence on the work item.
- Do not use `git worktree add` in this default path.

**Tests:**

Use temp git repo fixtures.

- creates branch from base branch;
- reuses existing work item branch idempotently;
- refuses unsafe dirty repo;
- records branch name deterministically;
- no command contains `worktree`.

**Commands:**

```bash
pnpm test src/server/project-branch-manager.test.ts -- --runInBand
```

---

### Task 4 — Move Planner timing to lane entry

**Objective:** Planner prepares the work item when it enters the lane, not as a stale batch ahead of previous code changes.

**Files:**

- Modify: `src/server/work-item-orchestrator.ts`
- Modify: `src/server/work-item-planning.ts` if needed
- Test: `src/server/work-item-orchestrator.test.ts`

**Behavior:**

When project lane is enabled:

```text
queued/inbox item selected for lane
→ ensure repo branch / current code baseline
→ mark laneState=preparing
→ launch Planner
```

Planner should receive prompt context with:

- repo path;
- current branch/base branch;
- current HEAD commit;
- previous completed work item summary if available;
- explicit instruction: plan against current code/docs.

**Tests:**

- Planner is launched only after lane selection.
- Planner prompt includes current branch/HEAD evidence.
- A second queued item is not planned while active item is building.
- After prior item done/merged, next item can be planned.

---

### Task 5 — Add Builder heartbeat + structured build evidence ingestion

**Objective:** Know whether Builder is still working, stale, succeeded, or failed, and ingest real evidence.

**Files:**

- Modify: `src/server/hermes-job-output.ts`
- Modify: `src/server/work-item-execution.ts`
- Modify: `src/server/work-item-orchestrator.ts`
- Modify: `src/server/work-item-run-timeline.ts`
- Test: `src/server/hermes-job-output.test.ts`
- Test: `src/server/work-item-execution.test.ts`
- Test: `src/server/work-item-orchestrator.test.ts`
- Test: `src/server/work-item-run-timeline.test.ts`

**Structured Builder output contract:**

Builder must output parseable JSON or fenced JSON:

```json
{
  "workItemId": "84bfe2c2-e899-437a-8a6c-a6fa9884886d",
  "phase": "build",
  "status": "succeeded",
  "repoPath": "/path/to/repo",
  "branchName": "mission/84bfe2c2-autonomous-e2e-code-delivery",
  "baseBranch": "test-hermes-workspace",
  "headCommit": "abc1234",
  "changedFiles": ["lib/example.ts", "tests/example.test.ts"],
  "testCommand": "npm test -- tests/example.test.ts",
  "testPassed": true,
  "testSummary": "3 passed",
  "artifactPaths": ["/tmp/.../test.log"]
}
```

**Delta detection:**

Server and harness should detect candidate changes with full baseline-relative delta:

```bash
git diff --name-only <baseCommit>..HEAD
git diff --name-only
git diff --cached --name-only
git ls-files --others --exclude-standard
```

Filter out:

- `node_modules/`
- `.next/`
- `dist/`
- `build/`
- `coverage/`
- docs-only unless work item is docs-only.

**Heartbeat states:**

- `scheduled`: job exists but no output/run yet.
- `running`: recent output/run/session update.
- `stale`: no output after configured threshold.
- `succeeded_with_evidence`: structured output + product/test diff + tests pass.
- `failed_with_evidence`: structured failure or job failure.

**Tests:**

- parse structured Builder output;
- reject missing workItemId;
- reject docs-only changes;
- accept committed/staged/untracked product/test files;
- stale job appears as stale, not failed;
- success evidence transitions build forward.

---

### Task 6 — Implement Merge-Healer phase

**Objective:** Finish work by integrating the feature branch into the base branch with tests, or block with conflict evidence.

**Files:**

- Create: `src/server/work-item-merge-healer.ts`
- Test: `src/server/work-item-merge-healer.test.ts`
- Modify: `src/server/work-item-orchestrator.ts`
- Modify: `src/server/work-item-run-timeline.ts`
- Modify: `src/lib/projects-api.ts`
- Modify UI tests if timeline fields change

**Merge-Healer flow:**

```text
review pass
→ laneState=merge_healing
→ inspect branch/base state
→ merge or rebase feature branch into base branch
→ run configured test command
→ if pass: persist merge commit, mark deploy/done per policy
→ if conflict/test fail: block item with conflict/test evidence and recovery action
```

**Required evidence:**

```ts
mergeState
mergeTargetBranch
mergeBaseCommit
mergeCommit
mergeConflictFiles[]
mergeTestCommand
mergeTestPassed
mergeArtifactPaths[]
```

**Safety rules:**

- Do not force push.
- Do not auto-resolve non-trivial conflicts without explicit policy.
- If conflicts exist, block and surface files/recovery controls.
- If merge succeeds but tests fail, block with test evidence.

**Tests:**

Use temp git repo fixtures.

- clean merge succeeds and records commit;
- conflict blocks with conflict files;
- test failure blocks with test log path;
- idempotent rerun does not duplicate merge;
- after blocked merge, lane can continue next item only when repo is clean/reset or operator allows.

---

### Task 7 — Project lane cockpit UI

**Objective:** Operator can see lane state per project and why it is or is not working.

**Files:**

- Modify: `src/screens/projects/project-detail-screen.tsx`
- Modify: `src/screens/dashboard/dashboard-screen.tsx` if global lane summary exists
- Modify: `src/lib/projects-view-model.ts`
- Test: `src/screens/projects/project-detail-screen.test.ts`
- Test: `src/lib/projects-view-model.test.ts`

**UI must show:**

- Lane mode: `Single-lane branch autonomy`.
- Current active work item.
- Current branch/base branch.
- Current phase/profile: Planner / Builder / Reviewer / Merge-Healer.
- Heartbeat/stale state.
- Blocked parked items.
- Next queued item.
- Merge state.
- Recovery actions.
- Explicit note: parallel worktrees disabled unless advanced mode enabled.

**Tests:**

- active lane renders current item and branch;
- no active item renders next queued item;
- blocked item renders parked/recovery state;
- stale Builder renders stale warning;
- merge conflict renders Merge-Healer blocker.

---

### Task 8 — Replace autonomous E2E with branch-based single-lane E2E

**Objective:** Prove the new default flow without worktrees.

**Files:**

- Modify or create: `scripts/mission-control-single-lane-autonomy-e2e.mjs`
- Modify: `src/server/production-e2e-work-item-workflow-script.test.ts`
- Keep existing `scripts/mission-control-autonomous-work-item-e2e.mjs` only as historical/worktree-mode proof if needed.

**Harness rules:**

- Uses canonical candidate repo path, not a new worktree.
- Requires repo clean or creates a safe backup/checkpoint before branch switch.
- Creates exactly one work item.
- Polls only orchestrator/detail endpoints.
- Forbids manual lifecycle/PATCH phase movement.
- Verifies branch created: `mission/<workItemId-short>-<slug>`.
- Verifies Planner launched after lane entry.
- Verifies Builder changed product/test files.
- Verifies tests ran and passed.
- Verifies Review/Merge-Healer ran.
- Verifies same work item reaches `done` or honest blocked state with evidence.
- If blocked, report is FAIL for full E2E but valid blocker evidence.

**PASS requires:**

```text
same workItem.id
status=done
feature branch created
product/test diff observed
tests passed
Merge-Healer integrated or policy-completed safely
manualPhaseMutationCalls=[]
```

**Commands:**

```bash
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
node scripts/mission-control-single-lane-autonomy-e2e.mjs
```

---

## 5. Builder execution order

Do not attempt full E2E first. Implement in this order:

1. Project lane policy normalization.
2. Lane selector.
3. Branch manager.
4. Planner-on-lane-entry.
5. Builder heartbeat + structured evidence ingestion.
6. Merge-Healer.
7. Project lane cockpit UI.
8. Branch-based single-lane live E2E.

Each task must update `docs/handoff/current-slice-status.md` after completion.

---

## 6. Copy-paste Builder prompt

```text
Proceed on Hermes Workspace single-lane autonomy.

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace

Read in order:
1. docs/handoff/current-slice-status.md
2. docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md
3. docs/plans/2026-04-27-hermes-workspace-single-lane-autonomy-roadmap-implementation-plan.md
4. docs/plans/2026-04-25-hermes-workspace-dream-mission-control-roadmap.md only for north-star context

Implement the plan task-by-task with TDD. Start with Task 1: project single-lane policy normalization.

Non-negotiables:
- Default execution is one active autonomous work item per repo/project.
- Default isolation is feature branch in canonical repo path, not worktree.
- Parallel worktrees are future opt-in only; do not implement them now.
- Planner should run when a work item enters the lane so it sees current code/docs from previous completed work.
- Blocked items may be parked with explicit evidence so the next queued item can run only when repo state is safe.
- Merge-Healer is first-class before we claim autonomous done.
- Preserve PATCH partial-update safety.
- Update docs/handoff/current-slice-status.md after each completed task.
```
