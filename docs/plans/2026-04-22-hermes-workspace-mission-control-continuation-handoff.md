# Hermes Workspace Mission Control — Continuation Handoff (2026-04-22)

> **For Hermes:** Resume Mission Control work from this file first after any context reset. Treat this as the authoritative continuation brief for the current implementation state and next slices.

**Goal:** Preserve exact project state, completed slices, verified runtime behavior, and the next prioritized implementation slices so work can continue cleanly after session compaction or a fresh chat.

**Architecture:** Hermes Workspace is the operator cockpit. Projects and Work Items are the authoritative Mission Control control plane. Conductor is the execution engine. Profiles provide role/phase behavior. The intended lifecycle is idea capture → planning/research → build → review/approval → deploy/done.

**Runtime repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

**Local service:** `hermes-workspace.service`

**App URL:** `http://localhost:3456`

---

## 1. Current grounded state

### 1.1 Canonical product direction
- **Projects / Work Items** are the source of truth.
- **Conductor** executes launched work; it is not the canonical entry path.
- **Profiles** express role/phase routing behavior.
- **Researcher** should own default planning/research work.
- **Builder** should own implementation after planning.
- Idea-only requests should start as Work Items, usually with `status=inbox` and `phase=research`.
- Acceptance criteria should be draftable by planning, not always mandatory at initial capture time.

### 1.2 Live-verified runtime facts
- Runtime repo in use: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Local systemd service in use: `hermes-workspace.service`
- Serving locally on port `3456`
- Known verification project: `46b401f9-9243-472f-b5b7-04bf34596906`
- Browser may show onboarding/mobile overlay first; use **Skip setup** if needed.
- `jq` is unavailable in this environment; use Python for JSON/HTTP inspection.

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
- Live QA on 2026-04-23 confirmed:
  - dashboard Mission Control tiles and operator queues render at `/dashboard`
  - project workflow policy renders live at `/projects/46b401f9-9243-472f-b5b7-04bf34596906`
  - approvals inbox is operational at `/projects/approvals`
  - approving a pending review updates both the inbox and the work-item detail history/state
  - the review-phase work item `2328ce63-9e7e-41bf-a796-93da2d12f82a` now resolves to `done` after approval

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

### Next practical priority
The next practical continuation step is no longer slices 2-5. The immediate queue is:
1. continue a freshly created inbox/research item through planning-oriented actions from detail view for one more live Slice 1 workflow pass
2. finish and verify the remaining unstaged Conductor/work-item launch routing updates in:
   - `src/server/work-item-launch.ts`
   - `src/server/work-item-launch.test.ts`
   - `src/server/conductor-launch.test.ts`

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
- `work-item-detail-screen.tsx` already has launch, sync, approval, and evidence surfaces, but still uses a generic `Launch via Conductor` action instead of workflow-specific planning/build/review/deploy actions.
- `projects-view-model.ts` already encodes the board as a workflow progression rather than a generic status dump.

---

## 7. What to do immediately after a future context reset

When resuming this project in a new or compacted chat:
1. load this file
2. confirm the runtime repo is still `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
3. read the current versions of:
   - `src/screens/projects/project-detail-screen.tsx`
   - `src/screens/projects/work-item-detail-screen.tsx`
   - `src/server/work-item-launch.ts`
   - `src/server/work-item-execution.ts`
4. re-check the current slice status in section 4 before choosing work; do not assume older slice ordering is still current
5. if no reprioritization is given, start with the remaining live QA gap for **Slice 1 — Idea capture + Plan with Researcher workflow**
6. after that, continue with the unstaged Conductor/work-item launch routing refinement
7. keep using the inspect → tests → patch → targeted tests → build → restart → live verify workflow

---

## 8. Bottom line

The project is already past the original roadmap’s earliest slices. The next meaningful evolution is no longer “add Mission Control basics”; it is to make the workflow truly match the intended operating model:

**idea capture → planning with Researcher → ready/build with Builder → review/approval → deploy/done**

If resuming later, continue from **Slice 1 — Idea capture + Plan with Researcher workflow** first.
