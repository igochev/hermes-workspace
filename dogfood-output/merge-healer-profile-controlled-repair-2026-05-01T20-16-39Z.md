# R11 Merge-Healer Profile Controlled Repair Dogfood Report

## Summary

R11 is implemented and verified locally. The dedicated `merge-healer` Hermes profile exists under `/home/d3ni3/.hermes/profiles/merge-healer`, was created through the supported Hermes profile workflow by cloning the R10 `supervisor` baseline, keeps the R10 `supervisor` profile preserved, and has no public gateway enabled. Workspace AI-assisted merge healing is now opt-in behind `ProjectAutonomyLanePolicy.aiMergeHealing`; deterministic server Merge-Healer remains the safe default. When enabled and mapped, AI repair launches only through the configured `merge-healer` profile after profile/readiness, budget, clean-repo, and evidence checks, and it refuses Builder fallback.

## Backup/profile evidence

- Pre-profile/config backup exists at `/home/d3ni3/.hermes/backups/hermes-workspace-r11/r11-pre-merge-healer-profile-20260501T200304Z`.
- `hermes profile list` shows:
  - `merge-healer` — model `openai/gpt-4.1`, gateway `stopped`, alias `merge-healer`.
  - `supervisor` — model `openai/gpt-4.1`, gateway `stopped`, alias `supervisor`.
- `hermes profile show merge-healer` verified:
  - Path: `/home/d3ni3/.hermes/profiles/merge-healer`
  - Model/provider: `openai/gpt-4.1 (openrouter)`
  - Gateway: `stopped`
  - `.env`: exists
  - `SOUL.md`: exists
  - Alias: `/home/d3ni3/.local/bin/merge-healer`
- Gateway isolation checks passed in `dogfood-output/merge-healer-profile-readiness-20260501T201639Z.json`:
  - `discord.enabled: false`
  - `gateway.discord.enabled: false`
  - `gateway.telegram.enabled: false`
  - `gateway.slack.enabled: false`
  - `mergeHealerGatewayStopped: true`
- `SOUL.md` now defines a constrained Merge-Healer contract: bounded conflict/test repair only, no unrelated refactor, no pushes, no deploys, no profile or gateway changes, and explicit evidence reporting.

## Implementation evidence

Changed files:

- `src/server/projects-store.ts`
  - Adds `ProjectAiMergeHealingPolicy` with disabled-by-default normalization.
  - Adds optional `autonomyLanePolicy.aiMergeHealing` patch/normalization support while preserving existing records/fixtures.
- `src/server/execution-runs-store.ts`
  - Adds `merge-healer` to durable execution run roles.
- `src/server/immediate-execution-launch.ts`
  - Adds `merge-healer` to immediate execution launch roles.
- `src/server/work-item-orchestrator.ts`
  - Adds controlled AI Merge-Healer repair launch after deterministic Merge-Healer blocks autonomous completion.
  - Requires mapped `runtimeProfiles.mergeHealerProfile` and verifies the profile exists with `listProfiles()`.
  - Enforces opt-in enablement, per-work-item attempt budget, clean-repo readiness, and deterministic conflict/test evidence before launch.
  - Launches via `launchImmediateExecution({ role: 'merge-healer', profile: <mapped profile> })` and records `/executions/<id>` evidence on the blocked work item.
  - Refuses fallback to Builder when mapping/profile readiness fails.
- `src/server/work-item-orchestrator.test.ts`
  - Covers disabled-by-default behavior, successful mapped-profile launch, missing-profile no-fallback, exhausted budget, dirty repo readiness block, and missing evidence block.

## Controlled dry-run evidence

- Readiness evidence: `dogfood-output/merge-healer-profile-readiness-20260501T201639Z.json`
  - All readiness checks passed: profile exists, Supervisor preserved, profile gateway stopped, Discord/Telegram/Slack gateway config disabled, SOUL contract present.
- Synthetic profile-routed dry-run: `dogfood-output/merge-healer-profile-synthetic-dry-run-20260501T201619Z.txt`
  - Command routed through `hermes -p merge-healer chat -q ...`.
  - The prompt explicitly prohibited file edits, command execution, gateways, pushes, and profile changes.
  - Output marker: `MERGE_HEALER_REPAIR_DECISION: manual_review`
  - Output marker: `SAFETY_BOUNDARIES_CONFIRMED: yes`
- No arbitrary live repository repair was launched; the R11 plan scoped dry-run evidence to a synthetic/controlled fixture rather than an arbitrary live repo.

## Verification gates

Passed locally:

```bash
pnpm vitest run src/server/work-item-orchestrator.test.ts --reporter=dot
# 1 file / 30 tests passed

pnpm vitest run src/server/work-item-orchestrator.test.ts src/server/work-item-launch.test.ts src/server/work-item-branch-evidence-recovery.test.ts --reporter=dot
# 3 files / 56 tests passed

pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run --reporter=dot
# 85 files / 579 tests passed
pnpm build
git diff --check
```

## Notes / follow-up

- No Discord gateway was created for `merge-healer`.
- The R10 `supervisor` profile remains present and stopped.
- AI-assisted merge healing remains disabled by default; projects must explicitly map `runtimeProfiles.mergeHealerProfile` and enable `autonomyLanePolicy.aiMergeHealing.enabled` before the profile can launch.
- The controlled launch path intentionally leaves the work item blocked until repair evidence is reviewed; deterministic Merge-Healer remains authoritative for final merge completion.
- Backup artifacts containing auth/env material remain outside the repo under `/home/d3ni3/.hermes/backups/hermes-workspace-r11/`.
