# Hermes Workspace — P3 Morning Review / Overnight Digest Architecture Plan

> **For Hermes:** Use `test-driven-development` for code changes where practical. Builder should implement this plan task-by-task, update `docs/handoff/current-slice-status.md` after each completed task, and stop after P3 is verified. Do not start another product slice without Main/CEO updating the active handoff.

**Goal:** Give the operator a fast morning-review surface that answers: what changed overnight, what needs approval, what failed, what got merged, what is parked, and what should I open next?

**Architecture:** Build on the existing status digest, attention queue, Work Item history, and P2 Executions evidence. Add a deterministic server-side Morning Review view model and API that classifies last-window activity without inventing a new automation engine. Surface it on Dashboard as an operator-first digest card with direct links to Work Items, Approvals, and Executions. Keep Discord/cron delivery as a formatting/API seam, not a new autonomous loop.

**Tech Stack:** TanStack Start/React, TypeScript, TanStack Query, Vitest, existing file-backed stores under `src/server`, existing `/api/work-item-notification-digest` and attention queue seams, P2 `/executions` routes.

---

## 0. Context and source documents

Read in this order:

1. `docs/handoff/current-slice-status.md`
2. `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
3. This plan
4. Source UX roadmap for context only: `docs/plans/2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md`
5. Recently shipped P2 plan for Executions constraints: `docs/plans/2026-04-29-hermes-workspace-p2-dedicated-runs-executions-architecture-plan.md`

This plan continues the Operator UX Clarity cycle:

| Order | Slice | Status |
|---:|---|---|
| P0 | Terminology cleanup and deep-link sanity | Shipped / Main-reviewed |
| P1 | Work Item Cockpit progressive disclosure | Shipped / Main-reviewed |
| P2 | Dedicated Executions surface | Shipped / Main-reviewed |
| P3 | Morning Review / overnight operator digest | Active |

## 1. Main/CEO P2 review baseline

Main reviewed the P2 implementation before authorizing this plan:

- Repo remained on branch `my-hermes-workspace-dev` at commit `5afe861` plus uncommitted P0/P1/P2 implementation changes.
- Focused P2 set passed: `pnpm test src/screens/executions/executions-view-model.test.ts src/screens/executions/executions-screen.test.ts src/screens/executions/execution-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts src/screens/jobs/jobs-screen.test.ts src/server/work-item-run-timeline.test.ts src/server/execution-runs-routes.test.ts -- --runInBand` — 7 files / 56 tests.
- Full regression passed: `pnpm vitest run` — 76 files / 488 tests.
- Build passed: `pnpm build`.
- Whitespace check passed: `git diff --check`.
- Service restarted and became active: `systemctl --user restart hermes-workspace.service && systemctl --user is-active hermes-workspace.service` returned `active`.
- Root smoke passed after one transient post-restart connection refusal: `curl -fsS http://127.0.0.1:3456/`.
- Live browser/DOM P2 verification passed for work item `7a0c4615-5e2f-468c-a5cf-0c8ae53eb645`:
  - `Operator Summary`, `Execution Evidence`, and `Advanced execution metadata` render;
  - all `Open execution trace` links point to `/executions?jobId=9c1126f62ea6&workItemId=7a0c4615-5e2f-468c-a5cf-0c8ae53eb645`;
  - no `/jobs?jobId=...` trace links remain;
  - `/executions?jobId=...&workItemId=...` renders `Execution trace not yet recorded`, useful fallback copy, and Work Item link;
  - `/jobs` renders stable Scheduled Jobs definition copy;
  - P0-banned labels were absent and browser console was clean.

## 2. Product definition

P3 is not a new “missions” dashboard and not a swarm theater. It is a morning operator briefing.

The operator should open Dashboard and understand within 10 seconds:

1. **What changed overnight?** New done items, changed statuses/phases, new execution attempts, new evidence, and new notes/history.
2. **What needs approval?** Pending review/deploy approval queue, oldest first.
3. **What failed?** Failed executions, failed reviews, blocked lanes, stale execution findings.
4. **What got merged?** Work items with merge evidence, PR readiness, cleanup recommendations.
5. **What is parked?** Blocked/parked lane items with reason and recovery guidance.
6. **What should I open next?** A single best next attention item with a direct link.

## 3. Data boundaries and terminology

Use this visible vocabulary:

| Concept | Meaning | Source seam |
|---|---|---|
| Morning Review | Operator briefing for a recent time window | new view model over existing stores |
| Overnight window | Default lookback window, 18 hours unless overridden | query param / helper input |
| Changed | Work-item history, status/phase/updatedAt, execution run timestamps | `WorkItemRecord`, `ExecutionRunRecord` |
| Needs approval | Pending approval inbox entries | `work-item-approvals` |
| Failed execution | Work-item or execution-run failure evidence | `ExecutionRunRecord.state`, work-item failure fields |
| Merged | Merge-Healer evidence exists | work-item merge fields |
| Parked | lane/work item blocked with reason | work item lane/status fields |
| Next attention item | highest severity open attention item or pending approval | attention queue + approvals |

Guardrails:

1. Do **not** reintroduce `Mission Link`, `Hermes Job ID`, `Failed missions`, or `Running missions` in visible Dashboard/Morning Review UI.
2. Do **not** add parallel worktrees, swarm maps, or a separate Missions page.
3. Do **not** mutate work items from the digest. P3 is read-only except for existing attention queue refresh behavior if already used by routes.
4. Do **not** send Discord messages automatically from the UI. Provide formatting/API support only; actual scheduling/delivery remains a separate operator/cron concern unless a later plan authorizes it.
5. Preserve PATCH partial-update safety; P3 should not touch `src/routes/api/work-items.$workItemId.ts`.

## 4. Acceptance criteria

P3 is accepted only when all are true:

1. A deterministic Morning Review server helper exists and can build a digest for a configurable lookback window.
2. The digest includes these buckets: changed, needs approval, failed, merged, parked, and next attention item.
3. Digest entries include operator-ready labels, project/work-item context, timestamp/age, severity, and direct hrefs.
4. Execution-related entries link to `/executions...` when execution run/job evidence exists; Scheduled Jobs remains secondary definition-only evidence.
5. `GET /api/morning-review` returns JSON with default and query-controlled lookback window support.
6. `GET /api/morning-review?format=discord` returns a compact Discord-ready message without persisting unrelated status-digest hashes.
7. Dashboard shows a Morning Review / Overnight Digest card above or near the existing Mission Control queues.
8. The card has one primary `Open next attention item` action when something needs attention; all bucket links are clickable.
9. Empty/all-clear state is explicit and calming, not blank.
10. Existing `/api/work-item-notification-digest` behavior remains compatible.
11. Focused tests cover view-model classification, API route behavior, Discord formatting, Dashboard copy/action state, and P0/P2 terminology guardrails.
12. Full verification includes focused tests, full regression, build, service restart/root smoke, and live browser/DOM Dashboard checks showing the digest card and clickable next action or all-clear state.

## 5. Implementation tasks

### Task 1 — Define the Morning Review server view model with RED tests

**Objective:** Build the core digest classification in one deterministic, UI-independent helper.

**Files:**

- Create: `src/server/morning-review.ts`
- Create: `src/server/morning-review.test.ts`
- Read/reference: `src/server/work-item-notification-digest.ts`
- Read/reference: `src/server/attention-queue.ts`
- Read/reference: `src/server/execution-runs-store.ts`
- Read/reference: `src/server/work-items-store.ts`

**Steps:**

1. Create exported types:

```ts
export type MorningReviewBucket = 'changed' | 'needs_approval' | 'failed' | 'merged' | 'parked'
export type MorningReviewSeverity = 'critical' | 'warning' | 'info' | 'success'

export type MorningReviewEntry = {
  id: string
  bucket: MorningReviewBucket
  severity: MorningReviewSeverity
  title: string
  detail: string
  projectId?: string
  projectName?: string
  workItemId?: string
  workItemTitle?: string
  href: string
  observedAt: string
  ageMinutes: number
  executionHref?: string
}

export type MorningReviewDigest = {
  generatedAt: string
  window: { since: string; until: string; lookbackHours: number }
  summary: Record<MorningReviewBucket, number> & { total: number }
  buckets: Record<MorningReviewBucket, Array<MorningReviewEntry>>
  nextAttentionItem: MorningReviewEntry | null
  allClear: boolean
}
```

2. Add `buildMorningReviewDigest(options?: { now?: Date; lookbackHours?: number }): MorningReviewDigest`.
3. Default `lookbackHours` to `18`.
4. Use `listWorkItems()`, `listApprovalInboxEntries()`, `listExecutionRuns()`, and `refreshAttentionQueue()`/`buildAttentionQueue()` as read sources.
5. Classify:
   - changed: work items updated in the window, history entries in the window, or execution runs observed in the window;
   - needs approval: pending approval inbox entries;
   - failed: failed execution runs, work-item execution failure fields, failed/changes-requested review states;
   - merged: `mergeState === 'merged'`, `mergeCommit`, `prUrl`, or merge artifacts observed in the window;
   - parked: `status === 'blocked'`, `laneState === 'blocked'`, `laneParkedAt`, or blocked reason.
6. De-duplicate by stable IDs: `bucket:source:id`.
7. Sort each bucket by severity first, newest observed timestamp second.
8. Pick `nextAttentionItem` in this order: critical failed, pending approval, parked/blocked, warning failed, newest changed.
9. RED tests must assert every bucket classification and the next-attention ranking before implementation.

**Verification command:**

```bash
pnpm test src/server/morning-review.test.ts -- --runInBand
```

### Task 2 — Add Morning Review formatting without disturbing the existing status digest

**Objective:** Provide an operator-readable compact message that can be used by cron/Discord later without changing existing digest de-dup semantics.

**Files:**

- Modify: `src/server/morning-review.ts`
- Modify: `src/server/morning-review.test.ts`
- Do not modify unless required: `src/server/work-item-notification-digest.ts`

**Steps:**

1. Add `formatMorningReviewForDiscord(digest: MorningReviewDigest): string`.
2. Header should be `**🌅 Morning Review — Mission Control**`.
3. Include the window: `Last <N>h` and generated timestamp.
4. Include one compact summary line: changed / needs approval / failed / merged / parked.
5. Include `Next:` line when `nextAttentionItem` exists.
6. Include top 3 entries per non-empty bucket with href text where possible.
7. Empty state should include `All clear — no overnight operator action needed.`
8. Use execution terminology: `failed execution`, not `failed mission`.
9. Tests must assert formatting, all-clear state, and banned labels absent.

**Verification command:**

```bash
pnpm test src/server/morning-review.test.ts src/server/work-item-notification-digest.test.ts -- --runInBand
```

### Task 3 — Add `/api/morning-review` route with JSON and Discord formats

**Objective:** Expose the Morning Review as a first-class API for Dashboard and future scheduled delivery.

**Files:**

- Create: `src/routes/api/morning-review.ts`
- Create or modify: `src/server/morning-review-routes.test.ts`
- Build-generated: `src/routeTree.gen.ts` after `pnpm build`

**Steps:**

1. Add authenticated `GET /api/morning-review`.
2. Support query params:
   - `lookbackHours` integer, clamped to 1–72;
   - `format=discord`.
3. JSON response shape:

```ts
{
  digest: MorningReviewDigest,
  message?: string
}
```

4. `format=discord` returns `{ digest, message }` using `formatMorningReviewForDiscord`.
5. Do not persist or compare the existing `notification-digest-last-hash.txt` here.
6. Tests must cover auth, default lookback, clamped lookback, JSON response, and Discord response.

**Verification command:**

```bash
pnpm test src/server/morning-review-routes.test.ts -- --runInBand
```

### Task 4 — Add client API helpers for Dashboard

**Objective:** Keep Dashboard fetching typed and testable rather than embedding route strings in the component.

**Files:**

- Create: `src/lib/morning-review-api.ts`
- Create: `src/lib/morning-review-api.test.ts` if the project pattern supports fetch-helper tests; otherwise cover through Dashboard tests.

**Steps:**

1. Export `MORNING_REVIEW_QUERY_KEY = ['dashboard', 'morning-review'] as const`.
2. Export `fetchMorningReview(options?: { lookbackHours?: number }): Promise<MorningReviewApiResponse>`.
3. Use `/api/morning-review?lookbackHours=18` by default.
4. Throw a useful error if response is not ok.
5. Tests should mock `fetch` and assert URL/shape/error behavior if a helper test is added.

**Verification command:**

```bash
pnpm test src/lib/morning-review-api.test.ts -- --runInBand
```

If no helper test is created, document why in the handoff and cover the helper via Dashboard tests in Task 5.

### Task 5 — Build Dashboard Morning Review card with RED tests

**Objective:** Put the digest where the operator starts their day.

**Files:**

- Modify: `src/screens/dashboard/dashboard-screen.tsx`
- Modify: `src/screens/dashboard/dashboard-screen.test.ts`
- Possibly modify: `src/lib/i18n.ts` if Dashboard copy constants live there

**Steps:**

1. Add a query using `fetchMorningReview({ lookbackHours: 18 })`.
2. Render a card near the top of Mission Control content with:
   - title: `Morning Review`;
   - subtitle/copy: `Overnight digest for the last 18h.`;
   - generated/window timestamp;
   - metric chips for Changed, Needs approval, Failed, Merged, Parked;
   - `Open next attention item` primary link when `nextAttentionItem` exists;
   - all-clear copy when `allClear` is true.
3. Render bucket previews with direct links. Keep each preview short: title, project/work item, age, severity.
4. For entries with `executionHref`, show a secondary `Open execution` link pointing to `/executions...`.
5. Do not remove the existing attention queue/approvals/failed/blocked/running sections in this slice.
6. RED tests must assert:
   - card title/subtitle;
   - summary bucket chips;
   - primary next action link;
   - all-clear state;
   - execution link uses `/executions`, not `/jobs?jobId=`;
   - banned labels absent.

**Verification command:**

```bash
pnpm test src/screens/dashboard/dashboard-screen.test.ts -- --runInBand
```

### Task 6 — Add Dashboard clickability and attention-flow coverage

**Objective:** Preserve the P0/P1 clickability discipline: every digest action either links somewhere useful or is explicitly static.

**Files:**

- Modify: `src/screens/dashboard/dashboard-screen.tsx`
- Modify: `src/screens/dashboard/dashboard-screen.test.ts`

**Steps:**

1. Extend `DASHBOARD_CLICKABILITY_AUDIT` with Morning Review surfaces:
   - summary chip static or filter action;
   - primary `Open next attention item` link;
   - bucket entry link;
   - secondary execution link.
2. Add tests that iterate the audit entries and ensure expected targets are present or intentionally static.
3. Confirm `Open next attention item` is absent/disabled in all-clear state, not a dead link.
4. Confirm bucket entries link to Work Item, Approvals, Project, or Executions routes.

**Verification command:**

```bash
pnpm test src/screens/dashboard/dashboard-screen.test.ts -- --runInBand
```

### Task 7 — API/live smoke and compatibility checks

**Objective:** Prove the new route works in the running app and did not break existing digest or P2 Executions.

**Files:**

- No planned source changes; update handoff after verification.

**Required commands:**

```bash
pnpm test src/server/morning-review.test.ts src/server/morning-review-routes.test.ts src/screens/dashboard/dashboard-screen.test.ts src/server/work-item-notification-digest.test.ts -- --runInBand
pnpm vitest run
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS 'http://127.0.0.1:3456/api/morning-review?lookbackHours=18' >/tmp/hermes-workspace-morning-review.json
curl -fsS 'http://127.0.0.1:3456/api/morning-review?lookbackHours=18&format=discord' >/tmp/hermes-workspace-morning-review-discord.json
curl -fsS 'http://127.0.0.1:3456/api/work-item-notification-digest' >/tmp/hermes-workspace-status-digest.json
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-smoke.html
```

If auth protection is enabled in the local service and unauthenticated API curl returns `401`, record that accurately and use browser/session-authenticated verification instead of weakening auth.

### Task 8 — Live browser/DOM Dashboard verification

**Objective:** Verify the actual operator UX, not just constants and helpers.

**Live verification:**

1. Open `http://127.0.0.1:3456/dashboard`.
2. If the onboarding overlay appears in a fresh profile, set `localStorage['hermes-onboarding-complete']='true'`, dispatch `hermes:onboarding-complete`, and reload.
3. Confirm `Morning Review` renders near the top of the Dashboard.
4. Confirm copy includes `Overnight digest` and the window.
5. Confirm the five buckets render: Changed, Needs approval, Failed, Merged, Parked.
6. If the local dataset has attention items, confirm `Open next attention item` exists and href points to a Work Item / Approvals / Executions route.
7. If the local dataset is all-clear, confirm the card says `All clear — no overnight operator action needed.` and has no dead primary action.
8. Confirm execution links, if present, point to `/executions...`, not `/jobs?jobId=...`.
9. Confirm existing Dashboard Mission Control queues still render.
10. Confirm P0-banned labels do not return in key surfaces: `Mission Link`, `Hermes Job ID`, `Failed missions`, `Running missions`.
11. Check browser console for JS/network errors.

**Handoff update after P3:**

When P3 is done, update `docs/handoff/current-slice-status.md` with:

- P3 implemented and verified evidence;
- exact commands run and result;
- live Dashboard Morning Review evidence;
- explicit next step: **Main/CEO review P3 and decide the next product cycle or merge-readiness package**.

Do not invent P4 from Builder. Main/CEO will prepare the next plan after review.

## 6. Risks and guardrails

- **Risk:** The digest becomes a second source of truth. Guardrail: compute from existing stores; do not store digest state except optional future de-dup in a separate plan.
- **Risk:** The Dashboard gets noisy again after P1 reduced cockpit noise. Guardrail: card is summary-first, top few entries only, with direct drill-down links.
- **Risk:** “Morning” implies a fixed timezone or delivery time. Guardrail: P3 implements a lookback window and UI/API, not scheduler policy. Use local browser/server formatting only for display.
- **Risk:** Existing status digest has stale “missions” vocabulary. Guardrail: P3 Morning Review must use execution vocabulary; do not broaden-scope rewrite the older digest except compatibility tests and non-breaking label fixes if necessary.
- **Risk:** Execution traces regress to Scheduled Jobs. Guardrail: tests and live DOM must assert `/executions...` for execution links.
- **Risk:** Auth gets bypassed for cron convenience. Guardrail: `/api/morning-review` uses existing `isAuthenticated` behavior; scheduling/delivery must respect configured auth.

## 7. Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, then this active plan, and implement Task 1 first.
