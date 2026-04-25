# Hermes Workspace Mission Control — Continuation Handoff (2026-04-22)

> **For Hermes:** Resume Mission Control work from this file first after any context reset. Treat this as the authoritative continuation brief for the current implementation state and next slices.

**Goal:** Preserve exact project state, completed slices, verified runtime behavior, and the next prioritized implementation slices so work can continue cleanly after session compaction or a fresh chat.

**Architecture:** Hermes Workspace is the operator cockpit. Projects and Work Items are the authoritative Mission Control control plane. Conductor is the execution engine. Profiles provide role/phase behavior. The intended lifecycle is idea capture → Planner enrichment → CEO/policy approval → Builder implementation → Planner/Oracle structured review → deploy gate → evidence archive → retrospective learning.

**Runtime repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

**Local service:** `hermes-workspace.service`

**App URL:** `http://localhost:3456`

---

## 1. Current grounded state

### 1.1 Canonical product direction
- **Projects / Work Items** are the source of truth.
- **Conductor** executes launched work; it is not the canonical entry path.
- **Profiles** express role/phase routing behavior.
- **Planner** is now the default planning/enrichment profile and should prepare rough ideas before Builder work.
- **Builder** owns implementation after Planner-prepared scope is approved.
- **Researcher** is an ad-hoc/Autopilot scout support role for web recon, comparisons, API changes, and feasibility checks.
- Idea-only requests should start as Work Items or Autopilot Suggestions, usually with `status=inbox` and `phase=research` until Planner enrichment makes them ready.
- Acceptance criteria should be drafted/refined by Planner, not forced at initial capture time.
- New north-star roadmap for the next era: `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-roadmap.md`.
- Implementer-ready plan index for cheaper models: `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`.
- Recommended next slice: **Slice N/O — Idea Intake + Planner Enrichment + Structured Planner Output**.

### 1.2 Live-verified runtime facts
- Runtime repo in use: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Local systemd service in use: `hermes-workspace.service`
- Serving locally on port `3456`
- Branch state on 2026-04-24: `my-hermes-workspace-dev...origin/my-hermes-workspace-dev` with a clean working tree
- Known verification project: `46b401f9-9243-472f-b5b7-04bf34596906`
- Browser may show onboarding/mobile overlay first; use **Skip setup** if needed.
- `jq` is unavailable in this environment; use Python for JSON/HTTP inspection.
- Builder is now the main Hermes profile and should be treated as the default implementation/build role for Mission Control work.

### 1.3 Verified implemented capabilities
- File-backed project/work-item Mission Control model exists.
- Project list, project detail, work-item detail, approvals inbox, launch flow, execution sync, and approval persistence exist.
- The project board now includes:
  - flow-ordered columns
  - operator signal chips
  - urgency sorting inside columns
  - board filters
  - urgency summary counters
  - clickable urgency-summary shortcuts
- The New Work Item form now includes:
  - readable dark native selects
  - `Assigned Profile` dropdown instead of free text
  - `Auto` routing option based on phase → profile mapping
- Work-item detail now exposes workflow-specific launch labels:
  - `Plan with Researcher`
  - `Launch Build`
  - `Launch Review`
  - `Launch Deploy`
- Work-item launches now persist and surface canonical Hermes mission linkage:
  - `missionJobId`
  - `missionJobName`
  - `missionSessionKeyPrefix`
  - `missionLink`
  - `missionState`
- Launch routing precedence is implemented and test-verified as:
  1. explicit work-item profile override
  2. project phase routing
  3. request/global phase routing
- Live QA on 2026-04-23 confirmed:
  - dashboard Mission Control tiles and operator queues render at `/dashboard`
  - project workflow policy renders live at `/projects/46b401f9-9243-472f-b5b7-04bf34596906`
  - approvals inbox is operational at `/projects/approvals`
  - approving a pending review updates both the inbox and the work-item detail history/state
  - the review-phase work item `2328ce63-9e7e-41bf-a796-93da2d12f82a` now resolves to `done` after approval
- Targeted audit on 2026-04-24 re-verified the routing slice with passing tests:
  - `src/server/work-item-launch.test.ts`
  - `src/server/conductor-launch.test.ts`
  - `src/server/work-item-phase5.test.ts`
  - `src/screens/projects/work-item-detail-screen.test.ts`
  - `src/screens/projects/project-detail-screen.test.ts`
  - `src/screens/dashboard/dashboard-screen.test.ts`

---

## 2. Most recent completed slices

### Slice A — Project board operator UX
Completed and verified:
- flow-oriented board order
- operator signal chips
- urgency-based sorting
- board filters (`All`, `Needs attention`, `Execution`, `Approvals`)
- urgency counters with stronger urgent card styling
- clickable urgency summary shortcuts with click-again-to-All behavior

### Slice B — New Work Item form fixes
Completed and verified:
- dark-mode select readability fix
- explicit native select dark styling
- `Assigned Profile` changed from text field to real dropdown
- live profile options pulled from `/api/profiles/list`
- helper copy clarifying `Auto` routing

### Slice C — Workflow audit against Mission Control intent
Completed and grounded in current code/docs:
- canonical entry path should be **Work Item first**
- raw Conductor `New Mission` should remain ad hoc / secondary
- planning should start with **Researcher** by default
- Builder should not be the default first-step planner
- acceptance criteria should be draftable from a planning step

---

## 3. Exact files most relevant for continuation

### Core Mission Control UI
- `src/screens/projects/projects-screen.tsx`
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/screens/projects/approvals-inbox-screen.tsx`

### Shared Mission Control view/domain logic
- `src/lib/projects-api.ts`
- `src/lib/projects-view-model.ts`
- `src/lib/work-item-approvals-api.ts`

### Server/domain logic
- `src/server/projects-store.ts`
- `src/server/project-detail.ts`
- `src/server/work-item-launch.ts`
- `src/server/work-item-execution.ts`
- `src/server/work-item-approvals.ts`

### Routes
- `src/routes/api/projects.ts`
- `src/routes/api/projects.$projectId.ts`
- `src/routes/api/work-item-approvals.ts`
- `src/routes/projects.tsx`
- `src/routes/projects/index.tsx`
- `src/routes/projects/$projectId.tsx`
- `src/routes/projects/$projectId/index.tsx`
- `src/routes/projects/approvals.tsx`

### Tests already created/expanded
- `src/screens/projects/project-detail-screen.test.ts`
- `src/screens/projects/projects-screen.test.ts`
- `src/screens/projects/work-item-detail-screen.test.ts`
- `src/screens/projects/approvals-inbox-screen.test.ts`
- `src/server/project-detail.test.ts`
- `src/server/projects-store.test.ts`
- `src/server/work-item-launch.test.ts`
- `src/server/work-item-execution.test.ts`
- `src/server/work-item-approvals.test.ts`
- `src/lib/projects-view-model.test.ts`

---

## 4. Current slice status and next priority

These are the grounded slice states after live QA and diff inspection on 2026-04-23.

### Slice 1 — Idea capture + Plan with Researcher workflow
**Status:** complete and live-verified.

**Grounded status:**
- project/work-item workflow already reflects `inbox → research/planning → ready/build`
- planning details surfaces exist for acceptance criteria and notes
- defaults and helper copy align with Research-first intent
- live QA on 2026-04-23 confirmed end-to-end project-level creation of a new work item from the UI, landing as `status=inbox` + `phase=research` with optional acceptance criteria/notes left empty
- live QA also confirmed the fresh item can be continued from detail view through the planning-oriented workflow: `Send to Planning` moved it to `status=active` + `phase=research`, and `Mark Ready` advanced it to `status=ready` with `Launch Build` becoming available as the next execution control

### Slice 2 — Work-item lifecycle action clarity
**Status:** complete and verified.

**Grounded status:**
- server-owned lifecycle transitions exist
- route/API support exists
- explicit lifecycle labels and state-driven action helpers are covered by tests
- live approval action resolved a review-phase work item into `done` and recorded history correctly

### Slice 3 — Work-item detail as true execution cockpit
**Status:** complete and verified.

**Grounded status:**
- work-item detail shows operator workflow, execution controls, evidence, history, approvals, and artifacts
- action layout changes based on current work state
- live work-item verification confirmed approved review state is reflected in history and approvals sections

### Slice 4 — Project-level workflow policy refinement
**Status:** complete and verified.

**Grounded status:**
- workflow policy panel is live
- project-level phase routing and review auto-approval controls render correctly
- approvals inbox and review governance are operational in the running app

### Slice 5 — Dashboard/operator overview refinement
**Status:** complete and verified.

**Grounded status:**
- dashboard Mission Control summary tiles render live
- operator queues for pending approvals, blocked work, and running missions render live
- targeted dashboard tests pass

### Slice 6A — Lifecycle beyond review (Phase 6 Task 1-5)
**Status:** complete and verified on 2026-04-24.

**Grounded status:**
- RED→GREEN tests locked and passed for:
  - `src/server/work-item-lifecycle.test.ts`
  - `src/server/work-item-approvals.test.ts`
  - `src/screens/projects/work-item-detail-screen.test.ts`
  - `src/server/work-item-phase5.test.ts`
- Server-owned lifecycle now explicitly supports deploy and recovery transitions:
  - `request_deploy_approval` (active deploy -> pending deploy approval)
  - `resume_build` (blocked build -> active build)
- Approval resolution now treats deploy as a first-class governed phase:
  - review approval advances to `status=active, phase=deploy`
  - deploy approval is required to finalize `status=done`
  - review changes/reject keeps return-to-build relaunch posture
- Work-item detail UI helpers are phase-aware for deploy and recovery:
  - lifecycle labels include `Request Deploy Approval` and `Resume Build`
  - lifecycle action availability includes deploy approval + blocked-build resume
  - blocked build launch CTA reads `Relaunch Build`
  - approvals summary distinguishes pending review vs pending deploy approval
- Live verification on `http://localhost:3456` confirmed end-to-end transition path on work item `bcc1ecd5-819b-4223-b8ec-bc74c84d01c4` via authenticated API calls from the running app context:
  - `request_review` -> review approval pending
  - review `approved` -> moved to deploy
  - `request_deploy_approval` -> deploy approval pending
  - deploy `approved` -> moved to done
  - project board and approvals inbox reflected the resolved deploy/review decisions
- Known runtime caveat during live QA: work-item detail route currently depends on `syncExecution=true` and can show `Work item not found` when `/api/work-items/:id?syncExecution=true` returns `{"error":"Dashboard index failed: 500"}`. This did not block lifecycle API verification and appears pre-existing to this slice.

### Slice 6B — Operator recovery flows (Phase 6 Task 6-8)
**Status:** complete and verified on 2026-04-24.

**Grounded status:**
- RED→GREEN tests locked and passed for recovery behavior across:
  - `src/server/work-item-execution.test.ts`
  - `src/server/work-item-lifecycle.test.ts`
  - `src/server/work-item-launch.test.ts`
  - `src/lib/projects-view-model.test.ts`
  - `src/screens/projects/work-item-detail-screen.test.ts`
  - `src/screens/projects/project-detail-screen.test.ts`
- Server-safe recovery semantics are now explicit:
  - `resume_build` clears stale failure state (`missionState` -> `unknown`, `missionLastError` -> `undefined`) before relaunch
  - relaunching a blocked/failed item clears prior error payload and records recovery-specific launch history (`Relaunched ... after failure recovery`)
  - failed execution history now includes direct operator guidance to run `Resume Build` before relaunch
- UI/operator recovery affordances are now clearer:
  - detail guidance and execution summary explicitly route failed builds to `Resume Build` + relaunch
  - board signal chips now include `Recovery ready` for blocked+failed mission items
  - project cards now render explicit recovery hints (e.g., `Recovery: Address review feedback and relaunch Build.`)
- Live verification on `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906` confirmed:
  - active card `Phase 4 approval flow demo` now displays the recovery hint text
  - urgency/header counters still render correctly while recovery hinting is active

### Slice 6C — Dashboard/operator-console escalation (Phase 6 Task 9-10)
**Status:** complete and verified on 2026-04-24.

**Grounded status:**
- RED→GREEN tests now lock failed-mission and escalation ordering semantics in:
  - `src/screens/dashboard/dashboard-screen.test.ts`
- Mission Control dashboard escalation improvements are now in place:
  - top-level summary includes `Failed missions`
  - top-level queue column now includes dedicated `FAILED MISSIONS` queue with direct work-item links
  - failed queue ordering favors project-level operator attention pressure (pending approvals + blocked/running/failed items), then recency
- Additional targeted regression coverage passed:
  - `src/screens/dashboard/dashboard-screen.test.ts`
  - `src/screens/projects/project-detail-screen.test.ts`
- Live verification at `http://localhost:3456/dashboard` confirmed:
  - `FAILED MISSIONS` tile rendered with escalation guidance copy
  - dedicated `FAILED MISSIONS` queue card rendered in the dashboard command-center row

### Slice 6D — Governance visibility tightening (Phase 6 Task 11)
**Status:** complete and verified on 2026-04-24.

**Grounded status:**
- RED→GREEN tests now lock deploy-governance visibility contract in:
  - `src/screens/projects/project-detail-screen.test.ts`
- Project workflow policy surface now explicitly includes deploy governance beside review governance:
  - added dedicated `DEPLOY GOVERNANCE` block in workflow policy panel
  - summary text now makes deploy approval gating explicit before done
  - deploy routing summary reflects configured deploy profile vs auto fallback without adding persistence complexity
- Targeted regression checks passed:
  - `src/screens/projects/project-detail-screen.test.ts`
  - `src/screens/dashboard/dashboard-screen.test.ts`
- Live verification at `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906` confirmed:
  - `Workflow Policy` panel now renders `DEPLOY GOVERNANCE`
  - copy explicitly states deploy routing + explicit deploy approval requirement before done

### Slice 6E — Docs closeout and post-phase queue (Phase 6 Task 12)
**Status:** complete and verified on 2026-04-24.

**Grounded status:**
- Continuation/roadmap docs now explicitly capture shipped + live-verified outcomes for slices 6A, 6B, 6C, and 6D.
- Phase 6 closure now records the exact post-phase queue instead of leaving Slice 6E as pending.
- Closeout verification rerun passed:
  - `pnpm vitest run src/screens/projects/project-detail-screen.test.ts src/screens/dashboard/dashboard-screen.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live verification rerun passed:
  - `http://localhost:3456/dashboard`
  - `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906` (Workflow Policy includes explicit `DEPLOY GOVERNANCE` copy)

### Post-Phase-6 hardening — syncExecution detail-path resilience (2026-04-24)
**Status:** complete and verified on 2026-04-24.

**Grounded status:**
- Added RED→GREEN resilience coverage in `src/server/work-item-execution.test.ts`:
  - `degrades to unknown execution state when Hermes dashboard index lookup fails`
- Minimal server fallback implemented in `src/server/work-item-execution.ts`:
  - `syncWorkItemExecutionState` now safely degrades to `execution.state = 'unknown'` when Hermes job lookup throws (e.g. `Dashboard index failed: 500`), instead of bubbling an API 500.
- Targeted verification passed:
  - `pnpm vitest run src/server/work-item-execution.test.ts src/server/work-item-phase5.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live verification passed:
  - `GET /api/work-items/d63d7e2f-1f31-43c1-8d40-cb6c9afed9bb?syncExecution=true` now returns `200` with `execution.state='unknown'` (no `error` payload)
  - `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906/work-items/d63d7e2f-1f31-43c1-8d40-cb6c9afed9bb` loads normally (no `Work item not found`)
  - `http://localhost:3456/projects/approvals`, `http://localhost:3456/dashboard`, and project board remain healthy after restart

### Post-Phase-6 hardening — Hermes job lookup fallback expansion (2026-04-24)
**Status:** complete and verified on 2026-04-24.

**Grounded status:**
- Added RED→GREEN coverage in `src/server/work-item-execution.test.ts`:
  - `falls back to dashboard job list lookup when direct job-id lookup fails`
- Hardened lookup flow in `src/server/work-item-execution.ts`:
  - direct `getHermesJobById(...)` failures are now handled per-candidate and continue to fallback lookup instead of aborting the whole sync path
  - `listHermesJobs()` failure still degrades safely to `null` (no route-level crash)
- Targeted verification passed:
  - `pnpm vitest run src/server/work-item-execution.test.ts`
  - `pnpm vitest run src/server/work-item-execution.test.ts src/server/work-item-phase5.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live verification passed:
  - `GET /api/work-items/d63d7e2f-1f31-43c1-8d40-cb6c9afed9bb?syncExecution=true` returns `200`, no `error`
  - `GET /api/work-items/a522005a-103b-4740-8c20-c6ee84c315d1?syncExecution=true` returns `200`, no `error`
  - detail page, approvals inbox, and dashboard all load normally after restart

### Slice 7 — Two-phase Launch Build orchestration (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- Two-phase pipeline is triggered when `status=ready` work item is launched for `build` (i.e., operator clicks "Launch Build")
- `launchWorkItemIntoConductor` detects candidates via `isTwoPhaseLaunchCandidate()` and builds a combined goal with Phase 1 (Plan) and Phase 2 (Build) via `buildTwoPhaseLaunchGoal()`
- `planFilePath` added to `WorkItemRecord`, persisted on launch, and surfaced in UI (Mission Control Summary + Delivery Evidence panels)
- Builder's goal includes "Read and follow the plan from Phase 1 at: {planFilePath}"
- Both `planner` (research) and `builder` (build) profiles resolved and included in `phaseProfiles` for ACP subprocess routing
- UI enhancements:
  - Operator guidance for ready items explains two-phase pipeline behavior
  - Launch toast shows "Launched two-phase pipeline (Planner → Builder). Plan path: ..."
  - Plan File Path visible in Mission Control Summary and Delivery Evidence panels
- Tests: 6 passing (work-item-launch.test.ts), 101 total, all green
- `pnpm build` clean, service restarted and active at `http://localhost:3456`

### Slice C — Risk level field for future auto-approval (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- `riskLevel: 'low' | 'medium' | 'high'` added to `WorkItemRecord` and `CreateWorkItemInput`
- Default: `'medium'` via `normalizeRiskLevel()` normalizer in `work-items-store.ts`
- API routes (POST + PATCH) accept `riskLevel` for create and update
- New Work Item form includes a Risk Level select (Low/Medium/High)
- Work item detail screen shows risk level badge in header + Mission Control Summary entry
- Project board cards show risk level tag alongside phase and priority tags
- Tests: 3 new tests in `work-items-store.test.ts` verifying default + custom values
- End-to-end verification: create (riskLevel=low) → PATCH (riskLevel=high) → GET (returns riskLevel=high)
- Existing work items auto-populated with `riskLevel: 'medium'`
- `pnpm build` clean, 102/102 tests passing, service restarted and active

### Slice E — riskLevel automation (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- riskLevel wired into board sorting — low-risk items sort lower within same attention + priority tier
- riskLevel wired into review auto-approval — low-risk items (`riskLevel=low`) auto-approve through review regardless of project policy
- riskLevel wired into operator guidance — ready items show "low-risk — review will be auto-approved"
- 2 new tests: `projects-view-model.test.ts` (sort order), `work-item-approvals.test.ts` (auto-approval)
- 104/104 tests passing, `pnpm build` clean, service restarted and active
- End-to-end verification: low-risk item in `active/build` → request review → auto-approved to `active/deploy`

### Slice F — Lifecycle completeness (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- Added lifecycle actions in `work-item-lifecycle.ts` + route parsing + work-item detail UI:
  - `cancel`
  - `back_to_research`
  - `back_to_build`
  - `back_to_inbox`
- `cancel` now requires a reason note and transitions to `status=cancelled` with lifecycle history.
- `back_to_research` now supports active/blocked build states (plus active review) for explicit planning fallback.
- `back_to_build` now supports active deploy state for explicit return-to-build correction loops.
- Added/updated coverage:
  - `src/server/work-item-lifecycle.test.ts`
  - `src/screens/projects/work-item-detail-screen.test.ts`
- Full regression status after Slice F verification: **120/120 tests passing** (`pnpm vitest run`).
- Provider/runtime error root cause discovered during live verification:
  - service was running against stale `dist` references and threw `ERR_MODULE_NOT_FOUND` for old `_tanstack-start-manifest` hash
  - resolved by rebuilding + restarting `hermes-workspace.service`
- API robustness fix for lifecycle validation:
  - cancel-without-reason now returns `400` (was surfacing as `500`)
  - file: `src/routes/api/work-items.$workItemId.lifecycle.ts`

### Slice G — Acceptance criteria verification (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- Added `criteriaStatus` tracking to work-item model (`src/server/work-items-store.ts`) with auto-alignment to `acceptanceCriteria`.
- Added per-criterion check-off UI + progress badge (`X/Y criteria met`) in `src/screens/projects/work-item-detail-screen.tsx`.
- Added progress helper coverage in `src/screens/projects/work-item-detail-screen.test.ts` and model coverage in `src/server/work-items-store.test.ts`.
- Added API support for `criteriaStatus` in work-item create/update routes.
- Fixed PATCH partial-update behavior in `src/routes/api/work-items.$workItemId.ts` to avoid wiping unrelated fields when updating only `criteriaStatus`.
- Full regression status after Slice G verification: **122/122 tests passing** (`pnpm vitest run`).
- Live verification completed on running app:
  - criteria progress shows on detail page (e.g. `0/2 criteria met`)
  - per-criterion toggle updates API state and progress (`0/2 -> 1/2`)
  - criteria preserved after toggle-only PATCH

### Slice H1/H2 — WIP awareness + blocked-reason taxonomy (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- Added WIP awareness helpers + threshold in `src/lib/projects-view-model.ts`:
  - `PROJECT_ACTIVE_WIP_WARNING_THRESHOLD = 3`
  - `isProjectWipHigh(...)`
  - `buildProjectWipHint(...)`
- Added project-level WIP warning rendering in `src/screens/projects/project-detail-screen.tsx`:
  - `WIP high` badge + launch-pressure hint
  - WIP hint attached to Work Items metric card
- Added blocked-reason taxonomy (`mission_failed | review_feedback | blocked_by_dependency | external | other`) across API/store/lifecycle/execution:
  - `src/lib/projects-api.ts`
  - `src/server/work-items-store.ts`
  - `src/routes/api/work-items.ts`
  - `src/routes/api/work-items.$workItemId.ts`
  - `src/server/work-item-execution.ts`
- Added blocked-reason board/detail UX in:
  - `src/screens/projects/project-detail-screen.tsx` (reason chip on cards)
  - `src/screens/projects/work-item-detail-screen.tsx` (Blocked reason + reason-specific guidance)
- Temporary live verification mutation was restored after verification:
  - demo work item `23e75c5f-29e7-49bf-8098-49687ee14a7b` returned to `status=active`, `phase=build`, `blockedReason=null`

**Verification:**
- Targeted tests: `58/58` passing
- Full regression: `124/124` passing (`pnpm test`)
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
- Live verification at `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906` confirmed WIP warning and blocked-reason surfaces

### Slice I1 — deploy rejection returns to build (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- Updated deploy approval resolution logic in `src/server/work-item-approvals.ts`.
- `deploy` approvals now transition as:
  - `approved` -> `status=done`, `phase=undefined`
  - `rejected` -> `status=active`, `phase=build`
  - `changes_requested` -> `status=active`, `phase=build`
- Added explicit correction-loop history notes:
  - `Deploy rejected; returned work item to build for correction and relaunch.`
  - `Deploy requested changes; returned work item to build for correction and relaunch.`
- Added test-first coverage in `src/server/work-item-approvals.test.ts` for both deploy rejection variants.

**Verification:**
- Targeted tests:
  - `pnpm test src/server/work-item-approvals.test.ts src/server/work-item-lifecycle.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `40/40` passing
- Full regression: `126/126` passing (`pnpm test`)
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
- Live API verification on target project created a temporary deploy-phase item, requested deploy approval, resolved as `rejected`, and confirmed `active/build` + correction-loop history note (temporary item removed).

### Slice I2 — sync fallback envelope (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- Updated `src/routes/api/work-items.$workItemId.ts` so `GET ?syncExecution=true` returns base payload + `executionSyncWarning` when sync throws, instead of HTTP 500.
- Added route-level regression coverage in `src/server/work-item-detail-route.test.ts`.
- Updated work-item detail warning surface in `src/screens/projects/work-item-detail-screen.tsx`:
  - `WORK_ITEM_EXECUTION_SYNC_WARNING_TITLE`
  - `getWorkItemExecutionSyncWarningMessage(...)`
  - warning banner while keeping page usable.
- Added helper assertions in `src/screens/projects/work-item-detail-screen.test.ts`.

**Verification:**
- Targeted tests: `16/16` passing
- Full regression: `128/128` passing
- `pnpm build` clean, service restarted and active
- Live API verification confirmed HTTP 200 fallback with `executionSyncWarning`

### Slice J — Planner-as-Reviewer (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- Autonomous Planner review pass triggers after build->review transition for work items with `planFilePath` (two-phase pipeline).
- `buildPlannerReviewGoal()` generates structured review prompt with plan path, acceptance criteria, per-criterion status, and explicit decision instruction.
- `launchPlannerReview()` fires a Conductor mission using the resolved `planner` profile.
- `syncWorkItemExecutionState` launches the review mission on build->review and auto-resolves the pending approval when the review job completes:
  - review job `succeeded` → approval `approved`, item advances to `active/deploy`
  - review job `failed` → approval `changes_requested`, item returns to `active/build`
- Data model additions: `reviewJobId`, `reviewState`, `reviewDecision` on `WorkItemRecord`.
- PATCH route supports all review fields.
- UI: Planner Review Status section in Mission Control Summary panel, `reviewDecisionLabel()` helper.

**Verification:**
- New tests: 2 (`buildPlannerReviewGoal`) + 1 (`reviewDecisionLabel`)
- Full regression: `131/131` passing
- `pnpm build` clean, service restarted and active
- Live API verification confirmed `reviewJobId`/`reviewState`/`reviewDecision` round-trip and `syncExecution` return

### Slice K — Notification watchdog (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- `src/server/work-item-notification-digest.ts`: `buildStatusDigest()`, `formatDigestForDiscord()`, `digestStateHasChanged()`/`persistDigestHash()`, `formatDigestAge()`
- `src/routes/api/work-item-notification-digest.ts`: `GET /api/work-item-notification-digest` (JSON + `hasChanged` + Discord message), `GET ?format=discord` (formatted only)
- 7 new tests in `work-item-notification-digest.test.ts`
- Full regression: `138/138` passing
- Live API verification confirmed digest returns correct pending approval data with `hasChanged=true`

### Slice L — Labels/tags + lightweight analytics (shipped 2026-04-25)
**Status:** complete and live-verified.

**Grounded status:**
- `labels: string[]` added to `WorkItemRecord` and `CreateWorkItemInput`, persists through API (POST + PATCH)
- View model (`projects-view-model.ts`): `ProjectBoardFilter` extended to `| \`label:${string}\``, `getUniqueLabels()` utility, label filter logic, `buildProjectBoardUrgencySummary` with `activeThisWeek`/`blockedThisWeek`/`doneThisWeek` (7-day rolling window), `PROJECT_URGENCY_SUMMARY_FILTERS` mapping
- Project board (`project-detail-screen.tsx`): analytics counters UI, labels badges on cards, `uniqueLabels` useMemo, labels filter UI buttons, `labels: []` in form defaults, `labels` in create mutation
- Detail screen (`work-item-detail-screen.tsx`): labels state/mutation hooks, inline `<span>` badges in header, labels textarea in create form
- Tests: `projects-view-model.test.ts`, `project-detail-screen.test.ts` updated
- Full regression: `138/138` passing, `pnpm build` clean, service active
- Live verification at target project confirmed labels badges, analytics counters, create form labels textarea

**Key design decisions:**
- Inline `<span>` + Tailwind for labels (avoids `<Badge>` `variant` prop mismatches)
- `getUniqueLabels()` deduplicates across all work items
- Analytics counters use 7-day rolling window
- Mapped analytics keys to `ProjectBoardFilter` via `PROJECT_URGENCY_SUMMARY_FILTERS`

### Next practical priority
Slice A (phase routing rewire), Slice B (two-phase orchestration), **Slice C (risk level field)**, **Slice E (riskLevel automation)**, **Slice F (lifecycle completeness)**, **Slice G (acceptance criteria verification)**, **Slice H1/H2 (WIP + blocked taxonomy)**, **Slice I1 (deploy rejection return-to-build)**, **Slice I2 (sync fallback envelope)**, **Slice J (Planner-as-Reviewer)**, **Slice K (Notification watchdog)**, and **Slice L (labels/analytics)** are complete. The immediate queue is:
1. **Slice K — notification watchdog** — ✅ **SHIPPED** (status digest, de-dup, Discord-formatted output)
2. **Slice L — labels/analytics** — ✅ **SHIPPED** (labels/tags, board filtering, lightweight analytics counters)
3. **Slice M — label-based board analytics dashboard**

Detailed execution breakdown is tracked in:
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-slices-plan.md`

---

## 5. Recommended execution protocol for future slices

For each new slice:
1. inspect current implementation first
2. add or update failing tests first where practical
3. patch the minimal set of files
4. run targeted tests
5. run `pnpm build`
6. restart `hermes-workspace.service`
7. verify live at `http://localhost:3456`
8. prefer the project detail page for live verification:
   - `/projects/46b401f9-9243-472f-b5b7-04bf34596906`

### Standard verification commands
```bash
pnpm test <targeted-files>
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

### Verification notes
- Use Python instead of `jq` for API inspection.
- If the browser lands on an overlay, click **Skip setup** first.
- Re-check console after any front-end change.

---

## 6. Current implementation cues already present in code

These matter because the next slice should extend them rather than fight them:
- `project-detail-screen.tsx` already defaults new work items to `status='inbox'` and `phase='research'`.
- `work-item-launch.ts` already supports launching `research`, `build`, `review`, and `deploy` phases and resolves profiles using:
  1. work-item explicit override
  2. project phase routing
  3. request/global phase profiles
- `work-item-detail-screen.tsx` already exposes workflow-specific launch labels, planning-detail editing, lifecycle actions, approval handling, mission evidence, and execution sync.
- `projects-view-model.ts` already encodes the board as a workflow progression rather than a generic status dump.
- `work-item-lifecycle.ts` now owns explicit workflow transitions for planning, review, deploy approval, blocked-build recovery, and backward/cancel paths:
  - `send_to_planning`
  - `mark_ready`
  - `request_review`
  - `request_deploy_approval`
  - `resume_build`
  - `cancel`
  - `back_to_research`
  - `back_to_build`
  - `back_to_inbox`
- `work-item-approvals.ts` now resolves phase-specific governance:
  - review approval → `active/deploy`
  - deploy approval → `done`
  - review changes/rejected → `active/build` relaunch posture
  - deploy changes/rejected → `active/build` correction + relaunch posture

---

### Runtime regression hotfix — dashboard token/bootstrap mismatch (2026-04-24)
**Status:** complete and verified on 2026-04-24.

**Grounded status:**
- Reproduced shared runtime failures across Operations / Jobs / Sessions / Chat via API endpoints and service logs:
  - `/api/hermes-jobs` -> 500
  - `/api/sessions` -> 500 (`Dashboard index failed: 500`)
- Confirmed root cause was capability bootstrap mismatch, not four separate UI bugs:
  - dashboard `/api/status` was healthy (`200`), so Workspace marked dashboard available
  - dashboard root `/` was failing (`500`) and token bootstrap failed (`fetchDashboardToken`)
  - protected `dashboardFetch` calls then threw and bubbled as runtime 500s
- Confirmed underlying dashboard runtime error from `hermes-dashboard.service` logs:
  - `FileNotFoundError: .../hermes_cli/web_dist/index.html`
- Implemented minimal merge-safe source fix in `src/server/gateway-capabilities.ts`:
  - `probeDashboard()` now requires successful token bootstrap; otherwise dashboard is treated as unavailable
- Added regression coverage in `src/server/gateway-capabilities.test.ts`:
  - status-up/token-down => `dashboard.available=false`
  - status-up/token-up => `dashboard.available=true`
- Verification pass completed:
  - `pnpm vitest run src/server/gateway-capabilities.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
- Post-fix live API verification confirms degraded-but-healthy behavior:
  - `/api/hermes-jobs` -> 200
  - `/api/sessions` -> 200 unavailable payload (no 500)
  - `/api/connection-status` -> 200 connected/portable
  - `/api/gateway-status` now reports `dashboard.available=false`, `mode=portable`
- Detailed incident record:
  - `docs/plans/2026-04-24-hermes-workspace-runtime-api-regression-debug-handoff.md`

## 7. What to do immediately after a future context reset

When resuming this project in a new or compacted chat:
1. load this file
2. confirm the runtime repo is still `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
3. read the current versions of:
   - `src/screens/projects/project-detail-screen.tsx`
   - `src/screens/projects/work-item-detail-screen.tsx`
   - `src/server/work-item-launch.ts`
   - `src/server/work-item-lifecycle.ts`
   - `src/server/work-item-approvals.ts`
   - `src/server/work-items-store.ts` (data model — riskLevel + criteriaStatus fields)
4. read `docs/plans/2026-04-25-hermes-workspace-profiles-workflow-rearchitecture.md` for the current architecture
5. re-check the current slice status in section 4 before choosing work; do not assume older slice ordering is still current
6. if no reprioritization is given, continue from the Dream Mission Control implementation queue:
   - **Slice N/O sub-slice 1 — PlanningDraft store + Planner structured-output parser** — ✅ shipped (tests + build verified)
   - **Slice N/O sub-slice 2 — Planner enrichment service + API routes + launch guard** — ✅ shipped (targeted tests + build verified)
   - **Slice N/O sub-slice 3 — UI panel/diff acceptance wiring** — ✅ shipped (UI helper tests + targeted server/UI tests + build verified)
   - **Slice P/Q — Autopilot suggestions + project scout schedules** — ✅ shipped (store/routes/client APIs/screens/tests + full regression + build + service restart + API smoke)
   - next priority: **Slice T/U — Structured review quality gates**
   - use `docs/plans/2026-04-25-hermes-workspace-slice-t-u-structured-review-quality-gates-plan.md` as the execution checklist
7. keep using the inspect → tests → patch → targeted tests → build → restart → live verify workflow

---

## 8. Bottom line

The project is already past the original roadmap's earliest slices. The routing foundation, project/work-item control plane, approvals inbox, workflow policy, Mission Control dashboard, two-phase launch pipeline, risk level field, labels/analytics, and board analytics dashboard are all in place.

### 2026-04-25 architectural shift

A major profiles/workflow re-architecture was completed on 2026-04-25:

1. **Profile architecture corrected** — Builder fixed as first-class profile; lesson saved
2. **Researcher upgraded** from dummy to proper profile (gpt-4.1, gateway running)
3. **Planner profile created** — new flagship profile (gpt-5.4, openai-codex)
4. **Dashboard root fixed** — `web_dist/index.html` rebuilt, `zero-fork` mode restored
5. **Two-phase Launch Build pipeline implemented** — Launch Build triggers Planner → Builder sequentially
6. **Risk level field implemented** — `riskLevel: 'low' | 'medium' | 'high'` on work items, default `medium`, UI across create/detail/board
7. **riskLevel automation** — low-risk items auto-approve through review, sort lower on board, guidance mentions auto-approval

See `docs/plans/2026-04-25-hermes-workspace-profiles-workflow-rearchitecture.md` for full details.

### 2026-04-25 Slice M — Label-based board analytics dashboard (shipped)

Extended the label analytics from lightweight counters (Slice L) into a full dashboard:

- **Model:** `LabelAnalyticsEntry` extended with `avgCycleTimeDays`, `throughputLast7d`, `reworkRate`
- **Metrics:** cycle time (avg days from `createdAt` to completion), throughput (done count in 7d), rework rate (build→review→build cycles)
- **UI:** 4-column metric grid on project detail screen (Avg Cycle Time, Throughput, Rework Rate, Status Summary) with per-label breakdown and conditional insight pills for rework thresholds
- **Tests:** 143/143 passing, production build clean
- **Files:** `projects-view-model.ts`, `project-detail-screen.tsx`, `projects-view-model.test.ts`

#### Shipped slices summary (as of 2026-04-25)

| Slice | Feature | Status |
|-------|---------|--------|
| A–J | Phase routing, two-phase orchestration, risk level, lifecycle, acceptance criteria, WIP, blocked taxonomy, deploy rejection, sync fallback, Planner-as-Reviewer | ✅ Shipped |
| K | Notification watchdog (digest, de-dup, Discord) | ✅ Shipped |
| L | Labels/tags + lightweight analytics counters | ✅ Shipped |
| M | Label-based board analytics dashboard (cycle time, throughput, rework, status) | ✅ Shipped |
| N/O-1 | PlanningDraft store + Planner structured-output parser (before UI) | ✅ Shipped |
| N/O-2 | Planner enrichment service + API routes + launch guard | ✅ Shipped |
| N/O-3 | Planner Enrichment UI panel + draft diff + accept/revision wiring | ✅ Shipped |

**Regression baseline before this sub-slice:** `143/143` passing

### 2026-04-25 Slice N/O sub-slice 1 completion snapshot

Grounded updates from this session:

- Added file-backed PlanningDraft persistence under `$HERMES_HOME/planning-drafts.json` via:
  - `src/server/planning-drafts-store.ts`
- Added parser/schema for structured Planner output via:
  - `src/server/planner-output-schema.ts`
- Added RED→GREEN tests for both primitives:
  - `src/server/planning-drafts-store.test.ts`
  - `src/server/planner-output-schema.test.ts`
- Verified commands:
  - `pnpm vitest run src/server/planning-drafts-store.test.ts src/server/planner-output-schema.test.ts`
  - `pnpm build`

### 2026-04-25 Slice N/O sub-slice 2 completion snapshot

Grounded updates from this session:

- Added Planner enrichment service and goal builder:
  - `src/server/work-item-planning.ts`
- Added RED→GREEN service tests:
  - `src/server/work-item-planning.test.ts`
- Added planning draft API routes:
  - `src/routes/api/work-items.$workItemId.prepare.ts`
  - `src/routes/api/work-items.$workItemId.planning-drafts.ts`
  - `src/routes/api/planning-drafts.$draftId.ts`
  - `src/routes/api/planning-drafts.$draftId.output.ts`
  - `src/routes/api/planning-drafts.$draftId.accept.ts`
- Added work-item detail payload enrichment with latest planning draft:
  - `src/routes/api/work-items.$workItemId.ts`
- Added build-launch guard to block unprepared rough ideas from Builder launch:
  - `src/server/work-item-launch.ts`
  - `src/server/work-item-launch.test.ts`
  - `src/routes/api/work-items.$workItemId.launch.ts` (400 mapping)
- Added client-facing planning API helpers and types groundwork:
  - `src/lib/planning-drafts-api.ts`
  - `src/lib/projects-api.ts`
- Verified commands:
  - `pnpm vitest run src/server/planning-drafts-store.test.ts src/server/planner-output-schema.test.ts src/server/work-item-planning.test.ts src/server/work-item-launch.test.ts`
  - `pnpm build`

### 2026-04-25 Slice N/O sub-slice 3 completion snapshot

Grounded updates from this session:

- Added Planner Enrichment helper APIs and launch gating helpers in work-item detail screen:
  - `getPlanningDraftStatusLabel`
  - `getPlanningDraftGuidance`
  - `canLaunchBuildFromPlanningState`
  - `buildPlanningDraftDiff`
- Implemented Planner Enrichment panel UI in work item detail:
  - no-draft state with **Prepare with Planner** action
  - requested/running metadata rendering
  - structured-ready diff preview + **Accept Planner Draft** flow
  - parse-failed error/warnings rendering + **Request Revision** + relaunch flow
  - accepted status rendering with accepted timestamp + plan path
- Added build-launch UI gating + guidance for rough ideas not yet planner-prepared.
- Updated project-detail rough idea intake copy and planner signal coverage:
  - `PROJECT_CREATE_WORK_ITEM_BUTTON_LABEL = "Capture rough idea"`
  - `PROJECT_CREATE_WORK_ITEM_SUBMIT_LABEL = "Create rough idea"`
  - board chips now include `Needs Planner`, `Draft ready`, `Planner revision needed` through `buildWorkItemOperatorSignals`
- Updated attention filtering to include unprepared inbox/research rough ideas.
- Verified commands:
  - `pnpm vitest run src/lib/projects-view-model.test.ts src/screens/projects/work-item-detail-screen.test.ts src/screens/projects/project-detail-screen.test.ts`
  - `pnpm vitest run src/server/planning-drafts-store.test.ts src/server/planner-output-schema.test.ts src/server/work-item-planning.test.ts src/server/work-item-launch.test.ts src/screens/projects/work-item-detail-screen.test.ts src/screens/projects/project-detail-screen.test.ts`
  - `pnpm build`

The next meaningful evolutions are now defined by the CEO/Architect north-star audit:

1. **Slice P — Autopilot Suggestion Model + Inbox** — project-aware scout findings become reviewable suggestions, not immediate code changes.
2. **Slice Q — Project Autopilot Scout Schedules** — easy daily/weekly improvement scouting per project.
3. **Slice T — Structured Review Decision Parser** — review output becomes a real quality gate, not just job success/failure.
4. **Slice R/S — Execution Runs + Supervisor** — durable run history plus stale/failure detection.

Detailed implementation entrypoint:
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`

Detailed high-level roadmap:
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-roadmap.md`

Detailed historic execution order and shipped slice scope:
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-slices-plan.md`

If resuming later, start from the implementation index above, then execute the Slice N/O detailed plan task-by-task.
