# Hermes Workspace — Autonomous Release Policy Activation Plan

> **For Hermes:** Builder must read `docs/handoff/current-slice-status.md` first, then this plan. This is an owner-approved real-project release-policy activation slice for the real ABACUS Daily Brief work item.

**Goal:** Complete the current real ABACUS Daily Brief gauntlet by enabling the conservative single-lane policy for the real ABACUS project, running Merge-Healer through the existing orchestrator path, and recording truthful deploy/merge evidence.

**Architecture:** Current Merge-Healer is deterministic server-side release safety, not yet a dedicated Hermes profile launch. The immediate target is to prove the evidence-gated lane path with `autonomyLanePolicy.enabled=true` while keeping always-on/retry/PR publishing/cleanup automation disabled. Dedicated `deployer`/`merge-healer` and `supervisor` profiles are a later roadmap slice after this proof.

**Tech Stack:** Hermes Workspace, TanStack Start routes, file-backed JSON stores, Work Item orchestrator, project autonomy lane policy, local Hermes execution records.

---

## CEO design decision captured by this plan

D3n13r approved the direction of **Option 1**: enable single-lane policy for the real ABACUS project, with backup first and no broad automation.

This does **not** mean “unattended swarm mode.” The intended release workflow is:

```text
Idea / rough request
  → Planner / Researcher creates plan + acceptance criteria
  → owner or policy approves build
  → Builder implements on feature branch
  → Reviewer / Planner validates against criteria
  → approval gate resolves
  → Merge-Healer integrates into base branch only if repo hygiene, merge, and post-merge tests pass
  → Work Item records merge evidence
  → Supervisor profile later audits/vetoes the whole chain
```

For this slice, the real ABACUS project should keep these conservative settings:

```text
autonomyLanePolicy.enabled = true
mergeHealerEnabled = true
alwaysOn.enabled = false
alwaysOn.retry.enabled = false / no automatic retry expansion
alwaysOn.prPublishing.enabled = false / manual
alwaysOn.cleanup.enabled = false / dry-run only
```

## Current live target

- Workspace repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Real ABACUS project ID: `583dd0c7-5c3a-4195-a7fe-9873c929768a`
- Real ABACUS repo path: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
- Real work item ID: `697d0059-a3ca-438e-b92c-481f39e7566b`
- Current expected state before this slice:
  - `status: active`
  - `phase: deploy`
  - `reviewState: succeeded`
  - `reviewDecision: manual_review` or approved-equivalent with resolved review approval
  - `mergeState: null`
  - project has `autonomyLanePolicy.mergeHealerEnabled: true` but `autonomyLanePolicy.enabled: false`
- Existing proof reports:
  - `dogfood-output/real-abacus-daily-brief-gauntlet-latest.md`
  - `dogfood-output/real-abacus-daily-brief-main-review-latest.md`

## Non-negotiables

1. **Backup first.** Before mutating live Workspace JSON, copy `~/.hermes/projects.json` and `~/.hermes/work-items.json` to a timestamped backup directory.
2. **No profile creation in this slice.** Deploy/Supervisor profiles are roadmap work, not required for the current deterministic Merge-Healer path.
3. **No `Deploy → builder`.** Do not paper over the unmapped Deploy role by assigning Builder. Deploy is release safety, not normal feature implementation.
4. **No always-on expansion.** Do not enable automatic retries, automatic PR publishing, cleanup, or always-on scouting while completing this item.
5. **No direct JSON edits unless API patch/reconcile fails and Main explicitly authorizes recovery.** Prefer API PATCH and orchestrator reconcile.
6. **Do not claim done unless `mergeState: merged` and the work item is `done / deploy` with merge evidence.**
7. **If Merge-Healer blocks, preserve the blocked state and report exactly why.** Do not force-merge.
8. **No new normal Scheduled Jobs.** Planner/Builder/Reviewer already proved `/executions`; this deploy slice must not regress to normal `/api/hermes-jobs` work-item creation.

---

## Task 1 — Baseline and backup live Workspace state

**Objective:** Capture the pre-mutation state and create rollback artifacts.

**Files/targets:**
- Read: `~/.hermes/projects.json`
- Read: `~/.hermes/work-items.json`
- Read/API: `/api/projects/583dd0c7-5c3a-4195-a7fe-9873c929768a`
- Read/API: `/api/work-items/697d0059-a3ca-438e-b92c-481f39e7566b`
- Write: backup directory under `~/.hermes/backups/`

**Steps:**

1. Verify service:

```bash
systemctl --user is-active hermes-workspace.service
curl --max-time 12 -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root.html
```

Expected: service `active`, curl succeeds.

2. Create timestamped backups:

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$HOME/.hermes/backups/autonomous-release-policy-$TS"
mkdir -p "$BACKUP_DIR"
cp "$HOME/.hermes/projects.json" "$BACKUP_DIR/projects.json"
cp "$HOME/.hermes/work-items.json" "$BACKUP_DIR/work-items.json"
printf '%s\n' "$BACKUP_DIR" | tee /tmp/hermes-workspace-release-backup-dir.txt
```

3. Fetch current project/work-item snapshots:

```bash
PROJECT_ID=583dd0c7-5c3a-4195-a7fe-9873c929768a
WORK_ITEM_ID=697d0059-a3ca-438e-b92c-481f39e7566b
curl --max-time 12 -fsS "http://127.0.0.1:3456/api/projects/$PROJECT_ID" -o /tmp/abacus-project-before-release.json
curl --max-time 12 -fsS "http://127.0.0.1:3456/api/work-items/$WORK_ITEM_ID" -o /tmp/abacus-work-item-before-release.json
python3 - <<'PY'
import json
for path in ['/tmp/abacus-project-before-release.json','/tmp/abacus-work-item-before-release.json']:
    data=json.load(open(path))
    print('\n==', path)
    if 'project' in data:
        p=data['project']
        print({
            'id': p.get('id'),
            'name': p.get('name'),
            'phaseProfiles': p.get('phaseProfiles'),
            'autopilotPolicy': p.get('autopilotPolicy'),
            'autonomyLanePolicy': p.get('autonomyLanePolicy'),
        })
    else:
        print({k:data.get(k) for k in ['id','status','phase','missionState','reviewState','reviewDecision','reviewQualityGateStatus','mergeState','blockedReason','branchName','baseBranch','mergeTargetBranch']})
PY
```

Expected:
- project is real Family Command Center / ABACUS project;
- work item is approved deploy-waiting;
- no merge evidence yet.

4. Record `/api/hermes-jobs` count:

```bash
curl --max-time 12 -fsS http://127.0.0.1:3456/api/hermes-jobs -o /tmp/hermes-jobs-before-release.json
python3 - <<'PY'
import json
p=json.load(open('/tmp/hermes-jobs-before-release.json'))
print(len(p.get('jobs', p if isinstance(p, list) else [])))
PY
```

---

## Task 2 — Enable conservative lane policy only for real ABACUS

**Objective:** Turn on the project-level single-lane gate required by current orchestrator code, without enabling always-on automation.

**Implementation note:** `src/routes/api/projects.$projectId.ts` PATCH accepts `autonomyLanePolicy`, and `updateProject()` merges nested policy patches through `mergeAutonomyLanePolicyPatch(...)`. Still, verify the returned policy after patch.

**Steps:**

1. Patch only the conservative lane fields:

```bash
PROJECT_ID=583dd0c7-5c3a-4195-a7fe-9873c929768a
python3 - <<'PY' >/tmp/enable-abacus-lane-policy.json
import json
print(json.dumps({
  'autonomyLanePolicy': {
    'enabled': True,
    'mode': 'single_lane',
    'isolation': 'branch',
    'maxActiveWorkItems': 1,
    'baseBranch': 'main',
    'branchPrefix': 'mission',
    'plannerTiming': 'on_lane_entry',
    'blockedBehavior': 'park_and_continue_when_repo_clean',
    'mergeHealerEnabled': True,
    'allowParallelWorktrees': False,
    'alwaysOn': {
      'enabled': False,
      'retry': {'enabled': False, 'maxAttemptsPerPhase': 1},
      'prPublishing': {'enabled': False, 'mode': 'manual'},
      'cleanup': {'enabled': False, 'dryRun': True}
    }
  }
}))
PY
curl --max-time 12 -fsS -X PATCH \
  -H 'Content-Type: application/json' \
  --data @/tmp/enable-abacus-lane-policy.json \
  "http://127.0.0.1:3456/api/projects/$PROJECT_ID" \
  -o /tmp/abacus-project-after-policy-patch.json
```

2. Verify policy did not accidentally enable broad automation:

```bash
python3 - <<'PY'
import json
p=json.load(open('/tmp/abacus-project-after-policy-patch.json'))['project']
policy=p['autonomyLanePolicy']
print(json.dumps({
  'enabled': policy.get('enabled'),
  'mergeHealerEnabled': policy.get('mergeHealerEnabled'),
  'maxActiveWorkItems': policy.get('maxActiveWorkItems'),
  'allowParallelWorktrees': policy.get('allowParallelWorktrees'),
  'alwaysOn': policy.get('alwaysOn'),
  'phaseProfiles': p.get('phaseProfiles'),
}, indent=2))
assert policy.get('enabled') is True
assert policy.get('mergeHealerEnabled') is not False
assert policy.get('maxActiveWorkItems') == 1
assert policy.get('allowParallelWorktrees') is False
assert policy.get('alwaysOn', {}).get('enabled') is False
assert policy.get('alwaysOn', {}).get('retry', {}).get('enabled') is False
assert policy.get('alwaysOn', {}).get('prPublishing', {}).get('enabled') is False
PY
```

Expected: only lane eligibility is enabled; always-on/PR/cleanup remain conservative.

---

## Task 3 — Run orchestrator reconcile for the specific work item

**Objective:** Let current Workspace product code perform the release step rather than direct JSON mutation.

**Steps:**

1. Reconcile only the target work item:

```bash
WORK_ITEM_ID=697d0059-a3ca-438e-b92c-481f39e7566b
curl --max-time 120 -fsS -X POST \
  "http://127.0.0.1:3456/api/work-items/orchestrator/reconcile?workItemId=$WORK_ITEM_ID" \
  -o /tmp/abacus-reconcile-after-policy.json
python3 -m json.tool /tmp/abacus-reconcile-after-policy.json
```

2. Fetch the final work item:

```bash
curl --max-time 12 -fsS "http://127.0.0.1:3456/api/work-items/$WORK_ITEM_ID" -o /tmp/abacus-work-item-after-reconcile.json
python3 - <<'PY'
import json
w=json.load(open('/tmp/abacus-work-item-after-reconcile.json'))
keys=['id','status','phase','laneState','reviewState','reviewDecision','reviewQualityGateStatus','mergeState','mergeCommit','mergeBaseCommit','mergeTargetBranch','mergeTestCommand','mergeTestPassed','blockedReason','laneBlockedReason','artifactPaths','mergeArtifactPaths']
print(json.dumps({k:w.get(k) for k in keys}, indent=2))
PY
```

Expected outcomes:

### Success path

```text
status: done
phase: deploy
laneState: done
mergeState: merged
mergeCommit: present
mergeTestPassed: true
```

### Acceptable blocked path

```text
status: blocked
mergeState: conflict or failed
laneBlockedReason: explains conflict/test/dirty-repo reason
```

If blocked, stop and report. Do not force merge.

---

## Task 4 — Verify repo state and gates after reconcile

**Objective:** Prove the merge result is safe and truthful.

**Commands:**

```bash
cd /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
git status --short --branch
git log --oneline --decorate -n 8
npm test -- tests/daily-brief.test.ts
npm run build
git diff --check
```

If Merge-Healer reports `mergeTestCommand`, also run/record that exact command manually if it differs from the above.

Then verify Workspace gates are still green:

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
pnpm vitest run src/server/work-item-orchestrator.test.ts src/server/work-item-merge-healer.test.ts src/server/profile-readiness-routes.test.ts
pnpm vitest run
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm build
git diff --check
```

Check scheduled jobs count did not increase unexpectedly:

```bash
curl --max-time 12 -fsS http://127.0.0.1:3456/api/hermes-jobs -o /tmp/hermes-jobs-after-release.json
python3 - <<'PY'
import json
before=json.load(open('/tmp/hermes-jobs-before-release.json'))
after=json.load(open('/tmp/hermes-jobs-after-release.json'))
def count(p):
    return len(p.get('jobs', p if isinstance(p, list) else []))
print({'before': count(before), 'after': count(after)})
PY
```

---

## Task 5 — Produce release evidence report and update handoff

**Objective:** Leave a durable, truthful continuation record.

**Create/update report files:**

- `dogfood-output/real-abacus-autonomous-release-latest.md`
- timestamped copy: `dogfood-output/real-abacus-autonomous-release-<timestamp>.md`

Report must include:

1. backup directory path;
2. project policy before/after summary;
3. reconcile response;
4. final work item state;
5. merge evidence or blocked reason;
6. candidate repo branch/head/status;
7. candidate repo gate results;
8. Workspace gate results;
9. scheduled jobs before/after count;
10. final verdict:
    - `ACCEPTED / MERGED`, or
    - `BLOCKED BY MERGE-HEALER`, or
    - `REJECTED / NEEDS MAIN`.

Update:

- `docs/handoff/current-slice-status.md`
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`

The handoff must stay compact. If success, say R3 is merged/done and the next CEO roadmap slice is dedicated release profiles / supervisor. If blocked, say R3 remains blocked at deploy with exact reason and rollback backup path.

---

## Future roadmap after this slice — dedicated release profiles

Do **not** implement these profiles in this slice unless Main explicitly creates a follow-up plan.

### Future `deployer` / `merge-healer` profile

Purpose: release integration specialist. It should not be a normal Builder clone.

Capabilities:

- inspect branch/base/head status;
- inspect merge conflicts and test failures;
- repair integration conflicts when safe;
- run post-merge gates;
- produce release notes and merge evidence;
- recommend merge/block decisions;
- never bypass failed tests/conflicts without explicit owner approval.

Default operational shape:

- first-class profile at `~/.hermes/profiles/deployer` or `~/.hermes/profiles/merge-healer`;
- local CLI execution, no Discord gateway by default;
- no shared unrestricted Discord token;
- no API server port conflict;
- SOUL optimized for release safety, conservative merges, and evidence writing.

### Future `supervisor` profile

Purpose: independent audit/veto layer over the whole lane.

Capabilities:

- read the plan, acceptance criteria, Builder evidence, Reviewer decision, repo diff, and gate outputs;
- detect self-review, missing evidence, stale branch/base, failed gates, policy violations, or unsafe auto-merge conditions;
- produce a structured allow/veto decision;
- escalate to owner when confidence is insufficient.

Default operational shape:

- first-class profile at `~/.hermes/profiles/supervisor`;
- local CLI/read-heavy workflow by default;
- no broad write authority until Workspace has explicit supervisor action boundaries;
- later wired into the Work Item release gate before Merge-Healer can finalize autonomous merge.

---

## Builder copy-paste prompt

```text
Proceed on Hermes Workspace.

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Read first: docs/handoff/current-slice-status.md
Then read active plan: docs/plans/2026-05-01-hermes-workspace-autonomous-release-policy-activation-plan.md

Execute the plan exactly:
- backup ~/.hermes/projects.json and ~/.hermes/work-items.json before any mutation;
- enable only conservative single-lane policy for real ABACUS project 583dd0c7-5c3a-4195-a7fe-9873c929768a;
- keep always-on/retry/PR publishing/cleanup disabled/manual/dry-run;
- run orchestrator reconcile only for work item 697d0059-a3ca-438e-b92c-481f39e7566b;
- verify final work item and candidate repo gates;
- do not force merge if Merge-Healer blocks;
- write dogfood-output/real-abacus-autonomous-release-latest.md plus timestamped copy;
- update docs/handoff/current-slice-status.md and the implementation index before stopping.

Do not create deployer/supervisor profiles in this slice. That is the next CEO-designed roadmap slice after this release proof.
```