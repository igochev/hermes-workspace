# Hermes Workspace — R5 Branch Evidence Recovery Plan

> **For Hermes:** Builder must read `docs/handoff/current-slice-status.md` first, then this plan. Use `subagent-driven-development` only if delegating code tasks; otherwise implement task-by-task with TDD.

**Goal:** Add and use a supported recovery path for the real ABACUS work item that R4 blocked because it has no feature-branch evidence, without force-merging or manually fabricating merge evidence.

**Architecture:** Implement a narrow server-side recovery seam that validates an operator-created recovery branch before attaching branch evidence to the blocked work item. The existing Merge-Healer remains the only component allowed to produce merge success/failure evidence. The slice then dogfoods that seam against the real ABACUS Daily Brief item and records a truthful merged-or-blocked verdict.

**Tech Stack:** Hermes Workspace, TanStack Start routes, file-backed work-item store, Work Item orchestrator, Merge-Healer, git CLI validation, Vitest, live Workspace API.

---

## Current source state

- Workspace repo: `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- Workspace branch: `my-hermes-workspace-dev`
- Active blocker from R4:
  - Project: `583dd0c7-5c3a-4195-a7fe-9873c929768a` — Family Command Center
  - Work item: `697d0059-a3ca-438e-b92c-481f39e7566b`
  - Candidate repo: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
  - Current work-item state: `blocked / deploy`, `laneState=blocked`, `mergeState=failed`
  - Blocker: `Merge-Healer blocked: work item has no feature branch evidence.`
- R4 backup: `/home/d3ni3/.hermes/backups/autonomous-release-policy-20260501T150739Z`
- R4 report: `dogfood-output/real-abacus-autonomous-release-latest.md`
- Real ABACUS candidate repo currently has uncommitted Daily Brief files on `test-hermes-workspace`; do not lose them.

## Non-negotiables

1. **Backup before mutation.** Before changing live Workspace JSON or candidate repo state, create timestamped backups under `~/.hermes/backups/branch-evidence-recovery-<timestamp>/`.
2. **No force merge.** Do not set `mergeState=merged`, `mergeCommit`, or `mergeTestPassed=true` manually.
3. **No direct JSON edits unless the new API fails and Main explicitly authorizes recovery.** This slice exists to avoid ad-hoc JSON surgery.
4. **No hidden broad automation.** Do not enable always-on/retry/PR publishing/cleanup and do not create Deploy/Supervisor profiles in this slice.
5. **Branch evidence must be real.** The recovery endpoint must validate the branch exists, differs from the base branch, has commits ahead of base, and belongs to the target repo.
6. **Merge-Healer owns the final verdict.** After evidence is attached, run the existing orchestrator/Merge-Healer path and accept either `merged` or a truthful blocker.
7. **Preserve PATCH partial-update safety.** Do not regress `/api/work-items/$workItemId` partial update semantics or include undefined fields that wipe arrays.

---

## Task 1 — Baseline, backups, and exact blocker capture

**Objective:** Capture live state and protect both Workspace JSON and the dirty ABACUS repo before any mutation.

**Files/targets:**
- Read: `~/.hermes/work-items.json`, `~/.hermes/projects.json`
- Read/API: `/api/work-items/697d0059-a3ca-438e-b92c-481f39e7566b`
- Read/API: `/api/projects/583dd0c7-5c3a-4195-a7fe-9873c929768a`
- Candidate repo: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`

**Steps:**

1. Verify Workspace service:

```bash
systemctl --user is-active hermes-workspace.service
curl --max-time 12 -fsS http://127.0.0.1:3456/ >/tmp/hermes-workspace-root.html
```

Expected: service is `active`; curl succeeds.

2. Create a timestamped backup directory:

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="$HOME/.hermes/backups/branch-evidence-recovery-$TS"
mkdir -p "$BACKUP_DIR"
cp "$HOME/.hermes/projects.json" "$BACKUP_DIR/projects.json"
cp "$HOME/.hermes/work-items.json" "$BACKUP_DIR/work-items.json"
printf '%s\n' "$BACKUP_DIR" | tee /tmp/hermes-workspace-r5-backup-dir.txt
```

3. Back up ABACUS repo state, including untracked files:

```bash
ABACUS_REPO=/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
BACKUP_DIR=$(cat /tmp/hermes-workspace-r5-backup-dir.txt)
cd "$ABACUS_REPO"
git status --short --branch | tee "$BACKUP_DIR/abacus-status-before.txt"
git diff > "$BACKUP_DIR/abacus-tracked.diff"
git ls-files --others --exclude-standard -z | tar --null -T - -czf "$BACKUP_DIR/abacus-untracked.tgz" || true
git log --oneline --decorate -n 20 > "$BACKUP_DIR/abacus-log-before.txt"
```

4. Fetch live project/work-item snapshots:

```bash
PROJECT_ID=583dd0c7-5c3a-4195-a7fe-9873c929768a
WORK_ITEM_ID=697d0059-a3ca-438e-b92c-481f39e7566b
curl --max-time 12 -fsS "http://127.0.0.1:3456/api/projects/$PROJECT_ID" -o /tmp/r5-project-before.json
curl --max-time 12 -fsS "http://127.0.0.1:3456/api/work-items/$WORK_ITEM_ID" -o /tmp/r5-work-item-before.json
python3 - <<'PY'
import json
w=json.load(open('/tmp/r5-work-item-before.json'))['workItem']
keys=['id','status','phase','laneState','mergeState','branchName','baseBranch','mergeTargetBranch','mergeBaseCommit','mergeTestPassed','laneBlockedReason','artifactPaths']
print(json.dumps({k:w.get(k) for k in keys}, indent=2))
assert w['status'] == 'blocked'
assert w.get('phase') == 'deploy'
assert w.get('mergeState') == 'failed'
assert 'no feature branch evidence' in (w.get('laneBlockedReason') or '')
PY
```

---

## Task 2 — Add a validated branch-evidence recovery server helper

**Objective:** Create one tested helper that attaches branch evidence only when it is safe and verifiable.

**Files:**
- Create: `src/server/work-item-branch-evidence-recovery.ts`
- Test: `src/server/work-item-branch-evidence-recovery.test.ts`
- Modify only if needed: `src/server/work-items-store.ts`

**Behavior:**

Implement a function like:

```ts
export type RecoverBranchEvidenceInput = {
  workItemId: string
  branchName: string
  baseBranch?: string
  operatorNote?: string
}

export type RecoverBranchEvidenceResult = {
  workItem: WorkItemRecord
  baseBranch: string
  branchName: string
  mergeBaseCommit: string
  branchHeadCommit: string
  commitsAhead: Array<string>
}

export async function recoverMissingBranchEvidence(
  input: RecoverBranchEvidenceInput,
): Promise<RecoverBranchEvidenceResult>
```

Required validations:

1. Work item exists.
2. Project exists and has a repo path.
3. Work item is the historical safe-recovery shape:
   - `status === 'blocked'`
   - `phase === 'deploy'`
   - `mergeState === 'failed'`
   - `laneBlockedReason` includes `no feature branch evidence`
   - review has approved-equivalent evidence (`reviewDecision === 'approved'` or an approved review approval exists).
4. `branchName` and `baseBranch` are non-empty and different.
5. Both refs exist in the candidate repo.
6. `git merge-base baseBranch branchName` resolves.
7. `git log baseBranch..branchName --oneline` has at least one commit.
8. Candidate repo is not in the middle of a merge/rebase.
9. If the repo is dirty, return a clear error before attaching evidence. Dirty-state recovery branch creation belongs in Task 4 before calling this helper.

Required update on success:

```ts
updateWorkItem(workItem.id, {
  status: 'active',
  phase: 'deploy',
  blockedReason: undefined,
  laneState: 'merge_healing',
  laneBlockedReason: input.operatorNote || 'Operator attached validated recovery branch evidence for Merge-Healer retry.',
  branchName,
  baseBranch,
  mergeTargetBranch: baseBranch,
  mergeBaseCommit,
  mergeState: 'not_started',
  mergeTestPassed: false,
})
```

Also append a work-item history entry that states the branch/base/head and that Merge-Healer still owns final merge evidence.

**Tests to write first:**

- rejects non-blocked work items;
- rejects missing project/repo path;
- rejects wrong blocker reason;
- rejects branch equal to base;
- rejects missing branch ref;
- rejects branch with no commits ahead of base;
- rejects dirty/in-progress repo state;
- accepts a valid branch and updates only recovery fields while preserving `acceptanceCriteria`, `artifactPaths`, review fields, and approvals.

Use temporary git repos in tests rather than the real ABACUS repo.

**Verification commands:**

```bash
pnpm vitest run src/server/work-item-branch-evidence-recovery.test.ts
pnpm vitest run src/server/work-items-store.test.ts src/server/work-item-orchestrator.test.ts src/server/work-item-merge-healer.test.ts
```

---

## Task 3 — Expose the recovery through an API route

**Objective:** Provide a supported live-operation endpoint so Main/Builder does not patch JSON directly.

**Files:**
- Create: `src/routes/api/work-items.$workItemId.branch-evidence-recovery.ts`
- Test: add route coverage in an existing route test file or create `src/server/work-item-branch-evidence-recovery-routes.test.ts`
- Route tree/generated artifacts if TanStack requires them.

**Endpoint:**

```text
POST /api/work-items/:workItemId/branch-evidence-recovery
Content-Type: application/json

{
  "branchName": "mission/697d0059-daily-brief-recovery",
  "baseBranch": "main",
  "operatorNote": "Recovered real ABACUS Daily Brief branch evidence after R4 blocker."
}
```

**Response:**

```json
{
  "workItem": { "id": "...", "status": "active", "phase": "deploy" },
  "recovery": {
    "branchName": "mission/697d0059-daily-brief-recovery",
    "baseBranch": "main",
    "mergeBaseCommit": "...",
    "branchHeadCommit": "...",
    "commitsAhead": ["..."]
  }
}
```

**Route rules:**

- Use `isAuthenticated(request)` like other Workspace API routes.
- Return `400` with a clear error for validation failures.
- Return `404` if the work item does not exist.
- Do not run Merge-Healer inside this endpoint. Keep evidence attachment and merge retry as separate observable steps.

**Verification commands:**

```bash
pnpm vitest run src/server/work-item-branch-evidence-recovery.test.ts src/server/work-item-branch-evidence-recovery-routes.test.ts
pnpm exec tsc --noEmit --pretty false
```

---

## Task 4 — Create a real ABACUS recovery branch from the dirty Daily Brief worktree

**Objective:** Turn the existing uncommitted Daily Brief work into a real feature branch without losing data or polluting `main` with unrelated hidden work.

**Files/targets:**
- Candidate repo: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`
- Branch to create: `mission/697d0059-daily-brief-recovery`
- Base branch: `main`

**Steps:**

1. Re-read the backup path and candidate status:

```bash
BACKUP_DIR=$(cat /tmp/hermes-workspace-r5-backup-dir.txt)
ABACUS_REPO=/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
cd "$ABACUS_REPO"
git status --short --branch
```

2. Create a separate recovery worktree from clean `main` so the dirty source worktree remains untouched:

```bash
RECOVERY_WORKTREE="$BACKUP_DIR/abacus-recovery-worktree"
RECOVERY_BRANCH="mission/697d0059-daily-brief-recovery"
git fetch origin --prune || true
git worktree add -b "$RECOVERY_BRANCH" "$RECOVERY_WORKTREE" main
```

If the branch already exists from a previous attempt, stop and inspect it; do not overwrite silently.

3. Copy only the real Daily Brief implementation/evidence files into the recovery worktree:

```bash
SOURCE="$ABACUS_REPO"
DEST="$RECOVERY_WORKTREE"
mkdir -p "$DEST/app/(app)/dashboard" "$DEST/components/dashboard" "$DEST/lib" "$DEST/tests" "$DEST/docs/plans" "$DEST/docs/reviews" "$DEST/dogfood-output/work-item-697d0059"
cp "$SOURCE/app/(app)/dashboard/page.tsx" "$DEST/app/(app)/dashboard/page.tsx"
cp "$SOURCE/components/dashboard/daily-brief.tsx" "$DEST/components/dashboard/daily-brief.tsx"
cp "$SOURCE/lib/daily-brief.ts" "$DEST/lib/daily-brief.ts"
cp "$SOURCE/tests/daily-brief.test.ts" "$DEST/tests/daily-brief.test.ts"
cp "$SOURCE/docs/plans/family-command-center-697d0059-plan.md" "$DEST/docs/plans/family-command-center-697d0059-plan.md"
cp "$SOURCE/docs/plans/family-command-center-697d0059-planner-draft.md" "$DEST/docs/plans/family-command-center-697d0059-planner-draft.md"
cp -R "$SOURCE/docs/reviews/." "$DEST/docs/reviews/" || true
cp -R "$SOURCE/dogfood-output/work-item-697d0059/." "$DEST/dogfood-output/work-item-697d0059/" || true
```

4. Inspect diff before committing:

```bash
cd "$RECOVERY_WORKTREE"
git status --short --branch
git diff --stat
git diff -- app/ components/ lib/ tests/ docs/ dogfood-output/ > "$BACKUP_DIR/recovery-branch.diff"
```

Stop if unrelated files appear.

5. Run candidate gates in the recovery worktree:

```bash
npm test -- tests/daily-brief.test.ts
npm run build
git diff --check
```

6. Commit the recovery branch:

```bash
git add 'app/(app)/dashboard/page.tsx' components/dashboard/daily-brief.tsx lib/daily-brief.ts tests/daily-brief.test.ts docs/plans/family-command-center-697d0059-plan.md docs/plans/family-command-center-697d0059-planner-draft.md docs/reviews dogfood-output/work-item-697d0059
git commit -m "feat: add daily brief runway for 697d0059"
git log --oneline --decorate -n 5
```

---

## Task 5 — Attach validated branch evidence and retry Merge-Healer

**Objective:** Use the new supported API, then let the existing orchestrator/Merge-Healer produce the final state.

**Steps:**

1. Attach branch evidence through the new API:

```bash
WORK_ITEM_ID=697d0059-a3ca-438e-b92c-481f39e7566b
RECOVERY_BRANCH="mission/697d0059-daily-brief-recovery"
python3 - <<'PY' >/tmp/r5-branch-evidence-recovery.json
import json
print(json.dumps({
  'branchName': 'mission/697d0059-daily-brief-recovery',
  'baseBranch': 'main',
  'operatorNote': 'R5 attached validated recovery branch evidence after R4 missing-feature-branch blocker; Merge-Healer still owns final merge verdict.'
}))
PY
curl --max-time 30 -fsS -X POST \
  -H 'Content-Type: application/json' \
  --data @/tmp/r5-branch-evidence-recovery.json \
  "http://127.0.0.1:3456/api/work-items/$WORK_ITEM_ID/branch-evidence-recovery" \
  -o /tmp/r5-branch-evidence-recovery-response.json
python3 -m json.tool /tmp/r5-branch-evidence-recovery-response.json
```

Expected: work item becomes `active / deploy`, branch/base/mergeBase evidence is present, merge remains not started/failed but not merged.

2. Re-run orchestrator reconcile only for the target work item:

```bash
curl --max-time 120 -fsS -X POST \
  "http://127.0.0.1:3456/api/work-items/orchestrator/reconcile?workItemId=$WORK_ITEM_ID" \
  -o /tmp/r5-reconcile-after-recovery.json
python3 -m json.tool /tmp/r5-reconcile-after-recovery.json
```

3. Fetch final work item:

```bash
curl --max-time 12 -fsS "http://127.0.0.1:3456/api/work-items/$WORK_ITEM_ID" -o /tmp/r5-work-item-after-reconcile.json
python3 - <<'PY'
import json
w=json.load(open('/tmp/r5-work-item-after-reconcile.json'))['workItem']
keys=['id','status','phase','laneState','branchName','baseBranch','mergeTargetBranch','mergeState','mergeCommit','mergeBaseCommit','mergeTestCommand','mergeTestPassed','laneBlockedReason','mergeArtifactPaths']
print(json.dumps({k:w.get(k) for k in keys}, indent=2))
PY
```

Acceptable final states:

- `ACCEPTED / MERGED`: `status=done`, `phase=deploy`, `laneState=done`, `mergeState=merged`, `mergeCommit` present, `mergeTestPassed=true`.
- `BLOCKED BY MERGE-HEALER`: `status=blocked`, `laneState=blocked`, `mergeState=conflict|failed`, blocker explains conflict/test/dirty-state reason.

Do not force merge if blocked.

---

## Task 6 — Full verification and durable report

**Objective:** Prove the recovery code and real dogfood outcome are safe.

**Workspace gates:**

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
pnpm vitest run src/server/work-item-branch-evidence-recovery.test.ts src/server/work-item-branch-evidence-recovery-routes.test.ts src/server/work-item-orchestrator.test.ts src/server/work-item-merge-healer.test.ts
pnpm vitest run
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm build
git diff --check
```

**Candidate repo gates:**

```bash
RECOVERY_WORKTREE=$(cat /tmp/hermes-workspace-r5-backup-dir.txt)/abacus-recovery-worktree
cd "$RECOVERY_WORKTREE"
npm test -- tests/daily-brief.test.ts
npm run build
git diff --check
```

**Scheduled jobs count check:**

```bash
curl --max-time 12 -fsS http://127.0.0.1:3456/api/hermes-jobs -o /tmp/r5-hermes-jobs-after.json
python3 - <<'PY'
import json
p=json.load(open('/tmp/r5-hermes-jobs-after.json'))
print(len(p.get('jobs', p if isinstance(p, list) else [])))
PY
```

R5 should not create normal Scheduled Jobs.

**Report files:**

Create/update:

- `dogfood-output/real-abacus-branch-evidence-recovery-latest.md`
- timestamped copy: `dogfood-output/real-abacus-branch-evidence-recovery-<timestamp>.md`

Report must include:

1. backup directory;
2. exact pre-recovery blocker state;
3. new helper/API behavior and test coverage;
4. recovery branch name/base/head/commits ahead;
5. candidate gate results;
6. API response for branch evidence recovery;
7. Merge-Healer reconcile response;
8. final work-item state;
9. Workspace gate results;
10. scheduled jobs count;
11. final verdict: `ACCEPTED / MERGED`, `BLOCKED BY MERGE-HEALER`, or `REJECTED / NEEDS MAIN`.

Update:

- `docs/handoff/current-slice-status.md`
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`

---

## Builder copy-paste prompt

```text
Proceed on Hermes Workspace R5.

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Read first: docs/handoff/current-slice-status.md
Then read active plan: docs/plans/2026-05-01-hermes-workspace-r5-branch-evidence-recovery-plan.md

Execute the plan exactly:
- backup ~/.hermes/projects.json and ~/.hermes/work-items.json before any Workspace mutation;
- backup the dirty real ABACUS repo state before any git mutation;
- implement a tested, authenticated branch-evidence recovery API for the specific safe blocker shape;
- do not manually set merge success evidence;
- create a real recovery branch mission/697d0059-daily-brief-recovery from main using only the Daily Brief files;
- attach validated branch evidence via the new API;
- retry orchestrator/Merge-Healer only for work item 697d0059-a3ca-438e-b92c-481f39e7566b;
- accept either a true merged state or a truthful Merge-Healer blocker;
- write dogfood-output/real-abacus-branch-evidence-recovery-latest.md plus timestamped copy;
- update docs/handoff/current-slice-status.md and the implementation index before stopping.

Do not create deployer/supervisor profiles and do not enable always-on/retry/PR/cleanup in this slice.
```
