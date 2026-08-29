# R14 Clean R12 Profile-Backed Release Lane Gauntlet Retry Plan

## CEO decision

After R13 creates a clean package baseline, retry the same R12 profile-backed release-lane gauntlet from a clean canonical repo path. This is the go/no-go proof before broader profile-backed release automation or a return to the product roadmap.

## Goal

Run one controlled Work Item through the profile-backed release lane using existing `supervisor` and `merge-healer` profiles, with real `/executions` evidence and no fake lifecycle state.

## Preconditions

Builder must stop and report a blocker if any precondition fails:

1. `git status --short --branch` shows a clean worktree synced with `origin/my-hermes-workspace-dev`.
2. `hermes profile list` shows both `supervisor` and `merge-healer`.
3. `hermes profile show supervisor` and `hermes profile show merge-healer` confirm:
   - model/provider configured;
   - gateways stopped/disabled for Discord/Telegram/Slack;
   - no ad-hoc overlay profile.
4. Project `46b401f9-9243-472f-b5b7-04bf34596906` maps:
   - `runtimeProfiles.supervisorProfile=supervisor`
   - `runtimeProfiles.mergeHealerProfile=merge-healer`
   - `autonomyLanePolicy.enabled=true`
   - `mergeHealerEnabled=true`
   - `releaseAudit.required=true`
   - `aiMergeHealing.enabled=false`
   - always-on retry/PR/cleanup disabled/manual/dry-run.
5. R12 work item `97e69d95-f9f0-497f-9215-ab4686983431` is still `ready/build` with plan file `docs/plans/2026-05-01-hermes-workspace-r12-profile-backed-release-lane-gauntlet-plan.md`.

## In scope

1. Backup live Workspace JSON before any policy/work-item mutation:
   - `~/.hermes/projects.json`
   - `~/.hermes/work-items.json`
   to a timestamped directory under `~/.hermes/backups/hermes-workspace-r14/`.
2. Rerun reconcile for the named R12 work item only:
   - `POST /api/work-items/orchestrator/reconcile?workItemId=97e69d95-f9f0-497f-9215-ab4686983431`
3. Observe the lifecycle through API and `/executions`:
   - Builder launch/result;
   - review result;
   - Supervisor release audit gate/evidence;
   - Merge-Healer or deterministic deploy/merge evidence depending on policy gates.
4. If blocked, record the exact reason and keep lifecycle truthful.
5. If successful, record final status/phase/merge/audit evidence and commit/branch evidence.
6. Browser/API verify Work Item detail exposes profile mappings, no-Builder-fallback copy, execution links, audit evidence, and merge/deploy state.
7. Run final gates after the gauntlet:
   - `pnpm exec tsc --noEmit --pretty false`
   - `pnpm exec eslint . --max-warnings=0`
   - targeted release/profile tests
   - `pnpm vitest run --reporter=dot`
   - `pnpm build`
   - `git diff --check`
   - service restart/is-active/root smoke.
8. Write final report:
   - `dogfood-output/profile-backed-release-lane-gauntlet-clean-retry-latest.md`
   - timestamped copy.
9. Update compact handoff and index:
   - If pass: next active Builder plan becomes R15 roadmap re-entry / Slice N planning.
   - If blocked: next action remains the exact blocker recovery; do not advance to Slice N.

## Out of scope

- No profile creation.
- No gateway enabling.
- No unrelated feature work.
- No manual JSON edits to mark success.
- No broad always-on unattended loop.

## Acceptance criteria

- R12 retry starts from a clean canonical repo path.
- Existing `supervisor` and `merge-healer` profiles are used.
- Supervisor and Merge-Healer do not fall back to Builder.
- Work Item detail/API show truthful execution/audit/merge evidence.
- Outcome is either:
  - PASS: profile-backed lane reached final deploy/merge/done evidence; or
  - BLOCKED: exact profile/policy/test/conflict/repo reason recorded, with no fake state.
- Final report gives Main/D3n13r a go/no-go for broader profile-backed release automation.
