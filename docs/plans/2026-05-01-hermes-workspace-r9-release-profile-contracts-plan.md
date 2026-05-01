# R9 Release Profile Contracts + Workspace Mapping Plan

## CEO decision

After R8 creates a clean release-lane baseline, define the first-class release profile contracts before touching live Hermes profile directories. This prevents ad-hoc `merge-healer` creation, Builder fallback, and unclear permissions.

## Goal

Add product/code contracts for dedicated release roles: `merge-healer`, `deployer` if still needed as a separate role, and `supervisor`. The result should make Workspace know what each role is allowed to do and how readiness is represented, without creating runtime profiles yet.

## In scope

- Inspect existing phase/profile routing in `src/lib/conductor-phase-profiles.ts`, `src/server/work-item-launch.ts`, project policy types, and R7 profile-readiness matrix.
- Add/adjust typed role capability metadata for release roles.
- Add structured readiness/status representation for absent profiles: no hidden Builder fallback.
- Add tests proving missing `merge-healer`/`supervisor` blocks or marks readiness explicitly instead of aliasing to Builder.
- Update UI copy so the operator sees the missing profile contract and next action.
- Update docs/handoff to R10 after verified.

## Out of scope

- Do not create `/home/d3ni3/.hermes/profiles/merge-healer` or `/supervisor`.
- Do not install gateways or Discord listeners.
- Do not mutate `~/.hermes/config.yaml` or profile configs.
- Do not change always-on/retry/PR/cleanup policy defaults.

## Task sequence

1. RED tests for no Builder fallback and explicit missing release-profile readiness.
2. Implement typed role contract/readiness helpers.
3. Surface readiness in relevant API DTOs/UI areas.
4. Verify with focused tests and full gates.
5. Write `dogfood-output/release-profile-contracts-latest.md` plus timestamp.
6. Update handoff to R10.

## Verification commands

```bash
pnpm vitest run src/lib/conductor-phase-profiles.test.ts src/server/work-item-launch.test.ts src/screens/projects/work-item-detail-screen.test.ts --reporter=dot
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run --reporter=dot
pnpm build
git diff --check
```

## Acceptance criteria

- Workspace has explicit release-role contracts/readiness for `merge-healer` and `supervisor`.
- Tests prove missing roles never fall back to Builder.
- UI/API expose readiness truth without requiring the operator to read logs.
- No live Hermes profiles/gateways/configs are created or modified.
- Handoff advances to R10 only after R9 gates pass.
