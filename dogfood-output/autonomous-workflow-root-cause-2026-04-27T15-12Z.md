# Autonomous Workflow Root Cause — 2026-04-27T15:12Z

## Verdict

D3n13r is correct: the current Hermes Workspace work-item workflow is **not** a proven autonomous coding state machine.

The previous E2E was invalid for autonomous workflow acceptance because it manually moved work-item lifecycle state via API instead of proving that creating a work item automatically triggers the configured phase profiles and advances through phases based on real profile output.

## What should happen

A real autonomous coding workflow should be:

1. Create work item.
2. System automatically starts the Research/Planner profile for Inbox/Research.
3. Planner output is ingested automatically.
4. The same work item is automatically prepared/accepted into Ready/Build when policy allows.
5. System automatically starts Builder for Ready/Build.
6. Builder output is synced back to the work item.
7. System automatically starts Review profile / approval logic.
8. Deploy/Done happens only after real output and policy/approval gates.

## What actually exists

### Work item creation

`src/routes/api/work-items.ts` only calls `createWorkItem(...)` and returns the item.

It does not call:

- `prepareWorkItemWithPlanner(...)`
- `launchWorkItemIntoConductor(...)`
- `applyWorkItemLifecycleTransition(...)`
- any background dispatcher/queue

So creation itself does not start the workflow.

### Launching execution

Launch exists, but only behind explicit API/UI action:

- `POST /api/work-items/:id/prepare`
- `POST /api/work-items/:id/launch`

There is no server-side worker that automatically scans new/ready items and launches the correct profile.

### Supervisor/reconcile

`src/server/work-item-supervisor.ts` can reconcile existing execution state, but it only syncs/detects stale/failed jobs.

It does **not** launch missing phase jobs.
It is only exposed as `POST /api/work-items/supervisor/reconcile`.
No interval/daemon/background scheduler calls it automatically.

### Planner output ingestion

Planner output support exists:

- `recordPlannerOutput(...)`
- `POST /api/planning-drafts/:draftId/output`
- `applyPlanningDraftToWorkItem(...)`
- `POST /api/planning-drafts/:draftId/accept`

But the cron/planner job output is not automatically connected back into those endpoints.

Observed live state:

`/home/d3ni3/.hermes/planning-drafts.json` has drafts stuck at `status: running`, including:

- work item `d5a7c982-efdf-4823-a235-f42556a3103e`
- planner job `da20bed040a0`
- status `running`

Even though cron output exists proving Planner actually produced artifacts:

- `~/.hermes/cron/output/da20bed040a0/2026-04-27_17-29-03.md`
- `~/.hermes/cron/output/b005736466b9/2026-04-27_17-29-11.md`
- `~/.hermes/cron/output/d9212bc9cfa7/2026-04-27_17-31-56.md`

The planning draft was never marked `structured_ready`, never accepted, and the work item did not advance.

### Live broken item evidence

Project: `production-dogfood-family-command-center-abacus`

Work item:

```text
d5a7c982-efdf-4823-a235-f42556a3103e
status=active
phase=research
missionState=unknown
missionJobId=b005736466b9
planFilePath=null
```

Sync result:

```text
execution.state=unknown
execution.job=null
execution.jobRuns=[]
transitionApplied=null
```

This means the item is stuck active/research and not progressing into Ready/Build/Builder.

## Root cause

The system currently has manual/exposed seams, not an autonomous workflow engine:

- create work item does not enqueue/autostart planning;
- planner cron output is not ingested into planning drafts;
- planning drafts are not auto-accepted or routed into build under policy;
- ready/build items are not auto-launched to Builder;
- active/build items only advance if sync sees a known job succeed;
- there is no always-on reconciler/dispatcher loop.

The existing E2E manually PATCHed state and therefore bypassed the broken/absent orchestration engine.

## Required real fix direction

The next implementation must add a server-side autonomous work-item orchestrator/reconciler that owns phase progression.

Minimum acceptance for the next E2E:

1. Create exactly one work item.
2. Do not manually PATCH status/phase.
3. Do not manually call lifecycle actions to move phases.
4. Let the autonomous orchestrator trigger profiles.
5. Prove planner output is ingested into the work item.
6. Prove Builder is launched by the workflow, not by a manual shell command.
7. Prove candidate repo diff appears from Builder.
8. Prove final status transitions are caused by observed job/profile output and approval policy.

Until that exists, any report claiming “autonomous workflow pass” is false.
