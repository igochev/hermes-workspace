# Hermes Workspace Single-Lane Production Hardening Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn the proven single-lane autonomous coding PASS into a production-reliable operator workflow before starting any new feature cycle.

**Architecture:** Keep the default model as one active autonomous work item per project/repo on the canonical repo path and feature branch. This plan hardens repeatability, queue safety, blocked recovery, UI evidence, repo hygiene, and acceptance reporting around the existing Planner → Builder → Reviewer → Merge-Healer lane. Parallel worktrees remain out of scope.

**Tech Stack:** Hermes Workspace React/TanStack UI, Vite/Vitest, file-backed server stores, Hermes jobs/cron output, Git branch workflow, existing Mission Control work-item APIs.

---

## 0. Acceptance context

Task 8 single-lane autonomous coding is live-accepted by:

```text
Report: dogfood-output/single-lane-autonomy-e2e-2026-04-27T22-39-20-392Z.md
Work item: b31ad72d-4ef0-4388-b867-e0bf11c14c82
Final: status=done phase=deploy laneState=done mergeState=merged
Merge commit: 179475456f18938f9fee9ab29caef0a277a62756
Manual phase mutation calls: []
Product/test diff: lib/mission-control/single-lane-delivery.ts, tests/single-lane-delivery.test.ts
```

This is proof of one lane success, not yet proof of production reliability. The next work must answer: can an operator trust this lane repeatedly, recover safely when it blocks, see truthful state in the UI, and avoid repo dirt/branch/stash leaks?

## 1. Non-negotiables

1. Do not reintroduce parallel worktrees.
2. Do not use manual lifecycle/status/phase PATCH calls as acceptance proof.
3. Every live harness must create or explicitly target exactly one work item and report the same ID throughout.
4. If a harness times out, inspect the target item before rerunning; do not blindly create fresh items.
5. Candidate repo dirt must be backed up/stashed before branch switching; never reset user work.
6. PASS requires persisted work-item evidence, not just current repo state.
7. UI claims require live browser/API verification, not constants-only tests.
8. Handoff must be updated before Builder stops.

---

## 2. Task list

### Task 1 — Make the single-lane E2E harness repeatable and self-cleaning

**Objective:** Prevent the harness from leaving hidden repo dirt, ambiguous fresh work items, or misleading PASS reports.

**Files:**

- Modify: `scripts/mission-control-single-lane-autonomy-e2e.mjs`
- Modify: `src/server/production-e2e-work-item-workflow-script.test.ts`
- Report output: `dogfood-output/single-lane-autonomy-e2e-*.md`

**Implementation requirements:**

1. Add explicit harness mode to the report:
   - `mode=fresh` when creating a new work item.
   - `mode=resume` when `HERMES_SINGLE_LANE_E2E_WORK_ITEM_ID` is set.
2. In fresh mode, fail before creating a new item if the same project already has an active non-terminal lane item.
3. In resume mode, require the target item to have label `single-lane-autonomy-e2e` or an explicit override env var such as `HERMES_SINGLE_LANE_E2E_ALLOW_NON_E2E_RESUME=true`.
4. Record candidate repo branch before and after.
5. Record dirty status before and after.
6. If the repo ends on a feature branch after PASS/FAIL, return to the target base branch when safe and record the checkout result.
7. Preserve full-delta product/test proof using committed-after-baseline + unstaged + staged + untracked + merge-commit diff where appropriate.
8. Report any leftover untracked/modified files as hygiene findings even if the workflow proof passes.

**Tests:**

Add/extend contract tests to assert the script source contains:

```ts
expect(source).toContain('HERMES_SINGLE_LANE_E2E_WORK_ITEM_ID')
expect(source).toContain('mode')
expect(source).toContain('repoHygiene')
expect(source).toContain('active non-terminal')
expect(source).toContain('checkout')
```

**Verification commands:**

```bash
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm build
```

**Done when:** A timed-out or resumed run cannot silently create another ambiguous item, and reports clearly separate workflow PASS from repo-hygiene warnings.

---

### Task 2 — Add a three-item sequential lane gauntlet

**Objective:** Prove the lane can process multiple queued work items one after another without hidden parallelism.

**Files:**

- Create: `scripts/mission-control-single-lane-sequential-gauntlet.mjs`
- Modify: `src/server/production-e2e-work-item-workflow-script.test.ts`
- Report output: `dogfood-output/single-lane-sequential-gauntlet-*.md`

**Harness behavior:**

1. Enable `autonomyLanePolicy` for the real dogfood project.
2. Checkpoint candidate repo dirt before starting.
3. Create exactly three work items with one shared `gauntletRunId` and labels:
   - `single-lane-sequential-gauntlet`
   - the unique run ID
4. Poll only orchestrator/detail endpoints.
5. Prove item 2 does not enter `building` until item 1 is `done` or parked as blocked.
6. Prove item 3 does not enter `building` until item 2 is `done` or parked as blocked.
7. Record branch names, lane-entered timestamps, planner launch timestamps, builder launch timestamps, merge timestamps, and final states.
8. PASS only when all three items reach `done/laneState=done` with Merge-Healer evidence.
9. FAIL if more than one non-blocked item is active/building for the same project at any time.

**Contract test expectations:**

```ts
expect(source).toContain('single-lane-sequential-gauntlet')
expect(source).toContain('createdWorkItemIds.length === 3')
expect(source).toContain('maxConcurrentActiveLaneItems')
expect(source).toContain('/api/work-items/orchestrator/reconcile')
expect(source).not.toMatch(/\/lifecycle/)
expect(source).not.toMatch(/method:\s*['"]PATCH['"][\s\S]{0,240}status/)
```

**Verification commands:**

```bash
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm build
systemctl --user restart hermes-workspace.service
node scripts/mission-control-single-lane-sequential-gauntlet.mjs
```

**Done when:** Report proves three sequential autonomous completions or gives an honest first blocker with exact item ID and phase.

---

### Task 3 — Harden blocked-item parking and next-item admission

**Objective:** Prove a blocked item can be parked with evidence and the lane can safely admit the next queued item without hiding merge burden.

**Files:**

- Modify/create server tests around: `src/server/project-autonomy-lane.test.ts`, `src/server/work-item-orchestrator.test.ts`, `src/server/work-item-run-timeline.test.ts`
- Modify if needed: `src/server/project-autonomy-lane.ts`, `src/server/work-item-orchestrator.ts`, `src/server/work-items-store.ts`
- Modify UI if needed: `src/screens/projects/project-detail-screen.tsx`, `src/lib/projects-view-model.ts`

**Required scenarios:**

1. Active item blocks because Builder evidence is invalid.
2. The item records:
   - `laneState=blocked`
   - `laneParkedAt`
   - `laneBlockedReason`
   - artifact paths / job IDs where available
   - recovery action availability
3. Lane selector refuses to admit the next item while repo state is unsafe.
4. Lane selector admits the next queued item only after repo state is safe and blocked item is explicitly parked.
5. Cockpit shows blocked parked item and next queued item distinctly.

**Verification commands:**

```bash
pnpm test src/server/project-autonomy-lane.test.ts src/server/work-item-orchestrator.test.ts src/server/work-item-run-timeline.test.ts src/screens/projects/project-detail-screen.test.ts src/lib/projects-view-model.test.ts -- --runInBand
pnpm build
```

**Done when:** Blocked items do not freeze the project forever, but also cannot be ignored while the repo is unsafe.

---

### Task 4 — Make operator evidence truth visible in the UI

**Objective:** Ensure the operator can verify Planner → Builder → Review → Merge-Healer truth without reading markdown logs.

**Files:**

- Modify: `src/screens/projects/project-detail-screen.tsx`
- Modify: `src/lib/projects-view-model.ts`
- Tests: `src/screens/projects/project-detail-screen.test.tsx`, `src/lib/projects-view-model.test.ts`

**UI requirements:**

The project lane cockpit / work-item detail must show, for the active or latest lane item:

1. Lane mode: `single-lane branch autonomy`.
2. Base branch and feature branch.
3. Planner state and plan artifact path.
4. Builder job ID, state, evidence artifact paths, product/test changed files if available.
5. Review decision/source.
6. Merge-Healer state, target branch, merge commit, test command, test result.
7. Repo hygiene warning if current repo branch/status is not safe.
8. Recovery affordances for blocked/stale items.
9. Explicit copy that parallel worktrees are disabled for this project unless policy changes.

**Verification:**

1. Add failing tests for labels and evidence fields.
2. Run:

```bash
pnpm test src/screens/projects/project-detail-screen.test.tsx src/lib/projects-view-model.test.ts -- --runInBand
pnpm build
systemctl --user restart hermes-workspace.service
```

3. Browser/live verify the real dogfood project detail page and capture a screenshot path in the final report.

**Done when:** A non-developer operator can see whether the lane is idle, building, blocked, reviewing, merging, or done, plus why.

---

### Task 5 — Add repo hygiene guardrails and cleanup/reporting

**Objective:** Prevent single-lane autonomy from leaving the candidate repo in a risky state.

**Files:**

- Modify/create: `src/server/project-branch-manager.ts`, `src/server/work-item-merge-healer.ts`, related tests
- Modify harness reports if needed

**Rules:**

1. Before lane entry, require clean candidate repo or a recorded checkpoint/stash path.
2. After merge, candidate repo should end on the base branch unless explicitly configured otherwise.
3. The report must list:
   - current branch
   - base branch
   - feature branch
   - dirty status
   - untracked files
   - local branches created by the lane
   - PR URL if created
   - stash/backup IDs created by the harness
4. Never delete branches automatically unless a clearly named cleanup env var is set.
5. Warn if base branch is ahead of origin and not pushed.

**Verification commands:**

```bash
pnpm test src/server/project-branch-manager.test.ts src/server/work-item-merge-healer.test.ts src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm build
```

**Done when:** PASS reports cannot hide dirty working trees, wrong branches, or unpushed merge commits.

---

### Task 6 — Production acceptance report and verdict

**Objective:** Produce a final owner-level verdict after the hardening gauntlet, not just scattered test output.

**Files:**

- Create: `dogfood-output/single-lane-production-hardening-YYYY-MM-DDTHH-MM-SS.md`
- Create/update latest alias: `dogfood-output/single-lane-production-hardening-latest.md`
- Update: `docs/handoff/current-slice-status.md`

**Report sections:**

1. Verdict: `ACCEPTED`, `CONDITIONALLY ACCEPTED`, or `REJECTED`.
2. Baseline repo state:
   - Hermes Workspace branch/commit/status.
   - Candidate repo branch/commit/status/stashes/ahead-behind.
3. Commands run and exact results.
4. Task 8 PASS report reference.
5. Sequential gauntlet report reference.
6. Blocked recovery report reference.
7. UI screenshot path.
8. Known risks/debt.
9. What is safe to use now.
10. What remains before enabling unattended always-on operation.

**Verdict rules:**

- `ACCEPTED`: three-item gauntlet passes, blocked recovery passes, UI evidence is live-verified, repo hygiene report is clean or intentionally documented.
- `CONDITIONALLY ACCEPTED`: core automation passes but operator-visible or repo hygiene warnings remain with clear mitigations.
- `REJECTED`: any required workflow proof fails, same-item evidence is missing, manual lifecycle/PATCH is used as proof, or repo ends unsafe without explicit recovery.

**Verification commands:**

```bash
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-hardening-smoke.html
```

**Done when:** The owner can decide whether single-lane autonomy is ready for real daily use, conditionally ready, or still rejected.

---

## 3. Copy-paste Builder prompt

```text
Proceed on Hermes Workspace single-lane production hardening.

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace

Read in order:
1. docs/handoff/current-slice-status.md
2. docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md
3. docs/plans/2026-04-28-hermes-workspace-single-lane-production-hardening-plan.md
4. dogfood-output/single-lane-autonomy-e2e-2026-04-27T22-39-20-392Z.md

Goal:
Turn the Task 8 single-lane PASS into production-reliable operator acceptance before any new feature cycle.

Start with Task 1: make the single-lane E2E harness repeatable and self-cleaning.

Non-negotiables:
- No parallel worktrees.
- No manual lifecycle/status/phase PATCH as proof.
- Preserve PATCH partial-update safety.
- Back up/stash candidate repo dirt before branch switching; never reset user work.
- Do not claim production-ready until the final hardening report gives ACCEPTED / CONDITIONALLY ACCEPTED / REJECTED.
- Update docs/handoff/current-slice-status.md after each completed task or before stopping.
```

---

## 4. Expected end state

After this plan ships, Hermes Workspace should have more than a one-off autonomous coding demo. It should have a repeatable, inspectable, operator-safe single-lane autonomy workflow that can be trusted as the default execution model for one repo/project at a time.
