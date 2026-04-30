# Real Executions Runtime Final Dogfood — 2026-04-30T06-18-00Z

## Verdict

**PASS** — the real ABACUS rough-idea path created a clickable `/executions/<executionId>` durable run, the execution detail page showed terminal runtime evidence and final response output, and the Scheduled Jobs list did not gain a new Work Item execution job.

## Environment

- Workspace repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Workspace branch/commit: `my-hermes-workspace-dev` / `d0edae3`
- Base URL: `http://127.0.0.1:3456`
- Project: `production-dogfood-family-command-center-abacus`
- Work item: `a77f3914-26cd-4cb0-b2dd-fc06eba33e7d`
- Execution: `7b217f97-691c-4976-a6f8-35041a26591b`
- Screenshot: `/home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_8a169dfa537a4f6d881ebb770c84d576.png`

## Live UI evidence

1. Created fresh real dogfood work item `a77f3914-26cd-4cb0-b2dd-fc06eba33e7d` titled `REAL Executions Runtime Dogfood real-exec-20260430T061006Z`.
2. Browser opened `/projects/production-dogfood-family-command-center-abacus/work-items/a77f3914-26cd-4cb0-b2dd-fc06eba33e7d`.
3. Work Item detail showed the primary CTA `Prepare Idea with Researcher`.
4. Triggering the CTA created `Open execution trace` pointing to `/executions/7b217f97-691c-4976-a6f8-35041a26591b`.
5. Browser opened `/executions/7b217f97-691c-4976-a6f8-35041a26591b` and showed:
   - state: `succeeded`;
   - role/phase: `planner` / `research`;
   - started: `2026-04-30T06:10:56.546Z`;
   - finished: `2026-04-30T06:14:00.905Z`;
   - final response present: `True`.
6. Browser console after execution-detail verification: no JS errors.

## API evidence

- `GET /api/work-items/a77f3914-26cd-4cb0-b2dd-fc06eba33e7d?syncExecution=true` saved to `dogfood-output/real-executions-runtime-final-work-item.json`.
- `GET /api/work-items/a77f3914-26cd-4cb0-b2dd-fc06eba33e7d/execution-runs` saved to `dogfood-output/real-executions-runtime-final-work-item-runs.json`.
- `GET /api/executions/7b217f97-691c-4976-a6f8-35041a26591b` saved to `dogfood-output/real-executions-runtime-final-execution.json`.

Execution run summary:

```json
{
  "id": "7b217f97-691c-4976-a6f8-35041a26591b",
  "workItemId": "a77f3914-26cd-4cb0-b2dd-fc06eba33e7d",
  "projectId": "production-dogfood-family-command-center-abacus",
  "role": "planner",
  "phase": "research",
  "engine": "hermes-session",
  "state": "succeeded",
  "jobId": null,
  "sessionKey": null,
  "startedAt": "2026-04-30T06:10:56.546Z",
  "finishedAt": "2026-04-30T06:14:00.905Z",
  "lastObservedAt": "2026-04-30T06:14:00.905Z",
  "summary": "Planner execution completed via immediate chat completion."
}
```

## Scheduled Jobs non-regression

- Jobs before launch: `['5e26a777bcd0', 'f5e71ec2a3f0']`
- Jobs after launch: `['5e26a777bcd0', 'f5e71ec2a3f0']`
- Added Scheduled Job IDs: `[]`

Result: **no new Scheduled Job-backed Work Item run was created**.

## Verification commands

- `pnpm test src/server/immediate-execution-launch.test.ts src/server/work-item-launch.test.ts src/server/work-item-planning.test.ts src/server/work-item-run-timeline.test.ts src/server/work-item-execution.test.ts src/screens/executions/execution-detail-screen.test.ts src/screens/projects/work-item-detail-screen.test.ts -- --runInBand` — PASS, 90 tests.
- `pnpm test src/routes/-root-layout-state.test.ts src/screens/executions/execution-detail-screen.test.ts -- --runInBand` — PASS, 8 tests.
- `pnpm exec tsc --noEmit --pretty false` — PASS.
- `pnpm exec eslint . --max-warnings=0` — PASS.
- `pnpm vitest run` — PASS, 82 files / 529 tests.
- `pnpm build` — PASS with existing Vite chunk/dynamic-import warnings.
- `git diff --check` — PASS.
- `systemctl --user restart hermes-workspace.service && systemctl --user is-active hermes-workspace.service` — PASS (`active`); initial curl immediately after restart had one transient connection-refused before retry succeeded, matching known service warm-up behavior.

## Fixes made during gauntlet

- Added direct `/v1/chat/completions` fallback for real immediate executions when the zero-fork gateway exposes chat completions but not `POST /api/sessions`.
- Fixed `/executions/:executionId` browser routing so a clicked execution trace renders the detail screen instead of the executions list.

## Notes

The run completed via immediate chat-completion fallback, not a Scheduled Job and not cron. The durable `ExecutionRunRecord` retains `engine: hermes-session`, `state: succeeded`, no `jobId`, and visible final response evidence.
