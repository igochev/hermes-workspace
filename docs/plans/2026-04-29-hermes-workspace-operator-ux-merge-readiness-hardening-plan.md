# Hermes Workspace — Operator UX Merge-Readiness Hardening Plan

> **For Hermes:** Use `test-driven-development` for code changes where practical. Builder should execute this as a narrow hardening/merge-readiness package after Main/CEO P3 review. Do not start a new product cycle until this package is green and reviewed.

## 1. CEO decision

P3 Morning Review is functionally strong enough for supervised product dogfood, but **not merge-ready yet**. Main/CEO decision: run a focused merge-readiness hardening package before any P4/new product cycle.

Why: Main verification found green product tests/build/smoke/live Dashboard evidence, but independent review and extra quality gates found changed-file lint/type blockers and two visible Dashboard strings that still use mission vocabulary.

## 2. Current evidence baseline

Main/CEO review on 2026-04-29:

- Branch: `my-hermes-workspace-dev`, commit baseline `5afe861` plus uncommitted P0/P1/P2/P3 Operator UX changes.
- Focused P3 verification passed: `pnpm test src/server/morning-review.test.ts src/server/morning-review-routes.test.ts src/screens/dashboard/dashboard-screen.test.ts src/server/work-item-notification-digest.test.ts -- --runInBand` — 4 files / 33 tests.
- Full regression passed: `pnpm vitest run` — 79 files / 507 tests.
- Build passed: `pnpm build` with existing Vite chunk/dynamic-import warnings.
- Whitespace passed: `git diff --check`.
- Service restart passed: `systemctl --user restart hermes-workspace.service && systemctl --user is-active hermes-workspace.service` returned `active`.
- API smoke passed:
  - `/api/morning-review?lookbackHours=18` returned `{ digest }` with summary `{ changed: 2, needs_approval: 0, failed: 2, merged: 0, parked: 2, total: 6 }`.
  - `/api/morning-review?lookbackHours=18&format=discord` returned `{ digest, message }` and message header `**🌅 Morning Review — Mission Control**`.
- Live Dashboard DOM passed for the Morning Review card: title/copy rendered, buckets rendered, `Open next attention item` linked to a Work Item, `Open execution` links pointed to `/executions/...`, browser console was clean.

Additional Main/independent review findings:

- Targeted ESLint on P3 files failed with import ordering/sorting/type-style/no-unnecessary-condition errors.
- `pnpm exec tsc --noEmit` failed with broad existing repo debt plus changed-file errors in P2/P3 touched files.
- Visible Dashboard empty copy still includes lower-case mission vocabulary:
  - `No failed missions in the operator escalation queue.`
  - `No running missions at the moment.`
- Existing visible-copy tests only caught capitalized banned variants, so lower-case variants escaped.
- Minor UX risk: `needs_approval` Morning Review entries should be oldest-first per product definition; current generic sort may prefer severity/newest.

## 3. Scope

This package is a hardening/merge-readiness slice, not a new feature cycle.

### In scope

1. Remove remaining visible mission vocabulary from Dashboard queue empty states and broaden banned-label tests to catch case-insensitive variants.
2. Clear targeted ESLint errors on the changed Operator UX file set.
3. Clear changed-file TypeScript blockers caused by the P0/P1/P2/P3 diff, while classifying unrelated legacy/baseline `tsc --noEmit` failures if full repo typecheck remains noisy.
4. Tighten Morning Review approval ordering if needed so pending approvals are oldest-first.
5. Produce a final merge-readiness evidence package: focused tests, full vitest, build, diff check, lint/type status, service/API/browser smoke, and final recommendation.

### Out of scope

- No P4 product feature.
- No automatic Discord morning delivery loop.
- No parallel worktrees or swarm/run-theater UI.
- No broad dashboard redesign beyond required terminology/lint/type fixes.
- Do not touch `/api/work-items/$workItemId` PATCH semantics unless fixing an existing changed-file type blocker with a focused test; preserve true partial-update safety.

## 4. Implementation tasks

### Task 1 — Terminology hardening with RED tests

Files:

- `src/screens/dashboard/dashboard-screen.tsx`
- `src/screens/dashboard/dashboard-screen.test.ts`

Steps:

1. Add/adjust Dashboard visible-copy tests so banned terminology is checked case-insensitively for at least:
   - `mission link`
   - `hermes job id`
   - `failed missions`
   - `running missions`
2. Confirm RED against the current copy.
3. Replace remaining queue empty-state copy with execution/work-item vocabulary, for example:
   - `No failed executions in the operator escalation queue.`
   - `No running executions at the moment.`
4. Re-run the Dashboard test.

Verification:

```bash
pnpm test src/screens/dashboard/dashboard-screen.test.ts -- --runInBand
```

### Task 2 — Morning Review ordering polish

Files:

- `src/server/morning-review.ts`
- `src/server/morning-review.test.ts`

Steps:

1. Add or adjust a test for `needs_approval` entries to verify oldest pending approval appears first.
2. Implement the smallest sorting change needed without disrupting severity/newest sorting for failed/changed/parked/merged buckets.
3. Preserve next-attention priority: critical failed first, pending approval, parked/blocked, warning failed, newest changed.

Verification:

```bash
pnpm test src/server/morning-review.test.ts -- --runInBand
```

### Task 3 — Targeted lint cleanup

Run targeted ESLint against changed P3/hardening files and fix errors without broad reformat churn:

```bash
pnpm exec eslint src/server/morning-review.ts src/routes/api/morning-review.ts src/lib/morning-review-api.ts src/screens/dashboard/dashboard-screen.tsx src/server/morning-review.test.ts src/server/morning-review-routes.test.ts src/lib/morning-review-api.test.ts src/screens/dashboard/dashboard-screen.test.ts
```

Expected fix categories:

- import/order and sort-imports;
- type-only import style;
- no-unnecessary-condition / no-unnecessary-type-assertion;
- array type style;
- async handler warning if easily resolved without route behavior changes.

If legacy dashboard import ordering makes auto-fix too broad, fix only changed imports/lines and document remaining baseline noise precisely.

### Task 4 — Changed-file TypeScript blocker cleanup

Run:

```bash
pnpm exec tsc --noEmit
```

Do not attempt a broad repo type cleanup unless it is small and directly caused by the current Operator UX diff. Classify failures into:

- **Changed-file blockers:** files touched/created by P0/P1/P2/P3/hardening diff, e.g. `src/screens/executions/executions-screen.tsx`, `src/screens/projects/work-item-detail-screen.tsx`, `src/screens/projects/work-item-detail-screen.test.ts`, `src/screens/dashboard/dashboard-screen.test.ts`, `src/server/work-item-run-timeline.ts`, P3 Morning Review files.
- **Baseline/broad debt:** unrelated older files/tests not touched by this package.

Fix changed-file blockers until no touched P0/P1/P2/P3/hardening file appears in the `tsc --noEmit` output, or document an explicit reason if one is inseparable from baseline type debt.

### Task 5 — Final verification package

Run and record:

```bash
pnpm test src/server/morning-review.test.ts src/server/morning-review-routes.test.ts src/screens/dashboard/dashboard-screen.test.ts src/server/work-item-notification-digest.test.ts -- --runInBand
pnpm vitest run
pnpm build
git diff --check
pnpm exec eslint src/server/morning-review.ts src/routes/api/morning-review.ts src/lib/morning-review-api.ts src/screens/dashboard/dashboard-screen.tsx src/server/morning-review.test.ts src/server/morning-review-routes.test.ts src/lib/morning-review-api.test.ts src/screens/dashboard/dashboard-screen.test.ts
pnpm exec tsc --noEmit
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS 'http://127.0.0.1:3456/api/morning-review?lookbackHours=18' >/tmp/hermes-workspace-morning-review-final.json
curl -fsS 'http://127.0.0.1:3456/api/morning-review?lookbackHours=18&format=discord' >/tmp/hermes-workspace-morning-review-discord-final.json
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-smoke-final.html
```

Then live browser verify Dashboard:

1. `http://127.0.0.1:3456/dashboard`
2. Morning Review visible near top.
3. Buckets visible: Changed, Needs approval, Failed, Merged, Parked.
4. `Open next attention item` links to Work Item/Approvals/Executions, or all-clear state has no dead primary action.
5. All execution links point to `/executions...`.
6. No visible case-insensitive banned labels: `mission link`, `hermes job id`, `failed missions`, `running missions`.
7. Browser console clean.

## 5. Acceptance criteria

This hardening package is accepted when:

1. P3 functional evidence remains green: focused tests, full vitest, build, service/API/browser smoke.
2. Dashboard visible copy no longer contains lower-case or capitalized banned labels in the tested surfaces.
3. Targeted ESLint for the changed P3/hardening file set is green, or any remaining warning is explicitly baseline and non-blocking.
4. `tsc --noEmit` has no changed-file blockers from the Operator UX diff; any remaining failures are documented as pre-existing/broad debt.
5. Handoff is updated with final evidence and clear next step: Main/CEO final merge-readiness review.

## 6. Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, then this active plan, and start with Task 1.
