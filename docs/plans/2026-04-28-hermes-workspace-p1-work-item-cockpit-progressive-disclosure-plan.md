# Hermes Workspace — P1 Work Item Cockpit Progressive Disclosure Implementation Plan

> **For Hermes:** Use `test-driven-development` for code changes where practical. Builder should implement this plan task-by-task, update `docs/handoff/current-slice-status.md` after each completed task, and stop after P1 is verified. Do not start P2/P3 without Main/CEO updating the active handoff.

**Goal:** Turn Work Item detail from a dense execution database record into a first-viewport operator cockpit that answers: what is happening, what needs my action, what evidence exists, and where are the raw details if I need them.

**Architecture:** This is a bounded UI/UX reorganization slice. Preserve existing backend/store fields, routes, launch/orchestrator behavior, lifecycle mutations, and PATCH partial-update safety. P1 may add display helpers and component structure inside `work-item-detail-screen.tsx`, but must not introduce a dedicated `/runs` or `/executions` route; that is P2.

**Tech Stack:** TanStack Start/React, TypeScript, TanStack Query, Vitest, existing Hermes Workspace file-backed APIs.

---

## 0. Context and source documents

Read in this order:

1. `docs/handoff/current-slice-status.md`
2. `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
3. This plan
4. Source UX roadmap for context only: `docs/plans/2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md`
5. Recently shipped P0 plan for terminology constraints: `docs/plans/2026-04-28-hermes-workspace-p0-terminology-deeplink-sanity-plan.md`

This plan continues the Operator UX Clarity cycle:

| Order | Slice | Status |
|---:|---|---|
| P0 | Terminology cleanup and deep-link sanity | Shipped / Main-reviewed |
| P1 | Work Item Cockpit progressive disclosure | Active |
| P2 | Dedicated Runs/Executions surface | Queued for Main/CEO architecture plan after P1 |
| P3 | Morning Review / overnight operator digest | Queued for Main/CEO architecture plan after P2 |

## 1. Main/CEO P0 review baseline

Main reviewed the P0 implementation before authorizing this plan:

- Changed files are bounded to UI copy/deep-link behavior and tests.
- Focused tests passed: `pnpm test src/screens/jobs/jobs-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts src/screens/dashboard/dashboard-screen.test.ts -- --runInBand` — 3 files / 36 tests.
- Full regression passed: `pnpm vitest run` — 73 files / 470 tests.
- Build passed: `pnpm build`.
- Whitespace check passed: `git diff --check`.
- Service restarted active: `systemctl --user restart hermes-workspace.service && systemctl --user is-active hermes-workspace.service` returned `active`.
- Root route smoke returned HTTP 200 after service readiness.
- Live browser/DOM verification passed for:
  - `/jobs` title/helper/sidebar copy: `Scheduled Jobs`, `New Scheduled Job`, scheduled-job helper copy.
  - `/jobs?jobId=missing-p0-smoke`: precise missing execution-trace copy.
  - Work Item detail `7a0c4615-5e2f-468c-a5cf-0c8ae53eb645`: `Execution Summary`, `Execution Trace`, `Execution State`, `Last Execution`, no old `Mission Link` or `Hermes Job ID` labels.
  - `/dashboard`: `FAILED EXECUTIONS` and `RUNNING EXECUTIONS` visible in DOM.
- Code search across `src` for `Mission Link|Hermes Job ID|Mission State|Mission Last Run|Mission Last Error|Failed missions|Running missions` returned only one internal server comment: `src/server/work-item-notification-digest.ts` line 340 `// Failed missions detail`, not visible UI copy.

Known limitation accepted for P0 review: the live `/jobs?jobId=<known>` path could not demonstrate a matching scheduled job because the local Jobs manager currently returned zero jobs, but helper/unit coverage proves match/highlight behavior and the Work Item detail execution trace link points to `/jobs?jobId=9c1126f62ea6` as expected. P2 will replace this temporary Scheduled Jobs trace destination.

## 2. Non-negotiables

1. Preserve existing backend/store fields for this slice. Do **not** rename `missionId`, `missionJobId`, `missionLink`, `missionState`, etc. internally.
2. Preserve existing launch, sync, recovery, approval, review, and lifecycle behavior.
3. Preserve PATCH partial-update safety; never include undefined fields in API update payloads.
4. Do not introduce `/runs`, `/executions`, or a new execution trace route in P1. That is P2.
5. Do not hide required operator controls. Launch, Sync Execution, Open Conductor, Request Review, lifecycle, recovery, approvals, and planning edits must remain reachable.
6. Use P0 vocabulary: Scheduled Job, Execution Trace, Execution State, Last Execution, Execution Error. Do not reintroduce visible `Mission Link`, `Hermes Job ID`, `Failed missions`, or `Running missions`.
7. Progressive disclosure means raw IDs move behind an explicit collapsed section, not deletion.
8. Constants-only tests are not enough. Final verification must include live browser/DOM evidence that the first viewport answers the operator questions without scrolling.

## 3. Current inspected baseline after P0

Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
Branch: `my-hermes-workspace-dev`
P0 baseline commit before uncommitted P0 changes: `5afe861` when Main reviewed.

Relevant current Work Item detail observations from live DOM:

- The page already starts with status/phase/risk/title and workflow buttons, then `Runs / Agents`, then `Execution Summary`.
- `Execution Summary` still contains many raw fields in one panel: repo snapshot, execution IDs, session prefix, trace href, state, timestamps, blocked metadata, profile/risk, branch/merge fields, always-on evidence, launch sessions, created/updated.
- Delivery Evidence repeats execution trace and scheduled job metadata.
- The good P0 terminology is present, but the first viewport is still noisy and scroll-heavy.

Likely files:

- `src/screens/projects/work-item-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.test.ts`
- Optional if extracted: `src/screens/projects/work-item-cockpit-*.tsx` or helper files under `src/screens/projects/`
- `docs/handoff/current-slice-status.md`

## 4. Acceptance criteria

P1 is accepted only when all are true:

1. Work Item detail has a top-level `Operator Summary` / `Work Item Cockpit` panel near the first viewport.
2. The first viewport answers, without scrolling on a normal desktop viewport:
   - current phase/status;
   - lane/execution state;
   - recommended next action;
   - branch/repo safety snapshot;
   - latest evidence status for Planner/Builder/Reviewer/Merge-Healer;
   - approval/recovery attention if blocking.
3. Raw IDs and low-level metadata are moved into a collapsed `Advanced execution metadata` section by default:
   - execution ID / scheduled job ID;
   - execution job name;
   - execution session prefix;
   - raw execution trace href;
   - launch session keys;
   - created/updated timestamps;
   - raw merge/test/parser fields that are not first-action evidence.
4. Existing execution trace action remains clickable (`Open execution trace`) and still routes to `/jobs?jobId=...` for now.
5. Branch/merge/test/PR/evidence fields are promoted above raw IDs and shown as operator-readable status, not only raw strings.
6. The existing `Runs / Agents` role timeline remains visible and useful; it may be renamed or visually integrated as `Execution Evidence`, but not removed.
7. Existing lifecycle, launch/sync, recovery, approval, planner enrichment, acceptance criteria, and operator notes flows remain reachable.
8. Focused tests cover new helper/view-model behavior and collapsed advanced metadata defaults.
9. Full verification includes focused tests, full regression, build, service restart/root smoke, and live browser/DOM checks.

## 5. Implementation tasks

### Task 1 — Extract cockpit view-model helpers and RED tests

**Objective:** Make the cockpit rules testable before reorganizing UI markup.

**Files:**

- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`

**Steps:**

1. Add/export constants for new visible section labels:
   - `WORK_ITEM_OPERATOR_SUMMARY_TITLE = 'Operator Summary'` or `WORK_ITEM_COCKPIT_TITLE = 'Work Item Cockpit'`.
   - `WORK_ITEM_EXECUTION_EVIDENCE_TITLE = 'Execution Evidence'`.
   - `WORK_ITEM_ADVANCED_EXECUTION_METADATA_TITLE = 'Advanced execution metadata'`.
2. Add helper/view-model functions that derive compact rows from the existing `workItem` shape without mutating it, for example:
   - `getWorkItemCockpitSummary(state)`
   - `getWorkItemEvidenceSnapshot(state)`
   - `getWorkItemAdvancedExecutionMetadataRows(workItem)`
3. RED tests should assert:
   - operator summary copy includes current phase/status and recommended next action;
   - evidence snapshot identifies Planner/Builder/Reviewer/Merge-Healer states using existing timeline/run fields where available;
   - advanced metadata contains execution IDs/session/raw href fields;
   - P0 vocabulary constants remain unchanged.

**Verification command:**

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts -- --runInBand
```

### Task 2 — Add first-viewport Operator Summary / Work Item Cockpit panel

**Objective:** Put the operator-critical answer at the top before dense panels.

**Files:**

- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`

**Steps:**

1. Insert a compact top panel after the existing page header / primary action strip and before `Runs / Agents` if practical.
2. Include concise tiles/rows for:
   - status + phase;
   - execution state / latest execution;
   - recommended next action (reuse `getWorkItemOperatorGuidance` / `getWorkItemExecutionSummary` where possible);
   - risk level;
   - assigned/selected profile readiness;
   - branch snapshot (`featureBranch`, `baseBranch`, `mergeTargetBranch` as available);
   - PR URL / merge commit / test result if present;
   - approval/recovery attention summary.
3. Use stable text labels that can be asserted in tests and recognized in DOM.
4. Keep primary buttons (`Sync Execution`, `Launch Build`, `Open Conductor`, `Request Review`) visible near the summary.

**Verification:** targeted test plus browser DOM later must show the summary appears before advanced metadata.

### Task 3 — Promote Execution Evidence and branch/merge/test proof

**Objective:** Make evidence visible before raw metadata.

**Files:**

- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`

**Steps:**

1. Rename or visually frame `Runs / Agents` as `Execution Evidence` if it improves clarity, while preserving the role timeline contents.
2. Promote branch/PR/test/merge evidence into either the Operator Summary or an immediately following Evidence panel:
   - branch;
   - base/merge target;
   - PR URL;
   - merge commit;
   - merge test command/result/artifacts;
   - plan file path;
   - latest execution trace action.
3. Avoid duplicating the same raw field in multiple expanded top-level places; top-level rows should be semantic summaries.
4. Preserve existing evidence rows in a readable order.

**Verification:** tests should prove evidence rows can be built when fields are present and produce clear empty states when absent.

### Task 4 — Move raw IDs into collapsed Advanced execution metadata

**Objective:** Stop forcing raw IDs into the default reading path while preserving debuggability.

**Files:**

- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`

**Steps:**

1. Replace the dense always-expanded `Execution Summary` raw field panel with:
   - top semantic summary/evidence rows from Tasks 2–3;
   - a collapsed-by-default advanced disclosure for raw metadata.
2. The advanced disclosure should include at least:
   - Execution ID;
   - Scheduled Job ID;
   - Execution Job Name;
   - Execution Session Prefix;
   - raw Execution Trace href plus clickable action;
   - Launch Sessions;
   - Created / Updated;
   - parser/review/merge raw fields that are not otherwise promoted.
3. Use an accessible disclosure mechanism (`button` + `aria-expanded`, native `<details>`, or existing design-system pattern). Default collapsed.
4. Tests should assert the default/copy contract. If render testing is hard, export a constant/default such as `WORK_ITEM_ADVANCED_METADATA_DEFAULT_OPEN = false` and helper rows.

**Verification command:**

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts -- --runInBand
```

### Task 5 — Functional regression and live first-viewport verification

**Objective:** Prove P1 improved the real operator view without breaking execution controls.

**Required commands:**

```bash
pnpm test src/screens/projects/work-item-detail-screen.test.ts -- --runInBand
pnpm vitest run
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-root-smoke.html
```

**Live verification:**

Use browser/DOM verification, not constants alone:

1. Open `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906/work-items/7a0c4615-5e2f-468c-a5cf-0c8ae53eb645`.
2. Confirm first viewport contains the new Operator Summary / Work Item Cockpit copy.
3. Confirm first viewport answers:
   - current phase/status;
   - execution state;
   - recommended next action;
   - branch/PR/test/evidence summary;
   - attention/approval/recovery state.
4. Confirm `Advanced execution metadata` is present and collapsed by default.
5. Expand it and confirm raw execution IDs, session prefix, raw trace href, and timestamps are still available.
6. Confirm `Open execution trace` still navigates to `/jobs?jobId=...`.
7. Confirm no visible regression to old P0-banned labels (`Mission Link`, `Hermes Job ID`, `Failed missions`, `Running missions`) in key screens.
8. Check browser console for JS/network errors.

**Handoff update after P1:**

When P1 is done, update `docs/handoff/current-slice-status.md` with:

- P1 implemented and verified evidence;
- exact commands run and result;
- live first-viewport verification notes;
- explicit next step: **Main/CEO review P1 and create P2 dedicated Runs/Executions architecture plan**.

Do not set P2 as active from Builder. Main/CEO will prepare P2/P3 in sequence.

## 6. Risks and guardrails

- **Risk:** Reorganizing a large screen can accidentally hide controls. Guardrail: test/DOM-check for `Sync Execution`, phase launch button, `Open Conductor`, lifecycle/review controls, approvals/recovery panels.
- **Risk:** Raw IDs become impossible to debug. Guardrail: collapsed advanced section keeps every old raw field available.
- **Risk:** P1 expands into P2 route architecture. Guardrail: no new execution route; keep `/jobs?jobId=...` temporary trace destination.
- **Risk:** UI claims are only constants. Guardrail: browser DOM verification is mandatory.
- **Risk:** PATCH update safety regression. Guardrail: avoid touching API update routes; if touched, verify conditional payload construction is preserved.

## 7. Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, then this active plan, and implement Task 1 first.
