# R10 Supervisor Profile Creation + Release Audit Launch Plan

## CEO decision

Create the first dedicated release profile only after R8/R9: Supervisor first, because it is read-only/audit-veto by design and R6 already made audit evidence durable and visible.

## Goal

Create and verify a first-class `supervisor` Hermes profile for Workspace-launched release audits, then wire Workspace to launch release audit through that profile under explicit policy gates.

## In scope

- Inspect live profile inventory with `hermes profile list` and `hermes profile show ...` before changes.
- Backup `~/.hermes` profile/config/auth-relevant files before profile creation.
- Create `supervisor` via supported Hermes profile commands only, with isolated home under `~/.hermes/profiles/supervisor`.
- Configure no Discord gateway by default; Workspace/server-launched only unless D3n13r explicitly requests messaging.
- Add/verify structured release audit prompt/output contract.
- Add tests for launch routing and persisted audit evidence.
- Run one safe dry-run/live audit against an existing release-lane work item or controlled fixture.

## Out of scope

- Do not create `merge-healer` yet.
- Do not grant Supervisor code mutation permissions.
- Do not enable broad always-on autonomy or retries.
- Do not copy secrets manually without verifying supported profile clone/export behavior.

## Task sequence

1. Backup profile state and inspect CLI/profile support.
2. Create/configure `supervisor` profile with read-only audit SOUL/contract.
3. Add Workspace mapping for release audit launch to Supervisor.
4. RED/GREEN tests for launch routing, structured parse, persisted evidence, and missing-profile errors.
5. Live dry-run/audit evidence with no code mutation.
6. Write `dogfood-output/supervisor-profile-audit-launch-latest.md` and update handoff to R11.

## Verification commands

```bash
hermes profile list
hermes profile show supervisor
pnpm vitest run src/server/work-item-release-audit-gate.test.ts src/server/work-item-orchestrator.test.ts src/server/work-item-launch.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run --reporter=dot
pnpm build
git diff --check
```

## Acceptance criteria

- `supervisor` exists as a first-class isolated Hermes profile or the report records a precise blocker.
- No Discord gateway is created unless owner explicitly authorizes it.
- Workspace routes release audit to Supervisor when configured and records audit evidence.
- Missing/failed Supervisor produces explicit blocked/manual-review state, not Builder fallback.
- Handoff advances to R11 only after verified.
