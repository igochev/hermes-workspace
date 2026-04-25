# Hermes Workspace Mission Control Roadmap

> **For Hermes:** Use subagent-driven-development skill to implement this roadmap incrementally on `my-hermes-workspace-dev`, preserving Hermes Workspace as the primary operator cockpit while adding a project/work-item control plane.

**Goal:** Evolve Hermes Workspace from a Hermes-native cockpit plus mission runner into a true single-user coding Mission Control with canonical work items, project/repo awareness, phase-driven automation, and Conductor-backed execution.

**Architecture:** Keep the existing Workspace shell, chat/files/terminal/memory/jobs/profiles surfaces, and treat them as the operator console. Add a server-owned Mission Control layer for projects, work items, approvals, artifacts, and lifecycle transitions. Use Conductor as the execution engine for launched work items, with phase → profile routing and mission/session linkage as the bridge between planning and autonomous delivery.

**Tech Stack:** TanStack Router, React Query, React/TSX, existing Hermes Workspace server routes, lightweight file-backed persistence first (merge-safe), Hermes profiles, Conductor mission spawn pipeline.

---

## Current grounded status

Based on current source inspection in the fork:

### Good foundations already present
- Persistent operator shell and nav:
  - `src/components/workspace-shell.tsx`
  - routes exist for `/dashboard`, `/tasks`, `/conductor`, `/profiles`, `/memory`, `/skills`, `/jobs`, `/files`, `/terminal`
- Conductor already supports:
  - orchestrator model
  - worker model
  - project directory
  - supervised mode
  - max parallel workers
  - **phase → profile routing**
  - files:
    - `src/screens/gateway/conductor.tsx`
    - `src/screens/gateway/hooks/use-conductor-gateway.ts`
    - `src/routes/api/conductor-spawn.ts`
- Profiles are already real Hermes profiles with provider/model/prompt support:
  - `src/server/profiles-browser.ts`
  - `src/routes/api/profiles/*.ts`
- There is already a lightweight persistent task board:
  - `src/server/tasks-store.ts`
  - `src/routes/api/hermes-tasks.ts`
  - `src/routes/api/hermes-tasks.$taskId.ts`
  - `src/screens/tasks/tasks-screen.tsx`

### Important current limitations
- `/tasks` is a simple file-backed board (`~/.hermes/tasks.json`), not a canonical coding work-item system.
- Conductor mission state is still partly UI/store-oriented:
  - `src/stores/mission-store.ts`
  - `src/screens/gateway/components/task-board.tsx`
  - `src/screens/gateway/components/kanban-board.tsx`
- Approvals are lightweight/local, not durable workflow records:
  - `src/screens/gateway/lib/approvals-store.ts`
- There is no first-class project/repo/work-item model yet.
- Tasks and Conductor are adjacent but not yet unified into a single lifecycle.

### Strategic design decision
Do **not** replace the Workspace cockpit. Keep it. Add an authoritative Mission Control layer beneath it.

## 2026-04-22 implementation snapshot

The roadmap below is still directionally correct, but the codebase is no longer at the early Phase 1 starting point.

### Completed / verified in the live local runtime
- Canonical Mission Control data model is in place with file-backed persistence for projects, work items, approvals, and execution metadata.
- `/projects`, `/projects/$projectId`, and `/projects/$projectId/work-items/$workItemId` exist and are live.
- Work items can launch into Conductor through the centralized `src/server/work-item-launch.ts` helper.
- Work-item execution sync, mission/session linkage, approval persistence, and approval resolution flows are implemented.
- An operator-facing approvals inbox now exists at `/projects/approvals`.
- The project board has already been upgraded with:
  - workflow-oriented column ordering (`Inbox → Ready → Active → Blocked → Done → Cancelled`)
  - operator signal chips on cards
  - deterministic urgency sorting inside columns
  - board filters (`All`, `Needs attention`, `Execution`, `Approvals`)
  - urgency summary counters with clickable shortcuts
- The New Work Item form has already been improved with:
  - readable dark-mode native selects
  - `Assigned Profile` as a real dropdown backed by `/api/profiles/list`
  - `Auto` profile routing aligned with phase → profile policy

### Current product conclusion
The canonical workflow should now be treated as:
1. capture work as a **Work Item** first
2. use **Researcher** as the default planning/research profile
3. use **Builder** for implementation after planning
4. keep **Conductor** as the execution engine, not the system of record
5. let planning draft acceptance criteria instead of forcing them up front for idea capture

### Immediate continuation pointer
For the exact current state, validated runtime details, and the prioritized next slices after this snapshot, continue from:
- `docs/plans/2026-04-22-hermes-workspace-mission-control-continuation-handoff.md`

## 2026-04-25 implementation snapshot

The codebase has advanced beyond the 2026-04-24 state with the following shipped slices:

### Slices K, L, M (shipped 2026-04-25)
- **Slice K** — Notification watchdog: scheduled digest of pending approvals, blocked items, failed missions with Discord formatting and de-duplication
- **Slice L** — Labels/tags + lightweight analytics: `labels: string[]` on work items, label badges on cards/detail, label filter UI, analytics counters (active/blocked/done this week)
- **Slice M** — Label-based board analytics dashboard: 4-column metric grid (Avg Cycle Time, Throughput, Rework Rate, Status Summary), per-label breakdown with health indicators, conditional insight pills for rework thresholds

### 2026-04-25 architectural shift (profiles/workflow re-architecture)
- Builder fixed as first-class Hermes profile
- Researcher upgraded from dummy to proper profile (gpt-4.1)
- Planner profile created (gpt-5.4, openai-codex)
- Dashboard root fixed, `zero-fork` mode restored
- Two-phase Launch Build pipeline (Planner → Builder sequential)
- Risk level field + automation on work items
- Full regression baseline: `143/143` passing

For the exact current state and prioritized next slices, continue from:
- `docs/plans/2026-04-22-hermes-workspace-mission-control-continuation-handoff.md`
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-slices-plan.md`

## 2026-04-24 implementation audit snapshot

The codebase has moved beyond the partially-complete routing state described in some older session notes.

### Newly re-verified on 2026-04-24
- `my-hermes-workspace-dev...origin/my-hermes-workspace-dev` was clean during audit.
- Work-item → Conductor routing is implemented in `src/server/work-item-launch.ts`.
- Effective routing precedence is test-covered as:
  1. work-item override
  2. project phase routing
  3. request/global phase routing
- Work-item detail now uses workflow-specific labels:
  - `Plan with Researcher`
  - `Launch Build`
  - `Launch Review`
  - `Launch Deploy`
- Canonical mission-link persistence/exposure is in place:
  - `missionJobId`
  - `missionJobName`
  - `missionSessionKeyPrefix`
  - `missionLink`
  - `missionState`
- Targeted Mission Control tests passed for launch, routing, dashboard, and project/work-item UI.

### Updated product conclusion
The next gap is no longer launch routing. The next gap is finishing the authoritative workflow beyond review so Hermes Workspace behaves like a full operator Mission Control instead of stopping at review completion.

### 2026-04-24 Phase 6A completion snapshot

Grounded updates from the first Phase 6 slice:
- Lifecycle contract now extends beyond review:
  - review approval advances work items to deploy
  - deploy approval is explicitly requested and resolved before done
- Server-owned lifecycle actions now include:
  - `request_deploy_approval`
  - `resume_build`
- Work-item detail lifecycle helpers now expose deploy/recovery-specific controls and labels.
- Targeted tests passing after RED→GREEN updates:
  - `src/server/work-item-lifecycle.test.ts`
  - `src/server/work-item-approvals.test.ts`
  - `src/screens/projects/work-item-detail-screen.test.ts`
  - `src/server/work-item-phase5.test.ts`
- Live verification against `http://localhost:3456` confirmed review -> deploy -> deploy approval -> done transitions on work item `bcc1ecd5-819b-4223-b8ec-bc74c84d01c4`, with board/inbox updates.

### 2026-04-24 Phase 6B completion snapshot

Grounded updates from the second Phase 6 slice:
- Operator recovery flow is now explicit in server lifecycle + launch semantics:
  - `resume_build` now clears stale failure state before relaunch (`missionState=unknown`, `missionLastError=undefined`)
  - relaunching blocked/failed work now records recovery-specific launch history (`Relaunched ... after failure recovery`)
  - failure-sync history now explicitly instructs operators to use `Resume Build` before relaunch
- Project/operator visibility improved for recovery:
  - board signals include `Recovery ready` for blocked+failed items
  - project cards render explicit recovery hints for rework states (including review `changes_requested`)
  - detail guidance/execution summary wording now routes operators through `Resume Build` + relaunch for failed build missions
- Targeted RED→GREEN test coverage passing for recovery behavior:
  - `src/server/work-item-execution.test.ts`
  - `src/server/work-item-lifecycle.test.ts`
  - `src/server/work-item-launch.test.ts`
  - `src/lib/projects-view-model.test.ts`
  - `src/screens/projects/work-item-detail-screen.test.ts`
  - `src/screens/projects/project-detail-screen.test.ts`
- Live verification against `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906` confirms project card recovery hint rendering (`Phase 4 approval flow demo` -> `Recovery: Address review feedback and relaunch Build.`).

### 2026-04-24 Phase 6C completion snapshot

Grounded updates from the third Phase 6 slice:
- Dashboard/operator-console escalation now treats failed missions as first-class operator attention:
  - mission-control summary adds `Failed missions` metric tile
  - queue row adds dedicated `FAILED MISSIONS` card with direct links to affected work items
- Cross-project attention semantics now prioritize failed queue order by project-level attention pressure (pending approvals + blocked/running/failed work), then mission recency.
- Targeted RED→GREEN test coverage passing:
  - `src/screens/dashboard/dashboard-screen.test.ts`
- Additional dashboard-adjacent regression check passing:
  - `src/screens/projects/project-detail-screen.test.ts`
- Live verification against `http://localhost:3456/dashboard` confirms failed-mission tile + queue rendering in the command-center block.

### 2026-04-24 Phase 6D completion snapshot

Grounded updates from the fourth Phase 6 slice:
- Project workflow policy now makes deploy governance explicit beside review governance:
  - new `DEPLOY GOVERNANCE` policy block in project detail workflow panel
  - deploy governance summary now always states explicit deploy approval requirement before done
  - routing summary reflects configured deploy profile vs auto fallback path
- Targeted RED→GREEN test coverage passing:
  - `src/screens/projects/project-detail-screen.test.ts`
- Additional regression check passing:
  - `src/screens/dashboard/dashboard-screen.test.ts`
- Live verification against `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906` confirms deploy governance text renders in Workflow Policy and includes explicit approval gating language.

### 2026-04-24 Phase 6E completion snapshot

Grounded updates from the fifth (closeout) Phase 6 slice:
- Roadmap + continuation docs now include grounded shipped/live-verified outcomes for slices 6A through 6D and explicitly mark Phase 6 closeout complete.
- Verification rerun before closeout docs update passed:
  - `pnpm vitest run src/screens/projects/project-detail-screen.test.ts src/screens/dashboard/dashboard-screen.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
- Live verification rerun passed at:
  - `http://localhost:3456/dashboard`
  - `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906`
- Remaining consciously deferred edge case remains unchanged:
  - `/api/work-items/:id?syncExecution=true` can fail through dashboard-index dependency (`Dashboard index failed: 500`)

### 2026-04-24 Post-Phase-6 hardening snapshot

Grounded updates from the first post-phase reliability slice:
- `/api/work-items/:id?syncExecution=true` now degrades safely when Hermes job lookup fails (`Dashboard index failed: 500` path), returning `execution.state='unknown'` instead of a route-level 500.
- RED→GREEN resilience test added and passing:
  - `src/server/work-item-execution.test.ts` (`degrades to unknown execution state when Hermes dashboard index lookup fails`)
- Targeted verification pass completed:
  - `pnpm vitest run src/server/work-item-execution.test.ts src/server/work-item-phase5.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
- Live verification confirms:
  - `GET /api/work-items/d63d7e2f-1f31-43c1-8d40-cb6c9afed9bb?syncExecution=true` returns `200` with no error payload
  - work-item detail page for that item now loads normally (no fallback `Work item not found`)
  - approvals/dashboard/project-board surfaces remain healthy after restart

### 2026-04-24 Post-Phase-6 hardening snapshot (lookup fallback expansion)

Grounded updates from the second post-phase reliability slice:
- `syncWorkItemExecutionState` now continues from direct `getHermesJobById(...)` failures to dashboard job-list fallback instead of degrading immediately to unknown.
- RED→GREEN coverage added and passing:
  - `src/server/work-item-execution.test.ts` (`falls back to dashboard job list lookup when direct job-id lookup fails`)
- Targeted verification pass completed:
  - `pnpm vitest run src/server/work-item-execution.test.ts`
  - `pnpm vitest run src/server/work-item-execution.test.ts src/server/work-item-phase5.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
- Live verification confirms syncExecution endpoints remain non-fatal (HTTP 200, no error payload) for representative work items and core operator surfaces still render.

### 2026-04-24 Runtime/API regression hotfix snapshot

Grounded updates from the urgent runtime repair pass:
- Shared cross-surface failures (`/operations`, `/jobs`, sessions loading, `/chat` warning) were traced to a single backend bootstrap issue.
- Confirmed runtime mismatch:
  - dashboard `/api/status` was healthy
  - dashboard root `/` failed with 500, so session-token bootstrap failed
  - Workspace still treated dashboard as available and attempted protected dashboard API calls, causing `Dashboard index failed: 500` throws.
- Confirmed dashboard root failure from `hermes-dashboard.service` logs:
  - `FileNotFoundError: .../hermes_cli/web_dist/index.html`
- Minimal merge-safe fix shipped in `src/server/gateway-capabilities.ts`:
  - `probeDashboard()` now requires successful token bootstrap to mark dashboard available.
- New regression tests added and passing:
  - `src/server/gateway-capabilities.test.ts`
    - token bootstrap failure => dashboard unavailable fallback
    - token bootstrap success => dashboard available
- Verification pass completed:
  - `pnpm vitest run src/server/gateway-capabilities.test.ts`
  - `pnpm build`
  - `systemctl --user restart hermes-workspace.service` / `is-active` -> `active`
- Post-fix live API verification confirms failures are resolved/degraded safely:
  - `/api/hermes-jobs` -> 200
  - `/api/sessions` -> 200 unavailable payload (no route 500)
  - `/api/connection-status` -> 200 connected/portable
  - `/api/gateway-status` -> `dashboard.available=false`, `mode=portable`

### Updated immediate priority
1. The underlying Hermes dashboard root issue was fixed — `web_dist/index.html` rebuilt, dashboard mode restored to `zero-fork`.
2. Route-level fallback envelope support remains a conscious future improvement but is no longer blocking — syncExecution degradation works.
3. **Done:** Phase routing rewired from `researcher` → `planner`, two-phase launch orchestration shipped, risk level field implemented.

---

### 2026-04-25 Slice A completion snapshot (shipped)

Grounded updates from the first profiles/workflow re-architecture slice:

**Phase routing defaults updated:**
- All `research` phase routing references changed from `researcher` → `planner` across the codebase
- UI button label: "Plan with Researcher" → "Plan with Planner"
- Routing policy help text and defaults updated
- 30 tests updated and passing for routing changes
- `pnpm build` clean, service restarted and active

**Impact:**
- "Plan with Planner" now uses the new `planner` profile (gpt-5.4 flagship)
- Researcher is demoted from phase-mapped profile to ad-hoc research support (stays on cheap gpt-4.1)
- Per-project overrides still available via Workflow Policy panel
- No data migration needed — existing per-project `phaseProfiles` can be updated via UI

### 2026-04-25 Slice B completion snapshot (shipped)

Grounded updates from the two-phase launch orchestration slice:

**Two-phase pipeline implemented:**
- Trigger condition: `status=ready` work item launched for `build` (operator clicks "Launch Build")
- **Phase 1 — Plan:** Orchestrator runs as Planner profile (gpt-5.4), explores codebase, writes a plan to `docs/plans/{slug}-{workItemId}-plan.md`
- **Phase 2 — Build:** Orchestrator reads the plan, spawns Builder profile workers (gpt-5.3-codex) for TDD implementation
- Both `planner` and `builder` profiles resolved and included in ACP subprocess routing

**Key files changed:**
- `src/server/work-item-launch.ts` — `isTwoPhaseLaunchCandidate()`, `buildTwoPhaseLaunchGoal()`, two-phase path in `launchWorkItemIntoConductor()`
- `src/server/work-items-store.ts` — `planFilePath` field on `WorkItemRecord`
- `src/screens/projects/work-item-detail-screen.tsx` — Plan File Path display, two-phase toast, updated operator guidance

**Verification:**
- 6 new tests passing (work-item-launch.test.ts), 101 total
- `pnpm build` clean, service restarted and active
- Live at `http://localhost:3456` — two-phase pipelines deployable from detail screen

### 2026-04-25 Slice C completion snapshot (shipped)

Grounded updates from the risk level field slice:

**Model change:**
- Added `riskLevel: 'low' | 'medium' | 'high'` to `WorkItemRecord` and `CreateWorkItemInput`
- Default: `'medium'` via `normalizeRiskLevel()` normalizer in `work-items-store.ts`

**UI additions:**
- New Work Item form: **Risk Level** select field (Low/Medium/High) in project detail create panel
- Work Item Detail screen: risk level badge in header + Mission Control Summary entry
- Project board cards: risk level tag alongside phase/priority tags

**API support:**
- POST `/api/work-items` accepts `riskLevel`
- PATCH `/api/work-items/:id` accepts `riskLevel` for updates

**Verification:**
- 3 new tests in `work-items-store.test.ts` verifying default + custom values
- 102/102 tests passing
- `pnpm build` clean, service restarted and active
- End-to-end API verification: create (riskLevel=low) → PATCH (riskLevel=high) → GET (returns riskLevel=high)
- Existing work items automatically populate with `riskLevel: 'medium'`

### 2026-04-25 Slice F completion snapshot (shipped)

Grounded updates from the lifecycle completeness slice:

**Lifecycle actions expanded:**
- Added `cancel` transition with required reason notes → `status=cancelled`
- Added `back_to_research` transition for active/blocked build states (plus active review fallback)
- Added `back_to_build` transition for active deploy correction loops
- Added `back_to_inbox` transition from active research

**Route/UI alignment:**
- Lifecycle action parsing updated in `/api/work-items/:workItemId/lifecycle`
- Work-item detail operator controls updated for new backward/cancel actions

**Validation hardening:**
- cancel-without-reason now returns **HTTP 400** (previously surfaced as 500)

**Verification:**
- `pnpm vitest run src/server/work-item-lifecycle.test.ts src/server/work-item-approvals.test.ts src/screens/projects/work-item-detail-screen.test.ts`
- `pnpm vitest run` → **120/120 tests passing**
- `pnpm build`
- `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live API verification via running app context:
  - cancel with reason succeeds (`200`)
  - cancel without reason fails with validation (`400`)

### 2026-04-25 Slice H1/H2 completion snapshot (shipped)

Grounded updates from WIP awareness + blocked-reason taxonomy slices:

**Flow control + WIP awareness:**
- Added WIP threshold helpers in `src/lib/projects-view-model.ts` (`PROJECT_ACTIVE_WIP_WARNING_THRESHOLD=3`, `isProjectWipHigh`, `buildProjectWipHint`).
- Surfaced `WIP high` warning badge + launch-pressure hint on project detail board (`src/screens/projects/project-detail-screen.tsx`).

**Blocked taxonomy + actionable guidance:**
- Added structured taxonomy (`mission_failed | review_feedback | blocked_by_dependency | external | other`) across:
  - `src/lib/projects-api.ts`
  - `src/server/work-items-store.ts`
  - `src/routes/api/work-items.ts`
  - `src/routes/api/work-items.$workItemId.ts`
  - `src/server/work-item-execution.ts`
- Added reason-aware board/detail surfaces and guidance in:
  - `src/screens/projects/project-detail-screen.tsx`
  - `src/screens/projects/work-item-detail-screen.tsx`

**Verification:**
- Targeted tests: `58/58` passing
- Full regression: `124/124` passing
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live verification on `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906` confirmed:
  - WIP warning rendered when active count exceeded threshold
  - blocked-reason label/guidance rendered on work-item detail
- Temporary live verification mutation on demo work item was restored (`status=active`, `phase=build`, `blockedReason=null`).

### 2026-04-25 Slice I1 completion snapshot (shipped)

Grounded updates from deploy rejection return-to-build slice:

**Approval transition fix:**
- Updated deploy approval resolution so both `rejected` and `changes_requested` decisions now transition work item to `status=active`, `phase=build`.
- Added explicit correction-loop history notes in `src/server/work-item-approvals.ts`:
  - `Deploy rejected; returned work item to build for correction and relaunch.`
  - `Deploy requested changes; returned work item to build for correction and relaunch.`

**Verification:**
- Targeted tests:
  - `pnpm test src/server/work-item-approvals.test.ts src/server/work-item-lifecycle.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `40/40` passing
- Full regression: `126/126` passing
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live API verification on target project:
  - Created temporary deploy-phase work item
  - Requested deploy approval then resolved as `rejected`
  - Verified result `status=active`, `phase=build` with correction-loop history note
  - Deleted temporary verification work item

### 2026-04-25 Slice I2 completion snapshot (shipped)

Grounded updates from route-level execution sync fallback envelope:

**Route/API fallback:**
- Updated `src/routes/api/work-items.$workItemId.ts` so `GET ?syncExecution=true` no longer returns 500 for recoverable sync failures.
- When sync throws, route now returns HTTP 200 with base payload and:
  - `executionSyncWarning: string`

**UI warning surfacing:**
- Added warning contract in `src/screens/projects/work-item-detail-screen.tsx`:
  - `WORK_ITEM_EXECUTION_SYNC_WARNING_TITLE`
  - `getWorkItemExecutionSyncWarningMessage(...)`
- Added warning banner + warning toast path while keeping work-item detail usable.

**Verification:**
- Targeted tests:
  - `pnpm test src/server/work-item-execution.test.ts src/server/work-item-detail-route.test.ts src/screens/projects/work-item-detail-screen.test.ts`
  - `16/16` passing
- Full regression: `128/128` passing
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live API verification on target project:
  - created temporary work item
  - called `GET /api/work-items/:id?syncExecution=true`
  - verified HTTP 200 payload remained usable
  - deleted temporary verification work item

### 2026-04-25 Slice J completion snapshot (shipped)

Grounded updates from the Planner-as-Reviewer autonomous quality gate:

**Planner review mission launch:**
- When `syncWorkItemExecutionState` detects build->review transition for work items with `planFilePath`, a Planner review Conductor mission is launched automatically.
- `buildPlannerReviewGoal()` produces a structured prompt with plan path, acceptance criteria, per-criterion status, and explicit `DECISION: APPROVED` / `DECISION: CHANGES_REQUESTED` instruction.
- `launchPlannerReview()` fires the mission using the resolved `planner` profile.

**Auto-resolution on review completion:**
- During subsequent execution sync cycles, when the work item is in `active/review` phase with a `reviewJobId`:
  - Review job `succeeded` → approval auto-resolved as `approved`, work item advances to `active/deploy` with history entry.
  - Review job `failed` → approval auto-resolved as `changes_requested`, work item returns to `active/build` with error context.

**Data model additions:**
- `reviewJobId?: string`, `reviewState?: WorkItemReviewState`, `reviewDecision?: WorkItemReviewDecision` added to `WorkItemRecord`, `CreateWorkItemInput`, and `normalizeWorkItem`.

**PATCH route support:**
- `planFilePath`, `reviewJobId`, `reviewState`, `reviewDecision` now accepted in PATCH `/api/work-items/:id`.

**UI additions:**
- Planner Review Status section in Mission Control Summary panel on work-item detail.
- `reviewDecisionLabel()` helper for user-facing decision copy.

**Verification:**
- New tests: `buildPlannerReviewGoal` (2), `reviewDecisionLabel` (1)
- Full regression: `131/131` passing (`pnpm test`)
- `pnpm build` clean
- `systemctl --user restart hermes-workspace.service` + `is-active` -> `active`
- Live API verification on target project confirmed `reviewJobId`/`reviewState`/`reviewDecision` round-trip and `syncExecution` return.

### 2026-04-25 Slice K completion snapshot (shipped)

Grounded updates from the notification watchdog slice:

**Digest generator:**
- `src/server/work-item-notification-digest.ts` with `buildStatusDigest()` — aggregates pending review/deploy approvals, blocked items, and failed missions across all projects.
- File-based de-dup using SHA-256 hash of canonical state (`digestStateHasChanged()` / `persistDigestHash()`).
- `formatDigestForDiscord()` — structured Discord-ready output with emoji-coded sections (⏳ pending, 🚧 blocked, ❌ failed) and age indicators.
- `formatDigestAge()` — human-readable duration.

**API endpoint:**
- `GET /api/work-item-notification-digest` — returns full JSON digest + `hasChanged` + pre-formatted Discord message.
- `GET ?format=discord` — returns only the formatted message for direct cron delivery.

**Verification:**
- 7 new tests in `work-item-notification-digest.test.ts`
- Full regression: `138/138` passing
- `pnpm build` clean, service restarted and active
- Live API verification confirmed digest returns correct pending approval data with `hasChanged=true`

### Updated next priority (Dream Mission Control queue)
1. **Slice K — notification watchdog** — ✅ **SHIPPED** (status digest, de-dup, Discord-formatted output)
2. **Slice L — labels + lightweight analytics** — cross-cutting categorization and throughput/blocked visibility

Detailed implementation slices and acceptance criteria are tracked in:
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-slices-plan.md`

---

# Target architecture

## Layer 1 — Operator cockpit (keep)
Keep existing Hermes Workspace surfaces as-is:
- Chat
- Sessions
- Files
- Terminal
- Memory
- Skills
- Profiles
- Jobs
- Dashboard

These remain the daily operator environment.

## Layer 2 — Mission Control domain layer (add)
Add canonical entities:
- Projects
- Work Items
- Approvals
- Artifacts / execution links
- Phase history

This becomes the authoritative source of truth.

## Layer 3 — Execution layer (extend)
Use Conductor to execute selected work items.

Conductor should become:
- the runtime execution engine
- launched from work items
- phase-aware
- profile-aware
- repo-aware

## Layer 4 — Delivery evidence layer (add)
Every work item should be able to accumulate:
- session IDs
- mission ID
- branch name
- PR URL
- output paths
- reports / summaries
- approval records

---

# Canonical domain model

## Project
Minimum initial fields:
- `id`
- `name`
- `slug`
- `repoPath`
- `repoUrl?`
- `defaultBranch?`
- `description?`
- `createdAt`
- `updatedAt`

## WorkItem
Recommended initial fields:
- `id`
- `projectId`
- `title`
- `description`
- `status`
- `phase`
- `priority`
- `assignedProfile?`
- `repoPathSnapshot`
- `missionId?`
- `sessionKeys[]`
- `branchName?`
- `prUrl?`
- `artifactPaths[]`
- `acceptanceCriteria[]`
- `notes[]`
- `createdAt`
- `updatedAt`

## Approval
Minimum initial fields:
- `id`
- `workItemId`
- `phase`
- `requestedBy`
- `requestedAt`
- `status`
- `resolvedBy?`
- `resolvedAt?`
- `notes?`

## WorkItemEvent / PhaseHistory
Minimum initial fields:
- `id`
- `workItemId`
- `type`
- `fromStatus?`
- `toStatus?`
- `fromPhase?`
- `toPhase?`
- `actor`
- `summary`
- `timestamp`

---

# Canonical lifecycle

Use these statuses/phases for the coding workflow.

## Statuses
- `inbox`
- `ready`
- `active`
- `blocked`
- `done`
- `cancelled`

## Phases
- `research`
- `build`
- `review`
- `deploy`

## Mapping rule
A work item is always in one status, and may also have an active phase when status is `active`.

Examples:
- idea captured → `status=inbox`
- clarified and approved for work → `status=ready`
- currently being explored → `status=active, phase=research`
- coding underway → `status=active, phase=build`
- pending review → `status=active, phase=review`
- pending release/deploy → `status=active, phase=deploy`
- completed → `status=done`
- blocked → `status=blocked`

This is cleaner than trying to overload the existing generic task columns.

---

# Screen / route plan

## Keep existing routes
- `/dashboard`
- `/tasks`
- `/conductor`
- `/profiles`
- `/memory`
- `/skills`
- `/jobs`
- `/files`
- `/terminal`

## Add new Mission Control routes
### New routes
- `/projects`
- `/projects/$projectId`
- `/projects/$projectId/work-items/$workItemId`

### New screens
- `src/screens/projects/projects-screen.tsx`
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.tsx`

### New route files
- `src/routes/projects.tsx`
- `src/routes/projects/$projectId.tsx`
- `src/routes/projects/$projectId/work-items/$workItemId.tsx`

## Product rule
Do **not** replace `/tasks` immediately.
Instead:
- keep `/tasks` as lightweight operator backlog / utility board
- introduce `/projects` + work-item screens as the real Mission Control surface
- later decide whether `/tasks` becomes a compatibility view or a simplified personal board

---

# Persistence strategy

## Phase 1 persistence rule
Stay merge-safe and low-risk.
Use file-backed persistence first, mirroring current Workspace style.

### Add server stores
- `src/server/projects-store.ts`
- `src/server/work-items-store.ts`
- `src/server/approvals-store.ts`
- `src/server/artifacts-store.ts` (or fold into work-items-store initially)

### Suggested files under `~/.hermes`
- `projects.json`
- `work-items.json`
- `work-item-approvals.json`
- `work-item-events.json`

This keeps the first implementation aligned with current Workspace patterns and avoids premature DB adoption.

## Future persistence option
Once the model stabilizes, consider migrating to SQLite or a stronger embedded persistence layer. Do not do this in Phase 1 unless file-backed limits become immediate blockers.

---

# Conductor integration design

## Key rule
Conductor should execute a **selected work item**, not just a freeform mission prompt.

## Add launch flow
From a work item detail page:
- `Launch Research`
- `Launch Build`
- `Request Review`
- `Launch Deploy`
- `Resume Work`

These actions should:
1. validate project/repo context
2. validate phase/profile configuration
3. create/update work item state
4. call a dedicated Mission Control → Conductor API
5. record mission/session linkage

## New route
- `src/routes/api/work-items.$workItemId.launch.ts`
  - or similarly named route matching router conventions

## New server orchestrator helper
- `src/server/work-item-launch.ts`

This helper should:
1. load work item
2. load project
3. derive phase
4. build conductor payload
5. call the existing conductor spawn path
6. update work item with mission/session tracking metadata
7. append phase history event

## Important rule
Do **not** duplicate Conductor mission-building logic in multiple routes.
Centralize it in one helper.

---

# Phase → Profile routing policy

Use the new Conductor routing you already implemented, but make it work-item aware.

## Recommended default routing
- `research` → `researcher`
- `build` → `builder`
- `review` → `reviewer` (to be added)
- `deploy` → `deployer` (to be added)

## Resolution order
When launching a work item phase, resolve profile in this order:
1. work-item explicit override
2. project-level phase routing config
3. Conductor global default phase routing
4. fallback to no explicit profile

That lets you support:
- per-item exceptions
- per-project conventions
- workspace-wide defaults

---

# Approval model

## First slice
Only add approvals where they create real operator value:
- build → review transition
- review approval / changes requested
- deploy approval

## UI behavior
On work-item detail page:
- show current approval state
- show history
- allow:
  - approve
  - request changes
  - deny / block

## Rule
Do **not** rely on localStorage approvals for Mission Control work items.
Those are fine for legacy/conductor-local UX but not for authoritative lifecycle governance.

---

# Repo/project awareness design

Each project should define:
- `repoPath`
- optional `repoUrl`
- optional `defaultBranch`

Each work item should snapshot the project repo path when launched.

## Why snapshot repo path into work item
Because if project config changes later, old work items still need reproducible execution history.

## Future optional fields
- `workspaceRoot`
- `docsPath`
- `plansPath`
- `preferredOutputDir`

---

# Dashboard evolution

Current Dashboard should evolve into a top-level Mission Control overview.

## Add widgets
- Active projects
- Work items by status
- Work items by phase
- Running missions
- Pending approvals
- Blocked items
- Recent completions

## Keep existing operator context visible
Do not turn dashboard into PM fluff. Keep it operator-centric:
- what needs attention now
- what is running now
- what is blocked now
- what approvals are waiting

---

# Recommended phased implementation roadmap

## Phase 1 — Canonical Mission Control data model
### Objective
Introduce Projects + Work Items as real server-owned entities without breaking existing Tasks or Conductor.

### Deliverables
- `projects-store.ts`
- `work-items-store.ts`
- project/work-item API routes
- `/projects` list screen
- `/projects/$projectId` detail screen with basic work-item list
- `/projects/$projectId/work-items/$workItemId` detail screen

### Rules
- Keep file-backed persistence
- Do not wire Conductor yet except placeholder buttons
- Do not replace `/tasks`

## Phase 2 — Launch from work item into Conductor
### Objective
Connect Mission Control work items to Conductor execution.

### Deliverables
- launch helper
- launch API route
- mission/session linkage on work items
- work-item action buttons for phase launch
- basic phase history entries

### Rules
- Conductor remains execution engine
- work items become control plane
- no duplicate spawn logic

## Phase 3 — Phase-aware lifecycle + profile resolution
### Objective
Make work-item transitions lifecycle-aware and deterministic.

### Deliverables
- canonical transition helper
- phase transitions
- project-level phase routing config
- work-item launch resolves profile by policy
- Conductor payload built from work item + project + phase

### Rules
- transitions must be server-owned
- UI should not mutate authoritative state directly

## Phase 4 — Approvals + review governance
### Objective
Add human/operator control for review/deploy stages.

### Deliverables
- approvals store + API routes
- review approval UI on work-item detail
- request changes / approve actions
- transition audit history

### Rules
- durable approvals, not localStorage-only
- review/deploy gates are explicit

## Phase 5 — Dashboard + operator quality of life
### Objective
Make the whole system feel like a true coding Mission Control.

### Deliverables
- dashboard widgets for projects/work-items/approvals/missions
- better artifact display
- branch / PR / session linking
- blocked-items panel
- quick filters and attention queues

---

# Minimal file plan

## New files likely needed
### Routes
- `src/routes/projects.tsx`
- `src/routes/projects/$projectId.tsx`
- `src/routes/projects/$projectId/work-items/$workItemId.tsx`
- `src/routes/api/projects.ts`
- `src/routes/api/projects.$projectId.ts`
- `src/routes/api/work-items.ts`
- `src/routes/api/work-items.$workItemId.ts`
- `src/routes/api/work-items.$workItemId.launch.ts`
- `src/routes/api/work-items.$workItemId.transition.ts`
- `src/routes/api/work-items.$workItemId.approvals.ts` (or split as needed)

### Screens
- `src/screens/projects/projects-screen.tsx`
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.tsx`
- optionally `src/screens/projects/components/*`

### Server
- `src/server/projects-store.ts`
- `src/server/work-items-store.ts`
- `src/server/work-item-launch.ts`
- `src/server/work-item-transitions.ts`
- `src/server/work-item-approvals.ts`

### Shared types
- `src/lib/mission-control-types.ts`

### Docs
- `docs/plans/2026-04-21-hermes-workspace-mission-control-roadmap.md`

---

# UX recommendations

## Projects page
Show cards/table with:
- project name
- repo path
- active work item count
- blocked count
- pending approval count
- last activity

## Project detail page
Show:
- repo context
- work-item board/list
- quick create work item
- filter by status/phase
- launchable actions

## Work item detail page
Show:
- description
- acceptance criteria
- current lifecycle status
- current phase
- linked mission/session data
- artifacts
- branch / PR info
- approval history
- phase history
- launch/resume/approve/block actions

## Conductor page
Keep as global execution surface, but later add:
- “launched from work item” context banner
- deep link back to source work item

---

# Product rules to preserve

## Rule 1
Do **not** destroy existing Hermes Workspace strengths to chase workflow rigor.

## Rule 2
Do **not** overload current `/tasks` as the final Mission Control domain model.

## Rule 3
Do **not** make Conductor the system of record.
Conductor runs work; work items own state.

## Rule 4
Do **not** put authoritative lifecycle logic in localStorage stores.
Use server helpers + file-backed persistence first.

## Rule 5
Preserve merge-safety:
- additive new screens
- additive routes
- additive server stores
- minimal invasive edits to existing cockpit screens

---

# Recommended first implementation slice

If starting immediately, the best first slice is:

1. Add Projects + Work Items stores and APIs
2. Add `/projects` + project detail + work-item detail screens
3. Add work-item → Conductor launch helper for one phase only
4. Start with only:
   - `ready`
   - `active/build`
   - `review`
   - `done`
5. Bind build launches to `builder`
6. Bind research launches to `researcher`

This gives the fastest proof that Hermes Workspace can become your Mission Control without a large rewrite.

---

# Validation checklist

After each phase:
- `pnpm test -- --runInBand`
- `pnpm build`
- restart `hermes-workspace.service`
- verify live UI on `http://127.0.0.1:3456`

For Mission Control phases specifically verify:
- a project can be created
- a work item can be created under a project
- a work item can be launched into Conductor
- mission/session linkage is written back
- phase/profile routing behaves as expected
- approvals persist and re-render after reload

---

# Bottom line

The right move is **not** “Conductor or Tasks?” as a final architecture.

The right architecture is:
- **Projects/Work Items** = authoritative coding control plane
- **Conductor** = execution engine
- **Profiles** = role/phase behavior
- **Workspace shell** = operator cockpit

That gives you a Hermes-native Mission Control without inheriting Multica’s backend/fork burden.
