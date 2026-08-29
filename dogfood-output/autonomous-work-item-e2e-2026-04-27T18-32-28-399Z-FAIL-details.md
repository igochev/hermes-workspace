# Autonomous Work Item E2E Failure Details

Workflow verdict: AUTONOMOUS WORKFLOW FAIL
Code delivery verdict: AUTONOMOUS CODE DELIVERY FAIL
E2E run id: autonomous-work-item-e2e-2026-04-27T18-17-23-757Z
Work item id: 84bfe2c2-e899-437a-8a6c-a6fa9884886d
Screenshot: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace/dogfood-output/autonomous-work-item-e2e-2026-04-27T18-17-23-757Z.png

## Final observed work item state

- status/phase: `active` / `build`
- missionJobId: `db190fd2a43a`
- missionState: `scheduled`
- planFilePath: `docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-plan.md`
- repoPathSnapshot: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS-autonomous-e2e-20260427T181715Z`

## Autonomous evidence observed

- Harness created exactly one work item for this run: `84bfe2c2-e899-437a-8a6c-a6fa9884886d`.
- No manual work-item lifecycle/PATCH movement was used by the harness.
- Planner job launched: `ed4852f80e36`.
- Planner markdown artifact was created and ingested via artifact fallback: `docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-planner-draft.md`.
- Planner draft auto-accepted the item to `ready/build`.
- Builder job launched by orchestrator: `db190fd2a43a`.

## Blocker

The Builder mission did not produce candidate product/test diffs before the 15-minute harness timeout. Final candidate repo `git diff --name-only` was empty, and `git status --short` only showed untracked planner docs.

```text
?? docs/plans/
?? lib/mission-control/
?? tests/autonomous-delivery.test.ts
```

Changed tracked files:

```text
(none)
```

## Planning drafts

```json
[
  {
    "id": "aaf6b64c-efa4-4bd6-8329-d4471a61fad4",
    "workItemId": "84bfe2c2-e899-437a-8a6c-a6fa9884886d",
    "projectId": "production-dogfood-family-command-center-abacus",
    "status": "accepted",
    "plannerJobId": "ed4852f80e36",
    "plannerJobName": "work-item-plan-production-dogfood-family-command-center-abacus-84bfe2c2",
    "plannerSessionKey": "cron_ed4852f80e36_pending",
    "plannerSessionKeyPrefix": "cron_ed4852f80e36_",
    "plannerProfile": "planner",
    "plannerLink": "/jobs?jobId=ed4852f80e36",
    "rawOutput": "{\"title\":\"Autonomous E2E Code Delivery autonomous-work-item-e2e-2026-04-27T18-17-23-757Z\",\"description\":\"Autonomous E2E autonomous-work-item-e2e-2026-04-27T18-17-23-757Z: create one item, then only poll the orchestrator until Builder delivers candidate repo code/test changes.\",\"priority\":\"medium\",\"riskLevel\":\"low\",\"labels\":[\"autonomous-e2e\",\"autonomous-work-item-e2e-2026-04-27T18-17-23-757Z\",\"planner-artifact-ready\"],\"acceptanceCriteria\":[\"Planner launches and produces a build-ready plan without tester phase movement.\",\"Builder launches from the orchestrator and changes product code plus tests in the candidate repo.\",\"The work item reaches done through autonomous orchestration and existing sync/review/deploy logic.\"],\"notes\":[\"Planner markdown artifact detected at docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-planner-draft.md; proceeding to Builder.\"],\"planFilePath\":\"docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-planner-draft.md\",\"openQuestions\":[],\"suggestedPhase\":\"build\"}",
    "structuredOutput": {
      "title": "Autonomous E2E Code Delivery autonomous-work-item-e2e-2026-04-27T18-17-23-757Z",
      "description": "Autonomous E2E autonomous-work-item-e2e-2026-04-27T18-17-23-757Z: create one item, then only poll the orchestrator until Builder delivers candidate repo code/test changes.",
      "priority": "medium",
      "riskLevel": "low",
      "labels": [
        "autonomous-e2e",
        "autonomous-work-item-e2e-2026-04-27T18-17-23-757Z",
        "planner-artifact-ready"
      ],
      "acceptanceCriteria": [
        "Planner launches and produces a build-ready plan without tester phase movement.",
        "Builder launches from the orchestrator and changes product code plus tests in the candidate repo.",
        "The work item reaches done through autonomous orchestration and existing sync/review/deploy logic."
      ],
      "notes": [
        "Planner markdown artifact detected at docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-planner-draft.md; proceeding to Builder."
      ],
      "planFilePath": "docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-planner-draft.md",
      "openQuestions": [],
      "suggestedPhase": "build"
    },
    "parseWarnings": [],
    "planFilePath": "docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-planner-draft.md",
    "createdAt": "2026-04-27T18:17:23.810Z",
    "updatedAt": "2026-04-27T18:21:14.232Z",
    "acceptedAt": "2026-04-27T18:21:14.231Z"
  }
]
```

## Execution runs

```json
[]
```

## Work item history

```json
[
  {
    "id": "0b235b92-600e-4ecc-a105-9a36128707b3",
    "action": "note",
    "status": "inbox",
    "phase": "research",
    "note": "Planner enrichment requested via profile planner. Draft aaf6b64c is running.",
    "missionId": "ed4852f80e36",
    "sessionKey": "cron_ed4852f80e36_pending",
    "sessionKeyPrefix": "cron_ed4852f80e36_",
    "profile": "planner",
    "createdAt": "2026-04-27T18:17:23.835Z"
  },
  {
    "id": "a14b815f-7296-4d87-a703-a75185fa99b0",
    "action": "status-change",
    "status": "ready",
    "phase": "build",
    "note": "Accepted Planner draft aaf6b64c and prepared work item for Builder launch.",
    "profile": "planner",
    "createdAt": "2026-04-27T18:21:14.228Z"
  },
  {
    "id": "2c9ea91f-8e1c-44eb-9da8-1c97f7575cbe",
    "action": "launch",
    "status": "active",
    "phase": "build",
    "note": "Launched two-phase pipeline (Phase 1: builder plan \u2192 Phase 2: build) via Conductor. Plan path: docs/plans/production-dogfood-family-command-center-abacus-84bfe2c2-plan.md Capacity advisory: build capacity is at 2/2 active work items; launch may proceed with operator awareness.",
    "missionId": "db190fd2a43a",
    "sessionKey": "cron_db190fd2a43a_pending",
    "sessionKeyPrefix": "cron_db190fd2a43a_",
    "profile": "builder",
    "createdAt": "2026-04-27T18:21:24.260Z"
  }
]
```
