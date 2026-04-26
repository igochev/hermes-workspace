# Hermes Workspace — Production Readiness Dogfood + UX Clickability Plan (2026-04-26)

> **Owner/CEO verdict:** Cycle 1 and Cycle 2 are not production-ready until a real-project dogfood proves that the UI is operational, not just visually present. This plan is intentionally written for Builder execution and includes tests that must fail on "looks implemented but cannot be used" UI.
>
> **Target real project:** `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
>
> **Target branch:** `test-hermes-workspace`
>
> **Hermes Workspace repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

---

## 1. Goal

Use `family_command_center-ABACUS` as a production dogfood candidate and prove Hermes Workspace can manage a real development project end-to-end:

1. register/open the real project in Mission Control;
2. configure Hermes profile mappings from the project UI;
3. create/capture work items from the UI;
4. run Planner/Builder/Review lifecycle paths without silent routing ambiguity;
5. verify all visually-actionable UI elements are actually clickable or clearly non-clickable;
6. catch and fix the exact class of false-success implementation where a panel reports a problem but provides no direct action to resolve it.

This plan is not complete until the live browser dogfood, focused tests, full regression, build, and service restart all pass.

---

## 2. Current context and confirmed product gap

Current shipped state inspected on 2026-04-26:

- Branch: `my-hermes-workspace-dev`
- Latest commit inspected: `9cd429a CYCLE 2 COMPLTED git add .! Implemented and verified 3 tasks for Slice AB/AC`
- Current handoff says Cycle 2 is complete and asks Main/Architect for the next plan.
- Test repo exists and is on the requested branch:
  - path: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
  - branch: `test-hermes-workspace`
  - latest commit inspected: `62ff902 Add database URL handling and bootstrap script for local development`

Confirmed UX/product gap from source inspection:

- `ProjectProfileReadinessPanel` renders readiness for `research`, `build`, `review`, `deploy`, `supervisor`, and `autopilot-scout`.
- The project Workflow Policy panel only edits `phaseProfiles` (`research/build/review/deploy`) plus `reviewAutoApproval`.
- `profile-readiness.ts` maps supervisor only from process defaults (`defaults.supervisorProfile`) and maps autopilot scout from `project.autopilotPolicy.scoutProfile` or defaults.
- Therefore the project detail page can report unmapped Supervisor / Autopilot Scout roles while the same visible surface does not give the operator a clear action to configure every displayed readiness role.
- Current `project-detail-screen.test.ts` mostly checks constants/helpers. It does not render the page and click through the Workflow Policy / Profile Readiness repair path, so the prior tests could pass while the UI remained operationally incomplete.

This is the core failure mode to fix first.

---

## 3. Non-negotiable execution rules for Builder

1. **TDD first.** Add failing tests that prove the current UX hole before implementing fixes.
2. **UI interactions must be tested by rendering/clicking.** Do not satisfy this plan only with exported constants or helper tests.
3. **Real browser dogfood is mandatory.** Use the running app and browser/Playwright to click the actual UI, not just API calls.
4. **Every visible call-to-action must either work or explicitly be non-interactive.** Cards/sections that look actionable need a button/link, or visual treatment that does not imply clickability.
5. **Do not mutate real user config blindly.** Use a deterministic dogfood project id/name where possible, record changes, and avoid destructive operations on existing projects.
6. **Preserve project PATCH partial-update safety.** Do not send undefined fields that wipe arrays or nested policies.
7. **Do not fake production readiness.** If any smoke step is blocked, document it in handoff as blocked with evidence.

---

## 4. Slice PR-1 — Profile Readiness must be actionable

### Scope

Turn Profile Readiness from a passive status panel into an operator-actionable preflight surface.

### Expected UX outcome

On a project detail page:

- If any readiness role is `unmapped`, `missing`, or `unknown`, the Profile Readiness panel shows an explicit action such as **Configure profile mappings**.
- Clicking that action opens the relevant configuration area on the same page.
- The configuration area allows the operator to set every role shown in readiness:
  - Research profile
  - Build profile
  - Review profile
  - Deploy profile
  - Supervisor profile
  - Autopilot Scout profile
- Inputs should prefer available profile choices from `fetchHermesTaskAssignees`/profile discovery where available. If free text is still allowed, the available profile list must be visible and selectable enough that the operator is not guessing strings.
- Saving mappings refreshes Profile Readiness immediately and the panel no longer reports stale unmapped roles when valid profiles are selected.
- Missing profiles produce actionable copy: choose an existing profile, create/rename a Hermes profile externally, or clear the mapping if Auto fallback is intended.

### Likely files

- `src/server/projects-store.ts`
- `src/lib/projects-api.ts`
- `src/routes/api/projects.$projectId.ts`
- `src/server/profile-readiness.ts`
- `src/server/profile-readiness.test.ts`
- `src/server/profile-readiness-routes.test.ts`
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/project-detail-screen.test.ts`
- `src/lib/profile-readiness-api.ts` if response/action metadata needs client typing

### Data model direction

Keep existing `phaseProfiles` for phase routing. Add project-level supervisor mapping explicitly, using one of these approaches after inspecting surrounding conventions:

Option A (preferred if minimal):

```ts
type ProjectRuntimeProfiles = {
  supervisorProfile?: string
}

ProjectRecord.runtimeProfiles: ProjectRuntimeProfiles
```

Option B (acceptable if lower churn):

```ts
ProjectRecord.supervisorProfile?: string
```

Autopilot Scout already has `project.autopilotPolicy.scoutProfile`; do not duplicate it. The Project Profile Mappings editor may edit `autopilotPolicy.scoutProfile` in the same save action, but route PATCH must preserve the rest of `autopilotPolicy`.

### Required RED tests

Add tests that fail before implementation:

1. `evaluateProfileReadiness` uses project supervisor mapping when set and marks it ready when the profile exists.
2. `PATCH /api/projects/:projectId` can update supervisor mapping and `autopilotPolicy.scoutProfile` without wiping the rest of autopilot policy.
3. Project detail render/click test:
   - render project detail with Profile Readiness reporting unmapped Supervisor / Autopilot Scout;
   - assert **Configure profile mappings** is present;
   - click it;
   - assert the mapping editor opens;
   - edit/select supervisor and autopilot scout profile fields;
   - click save;
   - assert `updateProject` receives only intended fields and query invalidation/refetch covers readiness.
4. Workflow Policy button test:
   - click **Workflow Policy**;
   - assert it is no longer just phase summaries and free-text-only fields;
   - assert all readiness roles shown in the panel have corresponding controls or direct navigation to their control.

Use React Testing Library / DOM event tests if already available in project patterns. If current tests avoid component rendering because of route/query setup complexity, extract pure presentational subcomponents/helpers so the click behavior is still tested at component level.

### Implementation notes

- Rename user-facing copy from **Workflow Policy** to something clearer if needed, e.g. **Profile & Workflow Policy**, but preserve existing labels in tests or update tests intentionally.
- Put the action button inside `ProjectProfileReadinessPanel`, not only in the page header, because the problem must be fixable where it is reported.
- When the readiness panel action opens the editor, scroll/focus to the first problematic mapping field if practical.
- Continue showing routing precedence, but do not let informational cards look like buttons unless clickable.

### Verification

Focused:

```bash
pnpm test src/server/profile-readiness.test.ts src/server/profile-readiness-routes.test.ts src/server/projects-store.test.ts src/screens/projects/project-detail-screen.test.ts -- --runInBand
```

Then full:

```bash
pnpm vitest run
pnpm build
```

---

## 5. Slice PR-2 — Production dogfood harness against the real test repo

### Scope

Create a repeatable production-readiness smoke harness that registers/uses the real project and clicks through key operator flows.

### Expected outcome

Builder can run one command/script and get a clear PASS/FAIL report for production dogfood. The report must include API status, UI click coverage, console errors, and screenshots or DOM evidence where practical.

### Likely files

- Create: `scripts/mission-control-production-dogfood.mjs`
- Create or update docs: `docs/handoff/current-slice-status.md` during execution only
- Potentially create: `docs/plans/production-dogfood-report-template.md` if useful
- Tests for script helpers if factored: `src/server/production-dogfood-smoke.test.ts` or similar

### Harness requirements

The script should:

1. Verify target repo exists and branch is `test-hermes-workspace`:
   ```bash
   git -C /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS rev-parse --abbrev-ref HEAD
   ```
2. Verify Hermes Workspace service is active and API responds:
   - `GET /api/projects`
3. Create or reuse a deterministic dogfood project:
   - id/name suggestion: `production-dogfood-family-command-center-abacus`
   - repoPath: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
   - defaultBranch: `test-hermes-workspace`
4. Configure profile mappings through API only as setup, then verify through UI:
   - research: existing planner/default profile available on machine
   - build: existing builder/default profile available on machine
   - review: existing reviewer/default profile where available
   - deploy: optional / Auto fallback allowed if deploy not used
   - supervisor: existing profile or explicitly accepted fallback
   - autopilot scout: existing profile or explicitly accepted fallback
5. Open the project page in a browser and click through:
   - Refresh
   - Profile Readiness → Configure profile mappings
   - Workflow/Profile Policy open/close
   - Save mappings
   - Capture rough idea
   - Work item create form validation (empty title shows error)
   - Create a safe dogfood rough idea for the target repo
   - Open the created work item detail page/card
   - Launch/preflight area renders profile advisory
   - Autopilot page link opens and filters/buttons are clickable enough to not dead-end
6. Check browser console after every navigation and significant click.
7. Fail on uncaught JS exceptions, failed network requests for tested routes, or missing expected DOM changes after a click.
8. Write a markdown report under `docs/plans/` or `dogfood-output/` with:
   - tested commit/branch;
   - target repo commit/branch;
   - UI interactions clicked;
   - API calls made;
   - console errors;
   - screenshots if generated;
   - PASS/FAIL verdict.

### Browser tooling

Because `playwright` is already a dependency but `@playwright/test` is not, use bare Playwright from a Node script unless Builder chooses to add `@playwright/test` intentionally.

If authentication blocks the script, Builder must inspect `src/server/auth-middleware.ts` and existing smoke scripts before deciding whether to use cookies, `HERMES_PASSWORD`, or an authenticated local bypass. Do not disable auth globally.

### Required RED checks

Before fixing PR-1, the dogfood harness should be able to fail on at least one of:

- Profile Readiness reports unmapped roles but no configure action exists in the panel.
- Configure action opens a panel that cannot edit Supervisor / Autopilot Scout mappings.
- Save succeeds but readiness remains stale/unmapped for roles that were set.
- A visually button-like card does nothing and has no non-interactive affordance.

### Verification

```bash
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
node scripts/mission-control-production-dogfood.mjs
```

The script must exit non-zero on production-readiness failure.

---

## 6. Slice PR-3 — Clickability audit of Mission Control surfaces

### Scope

Systematically identify and fix similar UI lies across shipped Mission Control surfaces.

### Pages/surfaces to audit first

1. Dashboard global attention / recovery cards
2. Projects list
3. Project detail header metrics and Profile Readiness panel
4. Project Workflow/Profile Policy editor
5. Project Autopilot page
6. Autopilot Suggestions page
7. Work item detail launch/preflight/recovery panels
8. Approvals inbox
9. Chat/session sidebar stale-session indicators

### Audit method

For every visually-actionable element:

- If it looks like a button/link/card CTA, it must be a `<button>`, `<a>`, or TanStack `<Link>` with working behavior.
- If it is informational only, it must not use hover/cursor/action styling that implies clickability.
- Keyboard access must work for real buttons/links.
- After click, assert expected DOM/API/navigation change.
- Check console after click.

### Required tests

Add a lightweight component or helper test matrix where practical:

- exported CTA descriptors include `kind: 'button' | 'link' | 'static'` or similar;
- static cards do not use action styling classes;
- clickable cards have explicit target/action labels;
- user-event/DOM tests click major CTAs and assert state changes.

For live verification, extend `scripts/mission-control-production-dogfood.mjs` to click the first-pass surfaces above.

---

## 7. Full verification gate — Builder must run all of this before reporting shipped

Builder must run and report exact results for:

```bash
# confirm repos/branches
git status --short --branch
git -C /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS status --short --branch

# focused implementation tests
pnpm test src/server/profile-readiness.test.ts src/server/profile-readiness-routes.test.ts src/server/projects-store.test.ts src/screens/projects/project-detail-screen.test.ts -- --runInBand

# full regression
pnpm vitest run

# production build
pnpm build

# optional but strongly preferred if not blocked by existing legacy lint debt
pnpm lint

# restart live app
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service

# API smoke
curl -fsS http://localhost:3456/api/projects >/tmp/hermes-workspace-projects-smoke.json

# real-project dogfood smoke
node scripts/mission-control-production-dogfood.mjs
```

If `pnpm lint` fails due to existing unrelated debt, Builder must quote the failing files/rules and continue only if `pnpm vitest run`, `pnpm build`, and the dogfood harness pass.

---

## 8. Acceptance criteria

This production-readiness plan is shipped only when all are true:

1. `family_command_center-ABACUS` appears as a real project in Hermes Workspace and opens successfully.
2. Profile Readiness problems can be fixed directly from the Profile Readiness panel or an immediately opened project profile editor.
3. Every readiness role shown has a corresponding project-level control or explicitly documented fallback behavior.
4. Workflow/Profile Policy no longer creates a false impression that phase string fields fix all readiness mappings.
5. The readiness panel updates after save without manual page reload.
6. Work item creation and detail navigation work for the real project.
7. Live browser dogfood clicks the key CTAs and fails on no-op UI.
8. Full regression and build pass.
9. Handoff is updated with the exact dogfood verdict, report path, and any remaining production blockers.

---

## 9. Builder starting instructions

Builder should start with Slice PR-1 Task 1:

1. Read this plan completely.
2. Inspect current files listed in PR-1.
3. Add RED tests proving Profile Readiness cannot currently configure every role it reports.
4. Implement the minimal model/API/UI changes.
5. Run focused tests.
6. Update `docs/handoff/current-slice-status.md` after PR-1 before proceeding to PR-2.

Do not skip directly to the dogfood script. The script must encode the UX failures we now know about, but the product must first expose the missing configuration controls.
