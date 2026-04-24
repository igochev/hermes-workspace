# Hermes Workspace Runtime/API Regression Debug Handoff (2026-04-24)

## Scope
Urgent regression investigation for runtime failures reported on:
- `/operations` (`Dashboard index failed: 500`)
- sessions loading (`Failed to load sessions.`)
- `/jobs` (`Failed to fetch jobs: 500`)
- `/chat` warning banner (`Connection error`, `Dashboard index failed: 500`)

Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

## Exact reproduced symptoms
Reproduced via live API calls + service logs:

1. `GET /api/hermes-jobs` returned `500`:
```json
{"status":500,"unhandled":true,"message":"HTTPError"}
```
2. `GET /api/sessions` returned `500`:
```json
{"error":"Dashboard index failed: 500"}
```
3. `GET http://127.0.0.1:9119/` returned `500 Internal Server Error` while `GET /api/status` returned `200`.
4. `journalctl --user -u hermes-workspace.service` showed repeated unhandled throws from `fetchDashboardToken` / `dashboardFetch` with `Dashboard index failed: 500`.
5. `journalctl --user -u hermes-dashboard.service` showed the root dashboard failure source:
   - `FileNotFoundError: ... /home/d3ni3/hermes-agent/hermes_cli/web_dist/index.html`

## Confirmed root cause
Shared backend bootstrap mismatch:

- Hermes Workspace considered dashboard mode available when `dashboard /api/status` returned `200`.
- But token bootstrap for protected dashboard APIs requires dashboard root HTML (`/`) to load and include `window.__HERMES_SESSION_TOKEN__`.
- In current Hermes dashboard runtime, `/` fails (`500`) due missing `web_dist/index.html` in the dashboard service environment.
- Result: any Workspace route using `dashboardFetch` for protected APIs crashed at token fetch stage, causing the observed cross-page failures.

In short: **dashboard availability probing was too optimistic** for this runtime state.

## Causality assessment (Hermes 0.11 / profile changes)
- Primary cause: dashboard runtime/package/deploy mismatch (dashboard root broken while `/api/status` remains healthy), not a frontend-only issue.
- Triggered through Workspace capability-probing assumptions.
- Not directly caused by Builder profile logic itself.
- Consistent with Hermes runtime evolution introducing a capability/bootstrap mismatch path.

## Files changed
1. `src/server/gateway-capabilities.ts`
   - Hardened `probeDashboard()` to require successful dashboard token bootstrap.
   - If token bootstrap fails, dashboard is now marked unavailable and Workspace falls back to gateway-compatible behavior.
2. `src/server/gateway-capabilities.test.ts` (new)
   - Added regression coverage:
     - dashboard `/api/status`=200 + root token bootstrap failure => `dashboard.available=false`
     - normal status + token bootstrap success => `dashboard.available=true`

## Tests/build/run verification

### Targeted tests
```bash
pnpm vitest run src/server/gateway-capabilities.test.ts
```
Result: PASS (2/2)

### Build
```bash
pnpm build
```
Result: PASS

### Service restart
```bash
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```
Result: `active`

## Live runtime verification after fix

### Capabilities/pathing
`GET /api/gateway-status` now returns:
- `dashboard.available: false`
- `mode: portable`
- `jobs: true`
- `sessions: false`

This is expected and prevents the broken dashboard token path from being used.

### Symptom endpoints
- `GET /api/hermes-jobs` -> `200` (`{"jobs":[]}`)
- `GET /api/sessions` -> `200` with graceful unavailable payload (no 500)
- `GET /api/connection-status` -> `200`, status connected/portable (no dashboard-index throw)

### Logs
After rebuild/restart and endpoint verification, no new `Dashboard index failed: 500` unhandled throws appeared in Workspace logs.

## Remaining risk / follow-up
1. Upstream/local Hermes dashboard service still has root SPA asset issue (`web_dist/index.html` missing). Workspace now degrades safely, but dashboard service itself should still be repaired separately.
2. Sessions in this runtime remain unavailable through gateway (`/api/sessions` unsupported), so UI correctly degrades to unavailable/empty state rather than failing.
3. If dashboard root is fixed later, Workspace should automatically return to dashboard mode (`zero-fork`) on next capability probe.
