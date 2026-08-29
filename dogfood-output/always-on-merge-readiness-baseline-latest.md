# Always-On Merge Readiness Baseline Report

Timestamp (UTC): 2026-04-28T17-46-41Z
Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
Branch: `my-hermes-workspace-dev`
Plan: `docs/plans/2026-04-28-hermes-workspace-always-on-merge-readiness-plan.md`
Scope: Task 1 baseline only — no code fixes or broad formatting performed.

## Command results

| Command | Exit code |
|---|---:|
| `node --check scripts/mission-control-always-on-policy-gauntlet.mjs` | 0 |
| `pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand` | 0 |
| `pnpm vitest run` | 0 |
| `pnpm build` | 0 |
| `git diff --check` | 0 |
| `systemctl --user is-active hermes-workspace.service` | 0 |
| `curl -fsS http://localhost:3456/ >/tmp/hermes-workspace-merge-readiness-smoke.html` | 0 |
| `pnpm exec eslint <changed Always-On subset>` | 1 |
| `pnpm exec tsc --noEmit --pretty false` | 2 |

## Git state

### `git status --short --branch`

```text
## my-hermes-workspace-dev...origin/my-hermes-workspace-dev
 M docs/handoff/current-slice-status.md
 M docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md
 M src/lib/projects-api.ts
 M src/lib/projects-view-model.test.ts
 M src/lib/projects-view-model.ts
 M src/screens/projects/project-detail-screen.test.ts
 M src/screens/projects/project-detail-screen.tsx
 M src/screens/projects/work-item-detail-screen.test.ts
 M src/screens/projects/work-item-detail-screen.tsx
 M src/server/production-e2e-work-item-workflow-script.test.ts
 M src/server/project-branch-manager.test.ts
 M src/server/project-branch-manager.ts
 M src/server/project-route.test.ts
 M src/server/projects-store.test.ts
 M src/server/projects-store.ts
 M src/server/work-item-merge-healer.test.ts
 M src/server/work-item-merge-healer.ts
 M src/server/work-item-notification-digest.test.ts
 M src/server/work-item-notification-digest.ts
 M src/server/work-item-recovery-actions.test.ts
 M src/server/work-item-recovery-actions.ts
 M src/server/work-item-run-timeline.test.ts
 M src/server/work-item-run-timeline.ts
 M src/server/work-item-supervisor.test.ts
 M src/server/work-item-supervisor.ts
 M src/server/work-items-store.ts
?? docs/plans/2026-04-28-hermes-workspace-always-on-merge-readiness-plan.md
?? docs/plans/2026-04-28-hermes-workspace-always-on-operator-policy-plan.md
?? dogfood-output/always-on-policy-gauntlet-2026-04-28T15-24-37-060Z.md
?? dogfood-output/always-on-policy-gauntlet-latest.md
?? scripts/mission-control-always-on-policy-gauntlet.mjs
```

### `git diff --stat`

```text
docs/handoff/current-slice-status.md               |  88 ++---
 ...e-dream-mission-control-implementation-index.md |  34 +-
 src/lib/projects-api.ts                            |  51 +++
 src/lib/projects-view-model.test.ts                | 122 +++++++
 src/lib/projects-view-model.ts                     | 128 ++++++++
 src/screens/projects/project-detail-screen.test.ts |  16 +
 src/screens/projects/project-detail-screen.tsx     | 125 ++++++++
 .../projects/work-item-detail-screen.test.ts       |  33 ++
 src/screens/projects/work-item-detail-screen.tsx   |  26 ++
 ...roduction-e2e-work-item-workflow-script.test.ts | 145 +++++++++
 src/server/project-branch-manager.test.ts          | 357 +++++++++++++++++++++
 src/server/project-branch-manager.ts               | 337 +++++++++++++++++++
 src/server/project-route.test.ts                   |  70 +++-
 src/server/projects-store.test.ts                  | 187 ++++++++++-
 src/server/projects-store.ts                       | 174 +++++++++-
 src/server/work-item-merge-healer.test.ts          |  55 ++++
 src/server/work-item-merge-healer.ts               |  28 +-
 src/server/work-item-notification-digest.test.ts   | 140 +++++++-
 src/server/work-item-notification-digest.ts        | 141 +++++++-
 src/server/work-item-recovery-actions.test.ts      |  29 +-
 src/server/work-item-recovery-actions.ts           |  18 ++
 src/server/work-item-run-timeline.test.ts          |   4 +-
 src/server/work-item-run-timeline.ts               |   9 +-
 src/server/work-item-supervisor.test.ts            | 245 +++++++++++++-
 src/server/work-item-supervisor.ts                 | 211 ++++++++++++
 src/server/work-items-store.ts                     |  21 ++
 26 files changed, 2697 insertions(+), 97 deletions(-)
```

### `git diff --name-only`

```text
docs/handoff/current-slice-status.md
docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md
src/lib/projects-api.ts
src/lib/projects-view-model.test.ts
src/lib/projects-view-model.ts
src/screens/projects/project-detail-screen.test.ts
src/screens/projects/project-detail-screen.tsx
src/screens/projects/work-item-detail-screen.test.ts
src/screens/projects/work-item-detail-screen.tsx
src/server/production-e2e-work-item-workflow-script.test.ts
src/server/project-branch-manager.test.ts
src/server/project-branch-manager.ts
src/server/project-route.test.ts
src/server/projects-store.test.ts
src/server/projects-store.ts
src/server/work-item-merge-healer.test.ts
src/server/work-item-merge-healer.ts
src/server/work-item-notification-digest.test.ts
src/server/work-item-notification-digest.ts
src/server/work-item-recovery-actions.test.ts
src/server/work-item-recovery-actions.ts
src/server/work-item-run-timeline.test.ts
src/server/work-item-run-timeline.ts
src/server/work-item-supervisor.test.ts
src/server/work-item-supervisor.ts
src/server/work-items-store.ts
```

## Functional gates to preserve

- `node --check scripts/mission-control-always-on-policy-gauntlet.mjs` ✅ exit 0.
- Focused Always-On policy contract test ✅ exit 0: 1 file / 19 tests passed.
- `pnpm vitest run` ✅ exit 0: 72 files / 464 tests passed.
- `pnpm build` ✅ exit 0 with existing Vite sourcemap/dynamic-import/chunk-size warnings only.
- `git diff --check` ✅ exit 0.
- `systemctl --user is-active hermes-workspace.service` ✅ active.
- Root smoke `curl -fsS http://localhost:3456/` ✅ exit 0, wrote `/tmp/hermes-workspace-merge-readiness-smoke.html` (10,749 bytes observed).

## Changed-file ESLint baseline

Command: `pnpm exec eslint src/server/projects-store.ts src/server/work-item-supervisor.ts src/server/work-item-notification-digest.ts src/server/project-branch-manager.ts src/server/work-item-merge-healer.ts src/server/work-item-run-timeline.ts src/lib/projects-view-model.ts src/screens/projects/project-detail-screen.tsx src/screens/projects/work-item-detail-screen.tsx scripts/mission-control-always-on-policy-gauntlet.mjs`

Result: ❌ exit 1. ESLint reported: `117 problems (116 errors, 1 warning)`.

Per changed implementation file:

- `src/lib/projects-view-model.ts`: 6 issues
- `src/screens/projects/project-detail-screen.tsx`: 31 issues
- `src/screens/projects/work-item-detail-screen.tsx`: 24 issues
- `src/server/project-branch-manager.ts`: 22 issues
- `src/server/projects-store.ts`: 3 issues
- `src/server/work-item-merge-healer.ts`: 6 issues
- `src/server/work-item-notification-digest.ts`: 9 issues
- `src/server/work-item-run-timeline.ts`: 6 issues
- `src/server/work-item-supervisor.ts`: 10 issues

Representative blocker classes:

- `import/consistent-type-specifier-style` — split inline `type` specifiers into top-level `import type` statements.
- `sort-imports` / `import/order` — sort import members and type import ordering.
- `@typescript-eslint/array-type` — use `Array<T>` instead of `T[]` in changed files.
- `@typescript-eslint/no-unnecessary-condition` — remove optional chains/nullish fallbacks now considered unnecessary by current types.
- `@typescript-eslint/naming-convention` — rename narrow generic parameter `K` to a repo-compliant `T...` name.
- `no-shadow` warning in `src/server/projects-store.ts` around nested `project` variable.

Full raw log: `/tmp/hermes-task1-eslint-changed.log`.

## TypeScript baseline

Command: `pnpm exec tsc --noEmit --pretty false`

Result: ❌ exit 2. Parsed `257` TypeScript error lines from the captured output.

Changed Always-On file/test matches to fix or classify first:

- `src/lib/projects-view-model.test.ts`: 2 error lines
- `src/screens/projects/project-detail-screen.test.ts`: 1 error lines
- `src/screens/projects/project-detail-screen.tsx`: 4 error lines
- `src/screens/projects/work-item-detail-screen.test.ts`: 2 error lines
- `src/screens/projects/work-item-detail-screen.tsx`: 93 error lines
- `src/server/project-autonomy-lane.test.ts`: 2 error lines
- `src/server/project-route.test.ts`: 9 error lines
- `src/server/projects-store.test.ts`: 1 error lines
- `src/server/work-item-supervisor-routes.test.ts`: 9 error lines

Representative changed-file errors:

```text
src/lib/projects-view-model.test.ts(22,8): error TS2459: Module '"./projects-view-model"' declares 'ProjectSummary' locally, but it is not exported.
src/lib/projects-view-model.test.ts(23,8): error TS2459: Module '"./projects-view-model"' declares 'WorkItemRecord' locally, but it is not exported.
src/screens/projects/project-detail-screen.test.ts(247,11): error TS2739: Type '{ id: string; projectId: string; title: string; description: string; status: "inbox"; phase: "research"; priority: "medium"; riskLevel: "medium"; labels: never[]; repoPathSnapshot: string; sessionKeys: never[]; ... 7 more ...; updatedAt: string; }' is missing the following properties from type 'WorkItemRecord': sourceSuggestionEvidence, reviewQualityGateReasons, reviewMissingEvidence
src/screens/projects/project-detail-screen.tsx(817,21): error TS2353: Object literal may only specify known properties, and 'projectId' does not exist in type 'ProjectProfileWorkflowPolicySavePayload'.
src/screens/projects/project-detail-screen.tsx(989,26): error TS18048: 'form.acceptanceCriteria' is possibly 'undefined'.
src/screens/projects/project-detail-screen.tsx(1011,26): error TS18048: 'form.labels' is possibly 'undefined'.
src/screens/projects/project-detail-screen.tsx(1033,26): error TS18048: 'form.notes' is possibly 'undefined'.
src/screens/projects/work-item-detail-screen.test.ts(451,9): error TS2353: Object literal may only specify known properties, and 'phase' does not exist in type 'Pick<WorkItemRunTimelineRow, "sessionKey" | "jobId" | "runId" | "sessionKeyPrefix">'.
src/screens/projects/work-item-detail-screen.test.ts(466,9): error TS2353: Object literal may only specify known properties, and 'phase' does not exist in type 'Pick<WorkItemRunTimelineRow, "sessionKey" | "jobId" | "runId" | "sessionKeyPrefix">'.
src/screens/projects/work-item-detail-screen.tsx(63,8): error TS2724: '"@/lib/work-item-execution-api"' has no exported member named 'WorkItemLifecycleAction'. Did you mean 'applyWorkItemLifecycleAction'?
src/screens/projects/work-item-detail-screen.tsx(217,7): error TS2741: Property '"project-runtime-profile"' is missing in type '{ 'work-item-assigned-profile': string; 'project-phase-profile': string; 'project-autopilot-policy': string; default: string; none: string; }' but required in type 'Record<ProfileReadinessSource, string>'.
src/screens/projects/work-item-detail-screen.tsx(686,9): error TS2322: Type 'string' is not assignable to type '"build" | "research" | "review" | "deploy" | undefined'.
src/screens/projects/work-item-detail-screen.tsx(734,31): error TS18047: 'workItem' is possibly 'null'.
src/screens/projects/work-item-detail-screen.tsx(734,31): error TS2345: Argument of type '{}' is not assignable to parameter of type 'string'.
src/screens/projects/work-item-detail-screen.tsx(951,37): error TS2339: Property 'runTimeline' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(964,22): error TS18047: 'workItem' is possibly 'null'.
src/screens/projects/work-item-detail-screen.tsx(976,5): error TS2322: Type 'string | undefined' is not assignable to type '"build" | "research" | "review" | "deploy" | undefined'.
src/screens/projects/work-item-detail-screen.tsx(977,5): error TS2322: Type 'string' is not assignable to type '"done" | "active" | "ready" | "inbox" | "blocked" | "cancelled"'.
src/screens/projects/work-item-detail-screen.tsx(980,46): error TS2322: Type 'string' is not assignable to type '"done" | "active" | "ready" | "inbox" | "blocked" | "cancelled"'.
src/screens/projects/work-item-detail-screen.tsx(980,71): error TS2322: Type 'string | undefined' is not assignable to type '"build" | "research" | "review" | "deploy" | undefined'.
src/screens/projects/work-item-detail-screen.tsx(992,9): error TS2322: Type 'string' is not assignable to type '"done" | "active" | "ready" | "inbox" | "blocked" | "cancelled"'.
src/screens/projects/work-item-detail-screen.tsx(993,9): error TS2322: Type 'string | undefined' is not assignable to type '"build" | "research" | "review" | "deploy" | undefined'.
src/screens/projects/work-item-detail-screen.tsx(996,33): error TS2339: Property 'blockedReason' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1008,69): error TS2339: Property 'latestPlanningDraft' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1009,75): error TS2559: Type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }' has no properties in common with type 'Pick<WorkItemRecord, "baseBranch" | "branchName" | "mergeCommit" | "mergeTargetBranch" | "mergeTestCommand" | "mergeTestPassed" | "mergeArtifactPaths">'.
src/screens/projects/work-item-detail-screen.tsx(1014,30): error TS2345: Argument of type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }' is not assignable to parameter of type '{ title: string; description: string; priority: string; riskLevel: string; labels: string[]; acceptanceCriteria: string[]; notes: string[]; planFilePath?: string | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1017,39): error TS2345: Argument of type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }' is not assignable to parameter of type '{ status: WorkItemStatus; phase: "build" | "research" | "review" | "deploy" | undefined; planFilePath?: string | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1023,5): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type '"build" | "research" | "review" | "deploy" | undefined'.
src/screens/projects/work-item-detail-screen.tsx(1081,25): error TS2322: Type '{}' is not assignable to type 'ReactNode'.
src/screens/projects/work-item-detail-screen.tsx(1085,27): error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'Record<WorkItemStatus, string>'.
src/screens/projects/work-item-detail-screen.tsx(1086,45): error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'Record<WorkItemPhase, string>'.
src/screens/projects/work-item-detail-screen.tsx(1087,27): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'Record<WorkItemPriority, string>'.
src/screens/projects/work-item-detail-screen.tsx(1087,62): error TS2339: Property 'priority' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1088,55): error TS2538: Type 'undefined' cannot be used as an index type.
src/screens/projects/work-item-detail-screen.tsx(1089,29): error TS2339: Property 'assignedProfile' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1089,64): error TS2339: Property 'assignedProfile' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1090,29): error TS2339: Property 'labels' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1090,41): error TS7006: Parameter 'label' implicitly has an 'any' type.
src/screens/projects/work-item-detail-screen.tsx(1094,73): error TS2339: Property 'title' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1096,29): error TS2339: Property 'description' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1314,29): error TS2339: Property 'labels' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1314,41): error TS7006: Parameter 'label' implicitly has an 'any' type.
src/screens/projects/work-item-detail-screen.tsx(1324,29): error TS2353: Object literal may only specify known properties, and 'labels' does not exist in type 'string[]'.
src/screens/projects/work-item-detail-screen.tsx(1324,46): error TS2339: Property 'labels' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1324,61): error TS7006: Parameter 'l' implicitly has an 'any' type.
src/screens/projects/work-item-detail-screen.tsx(1344,31): error TS2353: Object literal may only specify known properties, and 'labels' does not exist in type 'string[]'.
src/screens/projects/work-item-detail-screen.tsx(1344,52): error TS2339: Property 'labels' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1362,31): error TS2353: Object literal may only specify known properties, and 'labels' does not exist in type 'string[]'.
src/screens/projects/work-item-detail-screen.tsx(1362,52): error TS2339: Property 'labels' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1404,35): error TS7006: Parameter 'row' implicitly has an 'any' type.
src/screens/projects/work-item-detail-screen.tsx(1470,41): error TS2322: Type '{}' is not assignable to type 'string'.
src/screens/projects/work-item-detail-screen.tsx(1471,63): error TS2339: Property 'repoPathSnapshot' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1483,30): error TS2339: Property 'blockedReason' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1484,25): error TS7053: Element implicitly has an 'any' type because expression of type 'any' can't be used to index type 'Record<WorkItemBlockedReason, string>'.
src/screens/projects/work-item-detail-screen.tsx(1484,66): error TS2339: Property 'blockedReason' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1488,99): error TS2339: Property 'blockedReason' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1489,66): error TS2339: Property 'assignedProfile' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1490,79): error TS2538: Type 'undefined' cannot be used as an index type.
src/screens/projects/work-item-detail-screen.tsx(1491,64): error TS2339: Property 'planFilePath' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
src/screens/projects/work-item-detail-screen.tsx(1505,27): error TS2339: Property 'reviewJobId' does not exist on type '{ id: string; missionId?: string | undefined; missionJobId?: string | undefined; missionJobName?: string | undefined; missionSessionKeyPrefix?: string | undefined; missionLink?: string | undefined; ... 10 more ...; approvals?: Record<...>[] | undefined; }'.
```

Broad repo type debt / representative top paths (not all are changed Always-On files):

- `src/screens/projects/work-item-detail-screen.tsx`: 93 error lines
- `src/server/work-item-approvals.test.ts`: 19 error lines
- `src/server/autopilot-suggestions-routes.test.ts`: 18 error lines
- `src/server/profile-readiness-routes.test.ts`: 17 error lines
- `src/server/session-telemetry-routes.test.ts`: 12 error lines
- `src/server/execution-runs-routes.test.ts`: 9 error lines
- `src/server/project-route.test.ts`: 9 error lines
- `src/server/work-item-orchestrator-routes.test.ts`: 9 error lines
- `src/server/work-item-supervisor-routes.test.ts`: 9 error lines
- `src/server/attention-queue-routes.test.ts`: 6 error lines
- `src/server/work-item-approvals.ts`: 6 error lines
- `src/server/work-item-detail-route.test.ts`: 6 error lines
- `src/server/work-item-launch.test.ts`: 6 error lines
- `src/server/work-item-execution.ts`: 5 error lines
- `src/screens/projects/project-detail-screen.tsx`: 4 error lines
- `src/server/role-capacity-policy.test.ts`: 3 error lines
- `src/server/work-item-recovery-actions-routes.test.ts`: 3 error lines
- `src/lib/projects-view-model.test.ts`: 2 error lines
- `src/screens/dashboard/dashboard-screen.test.ts`: 2 error lines
- `src/screens/projects/work-item-detail-screen.test.ts`: 2 error lines

Known broad-debt patterns observed separately from Always-On stabilization:

- TanStack route handler test typing (`Route.options.server.handlers.*`) across multiple route tests.
- Existing fixture drift where `ProjectRecord` / `WorkItemRecord` added required fields but older tests omit them.
- Existing nullability strictness in work-item approvals/execution/lifecycle tests and helpers.

Full raw log: `/tmp/hermes-task1-tsc.log`.

## Task 2 starting point

Fix TypeScript blockers in changed Always-On implementation/tests before ESLint cleanup. Highest-yield starting files from this baseline:

1. `src/screens/projects/work-item-detail-screen.tsx` — 93 parsed error lines; likely narrowed partial payload where full `WorkItemRecord` is expected plus missing type imports/exports.
2. `src/lib/projects-view-model.test.ts` — imports `ProjectSummary` / `WorkItemRecord` from `projects-view-model` though the module does not export them.
3. `src/screens/projects/project-detail-screen.tsx` — save payload includes `projectId` not accepted by `ProjectProfileWorkflowPolicySavePayload`; form arrays maybe optional under current type narrowing.
4. `src/server/project-autonomy-lane.test.ts` — fixtures missing required `alwaysOn` inside `ProjectAutonomyLanePolicy`.
5. `src/server/project-route.test.ts` and route-handler test errors need classification: some are broad TanStack route test typing debt, but changed Always-On tests should be fixed if caused by new assertions.

## Acceptance status

Task 1 acceptance met: baseline report created with command exit codes, changed-file ESLint blockers, changed-file TypeScript blockers, and broad legacy lint/type debt classification.
