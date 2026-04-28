# Hermes Workspace Always-On Merge Readiness / Type-Lint Stabilization Plan

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task. Builder must start from `docs/handoff/current-slice-status.md`, then this plan.

**Goal:** Make the completed Always-On Operator Policy slice merge-ready by cleaning changed-file TypeScript/lint blockers, preserving the green functional gauntlet, and producing a final pre-commit verification record.

**Architecture:** This is a stabilization slice, not a product feature slice. Do not add new Mission Control capabilities. Keep the existing Always-On policy semantics intact: conservative defaults, no destructive cleanup, no automatic PR publishing, single-lane branch autonomy only.

**Tech Stack:** TypeScript, React/TanStack Router, Vitest, Vite, ESLint, Node scripts, file-backed Hermes Workspace stores.

---

## Owner decision

Proceed with merge-readiness stabilization before new product features.

Reason: the Always-On Operator Policy is functionally shipped and accepted for supervised always-on policy, but CEO review found strict quality gates are not clean:

- `pnpm vitest run` ✅ passed: 72 files / 464 tests.
- `pnpm build` ✅ passed.
- service/API smoke ✅ passed.
- live UI DOM showed `PROJECT LANE COCKPIT` and `ALWAYS-ON POLICY` ✅.
- `pnpm lint` ❌ failed with broad legacy repo debt: 1441 problems.
- changed-file ESLint subset ❌ failed with 117 problems.
- `pnpm exec tsc --noEmit --pretty false` ❌ failed with broad repo type debt, including errors in changed Always-On files/tests.

This plan turns the large uncommitted Always-On slice into something safer to commit/review without opening another feature front.

---

## Current baseline Builder must preserve

- Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Branch: `my-hermes-workspace-dev`
- Functional slice just completed: `docs/plans/2026-04-28-hermes-workspace-always-on-operator-policy-plan.md`
- Latest policy gauntlet report: `dogfood-output/always-on-policy-gauntlet-latest.md`
- Real dogfood candidate repo: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
- Candidate repo branch: `test-hermes-workspace`, clean, ahead of origin by 15 commits at CEO review.

Non-negotiables:

1. Do not change Always-On product behavior except to fix compile/lint/type correctness.
2. Preserve `/api/work-items/$workItemId` PATCH partial-update safety.
3. Preserve single-lane default; do not implement parallel worktrees.
4. Do not enable destructive cleanup or automatic PR publishing.
5. Do not run broad auto-formatters like `pnpm check` / `prettier --write .` across the repo.
6. Do not reset, stash, or discard the completed Always-On implementation unless explicitly instructed by the owner.
7. Keep fixes minimal and localized; classify legacy repo debt rather than trying to clean the whole historical codebase.

---

## Task 1 — Record a baseline quality-gate report

**Objective:** Capture the exact pre-fix state so Builder can distinguish new Always-On blockers from existing repository debt.

**Files:**

- Create: `dogfood-output/always-on-merge-readiness-baseline-YYYY-MM-DDTHH-MM-SS.md`
- Update alias: `dogfood-output/always-on-merge-readiness-baseline-latest.md`

**Steps:**

1. Inspect repo state:
   ```bash
   git status --short --branch
   git diff --stat
   git diff --name-only
   ```
2. Re-run the known-green functional gates:
   ```bash
   node --check scripts/mission-control-always-on-policy-gauntlet.mjs
   pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
   pnpm vitest run
   pnpm build
   git diff --check
   systemctl --user is-active hermes-workspace.service
   curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-merge-readiness-smoke.html
   ```
3. Capture strict gates without editing:
   ```bash
   pnpm exec eslint src/server/projects-store.ts src/server/work-item-supervisor.ts src/server/work-item-notification-digest.ts src/server/project-branch-manager.ts src/server/work-item-merge-healer.ts src/server/work-item-run-timeline.ts src/lib/projects-view-model.ts src/screens/projects/project-detail-screen.tsx src/screens/projects/work-item-detail-screen.tsx scripts/mission-control-always-on-policy-gauntlet.mjs
   pnpm exec tsc --noEmit --pretty false
   ```
4. Write a markdown baseline report with:
   - command exit codes;
   - counts / representative errors;
   - changed-file ESLint blockers;
   - TypeScript errors in changed Always-On files/tests;
   - broad legacy lint/type debt noted separately.
5. Update handoff with baseline report path.

**Acceptance:** There is a durable baseline report that tells the next task exactly what to fix and what to classify as legacy debt.

---

## Task 2 — Fix changed-file TypeScript blockers

**Objective:** Make the changed Always-On implementation and adjacent tests type-correct without broad refactors.

**Likely files from CEO review:**

- Modify/test: `src/lib/projects-view-model.ts`
- Modify/test: `src/lib/projects-view-model.test.ts`
- Modify/test: `src/screens/projects/project-detail-screen.tsx`
- Modify/test: `src/screens/projects/project-detail-screen.test.ts`
- Modify/test: `src/screens/projects/work-item-detail-screen.tsx`
- Modify/test: `src/screens/projects/work-item-detail-screen.test.ts`
- Modify/test as needed: `src/server/projects-store.ts`, `src/server/project-autonomy-lane.test.ts`, `src/server/project-route.test.ts`

**Known examples from CEO review to investigate first:**

- `ProjectSummary` / `WorkItemRecord` imported from `projects-view-model` tests but not exported.
- `work-item-detail-screen.tsx` appears to use a narrowed partial payload where full `WorkItemRecord` fields are expected.
- `ProjectAutonomyLanePolicy` fixtures missing required `alwaysOn` after the Always-On policy addition.
- `ProjectSummary` fixtures missing newly required `runtimeProfiles`, `autopilotPolicy`, or `autonomyLanePolicy`.
- Some route handler type errors are broad TanStack test typing debt; classify only if not introduced by this slice.

**Steps:**

1. Run focused typecheck and save full output to temp:
   ```bash
   pnpm exec tsc --noEmit --pretty false 2>&1 | tee /tmp/hermes-workspace-tsc-merge-readiness.txt
   ```
2. Extract errors for changed Always-On files only:
   ```bash
   grep -E 'src/(lib/projects-view-model|screens/projects/project-detail-screen|screens/projects/work-item-detail-screen|server/projects-store|server/project-autonomy-lane|server/project-route|server/work-item-supervisor|server/work-item-notification-digest|server/project-branch-manager|server/work-item-merge-healer|server/work-item-run-timeline)' /tmp/hermes-workspace-tsc-merge-readiness.txt || true
   ```
3. Fix only those errors unless a shared fixture helper cleanly removes repeated test fixture drift.
4. Prefer exported test helper builders or normalizers over copy-pasted partial object casts.
5. Run focused tests after each fix cluster:
   ```bash
   pnpm test src/lib/projects-view-model.test.ts src/screens/projects/project-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand
   pnpm test src/server/projects-store.test.ts src/server/project-route.test.ts src/server/project-autonomy-lane.test.ts -- --runInBand
   ```
6. Re-run full typecheck:
   ```bash
   pnpm exec tsc --noEmit --pretty false
   ```
7. If full typecheck still fails due legacy untouched files, update the report with a clear changed-file-clean vs legacy-debt classification.
8. Update handoff.

**Acceptance:** No TypeScript errors remain in files changed by the Always-On slice. Any remaining `tsc --noEmit` failures are explicitly documented as pre-existing/broad debt with representative paths.

---

## Task 3 — Fix changed-file ESLint blockers

**Objective:** Make ESLint clean for the changed Always-On implementation files without mass formatting the repo.

**Files:**

Use the changed-file subset from CEO review:

```bash
src/server/projects-store.ts
src/server/work-item-supervisor.ts
src/server/work-item-notification-digest.ts
src/server/project-branch-manager.ts
src/server/work-item-merge-healer.ts
src/server/work-item-run-timeline.ts
src/lib/projects-view-model.ts
src/screens/projects/project-detail-screen.tsx
src/screens/projects/work-item-detail-screen.tsx
scripts/mission-control-always-on-policy-gauntlet.mjs
```

**Steps:**

1. Run changed-file ESLint:
   ```bash
   pnpm exec eslint src/server/projects-store.ts src/server/work-item-supervisor.ts src/server/work-item-notification-digest.ts src/server/project-branch-manager.ts src/server/work-item-merge-healer.ts src/server/work-item-run-timeline.ts src/lib/projects-view-model.ts src/screens/projects/project-detail-screen.tsx src/screens/projects/work-item-detail-screen.tsx scripts/mission-control-always-on-policy-gauntlet.mjs
   ```
2. Fix deterministic issues only in changed files:
   - split type-only imports into top-level `import type` statements;
   - use `Array<T>` instead of `T[]` where repo lint requires it;
   - remove unnecessary optional chains / nullish coalescing introduced by this slice;
   - sort import specifiers where required;
   - rename narrow generic parameter `K` if lint requires `T...` naming.
3. Do **not** run `eslint --fix` across the whole repo.
4. Re-run changed-file ESLint until clean or only documented pre-existing rules remain in unchanged legacy sections of those files.
5. Run focused tests and build:
   ```bash
   pnpm test src/server/project-branch-manager.test.ts src/server/work-item-supervisor.test.ts src/server/work-item-notification-digest.test.ts src/lib/projects-view-model.test.ts src/screens/projects/project-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand
   pnpm build
   ```
6. Update baseline/final report and handoff.

**Acceptance:** Changed-file ESLint subset is clean, or every remaining issue is explicitly justified as legacy debt in a touched file that this slice did not introduce.

---

## Task 4 — Re-run full functional gauntlet after stabilization

**Objective:** Prove type/lint fixes did not break the already accepted Always-On policy behavior.

**Commands:**

```bash
node --check scripts/mission-control-always-on-policy-gauntlet.mjs
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm vitest run
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-merge-readiness-smoke.html
node scripts/mission-control-always-on-policy-gauntlet.mjs
```

Then browser/DOM verify the real project detail page still contains:

- `PROJECT LANE COCKPIT`
- `ALWAYS-ON POLICY`
- retry / notification / PR / cleanup safety copy

**Acceptance:** Functional verification remains green after quality fixes, and a fresh gauntlet report exists.

---

## Task 5 — Final pre-commit review package

**Objective:** Prepare the slice for an owner commit/merge decision.

**Files:**

- Create: `dogfood-output/always-on-merge-readiness-final-YYYY-MM-DDTHH-MM-SS.md`
- Update alias: `dogfood-output/always-on-merge-readiness-final-latest.md`
- Update: `docs/handoff/current-slice-status.md`
- Update: `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`

**Steps:**

1. Generate final report with:
   - git status / diff stat;
   - final functional command results;
   - changed-file lint result;
   - full lint classification;
   - typecheck result/classification;
   - latest Always-On gauntlet report path;
   - service/smoke/browser evidence;
   - candidate repo hygiene.
2. Run a static security scan on added lines:
   ```bash
   git diff | grep '^+' | grep -iE '(api_key|secret|password|token|passwd)\s*=\s*['"'"'][^'"'"']{6,}['"'"']' || true
   git diff | grep '^+' | grep -E 'os\.system\(|subprocess.*shell=True|\beval\(|\bexec\(|pickle\.loads?\(' || true
   ```
3. If the diff remains very large, do not commit automatically; report that the slice is ready for owner review and ask Main/CEO whether to commit.
4. Update the implementation index so this stabilization plan is marked active while running, then shipped after final verification.
5. Update handoff with the next action:
   - if clean: “Owner/Main may commit or request independent review.”
   - if not clean: exact blockers and recommended fix task.

**Acceptance:** D3n13r can make a commit/merge decision from one final report without reading raw terminal output.

---

## Verification matrix

Before this stabilization slice is considered shipped:

```bash
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm vitest run
pnpm build
git diff --check
pnpm exec eslint src/server/projects-store.ts src/server/work-item-supervisor.ts src/server/work-item-notification-digest.ts src/server/project-branch-manager.ts src/server/work-item-merge-healer.ts src/server/work-item-run-timeline.ts src/lib/projects-view-model.ts src/screens/projects/project-detail-screen.tsx src/screens/projects/work-item-detail-screen.tsx scripts/mission-control-always-on-policy-gauntlet.mjs
pnpm exec tsc --noEmit --pretty false
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-merge-readiness-smoke.html
node scripts/mission-control-always-on-policy-gauntlet.mjs
```

Full `pnpm lint` is desirable but currently known to fail from broad legacy debt. Do not block this slice on unrelated historical files; do block on changed Always-On files.

---

## Copy-paste Builder prompt

Proceed on Hermes Workspace Always-On Merge Readiness / Type-Lint Stabilization.

Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

Read in order:

1. `docs/handoff/current-slice-status.md`
2. `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
3. `docs/plans/2026-04-28-hermes-workspace-always-on-merge-readiness-plan.md`
4. Latest Always-On policy report: `dogfood-output/always-on-policy-gauntlet-latest.md`

Start with Task 1. This is a stabilization slice only: no new features, no parallel worktrees, no destructive cleanup, no PR publishing, no broad auto-formatting. Fix changed-file TypeScript and ESLint blockers, preserve all green functional verification, and update handoff after each task.
