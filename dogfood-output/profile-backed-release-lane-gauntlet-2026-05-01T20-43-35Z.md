# R12 Profile-Backed Release Lane Gauntlet Report

**Verdict:** BLOCKED — go/no-go: **NO-GO for broader profile-backed release automation until the local R9/R10/R11 batch package is committed/stashed/otherwise checkpointed so the canonical repo path is clean.**

**Work item:** `97e69d95-f9f0-497f-9215-ab4686983431` — R12: Profile-Backed Release Lane Gauntlet
**Project:** `46b401f9-9243-472f-b5b7-04bf34596906` — Mission Control Demo
**Observed at:** 2026-05-01T20:43:35Z

## What was executed

1. Verified existing release profiles:
   - `supervisor` exists, model `openai/gpt-4.1`, gateway `stopped`.
   - `merge-healer` exists, model `openai/gpt-4.1`, gateway `stopped`.
2. Backed up live Workspace JSON before mutations:
   - `/home/d3ni3/.hermes/backups/hermes-workspace-r12/profile-backed-release-lane-gauntlet-20260501T204104Z/projects.json`
   - `/home/d3ni3/.hermes/backups/hermes-workspace-r12/profile-backed-release-lane-gauntlet-20260501T204104Z/work-items.json`
3. Updated the live project through the supported project PATCH API with profile-backed release-lane policy:
   - `runtimeProfiles.supervisorProfile = supervisor`
   - `runtimeProfiles.mergeHealerProfile = merge-healer`
   - `autonomyLanePolicy.enabled = true`
   - `autonomyLanePolicy.releaseAudit = { required: true, requiredRiskLevels: [medium, high], supervisorRequired: true }`
   - `autonomyLanePolicy.aiMergeHealing.enabled = false` (R11 default-safe policy preserved)
   - always-on retry, PR publishing, and cleanup remain disabled/manual/dry-run.
4. Called the autonomous reconcile endpoint for the controlled R12 work item:
   - `POST /api/work-items/orchestrator/reconcile?workItemId=97e69d95-f9f0-497f-9215-ab4686983431`

## Reconcile result

The lane correctly refused to launch Builder because branch switching in the canonical repo path is unsafe while the repo contains uncommitted R9/R10/R11 batch artifacts.

```json
{
  "checked": 1,
  "changed": 0,
  "blocked": true,
  "events": [
    {
      "action": "noop",
      "statusBefore": "ready",
      "phaseBefore": "build",
      "statusAfter": "ready",
      "phaseAfter": "build",
      "message": "Builder auto-launch blocked: Refusing to switch to mission/97e69d95-r12-profile-backed-release-lane-gauntlet: canonical repo path is dirty (docs/handoff/current-slice-status.md, docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md, src/server/execution-runs-store.ts, src/server/immediate-execution-launch.ts, src/server/projects-store.ts, src/server/work-item-orchestrator.test.ts, src/server/work-item-orchestrator.ts, dogfood-output/merge-healer-profile-controlled-repair-2026-05-01T20-16-39Z.md, dogfood-output/merge-healer-profile-controlled-repair-latest.md, dogfood-output/merge-healer-profile-readiness-20260501T201639Z.json, dogfood-output/merge-healer-profile-synthetic-dry-run-20260501T201619Z.txt, dogfood-output/supervisor-profile-audit-launch-2026-05-01T19-48-30Z.md, dogfood-output/supervisor-profile-audit-launch-latest.md, dogfood-output/supervisor-profile-live-dry-run-20260501T194516Z.txt, dogfood-output/supervisor-profile-live-dry-run-20260501T194611Z.txt, src/server/work-item-release-audit-launch.test.ts, src/server/work-item-release-audit-launch.ts)."
    }
  ]
}
```

## API/UI evidence

API after restart showed the profile-backed release lane policy is live on the project:

- `runtimeProfiles`: `{ mergeHealerProfile: "merge-healer", supervisorProfile: "supervisor" }`
- `releaseAudit`: `{ required: true, requiredRiskLevels: ["medium", "high"], supervisorRequired: true }`
- `aiMergeHealing`: disabled by default with a one-attempt clean-repo/evidence-gated policy.

Browser verification on `/projects/46b401f9-9243-472f-b5b7-04bf34596906/work-items/97e69d95-f9f0-497f-9215-ab4686983431` confirmed the Work Item detail UI exposes:

- R12 work item title and `Ready / Build` state.
- Builder preflight ready.
- Merge-Healer preflight: `merge-healer` project runtime mapping, ready, release-role contract visible, no Builder fallback.
- Supervisor preflight: `supervisor` project runtime mapping, ready, release-role contract visible, no Builder fallback.

Supervisor audit execution was **not launched** because the lane did not safely reach deploy/review-approved state; this is a correct safety stop, not a fake success.

Merge-Healer execution was **not launched** because the lane did not safely reach review/deploy with approved review evidence; this is a correct safety stop.

## Verification commands

Passed locally after the blocked gauntlet attempt:

- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec eslint . --max-warnings=0`
- `pnpm vitest run --reporter=dot` — 85 files / 579 tests passed
- `pnpm build` — passed with existing Vite sourcemap/dynamic-import/chunk warnings
- `git diff --check`
- `systemctl --user restart hermes-workspace.service`
- `systemctl --user is-active hermes-workspace.service` → `active`
- root smoke `http://127.0.0.1:3456/` → 10749 bytes

## Recommendation

Before retrying R12, Main/D3n13r should authorize packaging/committing or named-stashing the local R9/R10/R11 batch artifacts. Then rerun the same R12 gauntlet against the clean canonical repo path. Do **not** broaden always-on/profile-backed release automation yet.
