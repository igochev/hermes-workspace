# Real ABACUS Daily Brief — Main Review

- **Generated:** 2026-04-30T21:25:30Z
- **Verdict:** `NOT COMPLETE / RETURN TO BUILDER`
- **Workspace baseline:** `da9681e` plus uncommitted R3 gauntlet implementation/docs
- **Real project:** `583dd0c7-5c3a-4195-a7fe-9873c929768a`
- **Real work item:** `697d0059-a3ca-438e-b92c-481f39e7566b`
- **Candidate repo:** `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`

## Main review result

Builder did implement the important Mission Control compatibility work needed to resume the real ABACUS gauntlet:

- missing `/api/sessions` can fall back to local Hermes profile CLI execution (`local-hermes-cli`);
- Builder and Reviewer executions are first-class `/executions/<id>` records, not normal Scheduled Jobs;
- work-item execution sync recognizes immediate/local CLI records;
- review launches preserve Builder mission evidence in `missionId` and write reviewer evidence to `reviewJobId`;
- Reviewer output was parsed as `CHANGES_REQUESTED`, so Merge-Healer was correctly not launched.

However, this is **not complete as per plan** because the real product item truthfully returned to build after Reviewer blockers. The next action is not a new roadmap cycle; it is another Builder pass on the same R3 plan.

## Additional Main fixes applied during review

Main found and patched two Workspace lifecycle issues before handing the lane back:

1. `changes_requested` review sync wrote a build-phase history entry but did not always update the Work Item record itself to `active / build`.
2. A repeated `syncExecution=true` on an item already returned to build could re-promote it to review from stale successful Builder evidence. Main added a guard so `reviewDecision: changes_requested` + failed review remains in build until a new Build launch is explicitly run. Main also made build relaunch clear stale review decision/gate fields for the next review cycle.

Regression tests were added for both cases.

## Live state after Main recovery

A backup was taken before live-state recovery:

- `/home/d3ni3/.hermes/backups/main-review-review-phase-fix/20260430T211353Z`

Current verified Work Item state via live API after service restart and `syncExecution=true`:

```json
{
  "status": "active",
  "phase": "build",
  "missionId": "0eef859a-f350-4005-bf2e-891f6efaf932",
  "missionState": "succeeded",
  "reviewJobId": "1922f637-f600-4679-b75f-ca1e6aff8154",
  "reviewState": "failed",
  "reviewDecision": "changes_requested",
  "reviewQualityGateStatus": "fail",
  "mergeState": null,
  "blockedReason": null
}
```

Reviewer blockers remain:

1. Candidate dashboard runtime copy is too Dad-specific on a shared adult dashboard (`waiting for Dad`, `need Dad's attention today`, `Daddy Daily Brief` label).
2. Manual desktop/mobile dashboard dogfood evidence is missing.

Note: during Main's review, one accidental extra reviewer execution was started by a stale sync path before the guard was patched: `cd808b7d-c0c1-412a-a0ef-7955734118ad`. It is no longer linked from the work item; the work item points back to the truthful Reviewer execution `1922f637-f600-4679-b75f-ca1e6aff8154` and remains in `active / build`.

## Verification run by Main

Workspace:

- `pnpm vitest run src/server/work-item-execution.test.ts src/server/work-item-launch.test.ts` — PASS 40 tests
- `pnpm vitest run` — PASS 82 files / 547 tests
- `pnpm exec tsc --noEmit --pretty false` — PASS
- `pnpm exec eslint . --max-warnings=0` — PASS
- `pnpm build` — PASS
- `git diff --check` — PASS
- `systemctl --user restart hermes-workspace.service` + `/api/projects` smoke — PASS
- Live `syncExecution=true` on the real work item stayed `active / build` — PASS

Candidate ABACUS repo:

- Branch `test-hermes-workspace`, HEAD `16b6fc4`, ahead 15
- Dirty/untracked Daily Brief product/test/docs/review files remain uncommitted
- `npm test -- tests/daily-brief.test.ts` — PASS 44/44
- `npm run build` — PASS
- `git diff --check` — PASS

## Decision

Do **not** ask Main for a new roadmap yet. Do **not** launch Merge-Healer. Continue the current R3 gauntlet with Builder:

1. Resume Build through Mission Control for work item `697d0059-a3ca-438e-b92c-481f39e7566b`.
2. Fix Reviewer blockers in the candidate repo.
3. Produce desktop/mobile dashboard dogfood evidence.
4. Rerun candidate gates.
5. Relaunch Reviewer.

Only after Reviewer approves and Merge-Healer/integration evidence is truthful should Main do a final acceptance/roadmap triage.
