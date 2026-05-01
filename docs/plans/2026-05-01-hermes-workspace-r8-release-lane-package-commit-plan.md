# R8 Release Lane Package Commit + Clean Baseline Plan

## CEO decision

R7 proved the R3/R4/R5/R6 release-lane bundle is package-ready, but the repo is still dirty and no new release profiles should be created on top of an uncommitted mixed package. R8 is the first task in the batch queue: make the release-lane package clean, reviewable, and pushed only if D3n13r explicitly authorizes packaging/commit/push in the Builder prompt.

## Goal

Stage only the release-lane package classified in `dogfood-output/release-lane-packaging-profile-readiness-latest.md`, rerun cached/package gates, commit/push as authorized, then update docs/handoff to advance to R9.

## In scope

- Inspect `git status --short --branch`, R7 report, current handoff, and this plan.
- Stage only files classified as release-lane package files in the R7 report.
- Verify staged diff with `git diff --cached --name-status`, `git diff --cached --stat`, and `git diff --cached --check`.
- Rerun minimal package confidence gates if anything changed since R7: `pnpm exec tsc --noEmit --pretty false`, `pnpm exec eslint . --max-warnings=0`, `pnpm vitest run --reporter=dot`, `pnpm build`, service restart/is-active, root smoke.
- Commit and push only when the prompt explicitly authorizes commit/push.
- Write `dogfood-output/release-lane-package-commit-latest.md` plus timestamped copy.
- Update `docs/handoff/current-slice-status.md` so R9 is next after package success.

## Out of scope / non-negotiables

- Do not create `deployer`, `merge-healer`, or `supervisor` profiles.
- Do not map missing profiles to Builder.
- Do not include unrelated live runtime files, candidate repo files, secrets, build output, or ad-hoc generated files outside the R7 classification.
- Do not claim profile readiness beyond the matrix already produced in R7.

## Task sequence

1. Read R7 report and list the exact package file set.
2. Check for new files not mentioned by R7; classify them before staging.
3. Stage the package file set only.
4. Run cached diff checks and full gates.
5. If authorized, commit with a release-lane message and push to `origin/my-hermes-workspace-dev`.
6. Verify clean/synced state after push.
7. Update docs/handoff to point to R9.

## Verification commands

```bash
git status --short --branch
git diff --cached --name-status
git diff --cached --check
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run --reporter=dot
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl --max-time 12 -fsS http://127.0.0.1:3456/ -o /tmp/hermes-workspace-root.html && wc -c /tmp/hermes-workspace-root.html
```

## Acceptance criteria

- Release-lane package file set is staged intentionally and no unrelated files are included.
- Cached diff checks pass.
- Typecheck, ESLint, Vitest, build, service, and root smoke are recorded.
- Commit/push occurs only with explicit owner authorization.
- Final report names commit SHA or clearly states why commit/push was not performed.
- Compact handoff advances to R9 only after a clean package baseline exists.

## Copy-paste Builder prompt

```text
Proceed on Hermes Workspace from /home/d3ni3/.Hermes/workspace/projects/hermes-workspace. Read docs/handoff/current-slice-status.md, then execute R8: docs/plans/2026-05-01-hermes-workspace-r8-release-lane-package-commit-plan.md. D3n13r/Main authorizes packaging/commit/push for the release-lane bundle only. Stage only the files classified by dogfood-output/release-lane-packaging-profile-readiness-latest.md, run the required gates, commit/push only that package, write the R8 report, and update handoff to R9. Do not create profiles.
```
