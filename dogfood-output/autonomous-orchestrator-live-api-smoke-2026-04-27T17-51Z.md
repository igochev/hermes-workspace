# Autonomous Orchestrator Task 14 — Live API Smoke

- Run timestamp: 2026-04-27T17:51Z
- Workspace repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Branch: `my-hermes-workspace-dev`
- Smoke project: `Mission Control Demo` (`46b401f9-9243-472f-b5b7-04bf34596906`)
- Smoke work item: `4659f5a0-4948-4f53-8e4d-412f33535ea9`
- Smoke run id: `autonomy-smoke-20260427T175044Z`
- Raw JSON evidence: `/tmp/hermes-autonomy-task14-smoke.json`

## Verification commands

```bash
pnpm test src/server/work-item-orchestrator.test.ts \
  src/server/work-item-orchestrator-routes.test.ts \
  src/server/hermes-job-output.test.ts \
  src/server/work-item-run-timeline.test.ts \
  src/server/work-item-detail-route.test.ts
```

Result: PASS — 5 files / 24 tests.

```bash
pnpm build
```

Result: PASS — production client + SSR build completed. Existing Vite sourcemap/chunk/dynamic-import warnings only.

```bash
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Result: PASS — service active.

```bash
curl -fsS http://127.0.0.1:3456/api/projects -o /tmp/hermes-projects.json
```

Result: PASS — HTTP 200, 6520 bytes.

## Live orchestrator API smoke

Created one temporary work item via `POST /api/work-items`:

- status/phase at creation: `inbox/research`
- repo path snapshot: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- no manual PATCH/lifecycle status or phase mutation was performed.

Called:

```bash
POST /api/work-items/orchestrator/reconcile?workItemId=4659f5a0-4948-4f53-8e4d-412f33535ea9
GET /api/work-items/4659f5a0-4948-4f53-8e4d-412f33535ea9?syncExecution=true
```

First reconcile response:

- `checked=1`
- `changed=1`
- event action: `launch_planner`
- planner job id: `0eac4b039e43`
- planning draft id: `89ef9e12-2418-45c5-8f2c-1f8eba8e9253`
- message: `Auto-launched Planner for inbox research work item.`

Detail/timeline response after reconcile:

| Phase | State | Job | Summary |
|---|---|---|---|
| research | running | `0eac4b039e43` | Planner is running. |
| build | not_started | — | No job launched |
| review | not_started | — | No job launched |
| deploy | not_started | — | No job launched |

Second reconcile idempotency check:

- `checked=1`
- `changed=0`
- event action: `noop`
- message: `No autonomous action available.`
- no duplicate Planner job launched while draft `89ef9e12-2418-45c5-8f2c-1f8eba8e9253` remained running.

## Verdict

Task 14 PASS. The live service exposes project/detail/timeline APIs and the autonomous reconcile endpoint launches Planner from a newly-created `inbox/research` work item without manual lifecycle/status/phase mutation. The detail API returns four timeline rows with live Planner evidence.

## Next

Task 15 remains: run the full real autonomous E2E against `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS` and require real candidate repo product/test diffs plus affected test output.
