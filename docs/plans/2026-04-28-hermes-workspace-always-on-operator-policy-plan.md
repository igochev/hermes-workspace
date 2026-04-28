# Hermes Workspace Always-On Operator Policy Implementation Plan

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task. Builder must start from `docs/handoff/current-slice-status.md`, then this plan.

**Goal:** Turn the accepted supervised single-lane autonomy into owner-approved always-on operation with explicit retry limits, notifications, PR publishing, and branch/stash cleanup retention.

**Architecture:** Keep single-lane branch autonomy as the default. Add a conservative per-project policy layer that is disabled or supervised by default, stores durable evidence on the project/work item, exposes operator controls in Mission Control, and refuses destructive cleanup/publishing unless policy gates and repo hygiene are clean.

**Tech Stack:** TypeScript, TanStack Router/React, file-backed Hermes Workspace stores, Vitest, Node `child_process` git helpers, existing work-item supervisor/orchestrator/recovery/digest seams.

---

## Owner decision

Proceed with **Always-On Operator Policy** before a new product feature roadmap.

Reason: Task 6 accepted single-lane autonomy for supervised daily use, but the acceptance report explicitly blocks fully unattended operation until retry limits, notifications, PR publishing, and cleanup retention are defined. This plan closes that gap without changing the north-star execution model.

Do **not** implement parallel worktrees in this plan.

---

## Current baseline Builder must preserve

- Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Current branch: `my-hermes-workspace-dev`
- Active product model: one repo/project, one active autonomous item, one dedicated feature branch, Planner → Builder → Reviewer → Merge-Healer.
- Latest accepted report: `dogfood-output/single-lane-production-hardening-latest.md`
- Real dogfood candidate repo: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
- Candidate repo state from acceptance: clean on `test-hermes-workspace`, 15 commits ahead of origin, safety/evidence stashes retained intentionally.

Non-negotiables:

1. Preserve `/api/work-items/$workItemId` PATCH partial-update safety. Never include undefined fields in update payloads.
2. Preserve single-lane default: no parallel worktrees.
3. Automatic actions must be policy-gated, bounded, and evidenced.
4. Cleanup must be retention-based and non-destructive by default.
5. PR publishing must be draft/safe by default and blocked if the repo is dirty, behind, or missing remote metadata.
6. Notifications must be deduplicated and must include actionable evidence, not vague “something failed” text.
7. Handoff must be updated after every completed task.

---

## Proposed policy shape

Builder may adjust exact names while keeping semantics stable.

Add a nested policy to `ProjectAutonomyLanePolicy` in `src/server/projects-store.ts` and client/server view models:

```ts
export type ProjectAutonomyAlwaysOnPolicy = {
  enabled: boolean
  retry: {
    enabled: boolean
    maxAttemptsPerPhase: number
    cooldownMinutes: number
    staleScheduledMinutes: number
    staleRunningMinutes: number
  }
  notifications: {
    enabled: boolean
    digestOnly: boolean
    notifyOn: Array<'blocked' | 'retry_scheduled' | 'retry_exhausted' | 'unsafe_repo' | 'pr_ready' | 'pr_published' | 'cleanup_recommended'>
    minRepeatMinutes: number
  }
  prPublishing: {
    enabled: boolean
    mode: 'manual' | 'draft'
    baseBranch?: string
    titlePrefix: string
    requireCleanRepo: boolean
    requirePassingMergeTests: boolean
  }
  cleanup: {
    enabled: boolean
    deleteMergedBranches: boolean
    retainMergedBranchDays: number
    retainLaneStashes: boolean
    retainLaneStashDays: number
    dryRun: boolean
  }
}
```

Default policy must be conservative:

```ts
{
  enabled: false,
  retry: {
    enabled: false,
    maxAttemptsPerPhase: 1,
    cooldownMinutes: 30,
    staleScheduledMinutes: 30,
    staleRunningMinutes: 240,
  },
  notifications: {
    enabled: true,
    digestOnly: true,
    notifyOn: ['blocked', 'retry_exhausted', 'unsafe_repo', 'pr_ready', 'cleanup_recommended'],
    minRepeatMinutes: 60,
  },
  prPublishing: {
    enabled: false,
    mode: 'manual',
    titlePrefix: '[Hermes Workspace]',
    requireCleanRepo: true,
    requirePassingMergeTests: true,
  },
  cleanup: {
    enabled: false,
    deleteMergedBranches: false,
    retainMergedBranchDays: 30,
    retainLaneStashes: true,
    retainLaneStashDays: 30,
    dryRun: true,
  },
}
```

---

## Task 1 — Persist owner always-on policy safely

**Objective:** Add normalized project-level always-on policy with safe defaults and PATCH preservation.

**Files:**
- Modify: `src/server/projects-store.ts`
- Modify/test: `src/server/projects-store.test.ts`
- Modify/test: `src/server/project-route.test.ts`
- Modify client types as needed in `src/lib/projects-view-model.ts` and project screen tests if type exports are mirrored there.

**Steps:**

1. Write failing tests that prove:
   - creating a project gets the conservative default always-on policy;
   - partial project update preserves existing policy;
   - partial policy update merges nested fields without wiping sibling retry/notification/PR/cleanup fields;
   - invalid numeric/string values normalize back to safe defaults;
   - default `enabled=false` and `cleanup.dryRun=true`.
2. Run focused RED:
   - `pnpm test src/server/projects-store.test.ts src/server/project-route.test.ts -- --runInBand`
3. Implement normalizer helpers:
   - `normalizeAutonomyAlwaysOnPolicy(value: unknown): ProjectAutonomyAlwaysOnPolicy`
   - merge with prior policy when update payload is partial.
4. Ensure route update payload remains conditional: do not pass `undefined` keys that wipe existing arrays/objects.
5. Run focused GREEN and adjacent server tests:
   - `pnpm test src/server/projects-store.test.ts src/server/project-route.test.ts src/server/project-detail.test.ts -- --runInBand`
6. Update `docs/handoff/current-slice-status.md` with Task 1 evidence.

**Acceptance:** Project policy is durable, conservative, and safe across create/update/PATCH.

---

## Task 2 — Add bounded stale-job retry decisions, not blind retries

**Objective:** Convert stale/missing/failed lane findings into explicit policy decisions: observe, recommend retry, schedule one bounded retry, or exhaust and notify.

**Files:**
- Modify/test: `src/server/work-item-supervisor.ts`
- Modify/test: `src/server/work-item-supervisor.test.ts`
- Modify/test: `src/server/work-item-recovery-actions.ts`
- Modify/test: `src/server/work-item-recovery-actions.test.ts`
- Modify/test as needed: `src/server/work-item-orchestrator.ts`, `src/server/work-item-orchestrator.test.ts`
- Modify: `src/server/work-items-store.ts` only if durable retry evidence fields are needed.

**Steps:**

1. Add failing tests for policy decisions:
   - policy disabled → no automatic retry, only finding/recovery recommendation;
   - retry enabled + stale scheduled job + retry count below max + repo clean → returns a retry decision with cooldown and evidence;
   - retry count exhausted → parks/escalates with `retry_exhausted` evidence;
   - dirty/unsafe repo → refuses retry and emits `unsafe_repo` evidence;
   - cooldown not elapsed → no duplicate retry.
2. Run RED:
   - `pnpm test src/server/work-item-supervisor.test.ts src/server/work-item-recovery-actions.test.ts -- --runInBand`
3. Implement a pure decision helper first, e.g. `decideAlwaysOnLaneRecovery(...)`, so tests can cover policy without spawning jobs.
4. Wire the helper into existing supervisor/recovery/orchestrator seams only after the pure helper is green.
5. Persist evidence on the work item without inventing hidden lifecycle jumps. Suggested fields if needed:
   - `laneRetryCount?: number`
   - `laneLastRetryAt?: string`
   - `laneRetryExhaustedAt?: string`
   - `laneRecoveryDecision?: string`
6. Run adjacent GREEN:
   - `pnpm test src/server/work-item-supervisor.test.ts src/server/work-item-recovery-actions.test.ts src/server/work-item-orchestrator.test.ts src/server/project-autonomy-lane.test.ts -- --runInBand`
7. Update handoff.

**Acceptance:** Always-on retry cannot loop forever, cannot run on unsafe repos, and leaves visible evidence for every decision.

---

## Task 3 — Extend notification digest into lane escalation digest

**Objective:** Make blocked/unsafe/retry-exhausted lane states visible in one deduplicated operator digest.

**Files:**
- Modify/test: `src/server/work-item-notification-digest.ts`
- Modify/test: `src/server/work-item-notification-digest.test.ts`
- Modify: `src/routes/api/work-item-notification-digest.ts`
- Modify UI if digest is surfaced in dashboard: `src/screens/dashboard/dashboard-screen.tsx`, `src/screens/dashboard/dashboard-screen.test.ts`

**Steps:**

1. Add failing tests proving digest includes:
   - lane blocked reason and recovery guidance;
   - retry scheduled / retry exhausted state;
   - unsafe repo hygiene warning;
   - PR ready / cleanup recommended signals once later tasks add those fields;
   - dedupe hash changes only when actionable state changes, not every generated timestamp.
2. Run RED:
   - `pnpm test src/server/work-item-notification-digest.test.ts -- --runInBand`
3. Extend `StatusDigest` with `laneEscalations` and format them in `formatDigestForDiscord`.
4. Keep external delivery out of scope unless a current in-repo delivery seam already exists; this task’s acceptance is an actionable digest route and Discord-formatted text.
5. Run GREEN:
   - `pnpm test src/server/work-item-notification-digest.test.ts src/server/work-item-supervisor.test.ts -- --runInBand`
6. Update handoff.

**Acceptance:** Operator can call/read one digest and understand exactly which lane needs attention and why.

---

## Task 4 — Add PR publishing preflight and draft publishing gate

**Objective:** Prepare safe PR publication for merged/ahead candidate branches without treating remote state as authoritative before publish.

**Files:**
- Modify/test: `src/server/project-branch-manager.ts`
- Modify/test: `src/server/project-branch-manager.test.ts`
- Modify/test as needed: `src/server/work-item-merge-healer.ts`, `src/server/work-item-merge-healer.test.ts`
- Add route only if needed: `src/routes/api/work-items.$workItemId.publish-pr.ts`

**Steps:**

1. Add failing tests for a pure `buildPrPublishingPreflight(...)` or similar helper:
   - blocks dirty repo;
   - blocks missing upstream/remote URL;
   - blocks behind base branch;
   - reports ahead/behind and candidate branch/merge evidence;
   - when policy disabled, reports `manual_required` and no command;
   - when policy enabled draft mode and `gh` is unavailable, reports actionable unavailable evidence instead of failing silently;
   - when `gh` is available in test stub, builds a draft PR command but does not execute in dry-run tests.
2. Run RED:
   - `pnpm test src/server/project-branch-manager.test.ts src/server/work-item-merge-healer.test.ts -- --runInBand`
3. Implement preflight as dry-run first. Do not push/delete by default.
4. If implementing actual publish route, require explicit operator click/API call and policy `prPublishing.enabled=true`.
5. Store resulting `prUrl` on hygiene/work-item evidence only after successful publish.
6. Run GREEN:
   - `pnpm test src/server/project-branch-manager.test.ts src/server/work-item-merge-healer.test.ts -- --runInBand`
7. Update handoff.

**Acceptance:** Mission Control can say “PR ready / not ready” with exact blockers and can create a draft PR only through explicit, policy-gated action.

---

## Task 5 — Add branch/stash cleanup retention planning and dry-run cleanup

**Objective:** Make branch/stash retention explicit and safe so lane artifacts do not accumulate silently.

**Files:**
- Modify/test: `src/server/project-branch-manager.ts`
- Modify/test: `src/server/project-branch-manager.test.ts`
- Modify/test: `src/server/work-item-run-timeline.ts`, `src/server/work-item-run-timeline.test.ts`
- Modify project/work-item detail UI tests if exposing cleanup recommendations.

**Steps:**

1. Add failing tests for cleanup planner:
   - lists local `mission/*` branches with merge status and age;
   - lists lane stashes matching `single-lane|mission|gauntlet` with age;
   - default policy recommends retention and no deletion;
   - cleanup enabled + dryRun true returns planned deletions only;
   - cleanup enabled + dryRun false still refuses deletion if repo dirty/behind or branch unmerged;
   - never deletes safety/evidence stashes younger than retention window.
2. Run RED:
   - `pnpm test src/server/project-branch-manager.test.ts src/server/work-item-run-timeline.test.ts -- --runInBand`
3. Implement a pure cleanup planner first, then an executor only if tests prove all guardrails.
4. Surface cleanup recommendations in timeline/cockpit as evidence, not hidden background deletion.
5. Run GREEN:
   - `pnpm test src/server/project-branch-manager.test.ts src/server/work-item-run-timeline.test.ts src/screens/projects/project-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand`
6. Update handoff.

**Acceptance:** Cleanup is visible, retention-based, dry-run by default, and never destroys recovery evidence silently.

---

## Task 6 — Operator UI: Always-On Policy panel and live recovery affordances

**Objective:** Give the owner a Mission Control panel to see and edit the policy safely.

**Files:**
- Modify/test: `src/screens/projects/project-detail-screen.tsx`
- Modify/test: `src/screens/projects/project-detail-screen.test.tsx`
- Modify/test: `src/screens/projects/work-item-detail-screen.tsx`
- Modify/test: `src/screens/projects/work-item-detail-screen.test.tsx`
- Modify/test: `src/lib/projects-view-model.ts`, `src/lib/projects-view-model.test.ts`
- Modify route/API tests as needed for PATCH policy updates.

**Steps:**

1. Add failing UI/view-model tests requiring:
   - panel label: `ALWAYS-ON POLICY`;
   - clear mode copy: `Supervised` vs `Always-on enabled`;
   - retry max/cooldown/stale thresholds;
   - notification digest events;
   - PR publishing mode and PR-ready blockers;
   - cleanup retention/dry-run status;
   - unsafe repo warnings and recovery affordances.
2. Run RED:
   - `pnpm test src/screens/projects/project-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts src/lib/projects-view-model.test.ts -- --runInBand`
3. Implement view-model summaries first, then UI.
4. Policy editing may be minimal but must not wipe nested policy fields; if full editing is too large, ship read-only summary plus a narrow “enable supervised digest / keep cleanup dry-run” safe toggle.
5. Run GREEN and build:
   - `pnpm test src/screens/projects/project-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts src/lib/projects-view-model.test.ts -- --runInBand`
   - `pnpm build`
6. Restart service and live verify project detail in browser.
7. Update handoff with screenshot path.

**Acceptance:** Owner can inspect always-on readiness from the UI without reading markdown logs.

---

## Task 7 — Always-on policy dogfood gauntlet and final verdict

**Objective:** Prove policy guardrails on the real dogfood repo without enabling destructive unattended behavior.

**Files:**
- Add/modify: `scripts/mission-control-always-on-policy-gauntlet.mjs`
- Modify/test: `src/server/production-e2e-work-item-workflow-script.test.ts`
- Output reports under: `dogfood-output/always-on-policy-gauntlet-*.md`

**Steps:**

1. Add a contract test requiring the gauntlet to report:
   - project policy snapshot;
   - retry disabled/default behavior;
   - simulated stale job decision;
   - simulated retry exhaustion decision;
   - unsafe repo refusal proof;
   - PR preflight proof for candidate repo’s ahead commits;
   - cleanup dry-run proof for lane branches/stashes;
   - digest text excerpt;
   - no manual lifecycle/status/phase PATCH proof;
   - no destructive cleanup unless explicit env vars are set.
2. Run RED:
   - `pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand`
3. Implement script with safe defaults. It may simulate stale/retry states through test fixtures or API-supported recovery routes; it must not dirty/reset/delete the candidate repo.
4. Run focused GREEN:
   - `node --check scripts/mission-control-always-on-policy-gauntlet.mjs`
   - `pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand`
5. Run full verification:
   - `pnpm vitest run`
   - `pnpm build`
   - `systemctl --user restart hermes-workspace.service`
   - `systemctl --user is-active hermes-workspace.service`
   - `curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-always-on-policy-smoke.html`
6. Run live gauntlet against the real dogfood project/candidate repo and save:
   - `dogfood-output/always-on-policy-gauntlet-YYYY-MM-DDTHH-MM-SS.md`
   - `dogfood-output/always-on-policy-gauntlet-latest.md`
7. Final verdict must be one of:
   - **ACCEPTED FOR UNATTENDED ALWAYS-ON** — only if bounded retry, notifications, PR preflight/publish gate, cleanup dry-run, UI, full tests/build/service/live gauntlet all pass.
   - **ACCEPTED FOR SUPERVISED ALWAYS-ON POLICY ONLY** — policy and UI pass, but no destructive/publishing actions are enabled.
   - **REJECTED** — any safety gate fails.
8. Update handoff and implementation index.

**Acceptance:** The owner has evidence-backed policy controls and a final verdict separate from the prior supervised-use acceptance.

---

## Verification matrix

Before Builder reports completion of the whole plan:

```bash
pnpm test src/server/projects-store.test.ts src/server/project-route.test.ts -- --runInBand
pnpm test src/server/work-item-supervisor.test.ts src/server/work-item-recovery-actions.test.ts src/server/work-item-orchestrator.test.ts src/server/project-autonomy-lane.test.ts -- --runInBand
pnpm test src/server/work-item-notification-digest.test.ts -- --runInBand
pnpm test src/server/project-branch-manager.test.ts src/server/work-item-merge-healer.test.ts src/server/work-item-run-timeline.test.ts -- --runInBand
pnpm test src/screens/projects/project-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts src/lib/projects-view-model.test.ts -- --runInBand
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-always-on-policy-smoke.html
```

Then live browser verify:

- real dogfood project detail page shows `PROJECT LANE COCKPIT`;
- same page shows `ALWAYS-ON POLICY`;
- work item detail shows retry/notification/PR/cleanup evidence when applicable;
- latest gauntlet report exists and has a final verdict.

---

## Copy-paste Builder prompt

Proceed on Hermes Workspace Always-On Operator Policy.

Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

Read in order:

1. `docs/handoff/current-slice-status.md`
2. `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
3. `docs/plans/2026-04-28-hermes-workspace-always-on-operator-policy-plan.md`
4. Latest accepted report: `dogfood-output/single-lane-production-hardening-latest.md`

Execute Task 1 first with TDD. Preserve single-lane default, preserve PATCH partial-update safety, do not implement parallel worktrees, do not delete branches/stashes or publish PRs without explicit policy gates. Update `docs/handoff/current-slice-status.md` after each completed task with exact verification commands and evidence paths.
