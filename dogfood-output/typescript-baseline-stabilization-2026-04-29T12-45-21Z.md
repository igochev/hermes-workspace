# Hermes Workspace — TypeScript Baseline Stabilization Report

- Timestamp (UTC): `2026-04-29T12-45-21Z`
- Command: `pnpm exec tsc --noEmit --pretty false 2>&1 | tee /tmp/hermes-workspace-tsc-baseline-stabilization.txt`
- Exit code: `2`
- Raw output: `/tmp/hermes-workspace-tsc-baseline-stabilization.txt`
- Output lines: `187`
- Parsed TypeScript errors: `131`
- Unique files with errors: `21`

## Unique error files

- `src/routes/api/work-items.$workItemId.ts` — 1 error(s), TS2345×1
- `src/screens/chat/hooks/use-session-events-refresh.ts` — 1 error(s), TS2322×1
- `src/server/attention-queue-routes.test.ts` — 6 error(s), TS18048×4, TS2339×2
- `src/server/autopilot-scout-prompts.test.ts` — 2 error(s), TS2353×2
- `src/server/autopilot-suggestions-routes.test.ts` — 18 error(s), TS18048×12, TS2339×6
- `src/server/hermes-jobs.ts` — 2 error(s), TS2322×1, TS2344×1
- `src/server/profile-readiness-routes.test.ts` — 17 error(s), TS18048×10, TS2322×2, TS2339×5
- `src/server/profile-readiness.test.ts` — 2 error(s), TS2322×2
- `src/server/role-capacity-policy.test.ts` — 3 error(s), TS18048×2, TS2339×1
- `src/server/session-telemetry-routes.test.ts` — 12 error(s), TS18048×8, TS2339×4
- `src/server/work-item-approvals.test.ts` — 19 error(s), TS18047×19
- `src/server/work-item-approvals.ts` — 6 error(s), TS18047×4, TS2322×1, TS2677×1
- `src/server/work-item-detail-route.test.ts` — 6 error(s), TS18048×4, TS2339×2
- `src/server/work-item-execution.ts` — 5 error(s), TS18047×5
- `src/server/work-item-launch.test.ts` — 6 error(s), TS2345×2, TS2739×2, TS2741×2
- `src/server/work-item-lifecycle.ts` — 2 error(s), TS2322×2
- `src/server/work-item-orchestrator-routes.test.ts` — 9 error(s), TS18048×6, TS2339×3
- `src/server/work-item-orchestrator.ts` — 1 error(s), TS2322×1
- `src/server/work-item-recovery-actions-routes.test.ts` — 3 error(s), TS18048×2, TS2339×1
- `src/server/work-item-recovery-actions.test.ts` — 1 error(s), TS2322×1
- `src/server/work-item-supervisor-routes.test.ts` — 9 error(s), TS18048×6, TS2339×3

## Error codes

- `TS18047` — 28
- `TS18048` — 54
- `TS2322` — 11
- `TS2339` — 27
- `TS2344` — 1
- `TS2345` — 3
- `TS2353` — 2
- `TS2677` — 1
- `TS2739` — 2
- `TS2741` — 2

## Error families and proposed order

### 1. TanStack route handler test typing

- Present files: `9`
- Parsed errors: `83`
- Notes: Repeated possibly-undefined `Route.options.server.handlers` plus missing GET/POST property types. Next task should apply the existing typed route-handler test helper/cast pattern.
- Files:
  - `src/server/attention-queue-routes.test.ts` — 6 error(s); first `TS18048` at 36:28: 'AttentionQueueRoute.options.server' is possibly 'undefined'.
  - `src/server/autopilot-suggestions-routes.test.ts` — 18 error(s); first `TS18048` at 59:28: 'SuggestionsRoute.options.server' is possibly 'undefined'.
  - `src/server/profile-readiness-routes.test.ts` — 17 error(s); first `TS2322` at 26:3: Type '{ id: string; name: string; slug: string; repoPath: string; repoUrl?: string | undefined; defaultBranch?: string | undefined; description?: string | undefined; phaseProfiles: ConductorPhaseProfiles; ... 5 more ...; updatedAt: string; }' is not assignable to type 'ProjectRecord'.
  - `src/server/role-capacity-policy.test.ts` — 3 error(s); first `TS18048` at 121:28: 'RoleCapacityPolicyRoute.options.server' is possibly 'undefined'.
  - `src/server/session-telemetry-routes.test.ts` — 12 error(s); first `TS18048` at 37:28: 'SessionTelemetryRoute.options.server' is possibly 'undefined'.
  - `src/server/work-item-detail-route.test.ts` — 6 error(s); first `TS18048` at 49:28: 'Route.options.server' is possibly 'undefined'.
  - `src/server/work-item-orchestrator-routes.test.ts` — 9 error(s); first `TS18048` at 46:28: 'WorkItemOrchestratorReconcileRoute.options.server' is possibly 'undefined'.
  - `src/server/work-item-recovery-actions-routes.test.ts` — 3 error(s); first `TS18048` at 88:12: 'WorkItemRecoveryActionsRoute.options.server' is possibly 'undefined'.
  - `src/server/work-item-supervisor-routes.test.ts` — 9 error(s); first `TS18048` at 62:28: 'WorkItemSupervisorReconcileRoute.options.server' is possibly 'undefined'.

### 2. Stale fixture normalization

- Present files: `6`
- Parsed errors: `47`
- Notes: Old fixture builders/literals are missing now-required normalized fields or use stale picked-policy fields; fix fixtures/tests, not production model types.
- Files:
  - `src/server/profile-readiness.test.ts` — 2 error(s); first `TS2322` at 8:3: Type '{ id: string; name: string; slug: string; repoPath: string; repoUrl?: string | undefined; defaultBranch?: string | undefined; description?: string | undefined; phaseProfiles: ConductorPhaseProfiles; ... 5 more ...; updatedAt: string; }' is not assignable to type 'ProjectRecord'.
  - `src/server/profile-readiness-routes.test.ts` — 17 error(s); first `TS2322` at 26:3: Type '{ id: string; name: string; slug: string; repoPath: string; repoUrl?: string | undefined; defaultBranch?: string | undefined; description?: string | undefined; phaseProfiles: ConductorPhaseProfiles; ... 5 more ...; updatedAt: string; }' is not assignable to type 'ProjectRecord'.
  - `src/server/work-item-launch.test.ts` — 6 error(s); first `TS2739` at 66:7: Type '{ id: string; name: string; slug: string; repoPath: string; repoUrl: string; defaultBranch: string; description: string; phaseProfiles: { research: string; build: string; review: string; deploy: string; }; reviewAutoApproval: { ...; }; autopilotPolicy: { ...; }; createdAt: string; updatedAt: string; }' is missing the following properties from type 'ProjectRecord': runtimeProfiles, autonomyLanePolicy
  - `src/server/work-item-recovery-actions.test.ts` — 1 error(s); first `TS2322` at 8:3: Type '{ id: string; dedupeKey: string; kind: AttentionKind; severity: AttentionSeverity; projectId: string; workItemId: string; ... 7 more ...; recommendedActions?: WorkItemRecoveryAction[] | undefined; }' is not assignable to type 'AttentionQueueItem'.
  - `src/server/work-item-approvals.test.ts` — 19 error(s); first `TS18047` at 55:12: 'first' is possibly 'null'.
  - `src/server/autopilot-scout-prompts.test.ts` — 2 error(s); first `TS2353` at 15:9: Object literal may only specify known properties, and 'enabled' does not exist in type 'Pick<ProjectAutopilotPolicy, "scoutSources" | "suggestionLimit">'.

### 3. Product-code nullability and API/type contracts

- Present files: `7`
- Parsed errors: `18`
- Notes: Real code needs narrowing/null handling/API normalization while preserving runtime semantics and partial PATCH safety.
- Files:
  - `src/routes/api/work-items.$workItemId.ts` — 1 error(s); first `TS2345` at 236:62: Argument of type '{ labels?: string[] | undefined; reviewMissingEvidence?: string[] | undefined; reviewQualityGateReasons?: string[] | undefined; reviewQualityGateStatus?: string | undefined; reviewParserError?: string | undefined; ... 24 more ...; title?: string | undefined; } | { ...; } | { ...; }' is not assignable to parameter of type 'Partial<Omit<WorkItemRecord, "id" | "updatedAt" | "projectId" | "createdAt">>'.
  - `src/screens/chat/hooks/use-session-events-refresh.ts` — 1 error(s); first `TS2322` at 68:7: Type 'number' is not assignable to type 'Timeout'.
  - `src/server/hermes-jobs.ts` — 2 error(s); first `TS2344` at 12:3: Type '"name" | "id" | "state" | "last_run_at" | "last_status" | "last_error" | "next_run_at"' does not satisfy the constraint 'keyof CronJob'.
  - `src/server/work-item-approvals.ts` — 6 error(s); first `TS2322` at 179:3: Type '({ approvalId: string; workItemId: string; workItemTitle: string; projectId: string; projectName: string; phase: WorkItemApprovalPhase; status: WorkItemApprovalStatus; ... 5 more ...; resolutionNotes: string | undefined; } | null)[]' is not assignable to type 'ApprovalInboxEntry[]'.
  - `src/server/work-item-execution.ts` — 5 error(s); first `TS18047` at 448:30: 'updated' is possibly 'null'.
  - `src/server/work-item-lifecycle.ts` — 2 error(s); first `TS2322` at 168:7: Type 'WorkItemApprovalRecord | null' is not assignable to type 'WorkItemApprovalRecord | undefined'.
  - `src/server/work-item-orchestrator.ts` — 1 error(s); first `TS2322` at 532:11: Type 'null' is not assignable to type 'string | undefined'.

## Next task

Task 2 — Route handler test helper cleanup. Start by inspecting the current passing route-test patterns in `src/server/morning-review-routes.test.ts` and `src/server/execution-runs-routes.test.ts`, then apply a small typed helper/cast pattern to the route handler test files listed above. After that, run:

```bash
pnpm test src/server/attention-queue-routes.test.ts src/server/autopilot-suggestions-routes.test.ts src/server/profile-readiness-routes.test.ts src/server/role-capacity-policy.test.ts src/server/session-telemetry-routes.test.ts src/server/work-item-detail-route.test.ts src/server/work-item-orchestrator-routes.test.ts src/server/work-item-recovery-actions-routes.test.ts src/server/work-item-supervisor-routes.test.ts -- --runInBand
pnpm exec tsc --noEmit --pretty false
```

## Guardrails

- Stabilization only; do not add product features.
- Avoid broad type weakening and broad formatting.
- Preserve `/api/work-items/$workItemId` partial PATCH safety when reaching product-code fixes.
