# Slice AB/AC Implementation Plan — Recovery Actions + Supervisor Controls

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Turn supervisor findings and attention queue items into clear recovery actions so the operator spends less time babysitting failed or stale autonomous runs.

**Architecture:** Extend attention items with recommended actions, add server-side recovery action routes, and surface safe buttons in dashboard/work-item detail. Keep actions explicit and auditable; automatic retries remain policy-gated for a later cycle.

**Tech Stack:** Attention queue, execution runs, work-item lifecycle/launch, dashboard UI, work-item detail UI, Vitest.

---

## Current context

Observed seams:

- Attention queue: `src/server/attention-queue.ts`, `src/server/attention-queue-store.ts`, `src/routes/api/attention-queue.ts`, `src/lib/attention-queue-api.ts`.
- Supervisor reconcile: `src/server/work-item-supervisor.ts`, `src/routes/api/work-items.supervisor.reconcile.ts`.
- Launch/relaunch: `src/server/work-item-launch.ts`, `src/routes/api/work-items.$workItemId.launch.ts`.
- Work item lifecycle: `src/server/work-item-lifecycle.ts`.
- Dashboard attention card: `src/screens/dashboard/dashboard-screen.tsx`.

## Acceptance criteria

1. Attention items include recommended recovery actions such as relaunch phase, return to build, request review, mark externally resolved, cancel work item, or dismiss attention.
2. Dashboard and work-item detail show those actions with clear safety copy.
3. Executing a recovery action appends work-item history and updates/dismisses relevant attention item.
4. Failed/stale execution can be relaunched from the UI through existing launch path.
5. Actions are audited; no silent automatic retry in this slice.
6. Full regression and build pass.

## Task 1: Add recovery recommendation helper

**Files:**
- Create: `src/server/work-item-recovery-actions.ts`
- Test: `src/server/work-item-recovery-actions.test.ts`

**Steps:**
1. Define action types:
   - `relaunch_phase`
   - `return_to_build`
   - `request_review`
   - `mark_resolved`
   - `cancel_work_item`
   - `dismiss_attention`
2. Write tests mapping attention kinds/states to actions.
3. Keep helper pure and deterministic.

## Task 2: Extend attention queue item model

**Files:**
- Modify: `src/server/attention-queue-store.ts`
- Modify: `src/server/attention-queue.ts`
- Modify: `src/lib/attention-queue-api.ts`
- Test: attention queue tests

**Steps:**
1. Add `recommendedActions: AttentionRecoveryAction[]` to open items.
2. Preserve existing JSON normalization for older items without actions.
3. Ensure dedupe/upsert keeps actions updated.
4. Test migration-safe normalization.

## Task 3: Add recovery execution route

**Files:**
- Create: `src/routes/api/work-items.$workItemId.recovery-actions.ts`
- Test: route/server test

**Steps:**
1. POST body: `{ actionType, attentionItemId?, phase?, notes? }`.
2. Validate action against current work item state.
3. For relaunch, call existing launch helper with explicit phase.
4. For return/request/cancel, use existing lifecycle/update helpers.
5. For mark/dismiss, update attention item status/history without pretending work is done.
6. Return updated work item and attention result.

## Task 4: Add dashboard attention action UI

**Files:**
- Modify: `src/screens/dashboard/dashboard-screen.tsx`
- Test: `src/screens/dashboard/dashboard-screen.test.ts`

**Steps:**
1. Show first recommended action on each global attention card.
2. Add deep link to work-item detail for full action list.
3. Keep dashboard actions conservative: dismiss/mark resolved or open detail unless action is clearly safe.

## Task 5: Add work-item detail recovery panel

**Files:**
- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Create/modify client helper: `src/lib/work-item-recovery-actions-api.ts`
- Test: work-item detail screen test

**Steps:**
1. Fetch execution runs/attention for the work item if not already available.
2. Render recovery panel only when actions exist.
3. Buttons must show exact effect: `Relaunch build`, `Return to build`, `Request review`, etc.
4. On success, invalidate work-item, project, attention queue, execution runs.
5. Show history/evidence after recovery.

## Task 6: Verification

Run:

```bash
pnpm test src/server/work-item-recovery-actions.test.ts src/screens/dashboard/dashboard-screen.test.ts
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Live smoke:

1. Create or locate a failed/stale test work item.
2. Confirm attention item recommends recovery.
3. Execute a safe recovery action.
4. Confirm work item history and attention status update.

## Risks / pitfalls

- Do not add automatic retry loops yet.
- Avoid destructive actions without explicit operator click.
- Recovery actions must be idempotent enough to survive double-click or stale UI.
