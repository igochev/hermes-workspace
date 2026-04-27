# Real Code Write Investigation — 2026-04-27T15-00-58Z

## Verdict

The earlier `work-item-e2e-latest.md` was a lifecycle-state E2E only. It moved one Hermes Workspace work item through Inbox → Ready → Build → Review → Deploy → Done, but it did not prove autonomous code execution in the candidate repo.

That is why `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS` initially had no product-code changes from the workflow.

## Root cause

`scripts/mission-control-work-item-e2e.mjs` validates:

- target repo exists,
- target branch is `test-hermes-workspace`,
- project/work item can be created,
- lifecycle API transitions succeed,
- final work item status is `done`,
- UI detail page renders Done.

It does **not** launch a Builder/coding agent and does **not** assert `git diff` in the candidate repository.

Evidence from the script:

- Candidate repo only read via git branch/commit checks.
- Build phase is simulated with `PATCH /api/work-items/:id` setting `status: active`, `phase: build`, `missionState: succeeded`.
- No command in the harness writes to `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`.

## Actual autonomous Builder run performed now

Command run from candidate repo:

```bash
~/.local/bin/builder chat --query "You are Builder working in /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS on branch test-hermes-workspace. Make one small, real, safe code change with tests: add a pure helper in lib/quick-capture.ts or nearby that improves existing behavior, add/update a test proving it, run npm test for affected tests, and leave the changes uncommitted. Do not edit config. After finishing, report exact changed files and commands run." --toolsets terminal,file --skills systematic-debugging,test-driven-development --yolo --max-turns 60 --quiet
```

## Candidate repo result

Branch: `test-hermes-workspace`

Changed files now present:

```text
 M lib/quick-capture.ts
 M tests/quick-capture.test.ts
?? docs/plans/
```

Code diff stat:

```text
lib/quick-capture.ts        |  9 +++++++--
tests/quick-capture.test.ts | 11 +++++++++++
2 files changed, 18 insertions(+), 2 deletions(-)
```

Implemented behavior:

- Added `literalTokenRegex()` helper in `lib/quick-capture.ts`.
- Quick Capture chore routing now handles member names containing punctuation, e.g. `A.J.`.
- Added regression test: `A.J. empty the dishwasher` routes as a chore and extracts `empty the dishwasher`.

## Verification

Focused affected test command:

```bash
/home/d3ni3/node_modules/.bin/tsx --test tests/quick-capture.test.ts
```

Result: PASS — 6/6 tests passed.

Diff hygiene:

```bash
git diff --check -- lib/quick-capture.ts tests/quick-capture.test.ts
```

Result: PASS — no whitespace errors.

Requested npm command:

```bash
npm test -- tests/quick-capture.test.ts
```

Result: FAIL overall because the repo's package script expands `tests/**/*.test.ts` and an existing unrelated baseline failure remains:

```text
Error: Cannot find module '@prisma/client/runtime/library'
Require stack:
- tests/bootstrap-dev.test.ts
```

The quick-capture tests in that same npm run pass, including the new regression.

## Correction needed in Hermes Workspace acceptance

The E2E gate must be split or strengthened:

1. Lifecycle E2E: same work item reaches Done.
2. Code-writing E2E: Builder/coding agent is launched against candidate repo and candidate repo `git diff --name-only` contains expected product-code/test changes.

A report that has no candidate repo diff must not be called autonomous code-writing E2E.
