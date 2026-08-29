# Hermes Workspace Production Acceptance Report

- Verdict: CONDITIONALLY ACCEPTED
- Date: 2026-04-27 16:42:47 EEST
- Workspace branch: `my-hermes-workspace-dev`
- Workspace commit: `c589734`
- Candidate repo: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
- Candidate branch: `test-hermes-workspace`
- Candidate commit: `62ff902`
- Dogfood project id: `production-dogfood-family-command-center-abacus`

## Verdict rationale

Hermes Workspace is production-functional for the single-user Mission Control dogfood flow: focused regression tests pass, full Vitest passes after dogfood hardening, build passes, service restarts, `/api/projects` smoke returns valid JSON, the real-project Playwright dogfood harness passes with required UI click evidence, and manual browser spot-check found no blocking UI/console issues.

Acceptance is conditional only because the real candidate repo baseline is already unhealthy before Workspace interaction, and broad Workspace lint remains known legacy lint debt. No Mission Control functional blocker was found.

## Candidate repo baseline

| Candidate repo command | Result | Notes |
|---|---:|---|
| `npm test` | FAIL | 21/22 tests passed; `tests/bootstrap-dev.test.ts` fails with `Cannot find module '@prisma/client/runtime/library'`. Baseline dependency/install issue in candidate repo, unrelated to Hermes Workspace interaction. |
| `npm run build` | FAIL | `next build` fails immediately with `sh: 1: next: not found`. Candidate repo dependency/install issue. |
| `npm run lint` | FAIL | `next lint` fails immediately with `sh: 1: next: not found`. Candidate repo dependency/install issue. |

## Hermes Workspace regression/build/lint

| Command | Result | Notes |
|---|---:|---|
| Focused Mission Control tests | PASS | `pnpm test ... -- --runInBand`: 14 files, 83 tests passed before hardening. |
| `node --check scripts/mission-control-production-dogfood.mjs` | PASS | Script syntax check passed after acceptance hardening. |
| `pnpm test src/server/production-dogfood-script.test.ts -- --runInBand` | PASS | 1 file, 5 tests passed after hardening. |
| `pnpm vitest run` | PASS | Final run after dogfood hardening: 62 files, 339 tests passed. |
| `pnpm build` | PASS | Final build passed; Vite emitted existing sourcemap/dynamic-import/chunk-size warnings only. |
| `pnpm lint` | FAIL / known debt | 1323 problems (1202 errors, 121 warnings). First categories: parserOptions.project excludes `public/sw.js`, `scripts/generate-pwa-icons.js`, `server-entry.js`; broad import/order, sort-imports, no-unnecessary-condition, array-type, react-hooks rule-not-found issues across legacy app files. Matches known broad legacy lint debt, not acceptance changes. |

## Service/API/dogfood

| Command | Result | Notes |
|---|---:|---|
| `systemctl --user restart hermes-workspace.service` | PASS | Restart completed. |
| `systemctl --user is-active hermes-workspace.service` | PASS | Returned `active`. |
| `/api/projects` smoke | PASS | Retried through transient first connection refusal after restart; final JSON parsed with `Array.isArray(data.projects) === true`, project count `10`. |
| `node scripts/mission-control-production-dogfood.mjs` | PASS | Final hardened run passed and wrote report/screenshot evidence. |

## Dogfood evidence

- Dogfood report: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace/dogfood-output/production-dogfood-2026-04-27T13-48-24-769Z.md`
- Latest dogfood report copy: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace/dogfood-output/production-acceptance-latest.md`
- Dogfood screenshot: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace/dogfood-output/production-dogfood-project-detail.png`
- Console/network errors in dogfood report: none.

Required UI evidence recorded by dogfood includes: project reuse/creation, Profile Readiness configure mappings, Supervisor/Autopilot Scout selectors, Save Profile & Workflow Policy, Capture rough idea, empty-title validation, create rough idea, open work item detail, Refresh, Sync Execution, Profile Preflight, Open Conductor link target verification, dashboard Mission Control, chat sidebar status/New chat, dashboard projects summary, attention card/no-data note, Project Autopilot save/disable, Projects refresh, Approvals refresh, Autopilot Inbox refresh, Status/Risk filters, and readiness API with no blocked non-deploy roles.

## Manual/browser spot-check

Browser spot-check was performed against the live service.

- Dashboard: Mission Control loaded with populated KPI cards and Global Attention; no broken cockpit state; no console errors.
  - Screenshot: `/home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_c04aacc85af647f69de2617ddf563ae8.png`
- Projects/project detail: real dogfood project appears; detail page shows repo path `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`; Profile Readiness is present/actionable; policy editor opens; no console errors.
  - Screenshot: `/home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_7017a8d927dc495ebb84e4b9b63c4e08.png`
- Work item detail: latest dogfood work item opens; execution controls, Profile Preflight, Refresh, Sync Execution, Plan with Planner, Open Conductor are visible; DOM href for Open Conductor is `/conductor?mode=work-item&id=d5a7c982-efdf-4823-a235-f42556a3103e`; no console errors.
  - Screenshot: `/home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_e956ca3b82c44f748af6e415703f20b2.png`
- Autopilot/Approvals: Project Autopilot schedule controls visible; Autopilot Suggestions refresh/filter controls visible; Approvals Inbox refresh visible and empty pending state/recent decisions render cleanly; no console errors.
  - Screenshot: `/home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_0409c40ca9c84bd09b89b6646d76aceb.png`

## Changes made during acceptance

The dogfood harness was hardened because its initial PASS report lacked acceptance-mandated metadata. Changes:

- `scripts/mission-control-production-dogfood.mjs`
  - reports Workspace branch/commit;
  - reports auth mode;
  - writes `dogfood-output/production-acceptance-latest.md`;
  - includes screenshot paths in PASS/FAIL reports;
  - asserts required UI evidence labels are present.
- `src/server/production-dogfood-script.test.ts`
  - covers required acceptance metadata/latest-report copy/click-evidence assertion.

Required post-hardening verification was rerun and passed: dogfood script test, full Vitest, build, service restart, API smoke, and dogfood harness.

## Known debt vs production blockers

Known debt:

1. Candidate repo dependencies are not installed/generated enough for its own baseline (`@prisma/client/runtime/library`, `next`). This predates and is outside Workspace acceptance.
2. Workspace `pnpm lint` remains blocked by broad legacy lint/config/style debt.

Production blockers found: none.

## Next action

Mark production acceptance complete as CONDITIONALLY ACCEPTED. Follow-up hardening slice should address either candidate repo dependency baseline if that repo is to be used for future acceptance, and/or repo-wide Workspace lint debt if clean lint becomes a release gate.
