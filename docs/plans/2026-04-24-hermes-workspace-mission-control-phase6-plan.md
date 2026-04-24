# Hermes Workspace Mission Control Phase 6 — Lifecycle Completion + Operator Recovery Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task. Treat the 2026-04-22 continuation handoff as the authoritative project-state brief and this document as the authoritative implementation plan for the next Mission Control slice.

**Goal:** Extend Hermes Workspace from a strong work-item/review cockpit into a more complete single-user Mission Control by finishing the workflow beyond review, adding operator recovery controls, and tightening dashboard/governance visibility.

**Architecture:** Keep `Projects + Work Items` as the source of truth, keep `Conductor` as the execution engine, and push all important workflow transitions through server-owned lifecycle logic instead of ad hoc UI-only status changes. Phase 6 should preserve the existing operator cockpit while closing the biggest remaining workflow gap: `review approved -> deploy -> deploy approval -> done`, plus recovery flows for blocked/failed work.

**Tech Stack:** TanStack Router, React Query, React/TSX, file-backed stores, Hermes jobs/Conductor launch pipeline, Vitest, local `hermes-workspace.service` runtime.

---

## 1. Current grounded starting point

Verified before writing this plan:
- Runtime repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Local app URL: `http://localhost:3456`
- Local service: `hermes-workspace.service`
- Branch state during audit: `my-hermes-workspace-dev...origin/my-hermes-workspace-dev`
- Builder is now the main Hermes profile and the intended implementation/build role.

Already implemented and verified:
- project/work-item control plane
- work-item launch into Conductor
- project phase routing + work-item override precedence
- approvals inbox for review flows
- workflow-aware project board + dashboard operator overview
- workflow-specific launch labels in work-item detail
- canonical mission/job/session linkage persistence

Grounded remaining gap:
- `src/server/work-item-lifecycle.ts` only owns:
  - `send_to_planning`
  - `mark_ready`
  - `request_review`
- `src/server/work-item-approvals.ts` already supports approval phases `review | deploy`
- current workflow effectively resolves review approval directly to `done`

That means the next slice should **not** revisit routing. It should finish the lifecycle and operator control model.

---

## 2. Product target for this phase

After this phase, Hermes Workspace should behave more like:

`idea capture -> planning with Researcher -> build with Builder -> review approval -> deploy launch -> deploy approval -> done`

and operators should also have explicit recovery paths for:
- mission failed
- blocked work
- review changes requested
- relaunch/resume after correction

---

## 3. Non-goals for this phase

Do **not** do these unless directly required by implementation:
- replace the file-backed persistence layer
- redesign the entire dashboard information architecture
- invent a multi-user approval system
- add drag/drop board mechanics
- add external notification systems
- rewrite the Conductor launch architecture

Stay merge-safe and minimal.

---

## 4. Likely files to inspect and/or modify

### Server/domain
- `src/server/work-item-lifecycle.ts`
- `src/server/work-item-lifecycle.test.ts`
- `src/server/work-item-approvals.ts`
- `src/server/work-item-approvals.test.ts`
- `src/server/work-item-launch.ts`
- `src/server/work-item-execution.ts`

### Client API / shared types
- `src/lib/work-item-execution-api.ts`
- `src/lib/work-item-approvals-api.ts`
- `src/lib/projects-api.ts`
- `src/lib/projects-view-model.ts`

### UI
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.test.ts`
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/project-detail-screen.test.ts`
- `src/screens/dashboard/dashboard-screen.tsx`
- `src/screens/dashboard/dashboard-screen.test.ts`
- `src/screens/projects/approvals-inbox-screen.tsx`

### Routes
- `src/routes/api/work-items.$workItemId.lifecycle.ts`
- `src/routes/api/work-item-approvals.ts`
- `src/routes/projects/$projectId/work-items/$workItemId.tsx`

### Docs to keep updated after implementation
- `docs/plans/2026-04-22-hermes-workspace-mission-control-continuation-handoff.md`
- `docs/plans/2026-04-21-hermes-workspace-mission-control-roadmap.md`

---

## 5. Execution protocol for Builder

For every task below:
1. inspect current implementation first
2. add or update failing tests first where practical
3. patch the minimal set of files
4. run targeted tests
5. run `pnpm build`
6. restart `hermes-workspace.service`
7. verify live at `http://localhost:3456`
8. update `docs/plans` continuation docs after the slice is grounded

Standard commands:
```bash
pnpm vitest run <targeted-files>
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Verification notes:
- use Python instead of `jq`
- if onboarding overlay appears, click `Skip setup`
- check browser console after front-end changes
- prefer live verification against project `46b401f9-9243-472f-b5b7-04bf34596906` unless a fresh test item is required

---

## 6. Implementation plan

## Slice 6A — Finish the authoritative lifecycle beyond review

### 2026-04-24 execution update
- ✅ Task 1 complete (RED tests added for deploy path + recovery actions)
- ✅ Task 2 complete (server lifecycle actions extended with deploy approval + blocked-build resume)
- ✅ Task 3 complete (deploy approval treated as first-class phase; review no longer collapses directly to done)
- ✅ Task 4 complete (work-item detail lifecycle helpers updated for deploy/recovery labels and action availability)
- ✅ Task 5 complete (live end-to-end verification executed against running app and persisted in continuation docs)

### Task 1: Lock the current workflow contract in tests before changing behavior
**Objective:** Make the intended new lifecycle explicit in tests first.

**Files:**
- Modify: `src/server/work-item-lifecycle.test.ts`
- Modify: `src/server/work-item-approvals.test.ts`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`

**Steps:**
1. Add RED tests describing the desired post-review flow:
   - review approval should move work into deploy, not straight to done
   - deploy should have its own approval/completion semantics
   - work-item detail should expose deploy-oriented actions when the item is in deploy state
2. Add RED tests for recovery behavior:
   - changes requested should return to build with actionable follow-up state
   - failed/blocked work should expose retry or relaunch paths
3. Run targeted tests and confirm failure.

**Verification:**
```bash
pnpm vitest run src/server/work-item-lifecycle.test.ts src/server/work-item-approvals.test.ts src/screens/projects/work-item-detail-screen.test.ts
```

### Task 2: Extend server lifecycle actions to include deploy-oriented transitions
**Objective:** Keep lifecycle control authoritative on the server.

**Files:**
- Modify: `src/server/work-item-lifecycle.ts`
- Modify: `src/lib/work-item-execution-api.ts`
- Modify: `src/routes/api/work-items.$workItemId.lifecycle.ts`
- Modify: `src/lib/projects-api.ts`

**Target behavior:**
Add explicit lifecycle actions such as the minimal set needed for:
- moving an approved review item into deploy readiness/active deploy
- marking deploy as pending approval when appropriate
- finalizing done only after deploy completion/approval

**Implementation notes:**
- prefer extending the existing action model instead of adding parallel one-off routes
- keep action labels workflow-specific
- avoid direct UI-only state edits

**Verification:**
```bash
pnpm vitest run src/server/work-item-lifecycle.test.ts src/lib/work-item-execution-api.ts
```

### Task 3: Extend approvals logic to treat deploy as a first-class governed phase
**Objective:** Make deploy approval real, not implied.

**Files:**
- Modify: `src/server/work-item-approvals.ts`
- Modify: `src/server/work-item-approvals.test.ts`
- Modify: `src/lib/work-item-approvals-api.ts`
- Modify: `src/routes/api/work-item-approvals.ts`

**Target behavior:**
- request deploy approval explicitly
- resolve deploy approval into the correct final work-item state
- keep history entries clear and phase-specific
- preserve review policy behavior without breaking existing review flows

**Verification:**
```bash
pnpm vitest run src/server/work-item-approvals.test.ts src/server/work-item-lifecycle.test.ts
```

### Task 4: Update work-item detail into a full phase-aware execution cockpit
**Objective:** Reflect the new lifecycle and approval model in the operator UI.

**Files:**
- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`

**Target behavior:**
- show the next correct action for deploy-phase items
- expose deploy approval status clearly
- keep research/build/review/deploy action labels distinct
- keep mission evidence visible and phase-aware
- preserve the planning/build/review flows that already work

**Verification:**
```bash
pnpm vitest run src/screens/projects/work-item-detail-screen.test.ts
```

### Task 5: Run live end-to-end verification for the extended lifecycle
**Objective:** Prove the workflow is grounded in the real app, not just tests.

**Steps:**
1. Create or reuse a suitable work item.
2. Drive it through:
   - planning
   - build
   - review
   - deploy
   - done
3. Confirm approvals/history/state transitions update correctly in:
   - project board
   - work-item detail
   - approvals inbox
   - dashboard if relevant
4. Update continuation docs with exact live findings.

**Verification:**
```bash
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

---

## Slice 6B — Add operator recovery flows

### 2026-04-24 execution update
- ✅ Task 6 complete (RED→GREEN tests lock failed-mission recovery signals, recovery hints, and resume guidance)
- ✅ Task 7 complete (server recovery semantics hardened: resume clears stale failure state, relaunch clears old error + records recovery-specific launch history)
- ✅ Task 8 complete (operator recovery surfaced in UI: project cards now show explicit recovery hints; detail guidance/execution summary now points to Resume Build + relaunch)

### Task 6: Lock recovery expectations in tests
**Objective:** Describe the operator recovery model before implementation.

**Files:**
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`
- Modify: `src/lib/projects-view-model.test.ts`
- Modify: `src/server/work-item-execution.test.ts`

**Target behavior:**
- failed mission -> relaunch/retry path visible
- blocked work -> operator guidance is explicit
- changes requested -> clear return-to-build posture

### Task 7: Add minimal server-safe relaunch/retry behavior
**Objective:** Provide recovery without duplicating launch architecture.

**Files:**
- Modify: `src/server/work-item-launch.ts`
- Modify: `src/server/work-item-execution.ts`
- Modify: `src/server/work-item-lifecycle.ts`
- Modify: `src/server/work-item-launch.test.ts`

**Implementation notes:**
- reuse existing launch path
- avoid creating a second orchestration contract
- ensure history entries clearly record retries/relaunches
- preserve canonical mission linkage semantics

### Task 8: Surface operator recovery controls in work-item detail and cards
**Objective:** Reduce operator friction during failure/rework.

**Files:**
- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/project-detail-screen.tsx`
- Modify: `src/lib/projects-view-model.ts`
- Modify: related tests

**Target behavior:**
- clearer recovery CTA for failed work
- stronger signal chips for failure/rework state
- optional quick action from project cards if the implementation stays minimal and clean

---

## Slice 6C — Strengthen dashboard/operator console behavior

### Task 9: Add failed-mission and cross-project attention emphasis to dashboard tests
**Objective:** Define the next dashboard operator contract in tests first.

**Files:**
- Modify: `src/screens/dashboard/dashboard-screen.test.ts`

**Target behavior:**
- failed missions deserve top-level visibility
- dashboard queue semantics should favor operator-now attention

### Task 10: Implement minimal dashboard escalation improvements
**Objective:** Make `/dashboard` a stronger command center without overbuilding.

**Files:**
- Modify: `src/screens/dashboard/dashboard-screen.tsx`
- Modify: `src/lib/projects-view-model.ts` if helpful
- Modify: tests

**Good minimal candidates:**
- failed missions summary/queue
- direct shortcuts into the exact affected work item
- clearer “what needs action now” hierarchy

### Slice 6C execution update (2026-04-24)
- ✅ Task 9 complete (RED→GREEN): `src/screens/dashboard/dashboard-screen.test.ts` now locks failed-mission visibility and cross-project attention ordering semantics.
- ✅ Task 10 complete: `src/screens/dashboard/dashboard-screen.tsx` now surfaces `Failed missions` in top-level summary tiles and adds a dedicated failed queue card.
- Queue escalation semantics now prioritize failed work by project-level attention pressure (pending approvals + blocked/running/failed work), with deterministic recency tie-breakers.
- Live dashboard verification at `http://localhost:3456/dashboard` confirms:
  - `FAILED MISSIONS` summary tile renders with operator escalation copy.
  - dedicated `FAILED MISSIONS` queue card renders with direct work-item navigation.

---

## Slice 6D — Tighten governance visibility

### Task 11: Extend workflow policy surface to mention deploy governance explicitly
**Objective:** Make routing/governance feel like a real operator contract.

**Files:**
- Modify: `src/screens/projects/project-detail-screen.tsx`
- Modify: `src/screens/projects/project-detail-screen.test.ts`

**Target behavior:**
- deploy governance sits beside review governance conceptually
- policy summary better reflects the full workflow, not only research/build/review
- do not overbuild persistence unless required by the server design

### Slice 6D execution update (2026-04-24)
- ✅ Task 11 complete (RED→GREEN): `src/screens/projects/project-detail-screen.test.ts` now locks explicit deploy-governance policy contract alongside review governance.
- ✅ `src/screens/projects/project-detail-screen.tsx` now surfaces deploy governance as a first-class policy block beside review governance in the workflow policy panel.
- Deploy governance summary is now explicit and phase-aware:
  - when deploy profile is set: routes deploy launches to that profile and still requires explicit deploy approval before done
  - when deploy profile is unset: uses auto fallback routing and still requires explicit deploy approval before done
- Live verification at `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906` confirms `DEPLOY GOVERNANCE` renders in Workflow Policy with explicit approval gating language.

---

## Slice 6E — Close the loop in docs and handoff

### Task 12: Update roadmap + continuation handoff with grounded outcomes
**Objective:** Prevent loss of context after implementation.

**Files:**
- Modify: `docs/plans/2026-04-22-hermes-workspace-mission-control-continuation-handoff.md`
- Modify: `docs/plans/2026-04-21-hermes-workspace-mission-control-roadmap.md`
- Modify: this file if priorities shift during implementation

**Required doc outcomes:**
- what shipped
- what was live-verified
- exact next priority after Phase 6
- any unresolved edge cases or consciously deferred work

### Slice 6E execution update (2026-04-24)
- ✅ Task 12 complete: roadmap + continuation docs now capture grounded shipped/live-verified outcomes for slices 6A–6D and the exact post-Phase-6 queue.
- ✅ Phase 6 exit criteria are now satisfied and explicitly documented:
  - lifecycle beyond review is governed through deploy approval
  - recovery flows exist for failed/blocked/rework states
  - dashboard escalates failed cross-project attention
  - workflow policy now shows deploy governance beside review governance
- ✅ Verification rerun for closeout:
  - `pnpm vitest run src/screens/projects/project-detail-screen.test.ts src/screens/dashboard/dashboard-screen.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
  - live checks at `/dashboard` and `/projects/46b401f9-9243-472f-b5b7-04bf34596906`
- Post-Phase-6 hardening follow-ups (2026-04-24) completed in two passes:
  - pass 1: work-item detail sync degrades to `execution.state='unknown'` instead of surfacing `Dashboard index failed: 500` as a route-level failure for `/api/work-items/:id?syncExecution=true`
  - pass 2: direct Hermes job-id lookup failures now fall back to dashboard job-list matching (`src/server/work-item-execution.test.ts` coverage: `falls back to dashboard job list lookup when direct job-id lookup fails`)

---

## 7. Exit criteria for the whole phase

Phase 6 is complete when all of the following are true:
- review no longer collapses straight into done unless that is an explicit intended policy path
- deploy exists as a visible governed step in the workflow
- operator recovery flows exist for failed/blocked/rework cases
- dashboard better surfaces urgent cross-project operator attention
- project policy view reflects the fuller Mission Control model
- targeted tests pass
- `pnpm build` passes
- `hermes-workspace.service` runs cleanly after restart
- continuation docs are updated with grounded live findings

---

## 8. Builder execution guidance

If Builder implements this plan, Builder should work slice-by-slice, not all at once.

Recommended order:
1. Slice 6A
2. Slice 6B
3. Slice 6C
4. Slice 6D
5. Slice 6E

After each slice:
- stop
- verify
- update docs
- report what changed, what passed, what remains

Do **not** silently continue into the next slice if verification is weak or if the live app behavior diverges from the intended operator model.

---

## 9. Suggested commit boundaries

- `test: lock phase-6 lifecycle expectations`
- `feat: extend work-item lifecycle through deploy`
- `feat: add deploy approval flow`
- `feat: add operator recovery controls`
- `feat: strengthen mission control dashboard attention queues`
- `docs: update mission control handoff after phase 6`

---

## 10. Bottom line

This plan is intentionally focused on the highest-value remaining gap between the current Hermes Workspace and the dreamed Mission Control.

The foundation is already there. The next evolution should **not** chase new architecture for its own sake.

It should finish the real operator workflow:

**idea -> research -> build -> review -> deploy -> done**

with strong recovery and visibility when reality gets messy.
