# Hermes Workspace — Dream Mission Control Slices Plan (2026-04-25)

> **For Hermes:** Execute this plan slice-by-slice with the established flow: inspect → tests-first (where practical) → minimal patch set → targeted tests → full tests → build → restart service → live verify.

**Goal:** Evolve Hermes Workspace from a strong operator board into a **dream Mission Control** for autonomous, stable, high-quality kanban-driven delivery.

**Architecture direction:** Build on the existing project/work-item/approval control plane and two-phase Planner→Builder launch flow by adding stronger quality gates, safer API envelopes, flow-control telemetry, and proactive operator alerts.

**Current baseline (already shipped):**
- Slices A–J shipped (phase routing rework, two-phase orchestration, risk level + automation, lifecycle completeness, acceptance-criteria check-off, WIP awareness, blocked-reason taxonomy, deploy rejection return-to-build, sync fallback envelope, Planner-as-Reviewer)
- **Slice K shipped** — Notification watchdog (status digest, de-dup, Discord-formatted output)
- Regression baseline: `138/138` passing
- Service/runtime baseline: `hermes-workspace.service` active, app at `http://localhost:3456`

---

## 1) Priority roadmap (what to build next)

### P0 — Operational excellence (QUEUE)
1. **Slice L — Labels/tags + lightweight analytics counters**

---

## 2) Detailed implementation slices

## Slice H1 — WIP awareness (board flow control)

**Objective:** Make overload visible and discourage over-launching by surfacing WIP pressure in board/detail UX.

**Files to modify (expected):**
- `src/lib/projects-view-model.ts`
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/project-detail-screen.test.ts`
- (optional) `src/screens/dashboard/dashboard-screen.tsx` if showing project WIP pressure summary

**Model/UI behavior:**
- Add computed `activeCount` per project column/scope.
- Add threshold constant (start with `3`, configurable later).
- Show warning badge when `activeCount >= threshold`.
- Add operator hint near launch controls: “WIP is high; finish one active item first.”

**Acceptance criteria:**
- WIP badge appears when threshold reached.
- WIP badge disappears below threshold.
- No breaking change to existing board sorting/filter behavior.

**Verification:**
- Targeted tests for view-model + project-detail render.
- Live verify by creating/transitioning items to `active`.

---

## Slice H2 — blocked-reason taxonomy (actionable blocked state)

**Objective:** Replace generic blocked state with structured reasons to improve recovery guidance and board triage.

**Files to modify (expected):**
- `src/server/work-items-store.ts`
- `src/routes/api/work-items.ts`
- `src/routes/api/work-items.$workItemId.ts`
- `src/server/work-item-lifecycle.ts`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/server/work-items-store.test.ts`
- `src/server/work-item-lifecycle.test.ts`

**Model behavior:**
- Add optional field:
  - `blockedReason: 'mission_failed' | 'review_feedback' | 'blocked_by_dependency' | 'external' | 'other'`
- Set/retain reason during transitions to `status='blocked'`.
- Allow manual operator override/edit from detail screen.

**Acceptance criteria:**
- Blocked items show reason badges.
- Guidance text varies by blocked reason.
- Reason survives update/lifecycle transitions unless explicitly changed.

**Verification:**
- Lifecycle tests cover reason assignment.
- Live verify blocked scenarios and reason visibility.

### H1/H2 execution snapshot (shipped 2026-04-25)
- Added project-level WIP threshold helpers + constants and surfaced `WIP high` warning/hint on project detail board.
- Added blocked-reason taxonomy across API/store/lifecycle/execution/UI:
  - `mission_failed | review_feedback | blocked_by_dependency | external | other`
- Added board blocked-reason badges and detail-level blocked reason/guidance surfaces.
- Added targeted coverage across:
  - `projects-view-model`, `project-detail-screen`, `work-item-detail-screen`
  - `work-items-store`, `work-item-lifecycle`, `work-item-execution`
- Verification completed:
  - targeted tests: `58/58` passing
  - full regression: `124/124` passing
  - `pnpm build` clean
  - `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
  - live verification on `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906`
- Temporary live verification mutation on demo work item was restored to original workflow state (`active/build`, `blockedReason=null`).

---

## Slice I1 — Deploy rejection should return to build

**Objective:** Remove deploy dead-loop by routing deploy rejection/changes-requested back to build relaunch posture.

**Files to modify (expected):**
- `src/server/work-item-approvals.ts`
- `src/server/work-item-approvals.test.ts`
- (optional text updates) `src/screens/projects/work-item-detail-screen.tsx`

**Current issue:** deploy rejection currently keeps item in deploy state.

**Target behavior:**
- Deploy `rejected` and `changes_requested` → `status='active'`, `phase='build'`.
- History note clearly says returned to build for correction/relaunch.

**Acceptance criteria:**
- Tests verify new transition behavior.
- UI guidance reflects build-correction loop.

### I1 execution snapshot (shipped 2026-04-25)
- Updated deploy approval resolution so `rejected` and `changes_requested` decisions return work item to `status=active`, `phase=build`.
- Added explicit history notes for correction/relaunch loop:
  - `Deploy rejected; returned work item to build for correction and relaunch.`
  - `Deploy requested changes; returned work item to build for correction and relaunch.`
- Primary implementation file:
  - `src/server/work-item-approvals.ts`
- Test-first coverage added in:
  - `src/server/work-item-approvals.test.ts`

**Verification completed:**
- targeted tests:
  - `pnpm test src/server/work-item-approvals.test.ts src/server/work-item-lifecycle.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `40/40` passing
- full regression:
  - `pnpm test` -> `126/126` passing
- build:
  - `pnpm build` clean
- service:
  - `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- live API verification on target project:
  - created temporary deploy-phase item, requested deploy approval, resolved as `rejected`
  - observed result `status=active`, `phase=build` with expected history note
  - temporary verification work item deleted after check

---

## Slice I2 — `executionSyncWarning` fallback envelope

**Objective:** Improve runtime resilience when execution sync fails without taking down detail API payload.

**Files to modify (expected):**
- `src/routes/api/work-items.$workItemId.ts`
- `src/lib/work-item-execution-api.ts`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/server/work-item-execution.test.ts` (or route-level tests)

**Target behavior:**
- If `syncExecution=true` sync path fails, still return base work-item payload + non-fatal warning:
  - `executionSyncWarning: string`
- UI renders subtle warning toast/banner and keeps page usable.

**Acceptance criteria:**
- No 500 for recoverable sync errors.
- Work item still visible/editable.
- Warning is observable in UI and tests.

### I2 execution snapshot (shipped 2026-04-25)
- Route fallback implemented in `src/routes/api/work-items.$workItemId.ts`:
  - when `syncExecution=true` throws, API now returns base payload + `executionSyncWarning` (HTTP 200) instead of 500.
- Added route-level regression test:
  - `src/server/work-item-detail-route.test.ts`
  - verifies fallback envelope (`workItem` present, `executionSyncWarning` present, no `execution` payload required).
- Added UI warning contract in work-item detail:
  - `WORK_ITEM_EXECUTION_SYNC_WARNING_TITLE`
  - `getWorkItemExecutionSyncWarningMessage(...)`
  - warning banner + warning toast path in `src/screens/projects/work-item-detail-screen.tsx`.
- Added screen helper tests:
  - `src/screens/projects/work-item-detail-screen.test.ts` validates warning title/message contract.

**Verification:**
- Targeted tests:
  - `pnpm test src/server/work-item-execution.test.ts src/server/work-item-detail-route.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `16/16` passing
- Full regression: `128/128` passing (`pnpm test`)
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live API verification on target project:
  - created temporary work item, called `GET /api/work-items/:id?syncExecution=true`, verified HTTP 200 payload, then deleted temporary item

---

### J execution snapshot (shipped 2026-04-25)
- **Objective achieved:** Autonomous Planner review pass after build completion for two-phase pipeline items (those with `planFilePath`).
- Added data model fields for Planner review tracking:
  - `reviewJobId?: string` — tracks the Planner review Conductor job
  - `reviewState?: 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'`
  - `reviewDecision?: 'approved' | 'changes_requested'`
- Added `buildPlannerReviewGoal()` in `src/server/work-item-launch.ts` — builds a structured review prompt with:
  - work item context (title, description, project info)
  - plan file path reference
  - acceptance criteria + per-criterion met/unmet status (e.g. `1/2 criteria met`)
  - explicit `DECISION: APPROVED` / `DECISION: CHANGES_REQUESTED` output instruction
- Added `launchPlannerReview()` in `src/server/work-item-launch.ts` — fires a Conductor review mission using the `planner` profile when work item has `planFilePath`
- Extended `syncWorkItemExecutionState` in `src/server/work-item-execution.ts`:
  - After `build->review` auto-transition (build mission success), launches Planner review mission for items with `planFilePath`
  - Records review mission launch in work-item history with job ID reference
  - On subsequent sync cycles, auto-resolves pending review approval when Planner review mission completes:
    - review job `succeeded` → approval `approved`, work item advances to `active/deploy` with history note
    - review job `failed` → approval `changes_requested`, work item returns to `active/build` with error context
- Added PATCH route support in `src/routes/api/work-items.$workItemId.ts` for `planFilePath`, `reviewJobId`, `reviewState`, `reviewDecision`
- Added Planner Review Status indicator in work-item detail Mission Control Summary panel:
  - `Planner Review Job`, `Planner Review State`, `Planner Review Decision` detail entries
  - Decision labels: `✅ Approved — advance to deploy` / `🔧 Changes Requested — return to build`
- Added `reviewDecisionLabel()` exported helper in `work-item-detail-screen.tsx`
- New test coverage:
  - `work-item-launch.test.ts`: 2 tests — `buildPlannerReviewGoal` with full context (plan/criteria/decision) + graceful empty handling
  - `work-item-detail-screen.test.ts`: 1 test — `reviewDecisionLabel` for approved/changes_requested/unknown/empty
- Full regression baseline: `131/131` passing (`pnpm test`)
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live API verification on target project:
  - created test work item with `planFilePath`
  - PATCH `reviewJobId`/`reviewState`/`reviewDecision` round-trips correctly
  - GET with `syncExecution=true` returns review fields
  - test work item cleaned up
- Decision is traceable in work-item history (Planner review launch + auto-resolution both record history entries).
- Compatible with existing low-risk auto-approve policy (work item can be auto-approved before Planner review completes).

---

### K execution snapshot (shipped 2026-04-25)
- **Objective achieved:** Proactive operator alerting with a scheduled notification digest for pending approvals, blocked items, and failed missions.
- Created `src/server/work-item-notification-digest.ts` with:
  - `buildStatusDigest()` — aggregates pending review/deploy approvals, blocked work items, and failed-mission work items across all projects
  - `formatDigestForDiscord()` — produces a structured Discord-ready message with emoji-coded sections and summary header
  - `digestStateHasChanged()` / `persistDigestHash()` — file-based de-dup window using SHA-256 hash of canonical state
  - `formatDigestAge()` — human-readable age formatting (minutes, hours)
- Created `src/routes/api/work-item-notification-digest.ts`:
  - `GET /api/work-item-notification-digest` — returns JSON digest + `hasChanged` flag + pre-formatted Discord message
  - `GET /api/work-item-notification-digest?format=discord` — returns only the formatted message for cron delivery
- New test coverage: 7 tests in `work-item-notification-digest.test.ts`
- Full regression: `138/138` passing (`pnpm test`)
- `pnpm build` clean, service restarted and active
- Live API verification: created project + review-phase work item + pending approval, confirmed digest returns 1 pending approval with `hasChanged: true`, formatted Discord message renders correctly
- **Cron wiring documented:** Operator can schedule periodic delivery via `cronjob create --prompt "..." --schedule "every 15m"` targeting the digest endpoint

---

## Slice L — Labels/tags + lightweight analytics

**Objective:** Improve project slicing and decision support with labels and minimal metrics.

**Files to modify (expected):**
- `src/server/work-items-store.ts`
- `src/routes/api/work-items.ts`
- `src/routes/api/work-items.$workItemId.ts`
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/lib/projects-view-model.ts`

**Target behavior:**
- Add `labels: string[]` to work item.
- Detail screen supports add/remove labels.
- Board filtering by label.
- Lightweight metrics (initial): active count, blocked count, done this week.

**Acceptance criteria:**
- Labels persist and filter correctly.
- Metrics render consistently with existing data model.

---

## 3) Execution protocol per slice (non-negotiable)

1. Inspect current implementation (no blind patching)
2. Add/update tests first where practical
3. Patch minimal files only
4. Run targeted tests
5. Run full tests (`pnpm vitest run`)
6. Build (`pnpm build`)
7. Restart service (`systemctl --user restart hermes-workspace.service`)
8. Live verify on:
   - `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906`
9. Update docs (`roadmap`, `continuation handoff`, this plan)

---

## 4) Definition of Done for each slice

A slice is only “shipped” when all are true:
- targeted tests pass
- full regression passes
- build passes
- service active after restart
- live verification completed
- docs updated with grounded state + next queue

---

## 5) Suggested sequence for immediate execution

- **Now:** Slice J (autonomous quality gate)
- **Then:** Slice K (notification watchdog)
- **After:** Slice L (labels + analytics)

This ordering gives best risk reduction and fastest mission-control quality gains.
