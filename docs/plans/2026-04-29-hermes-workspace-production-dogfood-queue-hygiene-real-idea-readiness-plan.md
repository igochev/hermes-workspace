# Hermes Workspace Production Dogfood Queue Hygiene + Real Idea Readiness Plan

> **For Hermes:** Use subagent-driven-development skill only if it helps. Implement this plan task-by-task with tests first where practical. This is a safety/readiness slice before creating D3n13r's real Family Command Center ABACUS idea.

**Goal:** Make the `Production Dogfood — Family Command Center ABACUS` project safe for a real idea-to-code run by preventing stale dummy/testing work items and stale planning drafts from being selected by the autonomous lane.

**Architecture:** Preserve historical evidence, but remove stale smoke/dummy items from lane eligibility through a tested, auditable cleanup flow. Add a dry-run/reporting script and server-side classification helpers before mutating persisted state. After cleanup, the ABACUS dogfood lane should be idle with no queued stale candidate; only a newly created real owner idea should be eligible to enter the lane.

**Tech Stack:** Hermes Workspace TypeScript server helpers, JSON-backed stores under `~/.hermes`, Node scripts, Vitest, existing Projects/WorkItems/PlanningDrafts stores, single-lane branch autonomy.

---

## 0. CEO context / why this slice exists

Current live data contains valuable historical dogfood evidence mixed with stale dummy queue items. The ABACUS project is lane-enabled, and the lane selector can consider old `inbox/research` items runnable. That means if the system is declared ready and reconciled before cleanup, it may select an old smoke item instead of D3n13r's real idea.

This slice is intentionally narrow. It does **not** create the real Family Command Center idea. It prepares the system so the next slice can create exactly one real idea and run it through Planner → Builder → Reviewer → Merge-Healer.

## 1. Current ABACUS dogfood data snapshot

Project:

```text
id: production-dogfood-family-command-center-abacus
name: Production Dogfood — Family Command Center ABACUS
repo: /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
lane policy: enabled, single_lane, branch isolation, baseBranch=test-hermes-workspace
```

Candidate repo state observed by Main/CEO before this plan:

```text
repo: /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
branch: test-hermes-workspace
status: clean
ahead/behind: ahead of origin/test-hermes-workspace by 15 commits
```

### Preserve as historical evidence

Do not cancel/delete these items. They are proof artifacts:

| Work item | State | Purpose |
|---|---|---|
| `55e4cd15-f179-433c-80bf-24b67f7672a2` | `done` | Old manual lifecycle E2E proof; not code-writing proof, but historical |
| `b31ad72d-4ef0-4388-b867-e0bf11c14c82` | `done/deploy/laneState=done/mergeState=merged` | One-item branch-based autonomous code-writing PASS |
| `c6c218a8-b299-4f7f-9f64-33812b06df3d` | `done/deploy/laneState=done/mergeState=merged` | Sequential gauntlet item 1 PASS |
| `1a44d0b2-86d8-4202-8dfa-50d71a454da8` | `done/deploy/laneState=done/mergeState=merged` | Sequential gauntlet item 2 PASS |
| `38c30749-118e-4ade-9e85-df62a31b611e` | `done/deploy/laneState=done/mergeState=merged` | Sequential gauntlet item 3 PASS |

### Preserve as blocked regression fixtures

Do not resume these as the next real idea. Keep them parked and visible as blocked evidence:

| Work item | State | Blocker |
|---|---|---|
| `84bfe2c2-e899-437a-8a6c-a6fa9884886d` | `blocked/build/laneState=blocked` | `Builder evidence phase must be build.` |
| `ac6918e0-a46d-4de4-a618-ddda1b233f98` | `blocked/build/laneState=blocked` | `Builder success evidence must include testPassed=true.` |

### Cancel/archive as stale test queue

These are not real product ideas. They should become terminal/non-runnable with an explicit note.

Old smoke rough ideas:

```text
110c9124-b898-43d3-a05a-a0ff304bc3fc
8c501827-d537-4715-8de5-98fee3d1db24
5961870a-3e41-4bb2-b36b-747f2989def8
c04a7be8-7b78-4a3c-8eeb-656c0923c27d
9457c095-238d-468e-84fe-25165c94499c
2a00c64d-40a2-477f-8e0f-da7e85fe6187
c6a7f30a-691f-496e-9455-db26ecc7e472
```

Old failed/partial autonomous E2E leftovers:

```text
9e52911f-93c4-4ec1-baef-6c2024dd3cbc
fdccecf9-8590-49ca-b2d2-fe924465468b
```

Already cancelled and should remain terminal:

```text
d5a7c982-efdf-4823-a235-f42556a3103e
```

Known stale planning drafts to handle if present:

- `110c9124...` has a stale `running` draft `378145e0...`.
- `9e52911f...` has failed/stale planning draft history, including `parse_failed` draft `1a5a55b7...`.
- `fdccecf9...` has a stale `structured_ready` draft `91d91603...`.

---

## 2. Non-negotiables

1. **Backup first.** Before any live data mutation, create timestamped backups of:
   - `~/.hermes/work-items.json`
   - `~/.hermes/planning-drafts.json`
   - `~/.hermes/projects.json`
2. **Dry-run first.** The cleanup script must default to dry-run and print exactly what would change.
3. **No deletion.** Do not delete work items or drafts. Mark stale items terminal/non-runnable and record notes/history.
4. **Preserve evidence.** Done and blocked evidence items must not be modified except optional non-functional labels/notes if the operator asks later.
5. **No manual lifecycle cheating as acceptance.** This slice is queue hygiene; it should not claim autonomous code-writing success.
6. **No silent auto-run.** After cleanup, the project must have zero runnable stale candidates before the real idea is created.
7. **PATCH partial-update safety.** Do not send undefined fields or wipe arrays such as `acceptanceCriteria`, `artifactPaths`, `labels`, or `history`.
8. **Candidate repo safety.** Do not reset/push/change the candidate repo in this slice. Only inspect and report its clean/ahead state.

---

## 3. Task list

### Task 1 — Add queue hygiene classification helpers

**Objective:** Make stale/historical ABACUS work-item classification deterministic and testable before any mutation.

**Files:**

- Create: `src/server/production-dogfood-queue-hygiene.ts`
- Test: `src/server/production-dogfood-queue-hygiene.test.ts`

**Implementation requirements:**

Create helpers similar to:

```ts
export type DogfoodQueueDisposition =
  | 'preserve_historical_evidence'
  | 'preserve_blocked_fixture'
  | 'cancel_stale_test_queue'
  | 'already_terminal'
  | 'unknown_manual_review'

export type DogfoodQueueClassification = {
  workItemId: string
  title: string
  status: string
  phase?: string
  laneState?: string
  disposition: DogfoodQueueDisposition
  reason: string
}

export function classifyProductionDogfoodWorkItem(workItem: WorkItemRecord): DogfoodQueueClassification
export function classifyProductionDogfoodQueue(workItems: WorkItemRecord[]): DogfoodQueueClassification[]
```

Classification rules:

- `done` historical proof items → `preserve_historical_evidence`.
- `blocked/build/laneState=blocked` with `laneParkedAt` and `laneBlockedReason` → `preserve_blocked_fixture`.
- titles starting with `Dogfood rough idea ` and non-terminal → `cancel_stale_test_queue`.
- titles starting with `Autonomous E2E Code Delivery ` and non-terminal → `cancel_stale_test_queue`.
- `cancelled` → `already_terminal`.
- anything else non-terminal → `unknown_manual_review`.

**Tests:**

Add focused tests proving:

1. the seven `Dogfood rough idea` items classify as `cancel_stale_test_queue`;
2. the two old `Autonomous E2E Code Delivery` inbox leftovers classify as `cancel_stale_test_queue`;
3. `b31ad72d`, `c6c218a8`, `1a44d0b2`, and `38c30749` classify as `preserve_historical_evidence`;
4. `84bfe2c2` and `ac6918e0` classify as `preserve_blocked_fixture` when parked metadata is present;
5. an unknown active item returns `unknown_manual_review` and blocks automated cleanup.

**Verification commands:**

```bash
pnpm test src/server/production-dogfood-queue-hygiene.test.ts -- --runInBand
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
```

---

### Task 2 — Add a dry-run/live cleanup script with backups

**Objective:** Provide an auditable operator tool that can clean only known stale test queue items and never touches evidence items.

**Files:**

- Create: `scripts/production-dogfood-queue-hygiene.mjs`
- Modify: `src/server/production-e2e-work-item-workflow-script.test.ts` or create `src/server/production-dogfood-queue-hygiene-script.test.ts`

**Script behavior:**

Default command:

```bash
node scripts/production-dogfood-queue-hygiene.mjs --project production-dogfood-family-command-center-abacus --dry-run
```

Live command:

```bash
node scripts/production-dogfood-queue-hygiene.mjs --project production-dogfood-family-command-center-abacus --apply
```

Requirements:

1. Resolve Hermes home from `HERMES_HOME ?? ~/.hermes`.
2. Load `work-items.json`, `planning-drafts.json`, and `projects.json`.
3. Refuse to apply unless:
   - project id exactly matches `production-dogfood-family-command-center-abacus`;
   - all non-terminal candidates are either `cancel_stale_test_queue` or `preserve_blocked_fixture`;
   - no `unknown_manual_review` item exists.
4. In `--dry-run`, write a report but do not modify JSON files.
5. In `--apply`, backup the three JSON files before writing:
   - `~/.hermes/backups/production-dogfood-queue-hygiene/<timestamp>/work-items.json`
   - `~/.hermes/backups/production-dogfood-queue-hygiene/<timestamp>/planning-drafts.json`
   - `~/.hermes/backups/production-dogfood-queue-hygiene/<timestamp>/projects.json`
6. In `--apply`, update only `cancel_stale_test_queue` work items:
   - `status: 'cancelled'`
   - remove `phase`
   - `laneState: 'done'` is **not** appropriate; leave absent unless already present
   - append note: `Archived stale dogfood/test queue item before real ABACUS idea intake.`
   - append history entry with `action: 'status-change'`, `status: 'cancelled'`, and the same note
   - preserve labels/artifacts/acceptance criteria/history arrays
7. Handle linked drafts for cancelled items:
   - any `requested`, `running`, or `structured_ready` planning draft for a cancelled item becomes `cancelled` if the draft type supports it; if the draft type does not currently support `cancelled`, use the nearest terminal failure state with a clear parse/report note and document the compromise in the report.
   - never mutate accepted drafts belonging to done historical evidence items.
8. Write timestamped and latest reports:
   - `dogfood-output/production-dogfood-queue-hygiene-YYYY-MM-DDTHH-MM-SSZ.md`
   - `dogfood-output/production-dogfood-queue-hygiene-latest.md`

**Report must include:**

- mode: `dry-run` or `apply`
- backup directory if applied
- all work items by disposition
- exact item ids changed
- linked draft ids changed
- preserved evidence item ids
- final runnable stale candidate count
- candidate repo branch/status/ahead-behind inspection result
- next recommended action

**Contract tests:**

Assert the script source contains:

```ts
expect(source).toContain('--dry-run')
expect(source).toContain('--apply')
expect(source).toContain('production-dogfood-family-command-center-abacus')
expect(source).toContain('backups/production-dogfood-queue-hygiene')
expect(source).toContain('Archived stale dogfood/test queue item before real ABACUS idea intake')
expect(source).toContain('unknown_manual_review')
```

**Verification commands:**

```bash
pnpm test src/server/production-dogfood-queue-hygiene.test.ts src/server/production-dogfood-queue-hygiene-script.test.ts -- --runInBand
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
```

---

### Task 3 — Run dry-run, inspect, then apply cleanup

**Objective:** Actually clean the stale ABACUS queue after verifying the dry-run report is exactly as expected.

**Steps:**

1. Inspect current repo and service state:

```bash
git status --short --branch
systemctl --user is-active hermes-workspace.service
```

2. Run dry-run:

```bash
node scripts/production-dogfood-queue-hygiene.mjs --project production-dogfood-family-command-center-abacus --dry-run
```

3. Read `dogfood-output/production-dogfood-queue-hygiene-latest.md` and verify expected counts:

Expected before apply, based on Main/CEO audit:

```text
preserve_historical_evidence: 5
preserve_blocked_fixture: 2
cancel_stale_test_queue: 9
already_terminal: 1
unknown_manual_review: 0
```

4. If and only if the dry-run matches expectations and `unknown_manual_review=0`, run apply:

```bash
node scripts/production-dogfood-queue-hygiene.mjs --project production-dogfood-family-command-center-abacus --apply
```

5. Re-run dry-run to prove idempotence:

```bash
node scripts/production-dogfood-queue-hygiene.mjs --project production-dogfood-family-command-center-abacus --dry-run
```

Expected after apply:

```text
cancel_stale_test_queue: 0
already_terminal: 10
unknown_manual_review: 0
runnable stale candidate count: 0
```

6. Do not continue if counts differ. Record the mismatch in handoff and stop.

---

### Task 4 — Prove the autonomous lane is idle before real idea intake

**Objective:** Verify a future real idea will not compete with stale dummy items.

**Files:**

- Modify if needed: `src/server/project-autonomy-lane.test.ts`
- No product code changes expected unless a bug is found.

**Checks:**

1. Use the existing lane selector against the ABACUS project data after cleanup.
2. It must return:

```text
active: null
next: null
reason: no queued lane candidate / blocked items are parked
```

3. Verify blocked fixtures are parked and do not block a future real item if repo safety is clean.
4. Verify creating a synthetic real item in a test fixture would be selected as `next` over historical evidence items.

**Verification commands:**

```bash
pnpm test src/server/project-autonomy-lane.test.ts src/server/production-dogfood-queue-hygiene.test.ts -- --runInBand
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
```

---

### Task 5 — Live API/UI smoke for clean project state

**Objective:** Confirm the live app shows the ABACUS project without stale runnable dummy queue clutter.

**Commands:**

```bash
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/api/projects/production-dogfood-family-command-center-abacus -o /tmp/abacus-project-after-queue-hygiene.json
```

Then parse `/tmp/abacus-project-after-queue-hygiene.json` and verify:

- done evidence items still exist;
- blocked fixture items still exist;
- stale rough idea / old autonomous E2E leftovers are now `cancelled`;
- no non-terminal work item title starts with `Dogfood rough idea `;
- no non-terminal work item title starts with `Autonomous E2E Code Delivery `;
- the project lane policy is still enabled and single-lane branch-based.

Live browser verification:

- open `http://localhost:3456/projects/production-dogfood-family-command-center-abacus`;
- verify Project Lane Cockpit renders;
- verify preserved done/blocked evidence is visible;
- verify no stale dummy item is presented as the next active/runnable mission;
- capture screenshot path for the final report.

---

### Task 6 — Final readiness report and handoff update

**Objective:** Leave the project ready for Main/CEO to create the real ABACUS idea in the next slice.

**Files:**

- Write/update: `dogfood-output/production-dogfood-queue-hygiene-final-latest.md`
- Write timestamped copy: `dogfood-output/production-dogfood-queue-hygiene-final-YYYY-MM-DDTHH-MM-SSZ.md`
- Update: `docs/handoff/current-slice-status.md`
- Update if needed: `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`

**Final report must include:**

- Verdict: `READY_FOR_REAL_IDEA_INTAKE` or `NOT_READY`
- Backup directory
- Changed item ids
- Changed draft ids
- Preserved evidence item ids
- Final ABACUS work-item state table
- Candidate repo hygiene state
- Service/API/browser verification results
- Screenshot path
- Exact next owner action:

```text
Ask Main/CEO to create the real “Family Command Center ABACUS” idea work item. Do not use old dummy work items.
```

**Final verification commands:**

```bash
pnpm test src/server/production-dogfood-queue-hygiene.test.ts src/server/production-dogfood-queue-hygiene-script.test.ts src/server/project-autonomy-lane.test.ts -- --runInBand
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-after-queue-hygiene.html
curl -fsS http://127.0.0.1:3456/api/projects/production-dogfood-family-command-center-abacus -o /tmp/abacus-project-after-queue-hygiene.json
```

---

## 4. Definition of done

This slice is complete only when:

1. Stale dummy/test work items are terminal/non-runnable with an audit note.
2. Historical done evidence and parked blocked fixtures are preserved.
3. Stale active/running/structured planning drafts linked to cancelled dummy items cannot trigger a future auto-run.
4. The ABACUS project lane has no stale runnable candidates.
5. Full hard gates remain green: TypeScript, ESLint max-warnings=0, Vitest, build.
6. Service/API/browser smoke proves the live project is safe for real idea intake.
7. Handoff says the next step is real idea creation, not another cleanup pass.

## 5. Builder prompt

Use this exact prompt for the Builder session:

```text
Proceed on Hermes Workspace.

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Read first: docs/handoff/current-slice-status.md
Active plan: docs/plans/2026-04-29-hermes-workspace-production-dogfood-queue-hygiene-real-idea-readiness-plan.md

Implement the Production Dogfood Queue Hygiene + Real Idea Readiness plan task-by-task. Non-negotiables: backup before live data mutation, dry-run before apply, no deletion, preserve done/blocked evidence items, cancel/archive only classified stale dummy/test queue items, preserve PATCH partial-update safety, keep TypeScript/ESLint/Vitest/build green, restart service and live-verify ABACUS project page before final report. Update handoff before stopping.
```
