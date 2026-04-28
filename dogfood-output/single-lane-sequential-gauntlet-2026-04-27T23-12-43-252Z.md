# Single-Lane Sequential Gauntlet Report

Verdict: FAIL
Gauntlet run id: single-lane-sequential-gauntlet-2026-04-27T23-12-43-252Z
Project id: production-dogfood-family-command-center-abacus
Created work item ids: []
Manual phase mutation calls: []
Max concurrent active lane items: 0

## Item proof
| Work item | Branch | Lane entered | Planner launched | Builder launched | Merge completed | Final status/lane | Merge state | Merge commit |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — |

## Sequential ordering proof
| Previous item | Next item | Previous done/parked at | Next build started at |
|---|---|---|---|
| — | — | — | — |

## Final work items
| Work item | Status | Lane state | Merge state |
|---|---|---|---|
| — | — | — | — |

## Orchestrator events
| Observed | Action | Work item id | Message |
|---|---|---|---|
| — | — | — | — |

## Repo hygiene
Branch before: test-hermes-workspace
Branch after: test-hermes-workspace
Checkout result: Already on target base branch test-hermes-workspace.
Dirty before:
```text

```
Dirty after:
```text

```
Findings:
- none

## Blockers
- Error: Refusing gauntlet: active non-terminal lane item already exists: d5a7c982-efdf-4823-a235-f42556a3103e (active/research/no-lane-state), 84bfe2c2-e899-437a-8a6c-a6fa9884886d (active/build/no-lane-state)
    at assert (file:///home/d3ni3/.Hermes/workspace/projects/hermes-workspace/scripts/mission-control-single-lane-sequential-gauntlet.mjs:17:25)
    at assertNoUnsafeActiveLaneItems (file:///home/d3ni3/.Hermes/workspace/projects/hermes-workspace/scripts/mission-control-single-lane-sequential-gauntlet.mjs:140:3)
    at runSingleLaneSequentialGauntlet (file:///home/d3ni3/.Hermes/workspace/projects/hermes-workspace/scripts/mission-control-single-lane-sequential-gauntlet.mjs:419:3)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async main (file:///home/d3ni3/.Hermes/workspace/projects/hermes-workspace/scripts/mission-control-single-lane-sequential-gauntlet.mjs:524:54)
    at async file:///home/d3ni3/.Hermes/workspace/projects/hermes-workspace/scripts/mission-control-single-lane-sequential-gauntlet.mjs:552:3
