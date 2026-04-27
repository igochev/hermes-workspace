# Builder Fix Plan — Autonomous Work Item E2E After Task 15

## Goal

Turn the current honest Task 15 result into a real autonomous code-delivery pass for Hermes Workspace Mission Control.

The required outcome remains strict:

```text
Create exactly one real work item
→ system auto-launches Planner
→ Planner output is ingested and accepted
→ system auto-launches Builder
→ Builder produces candidate repo product/test diffs
→ Hermes Workspace ingests execution evidence
→ same work item advances through review/deploy/done without tester phase mutation
→ report proves product/test diffs and affected tests
```

## Current verdict

**Autonomous workflow: partial / not passing.**

The system now reaches:

```text
create → Planner launch → Planner artifact fallback ingestion → draft acceptance → Builder launch
```

But the full E2E remains failed because the same work item did not reach `done`, and the harness did not record candidate product/test diffs before timeout.

## Evidence inspected

- Hermes Workspace repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Candidate worktree: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS-autonomous-e2e-20260427T181715Z`
- Work item: `84bfe2c2-e899-437a-8a6c-a6fa9884886d`
- Planner job: `ed4852f80e36`
- Builder job: `db190fd2a43a`
- E2E report: `dogfood-output/autonomous-work-item-e2e-2026-04-27T18-32-28-399Z-FAIL.md`
- Details report: `dogfood-output/autonomous-work-item-e2e-2026-04-27T18-32-28-399Z-FAIL-details.md`
- Builder session: `/home/d3ni3/.hermes/sessions/session_cron_db190fd2a43a_20260427_212313.json`
- Candidate test log: `/tmp/dispatch-production-dogfood-abacus-84bfe2c2/phase2-build/test.log`

## Key findings

### 1. The Task 15 run itself did not have product/test diffs by the harness deadline

Correction after re-checking: I previously overstated this. The current candidate worktree now contains commit `b1bed34 Add autonomous delivery guard for 84bfe2c2`, but that commit exists after the harness FAIL timestamp and after later worker activity. It is not valid evidence that the harness observed code delivery before timeout.

Current worktree commit evidence:

```text
b1bed34 Add autonomous delivery guard for 84bfe2c2
A  docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-plan.md
A  docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-planner-draft.md
A  lib/mission-control/autonomous-delivery.ts
A  tests/autonomous-delivery.test.ts
```

The original repo `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS` does not have those autonomous-delivery files in its current working tree. It has the older manual quick-capture changes. The live E2E acceptance must only count changes in the isolated target worktree for the current run and only when they are observed before the harness timeout.

Candidate test logs under `/tmp/dispatch-production-dogfood-abacus-84bfe2c2/phase2-build/test.log` show passing tests, but the artifact timestamps are after the failed harness report. Treat them as late/stale worker evidence, not Task 15 PASS evidence.

### 2. The E2E harness still needs full-delta detection, but that was not the only blocker

`scripts/mission-control-autonomous-work-item-e2e.mjs` currently uses:

```js
git diff --name-only
```

That excludes staged changes and committed changes after baseline if the harness does not compare commit ranges correctly. The harness should record a full candidate delta relative to `candidateCommitBefore`, including:

```bash
git diff --name-only <candidateCommitBefore>..HEAD
git diff --name-only
git diff --cached --name-only
git ls-files --others --exclude-standard
```

Then de-duplicate, timestamp observations, and filter docs-only artifacts. However, this only fixes reporting accuracy; it does not by itself prove autonomous completion.

### 3. Work item execution state is not grounded in the real Builder outcome

The persisted execution run for work item `84bfe2c2...` remains:

```json
{
  "phase": "build",
  "jobId": "db190fd2a43a",
  "state": "scheduled",
  "artifactPaths": [],
  "lastObservedAt": "2026-04-27T18:32:27.862Z"
}
```

The work item final state in the failure details remained:

```text
status/phase: active / build
missionState: scheduled
execution runs: [] in the report snapshot
```

So even after real candidate changes exist, Hermes Workspace does not yet ingest them as build completion evidence and does not transition `build -> review -> deploy -> done`.

### 4. Profile-routed worker launch needs a focused ACP check, not a lazy `hermes -p` conclusion

Correction after re-checking: `hermes -p builder status` works and reads the builder profile auth/config. My previous statement that current Hermes does not support top-level `-p` was wrong.

What still needs verification is narrower: whether the ACP subprocess launch shape used by `delegate_task` is valid. The error seen in the Builder cron session was:

```text
Copilot ACP process exited early: usage: hermes ... {chat,...,acp,profile,...}
```

The aliases are currently shell wrappers:

```sh
#!/bin/sh
exec hermes -p builder "$@"
```

So `acp_command: "builder"` with `acp_args: ["--acp", "--stdio"]` expands to:

```bash
hermes -p builder --acp --stdio
```

That may be wrong because ACP is exposed as a subcommand (`hermes acp`), while `hermes -p builder chat/status` works for normal profile commands. Builder must verify the actual ACP invocation, not infer it from normal chat/status behavior.

Candidate shapes to test:

```bash
builder --acp --stdio
hermes -p builder acp --accept-hooks
HERMES_HOME=/home/d3ni3/.hermes/profiles/builder hermes acp --accept-hooks
```

Only change routing after a real ACP smoke proves the correct shape.

### 5. The launch prompt gives the parent job conflicting responsibilities

The two-phase launch prompt tells the parent to execute Phase 1 and Phase 2, but inherited dispatch rules also say:

```text
Spawn workers one at a time. Do NOT wait for workers to finish — the UI handles tracking.
```

That is bad for this E2E. It lets child workers produce files while the tracked parent job remains `scheduled`/unresolved or times out with transport errors. Mission Control then has no reliable build-completion event to sync.

For autonomous E2E, the tracked Builder job must either:

1. do the build directly and finish with a structured success artifact, or
2. spawn child workers, wait/verify controller-side artifacts, then finish with structured success.

It must not fire-and-forget child workers and rely on external observation.

## Builder fix plan

### Task 0 — Add worktree dependency/build-output hygiene

**Goal:** Avoid accidentally multiplying `node_modules` / `.next` across every autonomous E2E worktree.

**Grounded current state:** Git worktree creation itself does not copy ignored dependency/build directories. In the current Family Command Center worktrees, only `family_command_center-ABACUS-autonomous-e2e-20260427T181715Z` has heavy ignored outputs: `node_modules` is ~1.2G / ~64k entries and `.next` is ~118M / ~324 entries. The original repo and the two earlier E2E worktrees do not have `node_modules` or `.next`. So the bloat is created by install/build commands run inside that worktree, not by `git worktree add`.

**Implementation requirements:**

1. The E2E harness/report must record ignored heavyweight paths in the target worktree before and after the run: at minimum `node_modules`, `.next`, `dist`, `build`, `coverage`.
2. Fresh disposable E2E worktrees should be removed after reports are preserved, or cleaned with an explicit disposable-worktree cleanup step.
3. Do not run full candidate `npm install` / `npm run build` in every fresh worktree unless the acceptance explicitly requires it. Prefer focused tests when possible.
4. If candidate dependencies are required, make the cost explicit in the report: install command, elapsed time, disk usage before/after, and cleanup action.
5. Never treat `node_modules` / `.next` as candidate product/test diff evidence.

**Exit criteria:**

- Report shows whether heavy ignored directories were created.
- Disposable worktrees are either cleaned/removed or explicitly kept with size reported.
- No new E2E plan silently creates multi-GB worktrees without documenting why.

### Task 1 — Verify and fix profile ACP routing at the real spawn seam

**Goal:** Stop guessing about profile ACP launch shape; use the one that passes a real ACP smoke.

**Files likely to change:**

- `src/lib/conductor-phase-profiles.ts`
- `src/lib/conductor-phase-profiles.test.ts`
- possibly `src/server/work-item-launch.ts` if it injects profile-routing instructions into prompts

**Implementation requirements:**

1. Run a focused ACP smoke for all candidate launch shapes:

```bash
builder --acp --stdio
hermes -p builder acp --accept-hooks
HERMES_HOME=/home/d3ni3/.hermes/profiles/builder hermes acp --accept-hooks
```

2. Use the first shape that actually starts ACP and works under `delegate_task`.
3. Add tests asserting the selected build/review/deploy ACP shape.
4. Do not claim `hermes -p` is unsupported; normal `hermes -p builder status/chat` works. The question is ACP argument shape.

**Exit criteria:**

- Tests fail before the change and pass after.
- No runtime prompt says `hermes -p <profile> --acp --stdio`.
- No runtime launch config depends on `/home/d3ni3/.local/bin/builder` unless that wrapper is fixed separately.

### Task 2 — Make Builder job completion self-contained and machine-readable

**Goal:** The tracked `db...` job must complete with evidence Mission Control can ingest.

**Files likely to change:**

- `src/server/work-item-launch.ts`
- `src/server/work-item-execution.ts`
- `src/server/hermes-job-output.ts`
- `src/server/work-item-orchestrator.ts`
- tests around these files

**Implementation requirements:**

1. Update the build launch prompt so the parent Builder job must produce a final structured artifact, even if it delegates internally.
2. Require a final JSON or fenced block with at least:

```json
{
  "workItemId": "...",
  "status": "succeeded",
  "phase": "build",
  "repoPath": "...",
  "changedFiles": ["lib/...", "tests/..."],
  "testCommand": "npm test ...",
  "testPassed": true,
  "testSummary": "26 passed",
  "artifactPaths": ["/tmp/dispatch-.../phase2-build/test.log"]
}
```

3. If the parent uses workers, it must wait for them, verify required artifacts, collect `git status --short`, collect full diff names including staged/untracked, and then return that final structured success block.
4. If `delegate_task` returns transport errors but artifacts exist, the parent may mark the phase succeeded only after controller-side artifact checks pass.

**Exit criteria:**

- Unit test proves parser accepts the structured Builder success artifact.
- Unit test proves sync records changed files/test evidence into execution run/work item artifacts.
- Unit test proves no transition occurs when output lacks product/test diff or test evidence.

### Task 3 — Add candidate repo delta detection that includes staged and untracked files

**Goal:** Remove the false-negative that caused this run to report no product/test diff.

**Files likely to change:**

- `scripts/mission-control-autonomous-work-item-e2e.mjs`
- `src/server/production-e2e-work-item-workflow-script.test.ts`
- possibly a new shared helper if reused by server sync

**Implementation requirements:**

Replace `gitDiffNameOnly(cwd)` with a helper such as:

```js
function gitChangedNameOnly(cwd) {
  return Array.from(new Set([
    ...git(cwd, ['diff', '--name-only']).split('\n'),
    ...git(cwd, ['diff', '--cached', '--name-only']).split('\n'),
    ...git(cwd, ['ls-files', '--others', '--exclude-standard']).split('\n'),
  ].map((line) => line.trim()).filter(Boolean)))
}
```

Keep the product/test filter, but evaluate it against this full delta.

**Exit criteria:**

- Contract test covers unstaged, staged, and untracked candidate files.
- Report includes product/test files if they are staged.
- Docs-only changes still fail code-delivery acceptance.

### Task 4 — Teach the orchestrator to promote successful build evidence

**Goal:** A real Builder success should advance the same work item past `active/build`.

**Files likely to change:**

- `src/server/work-item-orchestrator.ts`
- `src/server/work-item-execution.ts`
- `src/server/execution-runs-store.ts` if schema lacks fields
- `src/server/work-item-run-timeline.ts`
- tests for all touched areas

**Implementation requirements:**

1. During `active/build`, reconcile should inspect the latest Builder job output and/or local session/dispatch artifacts.
2. If Builder output proves:
   - product/test changed files exist,
   - tests ran,
   - tests passed,
   - work item id matches,

   then persist execution evidence and mark mission state `succeeded`.
3. Existing `syncWorkItemExecutionState` can then apply `build->review`; if it cannot because Hermes job state remains `scheduled`, add a controlled fallback transition based on structured artifact evidence.
4. Record artifact paths and code/test changed files so the Work Item detail cockpit can display them.

**Exit criteria:**

- Test: `active/build` + structured Builder output + staged product/test files + passing tests transitions to `active/review` or the next configured autonomous phase.
- Test: missing tests or docs-only changes keeps item blocked/active and emits honest event.
- Timeline row shows `Code diff detected` / `Output ready` with changed files and test summary.

### Task 5 — Complete autonomous review/deploy/done path for low-risk E2E items

**Goal:** The same E2E work item reaches `done` without manual lifecycle/PATCH movement.

**Files likely to change:**

- `src/server/work-item-orchestrator.ts`
- `src/server/work-item-execution.ts`
- `src/server/work-item-approvals.ts`
- tests around review/deploy auto-approval

**Implementation requirements:**

1. For low-risk autonomous E2E items with passing build evidence, allow Planner-as-reviewer or policy review to auto-resolve.
2. After review pass, advance to deploy.
3. For local dogfood/no external deploy, allow policy-based deploy completion if build/test evidence is sufficient and project policy permits it.
4. Every transition must be triggered by reconciler/sync observed evidence, not manual lifecycle calls.

**Exit criteria:**

- Test proves same work item id transitions:

```text
inbox/research → ready/build → active/build → active/review → active/deploy → done
```

- No test calls lifecycle/PATCH to move phase/status as the primary driver.
- `manualPhaseMutationCalls` remains `[]` in the live report.

### Task 6 — Re-run the real E2E against a fresh isolated worktree

**Goal:** Produce a clean PASS/FAIL report with no stale artifacts.

**Command shape:**

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace

pnpm test \
  src/lib/conductor-phase-profiles.test.ts \
  src/server/work-item-orchestrator.test.ts \
  src/server/work-item-execution.test.ts \
  src/server/production-e2e-work-item-workflow-script.test.ts \
  -- --runInBand

pnpm vitest run
pnpm build

systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/api/projects >/tmp/hermes-workspace-projects-smoke.json

# Create a fresh candidate worktree/branch from family_command_center-ABACUS.
# Then run:
HERMES_AUTONOMOUS_E2E_TARGET_REPO=<fresh-worktree> \
HERMES_AUTONOMOUS_E2E_TARGET_BRANCH=<fresh-branch> \
HERMES_AUTONOMOUS_E2E_CANDIDATE_TEST_COMMAND='npm test -- tests/autonomous-delivery.test.ts' \
node scripts/mission-control-autonomous-work-item-e2e.mjs
```

**Exit criteria for PASS:**

- `createdWorkItemIds.length === 1`
- `manualPhaseMutationCalls === []`
- orchestrator events include:
  - `launch_planner`
  - `ingest_planner_output`
  - `accept_planning_draft`
  - `launch_builder`
  - build evidence sync
  - review/deploy/done evidence
- candidate changed files include product/test files from full delta including staged/untracked
- candidate tests ran and passed
- final work item status is `done`
- report and screenshot are written
- handoff is updated with exact verdict and blocker if failed

## Recommended Builder prompt

Use this prompt for Builder:

```text
Fix Hermes Workspace autonomous work-item E2E after Task 15.

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Do not modify the real candidate repo destructively. Use fresh isolated worktrees for live E2E.

Start by reading:
- .hermes/plans/2026-04-27_213958-builder-autonomous-e2e-fix-plan.md
- docs/handoff/current-slice-status.md
- dogfood-output/autonomous-work-item-e2e-2026-04-27T18-32-28-399Z-FAIL-details.md
- scripts/mission-control-autonomous-work-item-e2e.mjs
- src/lib/conductor-phase-profiles.ts
- src/server/work-item-launch.ts
- src/server/work-item-orchestrator.ts
- src/server/work-item-execution.ts

Implement in TDD order:
1. Verify profile ACP routing with live ACP smoke; do not assume `hermes -p` is broken because normal `hermes -p builder chat/status` works.
2. Fix candidate delta detection to include unstaged, staged, and untracked files.
3. Make Builder job output machine-readable and require product/test diff + passing test evidence.
4. Teach sync/orchestrator to persist build evidence and transition active/build forward based on structured Builder success if Hermes job state remains scheduled but verified artifacts prove success.
5. Complete low-risk autonomous review/deploy/done transition without manual lifecycle/PATCH movement.
6. Re-run the real autonomous E2E on a fresh isolated Family Command Center worktree and update docs/handoff/current-slice-status.md with the exact verdict.

Non-negotiables:
- Do not claim PASS unless the same work item reaches done.
- Do not call lifecycle/PATCH to simulate phase movement in the harness.
- Do not accept docs-only candidate changes as code delivery.
- Include staged and untracked candidate files in diff evidence.
- Preserve PATCH partial-update safety: never send undefined fields that can wipe arrays.
```

## Risks and guardrails

- **False PASS risk:** Fixed by requiring final `status=done` plus candidate product/test diff plus tests.
- **False FAIL risk:** Fixed by including staged/untracked diff detection.
- **Nested worker invisibility risk:** Fixed by requiring parent job structured success output after artifact verification.
- **Profile routing regression risk:** Fixed by testing the actual ACP command shape, not just prompt text.
- **Repo contamination risk:** Fixed by using fresh isolated candidate worktrees and no destructive mutation of `/family_command_center-ABACUS`.

## Bottom line

Task 15 exposed three connected problems:

1. the tracked Builder/job path did not produce observable product/test diffs before the harness timeout;
2. the E2E harness diff logic is incomplete for staged/untracked/committed-after-baseline changes;
3. the parent Builder job / worker dispatch path does not reliably return structured success evidence to Mission Control.

Also: do not state that `hermes -p builder` is unsupported. It works for normal profile commands. Only the ACP subprocess shape needs focused verification.
