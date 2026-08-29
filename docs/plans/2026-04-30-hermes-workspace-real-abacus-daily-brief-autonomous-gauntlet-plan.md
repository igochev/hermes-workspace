# Hermes Workspace — Real ABACUS Daily Brief Autonomous Gauntlet Plan

> **For Hermes Builder:** Use `systematic-debugging` and `test-driven-development` where code changes are needed. This is primarily a production dogfood/acceptance gauntlet, not a broad Hermes Workspace feature slice. Update `docs/handoff/current-slice-status.md` before stopping.

**Goal:** Prove Mission Control can take D3n13r's real Family Command Center ABACUS idea — `Daddy Daily Brief — one-screen family runway for today` — through Planner preparation, Builder implementation, Reviewer/quality-gate evidence, and operator-visible execution traces without falling back to Scheduled Jobs or stale dummy work items.

**Architecture:** Use the live Hermes Workspace service and the real product project/work item, not the production-dogfood dummy queue. Keep one active repo lane for `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`. If Mission Control itself blocks the real run, stop and report the exact blocker instead of manually cheating the lifecycle.

**Tech Stack:** Hermes Workspace live API/UI, `ExecutionRunRecord` immediate executions, Family Command Center ABACUS repo, pnpm/vitest/build checks as available in the candidate repo.

**Previous package:** Immediate Execution Observability Hardening committed/pushed at `da9681e`.

---

## Real target

- Workspace repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Candidate product repo: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
- Real project id: `583dd0c7-5c3a-4195-a7fe-9873c929768a`
- Real project name: `Family Command Center`
- Real work item id: `697d0059-a3ca-438e-b92c-481f39e7566b`
- Real work item title: `Daddy Daily Brief — one-screen family runway for today`
- Starting state observed by Main: `active / research`, `planFilePath: null`
- Temporary R2 dogfood item to avoid confusing with the real item: `3c4e7252-ee14-4288-a38f-bf3deb81c4db` in project `production-dogfood-family-command-center-abacus`.

---

## Non-negotiables

1. **Backup first before live state mutation.** Before PATCH/POST actions that mutate Workspace JSON-backed state, create a timestamped backup of `~/.hermes/work-items.json`, `~/.hermes/planning-drafts.json`, `~/.hermes/projects.json`, and `~/.hermes/execution-runs.json` if present.
2. **Use the real project, not dummy dogfood.** All real idea lifecycle work must target project `583dd0c7-5c3a-4195-a7fe-9873c929768a` and work item `697d0059-a3ca-438e-b92c-481f39e7566b`.
3. **No normal Scheduled Jobs.** Normal Planner/Builder/Reviewer launches for the real item must create `/executions/<executionRunId>` records, not new `/api/hermes-jobs` job definitions.
4. **No manual lifecycle cheating as acceptance.** It is acceptable to click/use approved UI/API lifecycle actions; it is not acceptable to directly edit JSON to claim Planner/Builder/Reviewer success.
5. **Single active repo lane.** Do not run another ABACUS item in parallel. If the temporary R2 dogfood item or another item blocks the lane, park/report it explicitly with evidence before continuing.
6. **Candidate repo hygiene.** Inspect and record candidate repo branch/status before and after. Do not reset, force-push, or discard user work.
7. **PATCH partial-update safety.** If PATCH is used, send only explicit intended keys. Never send undefined arrays that could wipe `acceptanceCriteria`, labels, notes, or evidence arrays.
8. **Live UI evidence required.** API/test evidence alone is insufficient. Capture browser/DOM evidence for the real work item and its `/executions/<id>` traces.

---

## Task 1 — Baseline and backups

**Objective:** Establish a safe baseline for both Workspace and ABACUS before mutating anything.

**Commands:**

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
git status --short --branch
git rev-parse --short HEAD
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-smoke.html
curl -fsS 'http://127.0.0.1:3456/api/projects' > /tmp/hermes-projects-before-real-abacus.json
curl -fsS 'http://127.0.0.1:3456/api/work-items?projectId=583dd0c7-5c3a-4195-a7fe-9873c929768a' > /tmp/real-abacus-work-items-before.json
curl -fsS 'http://127.0.0.1:3456/api/work-items?projectId=production-dogfood-family-command-center-abacus' > /tmp/dogfood-abacus-work-items-before-real-run.json
curl -fsS 'http://127.0.0.1:3456/api/hermes-jobs' > /tmp/hermes-jobs-before-real-abacus.json
```

Create backups:

```bash
backup_dir="$HOME/.hermes/backups/real-abacus-daily-brief-gauntlet/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup_dir"
for file in work-items.json planning-drafts.json projects.json execution-runs.json; do
  if [ -f "$HOME/.hermes/$file" ]; then cp "$HOME/.hermes/$file" "$backup_dir/$file"; fi
done
printf '%s\n' "$backup_dir" > /tmp/real-abacus-backup-dir.txt
```

Candidate repo baseline:

```bash
cd /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
git status --short --branch
git rev-parse --short HEAD
```

**Expected:** Workspace branch is `my-hermes-workspace-dev` at or after `da9681e`; real work item exists in the real project; candidate repo status is recorded exactly.

---

## Task 2 — Ensure the real item is the only item being acted on

**Objective:** Prevent the just-created R2 dogfood observability item or stale dogfood items from being mistaken for D3n13r's real product idea.

**Steps:**

1. Inspect `/tmp/dogfood-abacus-work-items-before-real-run.json` and the real project response.
2. Confirm item `697d0059-a3ca-438e-b92c-481f39e7566b` is the only item you will prepare/build.
3. If item `3c4e7252-ee14-4288-a38f-bf3deb81c4db` is still `active/research`, do **not** launch it. Record it as historical R2 observability evidence in the final report. Only park/terminalize it if Mission Control refuses to proceed because of lane conflict; if you do, use a PATCH with explicit fields and cite the backup path.
4. If any unexpected ABACUS repo work item is `active/build`, `active/review`, or laneState `building/reviewing/merging`, stop and report the blocker rather than running a second item.

**Verification:** Final report includes a table of real-vs-dogfood candidates and states exactly which item was acted on.

---

## Task 3 — Planner preparation for the real Daily Brief item

**Objective:** Use the product Planner path to turn the rough idea into an accepted plan for ABACUS without direct JSON edits.

**Preferred UI path:** Open:

```text
http://127.0.0.1:3456/projects/583dd0c7-5c3a-4195-a7fe-9873c929768a/work-items/697d0059-a3ca-438e-b92c-481f39e7566b
```

Use the visible Planning/Planner action for the item. If using API, use:

```bash
curl -fsS -X POST \
  -H 'Content-Type: application/json' \
  -d '{"supervised":true}' \
  'http://127.0.0.1:3456/api/work-items/697d0059-a3ca-438e-b92c-481f39e7566b/prepare' \
  > /tmp/real-abacus-prepare-response.json
```

Then poll:

```bash
curl -fsS 'http://127.0.0.1:3456/api/work-items/697d0059-a3ca-438e-b92c-481f39e7566b/planning-drafts' > /tmp/real-abacus-planning-drafts.json
```

When a draft becomes `structured_ready`, review it. Accept only if it keeps the first slice local-first/deterministic and does not introduce AI, notifications, auth, or infrastructure expansion.

Accept via UI, or API:

```bash
curl -fsS -X POST 'http://127.0.0.1:3456/api/planning-drafts/<DRAFT_ID>/accept' > /tmp/real-abacus-accept-draft-response.json
```

**Expected:** Work item becomes `ready / build`, has a `planFilePath`, refined acceptance criteria, and planner evidence visible in the Work Item cockpit. If Planner output is poor, request revision or stop with a report; do not launch Builder on a bad plan.

---

## Task 4 — Launch Builder through immediate executions

**Objective:** Launch the real item build through Mission Control and prove it creates a first-class `/executions/<id>` trace.

**Preflight:** Re-read candidate repo status and confirm there is no unrelated dirty work that Builder would overwrite.

**Launch:** Use the Work Item UI Build/Launch action. If using API:

```bash
curl -fsS -X POST \
  -H 'Content-Type: application/json' \
  -d '{"phase":"build","supervised":true}' \
  'http://127.0.0.1:3456/api/work-items/697d0059-a3ca-438e-b92c-481f39e7566b/launch' \
  > /tmp/real-abacus-build-launch-response.json
```

**Observe:**

- Open `/executions/<executionRunId>` while it is running if possible.
- Confirm `Latest output`, `Last observed`, engine/profile/session evidence, and final response render.
- Confirm `/api/hermes-jobs` before/after did not gain a new normal Work Item job.

**Expected:** Candidate repo changes are on the intended branch/feature branch as controlled by Workspace. If Builder fails, stop and report the exact execution id, output excerpt, repo status, and recovery action. Do not manually patch ABACUS outside Mission Control unless the plan/Builder explicitly does so as the build agent.

---

## Task 5 — Sync, review, and merge-healer evidence

**Objective:** Prove the post-build lifecycle produces review/quality evidence and does not hide failures.

**Steps:**

1. Sync the work item execution state from the UI or by fetching the detail route with `syncExecution=true` if needed.
2. Confirm the work item moves to `active / review` only after Builder evidence is valid.
3. Confirm Reviewer/Planner-as-Reviewer launches as an immediate `/executions/<id>` run, not a Scheduled Job.
4. If review auto-approves, continue to merge/deploy approval flow as designed by the current product.
5. If review requests changes or manual review, record the quality-gate reasons and stop; that is a valid product finding, not a failed plan.
6. If Merge-Healer runs, verify branch/merge/test evidence is visible in Work Item cockpit and `/executions`.

**Expected:** Work item reaches a truthful terminal or waiting state with evidence. Do not claim "merged" or "done" unless Workspace/candidate repo evidence proves it.

---

## Task 6 — Candidate repo verification

**Objective:** Verify the ABACUS product state after Builder work.

Run commands appropriate to the candidate repo after inspecting its package scripts. At minimum:

```bash
cd /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
git status --short --branch
git diff --stat
```

If it is a Node app with scripts available, run the relevant focused/full gates, for example:

```bash
pnpm test
pnpm build
```

If commands differ or dependencies are missing, record the exact package scripts and grounded limitation. Do not invent passing product evidence.

---

## Task 7 — Final report and handoff update

**Objective:** Leave Main/CEO a clear acceptance artifact.

Write:

```text
dogfood-output/real-abacus-daily-brief-gauntlet-latest.md
dogfood-output/real-abacus-daily-brief-gauntlet-<timestamp>.md
```

Report must include:

- backup directory;
- real project id and work item id;
- initial/final work item status, phase, laneState, branchName, mergeState, planFilePath;
- Planner draft id and accept/revision decision;
- Builder execution id and Reviewer execution id, if launched;
- `/api/hermes-jobs` before/after ids and explicit new-job diff;
- candidate repo before/after branch, HEAD, status, diff stat, and test/build results;
- browser screenshot paths or DOM evidence for Work Item cockpit and `/executions/<id>`;
- final verdict: `ACCEPTED`, `CONDITIONALLY ACCEPTED`, or `REJECTED`, with reasons.

Update `docs/handoff/current-slice-status.md` with compact current state and next step before stopping.

---

## Required final verification package

Before reporting complete, run in Workspace:

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
pnpm vitest run
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root-smoke.html
```

For UI claims, use a real browser/DOM check. Constants-only tests are insufficient.

---

## Copy-paste Builder prompt

```text
proceed on Hermes Workspace
```

Builder should read `docs/handoff/current-slice-status.md`, this plan, then start with Task 1 baseline/backups.