# Slice Z/AA Implementation Plan — Autopilot Delegation Policies

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Make Autopilot useful as a developer delegation lane: suggestions should carry confidence/evidence, support safe one-click conversion into planning, and clearly explain what automation will happen next.

**Architecture:** Extend Autopilot suggestions with delegation policy metadata and UI actions. Keep safety rule: Autopilot does not directly code without accepted policy/operator action. Add “Convert + Plan” first, then an opt-in policy for “build when planner output is accepted/ready”.

**Tech Stack:** Existing Autopilot suggestion store/routes/UI, planning drafts, work-item routes, React Query, Vitest.

---

## Current context

Observed seams:

- Project Autopilot UI: `src/screens/projects/project-autopilot-screen.tsx`.
- Global suggestions inbox: `src/screens/projects/autopilot-suggestions-screen.tsx`.
- Autopilot types: `src/lib/autopilot-suggestions-api.ts`, `src/server/autopilot-suggestions-store.ts`.
- Planning draft flow from shipped N/O should be reused; do not create a parallel planner path.
- Work item launch path: `src/server/work-item-launch.ts`.

## Acceptance criteria

1. Suggestions show confidence, evidence quality, and recommended next action.
2. Operator can choose:
   - Convert to Work Item;
   - Convert + Request Planning;
   - Convert + Request Planning + mark for build after accepted plan (policy-gated, not silent direct coding).
3. Converted work items retain suggestion provenance.
4. Project Autopilot screen explains delegation policy and safety boundary.
5. Autopilot suggestions can be filtered by status/source/impact, not just visually listed as static chips.
6. Full regression and build pass.

## Task 1: Add delegation metadata helpers

**Files:**
- Modify/Create: `src/server/autopilot-delegation-policy.ts`
- Test: `src/server/autopilot-delegation-policy.test.ts`

**Steps:**
1. Define pure helper `recommendAutopilotDelegationAction(suggestion, projectPolicy)`.
2. Include outputs: `recommendedAction`, `confidence`, `evidenceQuality`, `riskWarning`, `operatorCopy`.
3. Test low-risk/high-evidence suggestion recommends planning; high-risk suggests manual review.

## Task 2: Persist suggestion provenance on conversion

**Files:**
- Modify: `src/server/autopilot-suggestions-store.ts`
- Modify: `src/server/work-items-store.ts`
- Modify: `src/lib/projects-api.ts`
- Test: relevant store tests

**Steps:**
1. Add optional work-item fields if not already present:
   - `sourceSuggestionId?: string`
   - `sourceSuggestionTitle?: string`
   - `sourceSuggestionEvidence?: string[]`
2. Ensure normalize and PATCH route preserve fields.
3. Test create/update round trip.

## Task 3: Add Convert + Plan route/action

**Files:**
- Modify/Create: `src/routes/api/autopilot-suggestions.$suggestionId.convert.ts` or existing action route
- Modify: `src/lib/autopilot-suggestions-api.ts`
- Test: route/action test

**Steps:**
1. Extend conversion action body with `mode: 'work-item' | 'work-item-and-plan' | 'work-item-plan-build-queued'`.
2. For `work-item-and-plan`, create work item then call existing planning draft request path.
3. For `work-item-plan-build-queued`, mark explicit queued intent field; do not launch build until planner draft is accepted/ready by existing flow.
4. Return created work item and planning draft identifiers.

## Task 4: Make suggestion filters real

**Files:**
- Modify: `src/screens/projects/autopilot-suggestions-screen.tsx`
- Test: screen test

**Steps:**
1. Replace static filter chips with buttons/selects backed by state.
2. Add filters: status, project, source, impact/risk.
3. Add tests for filter option constants and filtering helper.
4. Keep empty states clear.

## Task 5: Add Autopilot delegation UI copy and actions

**Files:**
- Modify: `src/screens/projects/autopilot-suggestions-screen.tsx`
- Modify: `src/screens/projects/project-autopilot-screen.tsx`
- Test: screen tests

**Steps:**
1. Show recommended next action on each suggestion card.
2. Add buttons for Convert, Convert + Plan, Convert + Plan + Build Queued.
3. Add safety text near buttons: `No code is launched until policy/operator conditions are met.`
4. Project screen should show delegation policy summary and current schedule.

## Task 6: Verification

Run:

```bash
pnpm test src/server/autopilot-delegation-policy.test.ts
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Live smoke:

1. Open `http://localhost:3456/projects/autopilot`.
2. Confirm filters work.
3. Convert a safe suggestion to Work Item + Plan.
4. Confirm work item provenance and planning draft are visible from project detail/work-item detail.

## Risks / pitfalls

- Do not bypass Planner enrichment.
- Do not silently launch Builder from Autopilot without policy/operator confirmation.
- Do not let converted suggestions lose evidence/rationale.
