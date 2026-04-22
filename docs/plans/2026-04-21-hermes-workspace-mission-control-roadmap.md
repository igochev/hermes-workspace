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
