# Hermes Workspace — Production Acceptance Real-Project Plan (2026-04-27)

> **Owner/CEO verdict:** all planned Mission Control slices may be shipped, but the product is not accepted as production-functional until Builder runs this acceptance gauntlet and reports evidence from the real project.
>
> **Hermes Workspace repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
>
> **Workspace branch at planning time:** `my-hermes-workspace-dev`
>
> **Workspace commit at planning time:** `c589734`
>
> **Real test project:** `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
>
> **Real test project branch:** `test-hermes-workspace`
>
> **Real test project commit at planning time:** `62ff902`

---

## 1. Goal

Prove Hermes Workspace is production-functional as a single-user Mission Control operator console by using a real in-development project, not mocked demos or constants-only tests.

Builder must verify all of the following:

1. Hermes Workspace source state is clean enough to test and all shipped Mission Control regression tests still pass.
2. The real project candidate is present, on the requested branch, and has its own baseline test/build state recorded.
3. Mission Control can register/reuse the real project, open it, configure profile/workflow policy, create a real work item, open the work item detail, and verify launch/preflight/conductor affordances.
4. Mission Control UI surfaces remain clickable/actionable after the latest shipped slices: dashboard, projects list, project detail, profile readiness, work item detail, project autopilot, autopilot suggestions, approvals inbox, and chat/sidebar freshness controls.
5. The production dogfood harness writes a PASS/FAIL report with exact commands, repo commits, UI clicks, API calls, console/network errors, and screenshot evidence.
6. If any part fails, Builder must stop calling the product production-ready and file the blocker with reproduction steps.

This is an acceptance plan, not a feature plan. Builder should not add new product functionality unless the acceptance run exposes a defect that blocks production acceptance.

---

## 2. Current context

From current index/handoff inspection on 2026-04-27:

- Cycle 1 shipped: N/O, P/Q, T/U, R/S.
- Cycle 2 shipped: V/W, X/Y, Z/AA, AB/AC.
- Prior Production Readiness cycle shipped PR-1/PR-2/PR-3:
  - Profile Readiness became actionable.
  - Real-project dogfood harness exists at `scripts/mission-control-production-dogfood.mjs`.
  - Clickability descriptors and script coverage were added across major Mission Control surfaces.
- Known blocker classification:
  - `pnpm lint` is currently expected to fail from broad pre-existing lint debt. It must still be run and summarized, but production acceptance may be conditional if and only if tests/build/live dogfood pass and the lint failures are the same unrelated legacy categories.
- Existing dogfood project id/name:
  - id: `production-dogfood-family-command-center-abacus`
  - name: `Production Dogfood — Family Command Center ABACUS`

---

## 3. Non-negotiable rules for Builder

1. **Run all required tests.** Do not report acceptance from partial evidence.
2. **Use the real repo path and branch exactly:** `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`, branch `test-hermes-workspace`.
3. **Do not mutate the real project destructively.** Recording baseline commands and creating Hermes Workspace work items is allowed; changing source code in `family_command_center-ABACUS` is not part of this acceptance plan.
4. **Do not hide failures behind known lint debt.** If `pnpm lint` fails, quote the first relevant files/rules and explicitly classify whether they match the known legacy lint blocker.
5. **Live UI proof is mandatory.** A passing Vitest/build run is not enough.
6. **No constants-only acceptance.** Every UI production claim needs a rendered/clicked test, Playwright dogfood evidence, or browser evidence.
7. **No silent console/network errors.** The dogfood harness may ignore documented benign noise only; actual route/API/tested-surface failures fail acceptance.
8. **Update handoff after the run.** Record verdict, exact command results, dogfood report path, screenshot path, and blockers.

---

## 4. Acceptance phase PA-0 — Preflight and repository evidence

Builder starts here before running tests.

### Commands

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace

date '+%Y-%m-%d %H:%M:%S %Z'
git status --short --branch
git rev-parse --short HEAD

git -C /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS status --short --branch
git -C /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS rev-parse --short HEAD
git -C /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS rev-parse --abbrev-ref HEAD
```

### Pass criteria

- Workspace is on `my-hermes-workspace-dev` unless D3n13r explicitly moved the test branch.
- Test project is on `test-hermes-workspace`.
- Builder records both short commits in the final report.
- If either repo has uncommitted changes, Builder lists them and decides:
  - workspace changes from prior Builder work: include in test scope;
  - unrelated user changes: stop and ask before mutating or committing anything.

---

## 5. Acceptance phase PA-1 — Baseline the real test project

This confirms the candidate project is a real development repo and records its health before Mission Control interacts with it.

### Commands

```bash
cd /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
npm test
npm run build
npm run lint
```

### Pass / conditional criteria

- `npm test` should pass or produce a clear baseline failure unrelated to Hermes Workspace.
- `npm run build` should pass or produce a clear baseline failure unrelated to Hermes Workspace.
- `npm run lint` may fail depending on Next/ESLint version drift; Builder must record exact failure text.
- A failing candidate repo command does **not** automatically fail Hermes Workspace production acceptance, but it must be included in the acceptance report because Mission Control should not be blamed for pre-existing candidate repo breakage.

### Required final-report entry

Builder must include a table:

| Candidate repo command | Result | Notes |
|---|---|---|
| `npm test` | PASS/FAIL | exact summary |
| `npm run build` | PASS/FAIL | exact summary |
| `npm run lint` | PASS/FAIL | exact summary |

---

## 6. Acceptance phase PA-2 — Hermes Workspace full regression gauntlet

Builder must run focused tests that cover shipped Mission Control seams, then the full suite and build.

### Focused tests

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace

pnpm test \
  src/server/profile-readiness.test.ts \
  src/server/profile-readiness-routes.test.ts \
  src/server/projects-store.test.ts \
  src/server/project-route.test.ts \
  src/screens/projects/project-detail-screen.test.ts \
  src/screens/projects/project-detail-screen.render.test.tsx \
  src/screens/dashboard/dashboard-screen.test.ts \
  src/screens/projects/projects-screen.test.ts \
  src/screens/projects/project-autopilot-screen.test.ts \
  src/screens/projects/autopilot-suggestions-screen.test.ts \
  src/screens/projects/approvals-inbox-screen.test.ts \
  src/screens/projects/work-item-detail-screen.test.ts \
  src/screens/chat/components/chat-sidebar-session-freshness.test.tsx \
  src/server/production-dogfood-script.test.ts \
  -- --runInBand
```

### Full tests/build/lint

```bash
pnpm vitest run
pnpm build
pnpm lint
```

### Pass criteria

- Focused tests pass.
- `pnpm vitest run` passes.
- `pnpm build` passes.
- `pnpm lint` is run. If it fails, Builder must quote the failure categories and confirm whether they are the already-known broad legacy lint debt. New lint failures in files changed during acceptance are production blockers.

---

## 7. Acceptance phase PA-3 — Live service and API smoke

### Commands

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace

systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://localhost:3456/api/projects >/tmp/hermes-workspace-projects-acceptance-smoke.json
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/hermes-workspace-projects-acceptance-smoke.json','utf8')); console.log(Array.isArray(data.projects), data.projects?.length ?? 0)"
```

### Pass criteria

- Service is `active`.
- `/api/projects` returns valid JSON with a `projects` array.
- If auth blocks the smoke, Builder must use the established local auth method and document it. Do not disable auth globally.

---

## 8. Acceptance phase PA-4 — Real-project production dogfood

Run the existing harness after PA-2 and PA-3 pass:

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
node scripts/mission-control-production-dogfood.mjs
```

### Existing minimum coverage expected from the harness

The script must verify/click at least:

- project exists/reused for `family_command_center-ABACUS`;
- Profile Readiness → Configure profile mappings;
- Supervisor and Autopilot Scout profile selectors;
- Save Profile & Workflow Policy;
- Capture rough idea;
- empty-title validation;
- create dogfood rough idea;
- open created work item detail;
- Work item detail Refresh;
- Work item detail Sync Execution;
- Profile Preflight observed;
- Open Conductor link target verified;
- Dashboard Mission Control page;
- Chat sidebar session refresh status observed;
- Chat sidebar New chat visible;
- Dashboard Projects summary navigation;
- Dashboard attention work-item card when present, or explicit no-attention-data note;
- Project Autopilot Save Autopilot Schedule;
- Project Autopilot Disable schedule;
- Projects list Refresh;
- Projects → Approvals Inbox → Refresh;
- Projects → Autopilot Inbox;
- Autopilot Suggestions Refresh;
- Autopilot Suggestions Status and Risk filters;
- profile readiness API has no blocked non-deploy roles after mappings;
- no unhandled console/page/network errors for tested routes.

### Harness hardening if current script is insufficient

If Builder discovers the current report lacks acceptance evidence, extend `scripts/mission-control-production-dogfood.mjs` and `src/server/production-dogfood-script.test.ts` before accepting production readiness. Required hardening:

1. Report Workspace commit and branch in addition to target repo commit/branch.
2. Report service base URL and auth mode used.
3. Include screenshot path(s) in both PASS and FAIL reports.
4. Fail if any required UI click label is absent from the final evidence list.
5. Write a deterministic latest report copy, e.g. `dogfood-output/production-acceptance-latest.md`, in addition to timestamped reports, so future Builder/Main sessions can find the last verdict quickly.

If these script changes are made, Builder must re-run:

```bash
pnpm test src/server/production-dogfood-script.test.ts -- --runInBand
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
node scripts/mission-control-production-dogfood.mjs
```

---

## 9. Acceptance phase PA-5 — Manual browser spot-check

Automated dogfood is necessary but not sufficient for the final CEO acceptance pass. Builder must open the live app and perform a short visual/manual spot-check using browser tooling or Playwright screenshots.

### Required surfaces

1. `http://localhost:3456/dashboard`
   - Mission Control loads.
   - No obvious empty/broken cockpit state.
   - Attention/recovery surfaces are either actionable or explicitly empty.
2. `http://localhost:3456/projects`
   - Real dogfood project appears.
   - Project card opens the project detail page.
3. `http://localhost:3456/projects/production-dogfood-family-command-center-abacus`
   - Repo path and branch are visible or inferable.
   - Profile Readiness is present and actionable.
   - Profile & Workflow Policy editor can be opened.
4. A created dogfood work item detail page
   - preflight/routing/recovery controls are visible;
   - Open Conductor target is correct;
   - no misleading no-op CTA is visible.
5. Autopilot / approvals surfaces
   - refresh/filter controls work;
   - empty states do not look like broken errors.

### Evidence

Builder must record at least one screenshot path and any observed console errors. If browser tooling is unavailable, Builder must state that and rely on the Playwright screenshot from PA-4 only; this is acceptable only if PA-4 passed.

---

## 10. Acceptance verdict matrix

Builder must use this exact classification in the final handoff/report.

### ACCEPTED — production-functional for single-user dogfood

All true:

- Candidate repo branch/commit verified.
- Candidate repo baseline commands recorded.
- Focused Hermes tests pass.
- Full Hermes Vitest passes.
- Hermes build passes.
- Hermes service restarts active.
- API smoke passes.
- Real-project dogfood script passes and writes report/screenshot evidence.
- Manual/browser spot-check has no blocking findings.
- `pnpm lint`, if failing, is only the known unrelated legacy lint debt.

### CONDITIONALLY ACCEPTED — usable, but with explicit known debt

Only allowed when:

- Tests/build/live dogfood all pass;
- the only blockers are known broad lint debt or candidate repo pre-existing test/build/lint failures;
- no Mission Control functional flow is blocked.

Builder must list debt separately from product blockers.

### REJECTED — not production-functional yet

Any of these fail:

- focused tests;
- full Vitest;
- build;
- service active check;
- API smoke;
- dogfood script;
- Profile Readiness actionability;
- work item creation/detail navigation;
- launch/preflight/conductor target verification;
- actual tested-route console/network errors;
- new lint/test errors caused by acceptance changes.

---

## 11. Final report requirements

Builder must create or update a report under:

```text
dogfood-output/production-acceptance-YYYY-MM-DDTHH-MM-SS.md
```

The report must include:

1. Verdict: ACCEPTED / CONDITIONALLY ACCEPTED / REJECTED.
2. Workspace branch + commit.
3. Candidate repo branch + commit.
4. All commands run and PASS/FAIL summaries.
5. Candidate repo baseline table.
6. Hermes Workspace focused/full/build/lint table.
7. Service/API/dogfood table.
8. Dogfood report path and screenshot path.
9. UI click evidence list or link to dogfood report.
10. Console/network errors: none or exact entries.
11. Known debt vs production blockers.
12. Next action:
    - if accepted: mark current production acceptance complete in `docs/handoff/current-slice-status.md`;
    - if conditional: create a follow-up hardening slice plan for the explicit debt;
    - if rejected: stop and write the blocker reproduction first.

---

## 12. Handoff update instructions for Builder

After running the acceptance gauntlet, Builder must update `docs/handoff/current-slice-status.md` with:

- Active Plan: this file.
- Completed Tasks: each PA phase with ✅ / ⚠️ / ❌.
- Current State: exact latest command summaries.
- Verdict: ACCEPTED / CONDITIONALLY ACCEPTED / REJECTED.
- Report paths: dogfood report, acceptance report, screenshot(s).
- Next Steps: either production accepted and ask Main for next product cycle, or list the blocker slice to fix.

Keep the handoff compact; do not paste full logs.

---

## 13. Builder starting prompt

D3n13r can send Builder:

```text
Proceed on Hermes Workspace production acceptance.
Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Read docs/handoff/current-slice-status.md first, then execute docs/plans/2026-04-27-hermes-workspace-production-acceptance-real-project-plan.md exactly. Use /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS on branch test-hermes-workspace as the real candidate. Run all required candidate repo baseline commands, all Hermes focused/full tests, build, lint, service/API smoke, production dogfood script, and browser/manual spot-check. Update handoff with verdict and report paths before stopping.
```
