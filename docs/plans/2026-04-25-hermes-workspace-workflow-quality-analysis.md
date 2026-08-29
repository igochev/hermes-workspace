# Hermes Workspace — Workflow Quality Analysis (2026-04-25)

> **Scope:** Comprehensive audit of the current Mission Control kanban workflow quality, identifying gaps, improvement opportunities, and prioritized recommendations for the next iteration.
>
> **Continuation:** This analysis builds on the slices shipped in `2026-04-25-hermes-workspace-profiles-workflow-rearchitecture.md` (Slices A–D). After reading this, consult the continuation handoff and roadmap for the full project state.

---

## 1. Current workflow architecture (as shipped)

### 1.1 Statuses and phases

| Status | Phase | Description |
|--------|-------|-------------|
| `inbox` | `research` (default) | Idea captured, unrefined |
| `ready` | — | Planning complete, ready for build |
| `active` | `research` | Planning in progress |
| `active` | `build` | Implementation in progress |
| `active` | `review` | Awaiting review approval |
| `active` | `deploy` | Awaiting deploy approval |
| `blocked` | `build` (typically) | Mission failed or blocked |
| `done` | — | Completed |
| `cancelled` | — | Abandoned (must be set at creation) |

### 1.2 Available lifecycle transitions

```
inbox/research ──[send_to_planning]──→ active/research
active/research ──[mark_ready]────────→ ready/—
ready/— ────────[Launch Build]───────→ active/build (two-phase pipeline)
active/build ────[request_review]─────→ active/review (+ review approval)
active/review ───[approve]────────────→ active/deploy
active/review ───[changes/reject]─────→ active/build (returned)
active/deploy ───[request_deploy_approval] → pending deploy approval
pending deploy ──[approve]────────────→ done
pending deploy ──[changes/reject]─────→ active/build (returned)
blocked/build ───[resume_build]───────→ active/build
```

### 1.3 What's working well

- Clean status + phase separation avoids overloaded state machines
- Two distinct governance gates (review + deploy) with independent approval flows
- Priority-based review auto-approval (`reviewAutoApproval` project policy)
- Two-phase launch pipeline (Planner → Builder) fully orchestrated
- Flow-ordered board columns with urgency sorting, signal chips, recovery hints
- Risk level field (`low | medium | high`) ready for automation wiring
- Full history tracking per work item with phase transitions

---

## 2. Detailed gap analysis

### 2.1 🚫 No "Cancel" lifecycle action

**Current state:** The `cancelled` status exists in the data model but is **unreachable from any lifecycle transition**. It can only be set at creation time. Once a work item enters `active` (any phase), it can never be cancelled through the UI.

**Impact:**
- Abandoned items linger in active/blocked state forever
- Board columns accumulate dead items
- Operator must use the delete button (destructive, no trace)
- No way to record *why* an item was cancelled

**Fix scope:** ~2 files (`work-item-lifecycle.ts`, `work-item-detail-screen.tsx`)
- Add `cancel` action available from any `active` or `blocked` state
- Transition to `status=cancelled`, phase=undefined
- Require a reason note (stored in history)
- Boards should render cancelled items differently (greyed out, collapsible)

### 2.2 🔙 No backward lifecycle transitions

**Current state:** The workflow is strictly forward — no action can move a work item backward in the lifecycle. Specifically:

| Missing transition | Use case |
|-------------------|----------|
| `back_to_inbox` | Planning reveals the idea isn't ready; operator should return to inbox for refinement |
| `back_to_research` | Builder encounters unknowns during build; needs more planning before continuing |
| `back_to_build` | Deploy approval is rejected/changed; should return to build for fixes (not stay in deploy) |

**Impact:**
- If planning discovers the work isn't ready, the operator has no clean way to backtrack
- If build hits unknowns, the operator has to cancel and recreate
- Stale blocked items accumulate because `blocked` has no "send back" actions beyond `resume_build`

**Fix scope:** ~2 files
- Add `back_to_research` from `blocked/build` and `active/build`
- Add `back_to_build` from `active/deploy` when deploy approval is rejected/changed
- Consider `back_to_inbox` from `active/research` for completeness

### 2.3 ⚠️ riskLevel not wired into any automation

**Current state:** The `riskLevel` field was added in Slice C (shipped 2026-04-25) but has **zero behavioral impact**:
- Not used in board sorting or urgency ranking
- Not used in auto-approval logic
- Not used in operator guidance text

**Impact:**
- The entire purpose of Slice C — "future auto-approval" — is unrealized
- Operators must manually assess urgency without risk-level cues
- The field is decoration, not decision support

**Fix scope:** ~2 files
- Wire into `getWorkItemAttentionRank()` in `projects-view-model.ts` — low-risk items sort lower
- Wire into `shouldAutoApproveReview()` in `work-item-approvals.ts` — low-risk can auto-approve
- Update operator guidance text in `work-item-detail-screen.tsx` when riskLevel=low

### 2.4 📋 No acceptance criteria verification

**Current state:** `acceptanceCriteria` is an array of strings on `WorkItemRecord`. They are displayed as a list on the detail screen and editable in the "Edit Planning Details" panel. However:

- No per-criterion check-off or progress tracking
- No way to mark criteria as "met" or "not met"
- No visual indicator of planning-to-build completeness
- No integration with the two-phase pipeline (Planner writes criteria, Builder doesn't confirm them)

**Impact:**
- Operator can't track which criteria are fulfilled
- Review approval lacks a checklist to verify against
- Planning output is disconnected from build completion signal

**Fix scope:** ~3 files
- Add `criteriaStatus: Array<{ text: string; met: boolean }>` to model (or extend existing array)
- Show checkbox + status per criterion on detail screen
- Add progress indicator (e.g., "3/5 criteria met")
- Could be used in auto-approval: "all criteria met + low risk = auto-approve"

### 2.5 📊 No WIP (Work-in-Progress) awareness

**Current state:** There are no safeguards or visual cues about how many work items are in `active` status across a project or globally.

**Impact:**
- No flow control — operator can launch unlimited concurrent missions
- Overload risk: too many active items means none get focused attention
- No "pull" signal — board doesn't help the operator decide what to work on next
- Hidden bottlenecks: active column can grow indefinitely without warning

**Fix scope:** ~2 files
- Add WIP threshold constant (e.g., 3 per column)
- Visual warning (yellow/red border, badge with "3 active — consider finishing one")
- Could be per-project configurable in workflow policy panel
- Future: block launch when WIP limit is exceeded

### 2.6 📉 No blocked-reason taxonomy

**Current state:** `blocked` status has no structured field for *why* it's blocked. The only way to determine the cause is to read `missionLastError`, the latest history entry, or the approval status.

**Impact:**
- Board filtering by blocked reason is impossible
- Operator guidance is generic ("Review the latest error or approval feedback")
- Can't aggregate "why are we blocked most often" across projects
- Recovery hint logic (`buildWorkItemRecoveryHint`) must guess from `missionState` and `approvals`

**Fix scope:** ~2 files
- Add `blockedReason: 'mission_failed' | 'review_feedback' | 'blocked_by_work_item' | 'external_dependency' | 'other'` to model
- Set automatically when lifecycle transitions to `blocked`
- Update operator guidance text per reason
- Allow custom notes alongside the reason

### 2.7 🔔 No notification system — ✅ **SHIPPED**

**Current state:** The operator must poll the dashboard or project board to discover:
- Pending approvals (review or deploy)
- Failed missions
- Review changes requested
- Deploy approval resolution

**Resolution:** Slice K shipped a `GET /api/work-item-notification-digest` endpoint that aggregates pending approvals, blocked items, and failed missions with a Discord-formatted output and file-based de-dup window. Operators can schedule periodic delivery via Hermes cron.

**Impact:**
- Time-sensitive governance bottlenecks can go unnoticed
- Failed missions may sit for hours before operator notices
- No proactive workflow acceleration

**Fix scope:** Could use existing `cronjob` infrastructure
- Periodic check for pending approvals across all projects
- Periodic check for failed missions
- Deliver summary via configured platform (Telegram, Discord, etc.)
- Could be per-project configurable

### 2.8 🏷️ No flexible labels/tags system

**Current state:** Categorization is limited to: `phase`, `priority`, `riskLevel`, `assignedProfile`. There's no generic label/tag system for cross-cutting concerns.

**Impact:**
- Can't tag items by type (bug, feature, chore, documentation)
- Can't filter/tag by sprint, milestone, or release
- No cross-project grouping beyond project assignment
- Board filtering is limited to the hard-coded filters (All, Attention, Execution, Approvals)

**Fix scope:** ~3 files
- Add `labels: Array<string>` to model
- Show as colored badges on board cards and detail header
- Allow inline add/remove on detail screen
- Future: filter by label on project board

---

## 3. Prioritized improvement roadmap

### Tier 1 — High impact, low effort (immediate)

| # | Improvement | Files | Est. effort | Status |
|---|-------------|-------|-------------|--------|
| 1 | **Wire riskLevel into urgency sorting** — low-risk items sort lower in board columns | `projects-view-model.ts` | ~10 lines | ✅ **Shipped** |
| 2 | **Wire riskLevel into auto-approval** — low-risk items auto-approve through review | `work-item-approvals.ts` | ~5 lines | ✅ **Shipped** |
| 3 | **Add "Cancel" lifecycle action** — cancel from any active/blocked state | `work-item-lifecycle.ts`, `work-item-detail-screen.tsx` | ~30 lines | ✅ **Shipped** |
| 4 | **Add "Back to Research" action** — return to research from blocked/build | `work-item-lifecycle.ts`, `work-item-detail-screen.tsx` | ~20 lines | ✅ **Shipped** |

### Tier 2 — Medium impact, medium effort (next)

| # | Improvement | Files | Est. effort | Status |
|---|-------------|-------|-------------|--------|
| 5 | **Acceptance criteria check-off** — per-criterion met/not-met tracking | `work-items-store.ts`, `work-item-detail-screen.tsx`, `work-items.$workItemId.ts` | ~70 lines | ✅ **Shipped** |
| 6 | **Board column WIP warning** — visual indicator when active exceeds threshold | `project-detail-screen.tsx`, `projects-view-model.ts` | ~30 lines | ✅ **Shipped** |
| 7 | **Deploy rejection → return to build** — not stuck in deploy | `work-item-approvals.ts` | ~10 lines | ✅ **Shipped** |

### Tier 3 — Higher impact, higher effort (future)

| # | Improvement | Est. effort |
|---|-------------|-------------|
| 8 | **Blocked reason taxonomy** — structured blocked-reason field + UI | ~80 lines |
| 9 | **Cron-based notification system** — periodic approval/mission alerts | ✅ **SHIPPED** — digest endpoint + de-dup |
| 10 | **Labels/tags system** — flexible categorization + board filter | ~80 lines |
| 11 | **Analytics pane** — cycle time, throughput, rework rate | ~150 lines |

---

## 4. Proposed implementation slices

### Slice E — riskLevel automation (shipped 2026-04-25)
- Wired riskLevel into board sorting — low-risk items sort lower within same attention + priority
- Wired riskLevel into review auto-approval — low-risk items auto-approve regardless of project policy
- Wired riskLevel into operator guidance — ready items show "low-risk — review will be auto-approved"
- 2 new tests: riskLevel sort order + riskLevel auto-approval
- 104/104 tests passing, `pnpm build` clean, live verified end-to-end

### Slice F — Lifecycle completeness (shipped 2026-04-25)
- ✅ Added `cancel` lifecycle action with required reason notes and transition to `status=cancelled`
- ✅ Added `back_to_research` action for active/blocked build recovery loops (and active review fallback)
- ✅ Added `back_to_build` action for active deploy correction loops
- ✅ Added `back_to_inbox` from active research for early planning rollback
- ✅ Updated lifecycle + detail-screen test coverage
- ✅ Fixed lifecycle API validation response: cancel-without-reason now returns HTTP 400 (not 500)

### Slice G — Acceptance criteria verification (shipped 2026-04-25)
- ✅ Added `criteriaStatus: Array<{ text: string; met: boolean }>` to the work-item model with automatic alignment to `acceptanceCriteria`
- ✅ Added check-off UI in work-item detail (`Acceptance Criteria`) with clickable per-criterion toggles
- ✅ Added progress indicator (`X/Y criteria met`) rendered in the acceptance-criteria panel
- ✅ Wired progress data into operator guidance for `ready` state
- ✅ Hardened PATCH route partial updates so criteria-status updates do not wipe unrelated work-item fields
- ✅ Verification: targeted tests + full regression (`122/122`), `pnpm build`, service restart, live UI/API check with toggle + restore

### Slice H — WIP awareness + blocked taxonomy (shipped 2026-04-25)
- ✅ H1 shipped: WIP threshold + board/detail warning surfaces (`WIP high`, launch-pressure hint)
- ✅ H2 shipped: structured blocked-reason taxonomy (`mission_failed | review_feedback | blocked_by_dependency | external | other`)
- ✅ Wired into operator guidance and board signals (reason chips + detail guidance)
- ✅ Verification: targeted tests (`58/58`), full regression (`124/124`), `pnpm build`, service restart (`active`), live project verification
- Execution details tracked in `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-slices-plan.md`

### Slice I1 — Deploy rejection returns to build (shipped 2026-04-25)
- ✅ Updated deploy approval resolution so `rejected` and `changes_requested` both return to `status=active`, `phase=build`
- ✅ Added explicit correction-loop history notes for both deploy rejection paths
- ✅ Added test-first coverage in `src/server/work-item-approvals.test.ts`
- ✅ Verification: targeted tests (`40/40`), full regression (`126/126`), `pnpm build`, service restart (`active`), live API verification with temporary deploy item (cleaned up)

### Slice I2 — execution sync fallback envelope (shipped 2026-04-25)
- ✅ Updated `src/routes/api/work-items.$workItemId.ts` fallback path: recoverable sync failures now return HTTP 200 base payload + `executionSyncWarning` instead of HTTP 500
- ✅ Added route-level fallback regression coverage in `src/server/work-item-detail-route.test.ts`
- ✅ Added warning copy contract + banner surface in `src/screens/projects/work-item-detail-screen.tsx`
- ✅ Added helper assertions in `src/screens/projects/work-item-detail-screen.test.ts`
- ✅ Verification: targeted tests (`16/16`), full regression (`128/128`), `pnpm build`, service restart (`active`), live API verification with temporary target-project item (cleaned up)

### Slice J — Planner-as-Reviewer (shipped 2026-04-25)
- ✅ Added autonomous Planner review pass triggered after build->review transition for two-phase pipeline items
- ✅ `buildPlannerReviewGoal()` produces structured review prompt with plan path, criteria status, and explicit decision instruction
- ✅ `launchPlannerReview()` fires Conductor review mission using `planner` profile
- ✅ Execution sync auto-resolves pending approval on review completion (succeeded→deploy, failed→return to build)
- ✅ Verification: targeted tests (3 new), full regression (`131/131`), service restart, live API verification

### Slice K — Notification watchdog (shipped 2026-04-25)
- ✅ Created `src/server/work-item-notification-digest.ts` with digest generator, Discord formatter, and file-based de-dup
- ✅ Created `GET /api/work-item-notification-digest` endpoint with `?format=discord` mode
- ✅ Verification: 7 new tests, full regression (`138/138`), `pnpm build`, service restart, live API verification with pending approval scenario

---

## 5. Verification criteria for each tier

After implementing any slice:
1. All existing tests pass (138+ as of 2026-04-25)
2. Added tests cover new behavior
3. `pnpm build` clean
4. Service restarts and is `active`
5. Live verification at `http://localhost:3456` — create items, advance through lifecycle, verify new actions appear/disappear correctly
6. Board filters, urgency sorting, signal chips all render correctly with new data

---

## 6. Continuation

This analysis is a living document. After implementing any slice from sections 3–4, update this doc with the shipped status and re-prioritize the remaining items.

For the full project state, see:
- `docs/plans/2026-04-22-hermes-workspace-mission-control-continuation-handoff.md` — immediate handoff
- `docs/plans/2026-04-25-hermes-workspace-profiles-workflow-rearchitecture.md` — architecture record
- `docs/plans/2026-04-21-hermes-workspace-mission-control-roadmap.md` — full project roadmap
