# R13 Profile Batch Package / Clean Baseline Plan

## CEO decision

R12 proved the release-lane safety guard correctly: the profile-backed gauntlet refused to launch Builder from a dirty canonical repo path. The next Builder task is not a new feature. It is to intentionally package/checkpoint the verified local R10/R11/R12 profile-batch artifacts so the canonical repo path becomes clean enough for a real R12 retry.

## Goal

Turn the current verified-but-dirty local profile-backed release-lane batch into a clean, auditable baseline without committing unrelated secrets or stale artifacts.

## Context Builder must preserve

- Repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Branch: `my-hermes-workspace-dev`
- Current HEAD inspected by Main: `fa6c7e6` (`R9 and R10`)
- R8 package baseline is already committed/pushed as `d6847771b3b2ea327801f22ab0ecf20d57c56aa8`.
- R9/R10/R11 are implemented/verified locally per reports, but the working tree still contains uncommitted R10/R11/R12 files.
- R12 is `ready/build` and blocked only because canonical repo is dirty.
- Backups that contain profile auth/env material live outside the repo under `/home/d3ni3/.hermes/backups/...`; never stage them.

## In scope

1. Inspect the exact dirty state:
   - `git status --short --branch`
   - `git diff --stat`
   - `git diff --name-only`
   - `git ls-files --others --exclude-standard`
2. Re-read R10/R11/R12 evidence reports:
   - `dogfood-output/supervisor-profile-audit-launch-latest.md`
   - `dogfood-output/merge-healer-profile-controlled-repair-latest.md`
   - `dogfood-output/profile-backed-release-lane-gauntlet-latest.md`
3. Classify every dirty/untracked file as:
   - must stage for R10/R11/R12 package;
   - generated/evidence report to stage;
   - keep out of git;
   - unexpected blocker.
4. Run final package gates before staging:
   - `pnpm exec tsc --noEmit --pretty false`
   - `pnpm exec eslint . --max-warnings=0`
   - targeted release/profile tests covering changed files:
     - `pnpm vitest run src/server/work-item-orchestrator.test.ts src/server/work-item-release-audit-launch.test.ts --reporter=dot`
   - `pnpm vitest run --reporter=dot`
   - `pnpm build`
   - `git diff --check`
5. Stage only the classified R10/R11/R12 package files and evidence reports. Do not stage `/home/d3ni3/.hermes/backups`, profile auth/env files, or unrelated local files.
6. Commit and push the package if all gates pass. Suggested commit message:
   - `feat: add profile-backed release lane roles`
7. Verify clean synced baseline:
   - `git status --short --branch`
   - `git log --oneline -3`
8. Write package evidence report:
   - `dogfood-output/profile-batch-package-clean-baseline-latest.md`
   - timestamped copy.
9. Update `docs/handoff/current-slice-status.md` compactly to point to R14 after the package commit/push succeeds. If packaging fails, leave handoff on R13 and record the exact blocker.

## Out of scope

- Do not rerun R12 before the repo is clean.
- Do not recreate `supervisor` or `merge-healer` profiles.
- Do not enable Discord/Telegram/Slack gateways for release profiles.
- Do not enable always-on retry, PR publishing, or cleanup automation.
- Do not start roadmap Slice N/P/Q until R12 has been retried from the clean baseline.

## Acceptance criteria

- R10/R11/R12 package files are intentionally classified.
- All final package gates pass.
- The package is committed and pushed, or a clearly named blocker report explains why not.
- The canonical repo path is clean after packaging.
- No auth/env/profile backup material is staged.
- Handoff/index point to R14 only if the baseline is clean.

## Required report fields

The final report must include:

- exact pre-package dirty file list;
- staged file list;
- commit SHA pushed, or blocker reason;
- commands run and pass/fail results;
- confirmation that release profiles still exist and gateways remain stopped/disabled;
- final `git status --short --branch` output.
