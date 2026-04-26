# Slice X/Y Implementation Plan — Profile/Role Readiness Preflight

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Prove that Hermes multi-profile/role routing is configured and launchable before autonomous work starts.

**Architecture:** Add a server-side profile readiness evaluator that compares project `phaseProfiles`, work-item `assignedProfile`, Autopilot scout profile, and supervisor role against available Hermes profiles and launch requirements. Surface results in project settings/detail and work-item launch UI, with warnings/advisories in launch responses.

**Tech Stack:** Existing project store, profile discovery helpers, Conductor phase-profile routing, TanStack routes, React, Vitest.

---

## Current context

Observed seams:

- Phase profile type: `src/lib/conductor-phase-profiles.ts`.
- Project model: `src/server/projects-store.ts` and `src/lib/projects-api.ts`.
- Launch resolution: `src/server/work-item-launch.ts` resolves work-item assigned profile, project phase profile, request phase profile.
- Conductor instructions tell workers to use `hermes -p <profile> --acp --stdio`.
- Existing profile discovery patterns appear in `src/routes/api/hermes-tasks-assignees.ts` and profile UI/routes.

## Acceptance criteria

1. Project detail shows a Profile Readiness panel for research/build/review/deploy/supervisor/autopilot scout.
2. Each role reports: mapped profile, existence, source of mapping, readiness severity, and fix hint.
3. Launch UI warns before launching when selected phase has no valid mapped profile, but does not hard-block unless project policy says so.
4. Work-item launch response includes readiness advisory next to existing capacity advisory.
5. Tests prove launch resolution order is preserved.
6. Full regression and build pass.

## Task 1: Add pure profile readiness evaluator

**Files:**
- Create: `src/server/profile-readiness.ts`
- Test: `src/server/profile-readiness.test.ts`

**Steps:**
1. Write tests for these cases:
   - all roles mapped and available → `ready`;
   - missing build profile → `warning`;
   - work item assigned profile overrides project build mapping;
   - Autopilot scout profile defaults to project policy value;
   - empty optional deploy mapping produces `unmapped`, not crash.
2. Implement types:
   - `ProfileReadinessRole = 'research' | 'build' | 'review' | 'deploy' | 'supervisor' | 'autopilot-scout'`
   - `ProfileReadinessStatus = 'ready' | 'unmapped' | 'missing' | 'unknown'`
   - `ProfileReadinessReport`.
3. Keep evaluator pure: inputs are project, optional work item, available profile names, optional defaults.

## Task 2: Add readiness API route

**Files:**
- Create: `src/routes/api/projects.$projectId.profile-readiness.ts`
- Create/modify client helper: `src/lib/profile-readiness-api.ts`
- Test: `src/server/profile-readiness-routes.test.ts`

**Steps:**
1. Route loads project and optional `workItemId` query param.
2. Reuse existing profile discovery helper or extract one from `hermes-tasks-assignees` if needed.
3. Return `{ ok: true, projectId, report }`.
4. If profile discovery fails, return `unknown` statuses with non-500 response so UI can still render.

## Task 3: Add Project Profile Readiness panel

**Files:**
- Modify: `src/screens/projects/project-detail-screen.tsx`
- Test: `src/screens/projects/project-detail-screen.test.tsx` or existing test file name

**Steps:**
1. Add query for `fetchProjectProfileReadiness(projectId)`.
2. Render compact role table near project controls or launch settings.
3. Use badges: Ready, Unmapped, Missing, Unknown.
4. Include copy: `Profile readiness checks whether mapped Hermes profiles exist before launches use them.`
5. Add tests for exported labels and status tone mapping.

## Task 4: Add launch advisory integration

**Files:**
- Modify: `src/server/work-item-launch.ts`
- Modify: `src/lib/work-item-launch-api.ts`
- Test: `src/server/work-item-launch.test.ts`

**Steps:**
1. Evaluate readiness for the requested launch phase before launch.
2. Preserve existing capacity decision behavior.
3. Include `profileReadinessDecision` or `profileReadinessReport` in launch response.
4. Append launch history note if profile is missing/unknown.
5. Do not block launch in this slice unless there is already a project policy flag to do so.

## Task 5: Add work-item detail preflight warnings

**Files:**
- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Test: `src/screens/projects/work-item-detail-screen.test.tsx`

**Steps:**
1. Fetch readiness with `workItemId`.
2. Show selected phase profile source and warning above launch button.
3. If `assignedProfile` overrides project role, make that explicit.
4. Keep the primary launch button usable unless server policy blocks.

## Task 6: Verification

Run:

```bash
pnpm test src/server/profile-readiness.test.ts src/server/work-item-launch.test.ts
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Live smoke:

1. Open a project detail page.
2. Confirm Profile Readiness panel shows phase roles.
3. Temporarily set a non-existent profile in UI/API test data and confirm warning displays.
4. Launch a safe test work item and confirm launch response/history includes readiness advisory.

## Risks / pitfalls

- Do not mutate user profile configs.
- Do not invent profile names. Report missing/unmapped clearly.
- Preserve route partial-update behavior; do not send undefined fields that wipe arrays.
- Keep hard-blocking for a later policy slice unless explicitly requested.
