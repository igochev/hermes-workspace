# R10 Supervisor Profile Creation + Release Audit Launch Dogfood Report

## Summary

R10 is implemented and verified locally. The dedicated `supervisor` Hermes profile exists, is isolated under `/home/d3ni3/.hermes/profiles/supervisor`, has no profile gateway artifacts, and is configured for server-launched/read-only release audit work. Workspace release-audit launch logic now routes configured release audits through the mapped Supervisor profile, persists running audit execution evidence, parses structured Supervisor audit output, and refuses Builder fallback when the mapped Supervisor profile is missing.

## Live profile/config evidence

- Backup created before profile/config changes at `/home/d3ni3/.hermes/backups/hermes-workspace-r10/r10-supervisor-profile-20260501T193837Z`.
- `hermes profile list` showed `supervisor` as an isolated named profile.
- `hermes profile show supervisor` after final configuration:
  - Path: `/home/d3ni3/.hermes/profiles/supervisor`
  - Model/provider: `openai/gpt-4.1 (openrouter)`
  - Gateway: `stopped`
  - Alias: `/home/d3ni3/.local/bin/supervisor`
- Supervisor profile gateway artifacts verified absent:
  - `/home/d3ni3/.hermes/profiles/supervisor/gateway.pid`: absent
  - `/home/d3ni3/.hermes/profiles/supervisor/gateway.lock`: absent
  - `/home/d3ni3/.hermes/profiles/supervisor/logs/gateway.log`: absent
- `discord.enabled: false` remains set in `/home/d3ni3/.hermes/profiles/supervisor/config.yaml`.
- Supervisor SOUL defines read-only release audit boundaries and the required `SUPERVISOR_AUDIT_*` output contract.

## Implementation evidence

Changed files:

- `src/server/immediate-execution-launch.ts`
  - Adds `supervisor` to immediate execution roles.
- `src/server/work-item-release-audit-launch.ts`
  - Builds read-only Supervisor audit prompts.
  - Verifies mapped Supervisor profile availability before launch.
  - Launches release audit via `launchImmediateExecution` with `role: 'supervisor'` and the configured profile.
  - Persists running release-audit evidence on work items.
  - Parses `SUPERVISOR_AUDIT_*` structured output and records approved/veto/manual-review evidence.
- `src/server/work-item-orchestrator.ts`
  - Launches Supervisor release audit before Merge-Healer when release audit is required and a Supervisor profile is configured.
  - Syncs completed Supervisor audit execution output into durable release audit fields.
  - Persists explicit failed/manual-review audit state on launch/parse/execution failures.
  - Continues to block Merge-Healer until approved audit evidence exists.
- `src/server/work-item-release-audit-launch.test.ts`
  - Covers prompt contract, launch routing/persistence, missing-profile no-fallback, and structured output persistence.
- `src/server/work-item-orchestrator.test.ts`
  - Covers Supervisor audit launch before Merge-Healer under release-audit policy.

## Dry-run/live audit evidence

- Initial Supervisor dry-run using `gpt-5.5 (openai-codex)` failed because the Supervisor profile did not have usable Codex credentials:
  - `dogfood-output/supervisor-profile-live-dry-run-20260501T194516Z.txt`
- Supervisor was reconfigured via supported Hermes config commands to use the existing OpenRouter env credentials:
  - `hermes -p supervisor config set model.provider openrouter`
  - `hermes -p supervisor config set model.default openai/gpt-4.1`
- Successful read-only Supervisor dry-run output:
  - `dogfood-output/supervisor-profile-live-dry-run-20260501T194611Z.txt`
  - Decision: `APPROVED`
  - Confidence: `high`
  - Required actions: `none`

## Verification gates

Passed locally:

```bash
pnpm vitest run src/server/work-item-release-audit-launch.test.ts src/server/work-item-release-audit-gate.test.ts src/server/work-item-orchestrator.test.ts src/server/work-item-launch.test.ts --reporter=dot
# 3 files / 47 tests passed

pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run --reporter=dot
# 85 files / 574 tests passed
pnpm build
git diff --check

systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
# active

GET http://127.0.0.1:3456/
# 200, 10749 bytes
GET http://127.0.0.1:3456/api/status
# 200, 10870 bytes
```

## Notes / follow-up

- No Discord gateway was created for `supervisor`.
- `merge-healer` was not created.
- The first dry-run exposed a credential-isolation issue for Codex-backed worker profiles; R10 resolved this for Supervisor by switching the profile to OpenRouter using supported `hermes config set` commands rather than manually copying auth secrets.
- Backup artifacts containing auth/env material were kept outside the repo under `/home/d3ni3/.hermes/backups/hermes-workspace-r10/`.
