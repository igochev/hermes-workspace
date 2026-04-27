# Hermes Workspace — REAL Production E2E Single Work-Item Workflow Test Plan

> **For Builder:** This replaces the previous weak “production dogfood” acceptance interpretation. Do **not** claim success from creating work items or clicking surfaces. Success means one real work item moves through the designed workflow from Inbox to Done.
>
> **Repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
>
> **Real test project:** `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
>
> **Real test project branch:** `test-hermes-workspace`
>
> **Non-negotiable:** one work item only, same ID from start to finish.

**Goal:** Add and run a real production end-to-end test proving a single Mission Control work item can be created in Inbox, auto-advanced to Ready when policy says it should, launched/driven through build/review/deploy, and completed as Done.

**Architecture:** Build a dedicated E2E harness and tests around the live Hermes Workspace service/API/UI. The harness must use the real project record and production-like persistence, create exactly one identifiable test work item, record every state transition, and fail if the item remains in Inbox or if new extra test items are created.

**Tech Stack:** TypeScript/Node, existing Hermes Workspace server routes, Vitest for harness unit/contract tests, Playwright/browser automation for live UI/API E2E, systemd local service at `http://localhost:3456`.

---

## Absolute definition of E2E for this slice

A passing E2E report must show this exact same `workItem.id` moving through the workflow:

```text
Created:        status=inbox,  phase=research
Auto approval:  status=ready,  phase=undefined
Start build:    status=active, phase=build
Request review: status=active, phase=review
Review gate:    status=active, phase=deploy     (auto-approved or operator-approved)
Deploy gate:    status=done,   phase=undefined  (operator-approved)
```

If the created work item stays in Inbox, the result is **FAIL**.

If the test creates multiple work items and does not complete one of them, the result is **FAIL**.

If Builder says “all done” without the state-transition table for the same work-item ID, the result is **FAIL**.

---

## Existing route facts Builder must use

Inspect these before coding:

- `src/routes/api/work-items.ts`
  - `POST /api/work-items` creates a work item.
- `src/routes/api/work-items.$workItemId.ts`
  - `GET /api/work-items/:id` fetches current state.
  - `PATCH /api/work-items/:id` can update status/phase/metadata and must preserve partial-update safety.
- `src/routes/api/work-items.$workItemId.lifecycle.ts`
  - `POST /api/work-items/:id/lifecycle`
  - actions include `send_to_planning`, `mark_ready`, `request_review`, `request_deploy_approval`, `resume_build`.
- `src/routes/api/work-item-approvals.$approvalId.ts`
  - `PATCH /api/work-item-approvals/:approvalId` with `{ "decision": "approved" }` resolves review/deploy approvals.
- `src/server/work-item-lifecycle.ts`
  - canonical lifecycle transition logic.
- `src/server/work-item-approvals.ts`
  - review auto-approval may move review -> deploy.
  - deploy approval approved moves deploy -> done.
- `src/server/work-items-store.ts`
  - canonical work-item persistence in `HERMES_HOME/work-items.json`.

Do not invent a second lifecycle. Exercise the real one.

---

## Pass / fail gates

### PASS requires all of these

1. Exactly one E2E test item is created for the run, with a unique `e2eRunId` label/title marker.
2. The same work item ID appears in every transition.
3. The report includes a transition table with status + phase after every step.
4. The item reaches `status=done` and `phase` absent/undefined.
5. Review gate is proven:
   - either review auto-approval created an approved review approval and moved to deploy,
   - or a pending review approval was explicitly approved through the real approval endpoint.
6. Deploy gate is proven by real deploy approval request + approval endpoint resolution.
7. Final GET confirms the persisted item is `done`.
8. Inbox check proves the final item is not in Inbox.
9. Count check proves the harness did not create extra unfinished E2E items for the run.
10. Browser/UI evidence opens the created work-item detail page and shows the terminal Done state or completed lifecycle history.

### FAIL if any of these happen

- Work item remains `status=inbox` after the auto-approval/mark-ready gate.
- More than one E2E work item is created for the run.
- Builder only clicks “create work item” and stops.
- Builder only tests constants, reducers, mocked stores, or unit routes.
- Builder manually edits JSON files to force success.
- Builder marks success while any required API step returned non-2xx.
- Builder cannot show final persisted state for the same work-item ID.

---

## Task 0 — Stop using the old acceptance result as production proof

**Objective:** Record that prior “production dogfood” did not satisfy real E2E because it allowed created work items to remain in Inbox.

**Files:**
- Modify: `docs/handoff/current-slice-status.md`
- Create/modify: latest report under `dogfood-output/`

**Steps:**

1. Add a handoff note: previous PA acceptance is superseded by this real E2E plan.
2. State explicitly: “Created items remaining in Inbox is a failed E2E condition.”
3. Do **not** delete old reports; classify them as surface dogfood, not real workflow E2E.

**Verification:** handoff points to this plan as the active gate.

---

## Task 1 — Add a failing harness contract test first

**Objective:** Prevent another fake E2E by making the report schema require a single completed work item transition table.

**Files:**
- Create/modify: `src/server/production-e2e-work-item-workflow-script.test.ts`
- Create/modify: `scripts/mission-control-work-item-e2e.mjs`

**Step 1: Write failing test**

Add tests that fail until the E2E script exports/produces a validated report contract.

Required test assertions:

```ts
expect(report.e2eRunId).toMatch(/^work-item-e2e-/)
expect(report.createdWorkItemIds).toHaveLength(1)
expect(report.workItemId).toBe(report.createdWorkItemIds[0])
expect(report.transitions.map((step) => step.name)).toEqual([
  'created-inbox',
  'ready-after-auto-approval',
  'active-build',
  'active-review',
  'active-deploy',
  'done',
])
expect(report.transitions.at(0)).toMatchObject({ status: 'inbox', phase: 'research' })
expect(report.transitions.at(1)).toMatchObject({ status: 'ready' })
expect(report.transitions.at(2)).toMatchObject({ status: 'active', phase: 'build' })
expect(report.transitions.at(3)).toMatchObject({ status: 'active', phase: 'review' })
expect(report.transitions.at(4)).toMatchObject({ status: 'active', phase: 'deploy' })
expect(report.transitions.at(5)).toMatchObject({ status: 'done' })
expect(report.finalInboxCheck).toMatchObject({ workItemIdStillInInbox: false })
expect(report.extraE2eItemsCreated).toEqual([])
```

**Step 2: Run RED**

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
```

Expected: FAIL because the script/contract does not exist or does not yet enforce these fields.

**Step 3: Implement minimal report validator/helper**

The script must expose or internally use a report validator that throws if:

- `createdWorkItemIds.length !== 1`
- any transition uses a different `workItemId`
- expected transition status/phase does not match
- final status is not `done`
- final inbox check says the item is still in Inbox

**Step 4: Run GREEN**

```bash
pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
```

Expected: PASS.

---

## Task 2 — Implement the live E2E API driver

**Objective:** Drive one real work item through the real API lifecycle.

**Files:**
- Modify: `scripts/mission-control-work-item-e2e.mjs`
- Test: `src/server/production-e2e-work-item-workflow-script.test.ts`

**Required live API sequence:**

Use `BASE_URL=${BASE_URL:-http://localhost:3456}`.

1. Generate:

```js
const e2eRunId = `work-item-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}`
const title = `REAL E2E Workflow ${e2eRunId}`
```

2. Ensure project exists/reuse:

```text
projectId: production-dogfood-family-command-center-abacus
repoPath: /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
branch: test-hermes-workspace
```

If the project does not exist, create it through the same project API used by the existing dogfood harness. Do not fake a project by writing JSON directly.

3. Create exactly one work item:

```http
POST /api/work-items
{
  "projectId": "production-dogfood-family-command-center-abacus",
  "title": "REAL E2E Workflow <e2eRunId>",
  "description": "Production E2E: one item must travel Inbox -> Ready -> Build -> Review -> Deploy -> Done.",
  "status": "inbox",
  "phase": "research",
  "priority": "low",
  "riskLevel": "low",
  "labels": ["production-e2e", "<e2eRunId>"],
  "acceptanceCriteria": [
    "The same work item leaves Inbox and reaches Ready.",
    "The same work item reaches Build, Review, Deploy, and Done.",
    "The final report includes transition evidence for the same work item id."
  ],
  "repoPathSnapshot": "/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS"
}
```

Record transition `created-inbox` from the response and from a fresh GET.

4. Prove auto-approval/ready gate:

The product currently exposes the lifecycle action `mark_ready`. If the intended auto-approval policy should move Inbox -> Ready automatically, the harness must first check whether the item moves to Ready without manual intervention. If it does not, the report must say auto-approval is missing and mark the run FAIL unless Builder implements/fixes the product behavior with TDD.

Allowed sequence for current API proof:

```http
POST /api/work-items/:id/lifecycle
{ "action": "send_to_planning", "actor": "production-e2e", "notes": "E2E planning start" }

POST /api/work-items/:id/lifecycle
{ "action": "mark_ready", "actor": "production-e2e", "notes": "E2E planning accepted; item must leave Inbox" }
```

After this, fresh GET must show `status=ready`. If still `inbox`, FAIL.

5. Start build through real state transition.

If no explicit `start_build` lifecycle action exists, use the product’s current real launch/update path, but record the gap. The minimum acceptable current API proof is:

```http
PATCH /api/work-items/:id
{ "status": "active", "phase": "build", "missionState": "succeeded", "notes": ["E2E build phase entered"] }
```

Better: use the UI/launch action if it reliably sets `active/build`.

Fresh GET must show `status=active`, `phase=build`.

6. Request review:

```http
POST /api/work-items/:id/lifecycle
{ "action": "request_review", "actor": "production-e2e", "notes": "E2E build complete; request review" }
```

Fresh GET must show either:

- transient `status=active`, `phase=review`, with a review approval, or
- if low-risk auto-approval fires immediately, `status=active`, `phase=deploy`, with approved review approval.

The report must still include an `active-review` transition. If auto-approval skips the observable GET, record the response/body/history evidence showing review was requested and auto-approved.

7. Approve review if pending:

Find pending review approval in the work-item GET response or approvals endpoint. Then:

```http
PATCH /api/work-item-approvals/:approvalId
{ "decision": "approved", "resolvedBy": "production-e2e", "notes": "E2E review approved" }
```

Fresh GET must show `status=active`, `phase=deploy`.

8. Request deploy approval:

```http
POST /api/work-items/:id/lifecycle
{ "action": "request_deploy_approval", "actor": "production-e2e", "notes": "E2E deploy approval requested" }
```

Find pending deploy approval.

9. Approve deploy:

```http
PATCH /api/work-item-approvals/:approvalId
{ "decision": "approved", "resolvedBy": "production-e2e", "notes": "E2E deploy approved; complete item" }
```

Fresh GET must show `status=done` and no phase.

10. Final count checks:

```http
GET /api/work-items?projectId=production-dogfood-family-command-center-abacus
```

Filter by label/title containing `e2eRunId`.

Assert:

```text
createdWorkItemIds.length === 1
final item status !== inbox
final item status === done
extraE2eItemsCreated.length === 0
```

---

## Task 3 — Add browser/UI proof for the same work item

**Objective:** The live UI must open the created item and visually confirm terminal state/history. API-only proof is not enough.

**Files:**
- Modify: `scripts/mission-control-work-item-e2e.mjs`
- Modify tests as needed.

**Required UI steps:**

1. Use Playwright or the existing dogfood browser harness.
2. Open:

```text
http://localhost:3456/projects/production-dogfood-family-command-center-abacus/work-items/<workItemId>
```

3. Confirm the page identifies the same title and work item.
4. Confirm visible final state is `Done` or equivalent terminal status.
5. Confirm lifecycle/history shows at least:
   - Inbox/research creation or planning start
   - Ready
   - Build
   - Review
   - Deploy
   - Done / deploy approved
6. Save screenshot:

```text
dogfood-output/work-item-e2e-<timestamp>.png
```

7. Record console/page/network errors. Any error on tested routes is FAIL unless explicitly benign and documented.

---

## Task 4 — Full production run command

**Objective:** Run the test against the live production-like local service.

**Commands:**

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace

date '+%Y-%m-%d %H:%M:%S %Z'
git status --short --branch
git rev-parse --short HEAD
git -C /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS status --short --branch
git -C /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS rev-parse --short HEAD
git -C /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS rev-parse --abbrev-ref HEAD

pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand
pnpm vitest run
pnpm build

systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://localhost:3456/api/projects >/tmp/hermes-workspace-projects-e2e-smoke.json
node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/hermes-workspace-projects-e2e-smoke.json','utf8')); console.log(Array.isArray(data.projects), data.projects?.length ?? 0)"

node scripts/mission-control-work-item-e2e.mjs
```

If `pnpm lint` is part of the release gate, run it too, but lint does not replace the E2E.

---

## Task 5 — Required report format

**Objective:** Builder must produce an artifact that cannot hide an Inbox failure.

**Files:**
- Create: `dogfood-output/work-item-e2e-YYYY-MM-DDTHH-MM-SS.md`
- Create/update: `dogfood-output/work-item-e2e-latest.md`
- Modify: `docs/handoff/current-slice-status.md`

**Report must include:**

```md
# REAL Work Item E2E Report

Verdict: PASS / FAIL
E2E run id: ...
Workspace branch/commit: ...
Candidate branch/commit: ...
Project id: production-dogfood-family-command-center-abacus
Work item id: ...
Work item title: ...
Created work item ids for this run: [...]
Extra E2E items created: []
Screenshot: ...

## Transition table
| Step | Work item id | Status | Phase | Evidence source |
|---|---|---|---|---|
| created-inbox | ... | inbox | research | POST + GET |
| ready-after-auto-approval | ... | ready | — | lifecycle + GET |
| active-build | ... | active | build | launch/PATCH + GET |
| active-review | ... | active | review | lifecycle response/history |
| active-deploy | ... | active | deploy | review approval + GET |
| done | ... | done | — | deploy approval + final GET |

## Approval evidence
- Review approval id/status/resolution: ...
- Deploy approval id/status/resolution: ...

## Inbox failure check
- Final item still in Inbox: false
- Any same-run test item still in Inbox: false

## Console/network errors
- none / exact list

## Commands run
- exact commands and PASS/FAIL summaries

## Blockers
- none / exact reproduction
```

### Verdict rules

- `PASS`: all required transitions and UI proof pass.
- `FAIL`: any transition missing, item stuck in Inbox, extra unfinished item created, UI proof missing, service/API/test command failed.
- `CONDITIONAL` is **not allowed** for this E2E. Either one item reached Done or it did not.

---

## Task 6 — Update handoff before stopping

**Objective:** Make the next session start from truth, not from “all done” claims.

**Modify:** `docs/handoff/current-slice-status.md`

Required content:

- Active Plan: this file.
- Current State: `REAL E2E PASS` or `REAL E2E FAIL`.
- If FAIL: first blocker, exact failing step, work item id, final status/phase, report path.
- If PASS: work item id, report path, screenshot path, exact final status.
- Next Steps: if fail, fix blocker with TDD before any new feature work.

---

## Builder starting prompt

Use this exact prompt for Builder:

```text
Execute the REAL Hermes Workspace production E2E single-work-item workflow plan.

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Plan: docs/plans/2026-04-27-hermes-workspace-real-e2e-single-work-item-workflow-plan.md
Real project: /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
Real project branch: test-hermes-workspace

Read docs/handoff/current-slice-status.md first. The prior production dogfood result is NOT sufficient E2E proof. Implement the dedicated E2E harness using TDD: write the failing contract test first, then build scripts/mission-control-work-item-e2e.mjs.

Non-negotiable pass condition: create exactly ONE work item and prove the SAME workItem.id moves Inbox/research -> Ready -> active/build -> active/review -> active/deploy -> Done. If it remains in Inbox or multiple E2E items are created, report FAIL. Do not call it success unless dogfood-output/work-item-e2e-latest.md contains the transition table for the same work item id and final persisted status=done.

Run the required test/build/service/API/live E2E commands and update docs/handoff/current-slice-status.md before stopping.
```
