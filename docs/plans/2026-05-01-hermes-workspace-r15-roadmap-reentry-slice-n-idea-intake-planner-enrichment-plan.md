# R15 Roadmap Re-entry: Slice N Idea Intake + Planner Enrichment Plan

## CEO decision

Only after R14 proves or truthfully blocks the clean profile-backed release-lane gauntlet, return to the product roadmap. The next roadmap item is Slice N: make rough ideas safely become Planner-prepared executable work.

## Goal

Add a clean `rough idea → Planner-prepared work item draft → operator accepts into ready work item` workflow that is separate from launching Builder.

## Preconditions

Builder must stop and update the handoff if R14 has not produced a PASS or explicit owner-approved proceed decision. Do not bury unresolved release-lane blockers under new feature work.

## User value

D3n13r should be able to dump a rough idea with minimal fields, ask Planner to prepare it, review a structured draft, and accept it into a ready-to-build Work Item without launching Builder immediately.

## In scope

### Task 1 — Planning draft model/store/API skeleton

- Inspect current stores before patching:
  - `src/server/work-items-store.ts`
  - existing planning draft code/stores/routes, if present
  - `src/routes/api/work-items.$workItemId.ts`
- Add or extend a `PlanningDraft` model/store for draft revisions.
- Fields should support at least:
  - `id`, `workItemId`, `projectId`, `status`
  - `rawIdea`, `rawPlannerOutput`
  - `structuredOutput` with title/description/acceptanceCriteria/labels/risk/estimatedEffort/impactedFiles/openQuestions/planFilePath
  - parse warnings/errors
  - timestamps.
- Add tests first for create/list/latest/update status behavior.

### Task 2 — Prepare-with-Planner server action without Builder launch

- Add a dedicated server route/helper for preparing a Work Item with Planner.
- It must launch/record a Planner preparation run only; it must not launch Builder or mutate mission/build fields.
- Planner output must be parsed/validated before work-item fields are changed.
- Invalid/missing structured output must mark the draft as needing revision, not corrupt the Work Item.
- Preserve PATCH partial-update safety.

### Task 3 — Accept/revise draft API

- Add an accept endpoint/action that applies selected draft fields to the Work Item.
- Applying a draft should update title/description/criteria/labels/risk/planFilePath only through explicit fields.
- Add a revise/reject path or status so bad drafts do not disappear.
- Tests must cover partial acceptance and no accidental criteria wipe.

### Task 4 — Work Item detail UI review affordance

- Add a Planner Draft panel to the Work Item detail page.
- Show structured diff/review fields first; raw output stays advanced/collapsed.
- Primary actions:
  - Prepare with Planner
  - Accept draft
  - Mark needs revision / request revise (can be a first-pass status action if full relaunch is too large)
- UI must make clear that Builder has not launched yet.

### Task 5 — Live dogfood + evidence

- Create one real rough-idea Work Item in the Mission Control project.
- Run prepare-with-Planner or, if live Planner transport blocks, use the route with a controlled structured test/dry-run path and record exact limitation.
- Browser verify the draft panel and accept flow.
- Write final report under:
  - `dogfood-output/slice-n-idea-intake-planner-enrichment-latest.md`
  - timestamped copy.

## Out of scope

- Autopilot Suggestion Inbox (Slice P).
- Scout schedules (Slice Q).
- SQLite migration.
- Parallel worktrees.
- Automatic build launch after planning.
- Broad UI redesign beyond the draft review affordance.

## Verification commands

```bash
pnpm vitest run src/server/planning-drafts-store.test.ts src/server/work-item-planning*.test.ts --reporter=dot
pnpm vitest run --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl --max-time 12 -fsS http://127.0.0.1:3456/ -o /tmp/hermes-workspace-root.html && wc -c /tmp/hermes-workspace-root.html
```

## Acceptance criteria

- A rough idea can be prepared by Planner without Builder launch.
- Structured draft output is persisted and visible.
- Invalid Planner output is safe and reviewable.
- Operator can accept a draft into Work Item fields without wiping acceptance criteria or arrays accidentally.
- UI clearly shows draft status and next action.
- Final report includes API evidence, browser evidence, commands, and any live Planner transport limitations.
