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

## 4. Current next prioritized slices

These are the slices that should be treated as the planned continuation queue unless the user reprioritizes.

### Slice 1 — Idea capture + Plan with Researcher workflow
**Why first:** this is the highest-value gap between current implementation and intended Mission Control workflow.

**Outcome wanted:**
- New Work Item creation should support quick idea/request capture without demanding full acceptance criteria up front.
- A dedicated planning action should exist.
- Planning should route to `researcher` by default.
- Planning output should have a natural place to draft or enrich acceptance criteria and notes.
- Lifecycle language should make sense for `inbox → planning/research → ready/build`.

**Likely implementation surfaces:**
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/server/work-item-launch.ts`
- `src/server/work-item-execution.ts`
- `src/lib/projects-api.ts`
- related tests above

**Concrete likely sub-slices:**
1. simplify New Work Item form for idea capture
2. add explicit `Plan with Researcher` action on work-item detail
3. ensure launch copy/goal for research phase is planning-oriented
4. add acceptance-criteria drafting/editing path after or around planning
5. add explicit transition helpers such as `Mark Ready` / `Launch Build`

### Slice 2 — Work-item lifecycle action clarity
**Outcome wanted:**
- clear state transition buttons matching the intended workflow, likely including:
  - `Send to Planning`
  - `Mark Ready`
  - `Launch Build`
  - `Request Review`
  - `Launch Deploy`
- actions should be server-owned, explicit, and consistent with approval rules

### Slice 3 — Work-item detail as true execution cockpit
**Outcome wanted:**
- stronger planning/build/review/deploy state visibility
- clearer evidence grouping
- cleaner action layout depending on current phase/status
- reduced ambiguity between “launch”, “sync”, “approval”, and “done” pathways

### Slice 4 — Project-level workflow policy refinement
**Outcome wanted:**
- clearer project-level routing/governance controls
- possibly stronger surfacing of phase → profile routing and review auto-approval policy
- make per-project workflow rules feel operational rather than hidden config

### Slice 5 — Dashboard/operator overview refinement
**Outcome wanted:**
- Mission Control dashboard surfacing what needs attention now
- stronger blocked / pending approval / running work visibility
- better top-level operational queues

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
4. start with **Slice 1 — Idea capture + Plan with Researcher workflow** unless D3n13r reprioritizes
5. keep using the inspect → tests → patch → targeted tests → build → restart → live verify workflow

---

## 8. Bottom line

The project is already past the original roadmap’s earliest slices. The next meaningful evolution is no longer “add Mission Control basics”; it is to make the workflow truly match the intended operating model:

**idea capture → planning with Researcher → ready/build with Builder → review/approval → deploy/done**

If resuming later, continue from **Slice 1 — Idea capture + Plan with Researcher workflow** first.
