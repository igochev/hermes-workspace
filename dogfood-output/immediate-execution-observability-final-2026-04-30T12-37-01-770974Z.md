# Immediate Execution Observability Hardening — Final Dogfood Report

Verdict: PASS

Generated: 2026-04-30T12:40:31.797964Z
Workspace branch/commit: my-hermes-workspace-dev / 5f21b78
Workspace URL: http://127.0.0.1:3456

## Live dogfood item

- Project id: production-dogfood-family-command-center-abacus
- Work item id: 3c4e7252-ee14-4288-a38f-bf3deb81c4db
- Work item title: Immediate observability dogfood observability-20260430T123302Z
- Execution id: 239bc80f-61b4-4b90-ad3c-2fd2ff1f3e13
- Execution link: /executions/239bc80f-61b4-4b90-ad3c-2fd2ff1f3e13
- Execution state: succeeded
- Phase / role / profile: research / planner / planner
- Last observed: 2026-04-30T12:33:41.810Z
- Started: 2026-04-30T12:33:02.671Z
- Finished: 2026-04-30T12:33:41.810Z
- Screenshot (execution detail): /home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_5ed5a09986324ec79a040c58e8aeb195.png
- Screenshot (work-item evidence): /home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_dd6ac95f8ded43ccad2ef1fce2c17221.png

## Scheduled Jobs no-new-job evidence

Before /api/hermes-jobs ids:

```json
[
  "f5e71ec2a3f0",
  "5e26a777bcd0"
]
```

After /api/hermes-jobs ids:

```json
[
  "f5e71ec2a3f0",
  "5e26a777bcd0"
]
```

New Scheduled Job ids after normal Work Item launch: `[]`

## Execution observability evidence

Latest output excerpt:

```text
Acknowledged run id: `observability-20260430T123302Z`

Work item: `3c4e7252-ee14-4288-a38f-bf3deb81c4db`  
Project: `production-dogfood-family-command-center-abacus`  
Role/phase: `planner` / `research`  
Repo path verified: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`  
Branch verified: `test-hermes-workspace`  
HEAD: `16b6fc4`  
Workspace health: `200`

No files modified by this planner run. Existing repo state already had one untracked file before planning:
`docs/plans/production-dogfood-family-command-center-abacus-a77f3914-planner-draft.md`

No Scheduled Job was created. Cron job list was inspected only; no create/update action was taken.

## Grounded plan

### Objective

Use this immediate Mission Control launch to verify observability for live dogfood execution records, specifically that the immediate execution path captures the latest planner output without accidentally creating a Scheduled Job.

### Proposed acceptance criteria

1. Immediate execution record for work item `3c4e7252-ee14-4288-a38f-bf3deb81c4db` shows latest output from this planner run.
2. Output includes run id `observability-20260430T123302Z`.
3. Output includes grounded repo path `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`.
4. No Scheduled Job definition is created for this immediate work-item launch.
5. The execution remains associated with project `production-dogfood-family-command-center-abacus` and work item `3c4e7252-ee14-4288-a38f-bf3deb81c4db`.

### Open questions

- Does Mission Control expose the immediate execution record UI/API in a way that clearly distinguishes immediate launches from Scheduled Jobs?
- Should immediate planner launches display repo/branch/HEAD metadata automatically, or rely on agent output?
- Should existing unrelated cron jobs be hidden from this work-item context to avoid operator confusion?

### Constraints

- Research/planning only.
- Do not modify repository files.
- Do not launch Builder.
- Do not create a Scheduled Job.
- Keep output short and directly tied to observability verification.

### Recommended next build slice

**Slice: Immediate Execution Observability Verification**

Add or verify UI/API evidence that an immediate work-item launch:

- appends/latest-updates execution output,
- links output to the correct work item ID,
- shows the launch mode as immediate/manual,
- does not create or mutate Scheduled Job records,
- exposes enough metadata for operator confidence: repo path, branch, phase, profile, run id.
```

Final response excerpt:

```text
Acknowledged run id: `observability-20260430T123302Z`

Work item: `3c4e7252-ee14-4288-a38f-bf3deb81c4db`  
Project: `production-dogfood-family-command-center-abacus`  
Role/phase: `planner` / `research`  
Repo path verified: `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`  
Branch verified: `test-hermes-workspace`  
HEAD: `16b6fc4`  
Workspace health: `200`

No files modified by this planner run. Existing repo state already had one untracked file before planning:
`docs/plans/production-dogfood-family-command-center-abacus-a77f3914-planner-draft.md`

No Scheduled Job was created. Cron job list was inspected only; no create/update action was taken.

## Grounded plan

### Objective

Use this immediate Mission Control launch to verify observability for live dogfood execution records, specifically that the immediate execution path captures the latest planner output without accidentally creating a Scheduled Job.

### Proposed acceptance criteria

1. Immediate execution record for work item `3c4e7252-ee14-4288-a38f-bf3deb81c4db` shows latest output from this planner run.
2. Output includes run id `observability-20260430T123302Z`.
3. Output includes grounded repo path `/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS`.
4. No Scheduled Job definition is created for this immediate work-item launch.
5. The execution remains associated with project `production-dogfood-family-command-center-abacus` and work item `3c4e7252-ee14-4288-a38f-bf3deb81c4db`.

### Open questions

- Does Mission Control expose the immediate execution record UI/API in a way that clearly distinguishes immediate launches from Scheduled Jobs?
- Should immediate planner launches display repo/branch/HEAD metadata automatically, or rely on agent output?
- Should existing unrelated cron jobs be hidden from this work-item context to avoid operator confusion?

### Constraints

- Research/planning only.
- Do not modify repository files.
- Do not launch Builder.
- Do not crea
```

Browser/DOM evidence:

- `/executions/239bc80f-61b4-4b90-ad3c-2fd2ff1f3e13` displayed Execution Evidence, Live progress, Latest output, and Final response.
- Work Item detail displayed Execution Evidence for execution `239bc80f`, plus Latest output and Final response in the Work Item evidence/cockpit area.
- Work Item execution trace links stayed on `/executions` and did not point to `/jobs?jobId`.

## Commands run

| Command | Result |
|---|---|
| `pnpm test src/server/work-item-run-timeline.test.ts src/screens/executions/execution-detail-screen.test.ts -- --runInBand` | RED first: 3 expected failures before Task 3 implementation |
| `pnpm test src/server/work-item-execution.test.ts src/server/immediate-execution-launch.test.ts src/server/work-item-run-timeline.test.ts src/screens/executions/execution-detail-screen.test.ts -- --runInBand` | PASS, 47 tests |
| `pnpm exec tsc --noEmit --pretty false` | PASS |
| `pnpm exec eslint src/server/work-item-run-timeline.ts src/server/work-item-run-timeline.test.ts src/lib/projects-api.ts src/screens/projects/work-item-detail-screen.tsx --max-warnings=0` | PASS |
| `git diff --check` | PASS |
| `pnpm build` | PASS with existing Vite dynamic-import/chunk warnings |
| `pnpm vitest run` | PASS, 82 files / 537 tests |
| `pnpm exec eslint . --max-warnings=0` | PASS |
| `systemctl --user restart hermes-workspace.service && root curl smoke` | PASS after one expected readiness retry |
| `POST /api/work-items` then `POST /api/work-items/:id/launch` phase=research | PASS, immediate execution `239bc80f-61b4-4b90-ad3c-2fd2ff1f3e13` |
| `GET /api/hermes-jobs` before/after | PASS, no new job ids |

## Limitations / notes

- The live gateway used the immediate chat-completion fallback initially, then completed successfully with final output in the durable execution run.
- No repo files were modified by the live dogfood Planner run; the run output notes a pre-existing untracked ABACUS plan file.
