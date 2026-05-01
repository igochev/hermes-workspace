# R13 Profile Batch Package / Clean Baseline Report

**Verdict:** PASS — verified local R10/R11/R12 profile-backed release-lane artifacts were classified, gated, committed, pushed, and the canonical repo reached a clean synced baseline.

**Work item:** `8a076c35-501b-42f0-ab1b-ea35570502ef` — R13: Profile Batch Package / Clean Baseline
**Repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
**Branch:** `my-hermes-workspace-dev`
**Observed:** 2026-05-01T21:07:47Z

## Pre-package dirty file list

From `git status --short --branch`, `git diff --name-only`, and `git ls-files --others --exclude-standard` before packaging:

```text
## my-hermes-workspace-dev...origin/my-hermes-workspace-dev
 M docs/handoff/current-slice-status.md
 M docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md
 M docs/plans/2026-04-25-hermes-workspace-dream-mission-control-roadmap.md
 M src/server/execution-runs-store.ts
 M src/server/immediate-execution-launch.ts
 M src/server/projects-store.ts
 M src/server/work-item-orchestrator.test.ts
 M src/server/work-item-orchestrator.ts
?? docs/plans/2026-05-01-hermes-workspace-r13-profile-batch-package-clean-baseline-plan.md
?? docs/plans/2026-05-01-hermes-workspace-r14-clean-r12-profile-backed-gauntlet-retry-plan.md
?? docs/plans/2026-05-01-hermes-workspace-r15-roadmap-reentry-slice-n-idea-intake-planner-enrichment-plan.md
?? dogfood-output/merge-healer-profile-controlled-repair-2026-05-01T20-16-39Z.md
?? dogfood-output/merge-healer-profile-controlled-repair-latest.md
?? dogfood-output/merge-healer-profile-readiness-20260501T201639Z.json
?? dogfood-output/merge-healer-profile-synthetic-dry-run-20260501T201619Z.txt
?? dogfood-output/profile-backed-release-lane-gauntlet-2026-05-01T20-43-35Z.md
?? dogfood-output/profile-backed-release-lane-gauntlet-latest.md
?? dogfood-output/r13-r15-batch-activation-latest.md
?? dogfood-output/supervisor-profile-audit-launch-2026-05-01T19-48-30Z.md
?? dogfood-output/supervisor-profile-audit-launch-latest.md
?? dogfood-output/supervisor-profile-live-dry-run-20260501T194516Z.txt
?? dogfood-output/supervisor-profile-live-dry-run-20260501T194611Z.txt
?? src/server/work-item-release-audit-launch.test.ts
?? src/server/work-item-release-audit-launch.ts
```

## Classification

| Classification | Files |
| --- | --- |
| Must stage for R10/R11/R12 package | `src/server/execution-runs-store.ts`, `src/server/immediate-execution-launch.ts`, `src/server/projects-store.ts`, `src/server/work-item-orchestrator.ts`, `src/server/work-item-orchestrator.test.ts`, `src/server/work-item-release-audit-launch.ts`, `src/server/work-item-release-audit-launch.test.ts` |
| Generated/evidence report to stage | `dogfood-output/supervisor-profile-audit-launch-latest.md`, `dogfood-output/supervisor-profile-audit-launch-2026-05-01T19-48-30Z.md`, `dogfood-output/supervisor-profile-live-dry-run-20260501T194516Z.txt`, `dogfood-output/supervisor-profile-live-dry-run-20260501T194611Z.txt`, `dogfood-output/merge-healer-profile-controlled-repair-latest.md`, `dogfood-output/merge-healer-profile-controlled-repair-2026-05-01T20-16-39Z.md`, `dogfood-output/merge-healer-profile-readiness-20260501T201639Z.json`, `dogfood-output/merge-healer-profile-synthetic-dry-run-20260501T201619Z.txt`, `dogfood-output/profile-backed-release-lane-gauntlet-latest.md`, `dogfood-output/profile-backed-release-lane-gauntlet-2026-05-01T20-43-35Z.md`, `dogfood-output/r13-r15-batch-activation-latest.md` |
| Batch plan/handoff/index docs to stage | `docs/handoff/current-slice-status.md`, `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`, `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-roadmap.md`, R13/R14/R15 plan files |
| Keep out of git | `/home/d3ni3/.hermes/backups/...`, profile homes, `.env`, auth/config backup material, build `dist/` artifacts |
| Unexpected blockers | none |

## Staged file list

`git diff --cached --name-status` before commit:

```text
M	docs/handoff/current-slice-status.md
M	docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md
M	docs/plans/2026-04-25-hermes-workspace-dream-mission-control-roadmap.md
A	docs/plans/2026-05-01-hermes-workspace-r13-profile-batch-package-clean-baseline-plan.md
A	docs/plans/2026-05-01-hermes-workspace-r14-clean-r12-profile-backed-gauntlet-retry-plan.md
A	docs/plans/2026-05-01-hermes-workspace-r15-roadmap-reentry-slice-n-idea-intake-planner-enrichment-plan.md
A	dogfood-output/merge-healer-profile-controlled-repair-2026-05-01T20-16-39Z.md
A	dogfood-output/merge-healer-profile-controlled-repair-latest.md
A	dogfood-output/merge-healer-profile-readiness-20260501T201639Z.json
A	dogfood-output/merge-healer-profile-synthetic-dry-run-20260501T201619Z.txt
A	dogfood-output/profile-backed-release-lane-gauntlet-2026-05-01T20-43-35Z.md
A	dogfood-output/profile-backed-release-lane-gauntlet-latest.md
A	dogfood-output/r13-r15-batch-activation-latest.md
A	dogfood-output/supervisor-profile-audit-launch-2026-05-01T19-48-30Z.md
A	dogfood-output/supervisor-profile-audit-launch-latest.md
A	dogfood-output/supervisor-profile-live-dry-run-20260501T194516Z.txt
A	dogfood-output/supervisor-profile-live-dry-run-20260501T194611Z.txt
M	src/server/execution-runs-store.ts
M	src/server/immediate-execution-launch.ts
M	src/server/projects-store.ts
M	src/server/work-item-orchestrator.test.ts
M	src/server/work-item-orchestrator.ts
A	src/server/work-item-release-audit-launch.test.ts
A	src/server/work-item-release-audit-launch.ts
```

## Commit / push evidence

- Package commit pushed: `8a69832` (`feat: add profile-backed release lane roles`)
- Remote: `origin/my-hermes-workspace-dev`
- Push result: `fa6c7e6..8a69832  my-hermes-workspace-dev -> my-hermes-workspace-dev`

## Commands run and results

| Command | Result |
| --- | --- |
| `git status --short --branch` | PASS — dirty state captured before packaging; clean after package commit/push before report/handoff update |
| `git diff --stat` / `git diff --name-only` / `git ls-files --others --exclude-standard` | PASS — exact dirty/untracked state classified |
| Re-read R10/R11/R12 reports | PASS — reports reviewed: Supervisor audit launch, Merge-Healer controlled repair, R12 blocked gauntlet |
| `pnpm exec tsc --noEmit --pretty false` | PASS |
| `pnpm exec eslint . --max-warnings=0` | PASS |
| `pnpm vitest run src/server/work-item-orchestrator.test.ts src/server/work-item-release-audit-launch.test.ts --reporter=dot` | PASS — 2 files / 34 tests |
| `pnpm vitest run --reporter=dot` | PASS — 85 files / 579 tests |
| `pnpm build` | PASS — existing Vite sourcemap/dynamic-import/chunk warnings only |
| `git diff --check` | PASS before staging for tracked changes |
| `git diff --cached --check` | PASS after normalizing trailing whitespace in evidence text files |
| Static added-line security scans | PASS — no hardcoded secret, shell injection, eval/exec, pickle, or SQL-injection findings |
| Independent pre-commit review subagent | PASS — no security concerns or logic errors; verified no secrets/backups/profile env files staged and no Builder fallback in Supervisor/Merge-Healer paths |

## Release profile / gateway confirmation

`HERMES_HOME=/home/d3ni3/.hermes hermes profile list` showed both release profiles and their gateways stopped:

- `supervisor` — `openai/gpt-4.1`, gateway `stopped`, alias `supervisor`.
- `merge-healer` — `openai/gpt-4.1`, gateway `stopped`, alias `merge-healer`.

`hermes profile show supervisor` and `hermes profile show merge-healer` confirmed profile homes under `/home/d3ni3/.hermes/profiles/...`, model/provider configured, `.env` and `SOUL.md` present, and gateway `stopped`.

Parsed config checks confirmed:

- `supervisor`: `discord.enabled=false`; no `gateway.discord`, `gateway.telegram`, or `gateway.slack` enablement present.
- `merge-healer`: `discord.enabled=false`, `gateway.discord.enabled=false`, `gateway.telegram.enabled=false`, `gateway.slack.enabled=false`.

No Supervisor/Merge-Healer profiles were recreated during R13, no deployer profile was created, and no Discord/Telegram/Slack gateways were enabled.

## Final git status before report/handoff commit

Immediately after package push and before this report/handoff update:

```text
## my-hermes-workspace-dev...origin/my-hermes-workspace-dev
```

`git log --oneline -3`:

```text
8a69832 feat: add profile-backed release lane roles
fa6c7e6 R9 and R10
d684777 Release lane baseline package
```

## Next action

R13 produced the clean baseline required by the R14 preconditions. Next Builder task is R14 only: retry the profile-backed R12 gauntlet from the clean canonical repo using the existing `supervisor` and `merge-healer` profiles; do not recreate profiles and do not enable gateways.
