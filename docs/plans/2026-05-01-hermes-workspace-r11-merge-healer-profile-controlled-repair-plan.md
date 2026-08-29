# R11 Merge-Healer Profile Controlled Repair Plan

## CEO decision

Only after the release-lane package is clean and profile contracts/Supervisor are first-class should we create an AI-assisted `merge-healer` profile. The deterministic server Merge-Healer remains the safe default; the profile is for bounded conflict/test repair with evidence.

## Goal

Create and wire a dedicated `merge-healer` profile for controlled merge/rebase/test-failure repair, behind policy gates and safety budgets.

## In scope

- Inspect/backup profiles before creation.
- Create `merge-healer` profile via supported Hermes profile commands.
- Define a conservative SOUL/role contract: conflict repair, test rerun, evidence report, no unrelated refactor, no push without policy.
- Add Workspace policy flags for AI-assisted merge healing separate from deterministic merge.
- Add tests for safety: disabled by default, max attempts/budget, dirty repo detection, no Builder fallback, evidence artifacts required.
- Dry-run on a synthetic conflict fixture or controlled small branch, not an arbitrary live repo.

## Out of scope

- Do not make AI merge healing the default for all projects.
- Do not enable parallel worktrees.
- Do not create public messaging gateway.
- Do not silently push or force-push.

## Task sequence

1. Backup and inspect Hermes profile inventory.
2. Create/configure `merge-healer` profile if profile tooling is healthy.
3. Implement guarded Workspace launch/mapping and policy checks.
4. RED/GREEN tests for enabled/disabled/missing-profile/conflict paths.
5. Synthetic dry-run evidence.
6. Write `dogfood-output/merge-healer-profile-controlled-repair-latest.md` and update handoff to R12.

## Verification commands

```bash
hermes profile list
hermes profile show merge-healer
pnpm vitest run src/server/work-item-orchestrator.test.ts src/server/work-item-launch.test.ts src/server/work-item-branch-evidence-recovery.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run --reporter=dot
pnpm build
git diff --check
```

## Acceptance criteria

- `merge-healer` exists as a first-class isolated profile or the report records a precise blocker.
- AI-assisted merge healing is disabled by default and separately gated from deterministic server merge.
- Tests prove no Builder fallback, bounded attempts, dirty-repo protections, and required evidence artifacts.
- Synthetic dry-run evidence is recorded.
- Handoff advances to R12 only after verified.
