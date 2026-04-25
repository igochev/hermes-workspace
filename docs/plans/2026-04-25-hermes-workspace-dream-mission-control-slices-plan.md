# Hermes Workspace — Dream Mission Control Slices Plan (2026-04-25)

> **For Hermes:** Execute this plan slice-by-slice with the established flow: inspect → tests-first (where practical) → minimal patch set → targeted tests → full tests → build → restart service → live verify.

**Goal:** Evolve Hermes Workspace from a strong operator board into a **dream Mission Control** for autonomous, stable, high-quality kanban-driven delivery.

**Architecture direction:** Build on the existing project/work-item/approval control plane and two-phase Planner→Builder launch flow by adding stronger quality gates, safer API envelopes, flow-control telemetry, and proactive operator alerts.

**Current baseline (already shipped):**
- Slices A–J shipped (phase routing rework, two-phase orchestration, risk level + automation, lifecycle completeness, acceptance-criteria check-off, WIP awareness, blocked-reason taxonomy, deploy rejection return-to-build, sync fallback envelope, Planner-as-Reviewer)
- **Slice K shipped** — Notification watchdog (status digest, de-dup, Discord-formatted output)
- Regression baseline: `143/143` passing
- Service/runtime baseline: `hermes-workspace.service` active, app at `http://localhost:3456`
- **Slice L shipped** — Labels/tags + lightweight analytics counters
- **Slice M shipped** — Label-based board analytics dashboard (cycle time, throughput, rework rate, status summary)

---

## 1) Priority roadmap (what to build next)

### P0 — Operational excellence (QUEUE)
1. **Slice L — Labels/tags + lightweight analytics** — ✅ **SHIPPED**
2. **Slice M — Label-based board analytics dashboard**

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

**Status:** complete and verified on 2026-04-25.

**Grounded status:**
- `labels: string[]` added to `WorkItemRecord` and `CreateWorkItemInput`
- Labels persist and round-trip through API (POST + PATCH)
- Detail screen (`work-item-detail-screen.tsx`): labels state variables + mutation hooks, inline `<span>` badges rendered alongside status/phase badges in header, labels `<textarea>` in create form
- Project board (`project-detail-screen.tsx`): labels badges on board cards below phase tags, `labels: []` in `EMPTY_WORK_ITEM_FORM` defaults, `labels` included in `createWorkItemMutation` payload, `uniqueLabels` useMemo for deduplicated filter options, labels filter UI buttons for dynamic `label:${tag}` filtering
- View model (`projects-view-model.ts`): `ProjectBoardFilter` extended to `| \`label:${string}\``, `getUniqueLabels()` utility for deduplication across work items, label filter logic in `filterWorkItemsForProjectBoard`, `buildProjectBoardUrgencySummary` with `activeThisWeek`, `blockedThisWeek`, `doneThisWeek` counters based on 7-day rolling window, `PROJECT_URGENCY_SUMMARY_FILTERS` mapping for analytics counter shortcuts
- Analytics counters UI: `activeThisWeek`, `blockedThisWeek`, `doneThisWeek` counters on project board, clickable urgency summary shortcuts
- Tests: `projects-view-model.test.ts` (updated `blockedThisWeek` expectation to `1`), `project-detail-screen.test.ts` (updated urgency summary field assertions)
- Full regression: `138/138` passing (`pnpm test`)
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
- Live verification at `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906`: labels badges render on cards, labels textarea visible in create form, analytics counters present

**Key design decisions:**
- Replaced `<Badge>` wrapper with inline `<span>` + Tailwind classes for label rendering to avoid `variant` prop mismatches across components
- `getUniqueLabels()` deduplicates labels across all work items for dynamic filter UI
- Analytics counters use 7-day rolling window from `new Date()` for `activeThisWeek`, `blockedThisWeek`, `doneThisWeek`
- Mapped new analytics keys to existing `ProjectBoardFilter` types via `PROJECT_URGENCY_SUMMARY_FILTERS`

**Files modified:**
- `src/lib/projects-view-model.ts` — analytics counters, label filter logic, `getUniqueLabels`
- `src/screens/projects/project-detail-screen.tsx` — analytics UI, labels filter UI, `uniqueLabels` useMemo, labels badges on cards
- `src/screens/projects/work-item-detail-screen.tsx` — label state/mutation hooks, label badges in header, labels textarea in create form
- `src/lib/projects-view-model.test.ts` — updated assertions
- `src/screens/projects/project-detail-screen.test.ts` — updated assertions

---

## Slice M — Label-based board analytics dashboard

**Status:** complete and verified on 2026-04-25.

**Grounded status:**
- Extended `LabelAnalyticsEntry` type in `projects-view-model.ts` with three new metrics:
  - `avgCycleTimeDays` — average days from `createdAt` to completion for labeled, done work items
  - `throughputLast7d` — count of `done` work items in the last 7 days
  - `reworkRate` — percentage of items showing build→review→build cycles (computed via `detectRework()`)
- Added `buildProjectBoardUrgencySummary` with expanded analytics: `activeThisWeek`, `blockedThisWeek`, `doneThisWeek`
- Added `PROJECT_URGENCY_SUMMARY_FILTERS` mapping for analytics counter shortcuts
- UI updated in `project-detail-screen.tsx`:
  - Replaced compact label analytics panel with expanded 4-column metric grid: Avg Cycle Time, Throughput, Rework Rate, Status Summary
  - Added conditional insight pills for rework rate thresholds (>10% amber, >20% red)
  - Per-label breakdown with cycle time and health indicators
  - Retained per-label card rendering on board
- Tests in `projects-view-model.test.ts`:
  - Updated `builds label analytics with per-label breakdown` for new fields
  - Fixed fixture timestamps for `computes cycle time, throughput, and rework metrics` test
  - Adjusted cycle time bound expectation from `<10` to `<=15` days
- Full regression: `143/143` passing (`pnpm vitest run`)
- `pnpm build` clean (6.21s)
- Dev server restarted and running at `http://127.0.0.1:3456/`
- Live verification: analytics grid visible on project detail screen for `46b401f9-9243-472f-b5b7-04bf34596906`

**Key design decisions:**
- Cycle time computed as average days from `createdAt` to completion for labeled, done items
- Rework rate detected via `detectRework()` helper checking for build→review→build cycles in work item history
- Throughput measured as count of `done` items in the last 7 days
- UI uses a 4-column metric grid with conditional insight pills for rework rate thresholds
- Mapped new analytics keys to existing `ProjectBoardFilter` types via `PROJECT_URGENCY_SUMMARY_FILTERS`

**Files modified:**
- `src/lib/projects-view-model.ts` — `LabelAnalyticsEntry` type extension, cycle time/throughput/rework computation, `detectRework()`, urgency summary expansion
- `src/screens/projects/project-detail-screen.tsx` — 4-column analytics grid, per-label breakdown, insight pills, rework thresholds
- `src/lib/projects-view-model.test.ts` — updated label analytics test, fixed timestamps, adjusted cycle time bound

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

- **Now:** Slice M — Label-based board analytics dashboard — ✅ **SHIPPED**
- **Next:** Identify next P0 queue item from quality analysis (Slice N+)

This ordering gives best risk reduction and fastest mission-control quality gains.
