# Immediate Execution Observability Hardening — Main/CEO Review

Verdict: PASS after one Main review patch

Reviewed: 2026-04-30T12:56:42Z
Branch: my-hermes-workspace-dev
Base commit before package: 5f21b78

## Builder package accepted

Builder completed the Immediate Execution Observability Hardening plan with:

- immediate reviewer sync from `ExecutionRunRecord` before legacy Scheduled Job fallback;
- session streaming heartbeat/latest-output/final/failure state into durable execution records;
- Work Item timeline and Work Item cockpit rendering of latest output / final response;
- live dogfood evidence proving a normal Work Item Planner launch created `/executions/239bc80f-61b4-4b90-ad3c-2fd2ff1f3e13` and did not create a new Scheduled Job.

Builder final report: `dogfood-output/immediate-execution-observability-final-latest.md`.

## Main review blocker found and fixed

Independent review found one merge blocker before commit: normal immediate mission sync was still partly Scheduled-Job-centric. `syncWorkItemExecutionState(...)` could treat a `missionId` that was actually an immediate `ExecutionRunRecord.id` as a Scheduled Job candidate and rewrite Work Item fields toward legacy job-shaped links/state after `syncExecution=true`.

Main patch:

- added immediate mission run detection by `missionId` / `missionJobId` for `engine: 'hermes-session'`;
- skips legacy Hermes Job lookup when the mission is an immediate execution run;
- preserves `/executions/<executionRunId>` links, clears `missionJobId` / `missionJobName`, carries session key, last observed time, mission state, and error from the execution run;
- added regression test: `syncs normal immediate mission state from ExecutionRunRecord without rewriting it as a Scheduled Job`.

Focused re-review verdict: PASS. No remaining merge blockers.

## Verification rerun by Main

- `pnpm test src/server/work-item-execution.test.ts -- --runInBand` — PASS, 20 tests.
- `pnpm test src/server/work-item-execution.test.ts src/server/immediate-execution-launch.test.ts src/server/work-item-run-timeline.test.ts src/screens/executions/execution-detail-screen.test.ts -- --runInBand` — PASS.
- `pnpm vitest run` — PASS.
- `pnpm exec tsc --noEmit --pretty false` — PASS.
- `pnpm exec eslint . --max-warnings=0` — PASS.
- `pnpm build` — PASS with existing Vite dynamic-import/chunk warnings.
- `git diff --check` — PASS.
- `systemctl --user restart hermes-workspace.service` + `systemctl --user is-active hermes-workspace.service` — PASS (`active`).
- Root smoke `curl -fsS http://127.0.0.1:3456/` — PASS after readiness retry 2.
- Browser live check `/executions/239bc80f-61b4-4b90-ad3c-2fd2ff1f3e13` — PASS: route loaded as `Execution trace — Hermes`, engine evidence showed `hermes-session`, final output content rendered, browser console clean.

## Known non-blocking note

If Hermes session creation succeeds but the streaming chat endpoint itself is unavailable, immediate execution currently records a failed stream rather than falling back to non-streaming immediate chat completion. This is acceptable for this package and can be considered in a future resilience slice if it becomes noisy in dogfood.
