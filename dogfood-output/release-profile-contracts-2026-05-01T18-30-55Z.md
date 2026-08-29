# R9 Release Profile Contracts — Dogfood Report

- **Repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- **Branch:** `my-hermes-workspace-dev`
- **Completed:** 2026-05-01T21:33:47+03:00
- **Plan:** `docs/plans/2026-05-01-hermes-workspace-r9-release-profile-contracts-plan.md`
- **Work item:** `c00e6b2a-8dc0-44b9-ad8d-686ee55c7aca`

## Verdict

**R9 release-profile contracts/readiness implemented and verified.**

Workspace now models release/runtime roles as explicit profile-readiness contracts instead of implicit strings or Builder fallback. `merge-healer` is represented as a first-class runtime-mapped release role, distinct from phase profiles, and all readiness reports carry operator-facing contract metadata.

No live Hermes profile directories, gateway listeners, or profile configs were created or modified.

## Implementation summary

- Added `merge-healer` to `ProfileReadinessRole` and included it in project/work-item readiness aggregation.
- Added exported `PROFILE_READINESS_ROLE_CONTRACTS` with labels, contracts, and capabilities for phase roles plus release/runtime roles.
- Extended `ProfileReadinessRoleReport` with:
  - `label`
  - `contract`
  - `capabilities`
- Added `ProjectRuntimeProfiles.mergeHealerProfile` to server persistence normalization and API DTO typing.
- Preserved Supervisor mapping behavior separately from Merge-Healer mapping.
- Updated work-item Profile Preflight UI/advisory copy to surface contract-backed readiness decisions and release-role readiness details.
- Updated project detail readiness labels/tests for `merge-healer`.
- Expanded tests to prove missing/unmapped runtime release profiles are explicit readiness states and do not fall back to Builder.

## No live-profile side effects

Checked the runtime profile directories after implementation:

```text
ABSENT /home/d3ni3/.hermes/profiles/merge-healer
ABSENT /home/d3ni3/.hermes/profiles/supervisor
ABSENT /home/d3ni3/.hermes/profiles/deployer
```

This satisfies the R9 boundary: contracts/readiness only, no profile creation, no gateways, no config mutation.

## Verification results

Commands run from `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`:

| Gate | Result |
|---|---|
| `pnpm vitest run src/server/profile-readiness.test.ts src/screens/projects/work-item-detail-screen.test.ts --reporter=dot` | ✅ pass |
| `pnpm vitest run src/lib/conductor-phase-profiles.test.ts src/server/work-item-launch.test.ts src/screens/projects/work-item-detail-screen.test.ts src/server/profile-readiness.test.ts --reporter=dot` | ✅ pass |
| `pnpm exec tsc --noEmit --pretty false` | ✅ pass |
| `pnpm exec eslint . --max-warnings=0` | ✅ pass |
| `pnpm vitest run --reporter=dot` | ✅ pass — 84 files / 569 tests |
| `pnpm build` | ✅ pass — existing Vite sourcemap/static+dynamic import warnings only |
| `git diff --check` | ✅ pass |
| Live profile directory check | ✅ no deployer/supervisor/merge-healer directories created |

## Files changed

- `src/server/profile-readiness.ts`
- `src/server/profile-readiness.test.ts`
- `src/server/projects-store.ts`
- `src/lib/projects-api.ts`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.test.ts`
- `src/screens/projects/project-detail-screen.tsx`
- `src/screens/projects/project-detail-screen.test.ts`
- `src/screens/projects/project-detail-screen.render.test.tsx`

## Next

Proceed to R10: `docs/plans/2026-05-01-hermes-workspace-r10-supervisor-profile-creation-audit-launch-plan.md`.
