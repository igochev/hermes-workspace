# R12 Profile-Backed Release Lane Gauntlet Plan

## CEO decision

After R8-R11, prove the whole profile-backed release lane on one controlled work item before broadening autonomy.

## Goal

Run one end-to-end release-lane gauntlet using the first-class profile contracts/profiles: Planner/Builder/Reviewer, Supervisor audit, deterministic or AI-assisted Merge-Healer as policy allows, and truthful evidence in Workspace.

## In scope

- Create or select one controlled low-risk Hermes Workspace work item.
- Backup `~/.hermes/projects.json` and `~/.hermes/work-items.json` before live mutations.
- Verify profile readiness before launch.
- Run the lane through build, review, Supervisor audit, merge/deploy gate, and final state.
- Browser/API verify Work Item detail evidence and execution links.
- Write final verdict report.

## Out of scope

- No parallel worktrees.
- No always-on unattended loop beyond this named work item.
- No force-merge or silent manual JSON success edits.
- No Discord gateways for release profiles unless owner already approved.

## Task sequence

1. Preflight profiles and project policy.
2. Backup live Workspace JSON.
3. Launch one controlled lane item.
4. Observe through `/executions`, API, and browser UI.
5. If blocked, record exact profile/policy/test/conflict reason and recovery recommendation.
6. If passed, record merge/deploy evidence and final state.
7. Write `dogfood-output/profile-backed-release-lane-gauntlet-latest.md` and compact handoff with next owner decision.

## Verification commands

```bash
hermes profile list
curl --max-time 12 -fsS http://127.0.0.1:3456/api/projects/46b401f9-9243-472f-b5b7-04bf34596906 -o /tmp/r12-project.json
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run --reporter=dot
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl --max-time 12 -fsS http://127.0.0.1:3456/ -o /tmp/hermes-workspace-root.html && wc -c /tmp/hermes-workspace-root.html
git diff --check
```

## Acceptance criteria

- One controlled work item runs with truthful profile-backed release-lane evidence.
- Supervisor audit evidence is visible in API/UI.
- Merge-Healer path is either successful with evidence or blocked with exact reason.
- No lifecycle state is manually faked.
- Final report gives Main/D3n13r a go/no-go for broader profile-backed release automation.
