# Hermes Workspace — R7 Release Lane Packaging + Profile Readiness Plan

> **For Builder:** Start only after reading `docs/handoff/current-slice-status.md` and the implementation index. This is the next authorized task after R6 completed the release supervisor audit gate. This is a packaging/readiness slice, not a new feature build and not ad-hoc profile creation.

## 1. CEO decision

R6 made the deploy/release safety gate explicit: Merge-Healer is now blocked by durable release-audit evidence when policy requires it, and missing Supervisor evidence no longer silently falls through to Builder.

That means we are **close to** creating dedicated release profiles, but not by hand on a dirty mixed branch. The correct next step is:

1. package and Main-review the in-flight R3/R4/R5/R6 release-lane changes into a clean evidence package;
2. fix stale continuation docs so no Builder restarts R6;
3. produce a precise profile-readiness matrix for `deployer` / `merge-healer` and `supervisor`;
4. leave actual Hermes profile creation for a separate owner-approved profile-creation task after the package is clean.

## 2. Scope

### In scope

- Inspect current dirty worktree and classify files by slice: R3/R4/R5/R6/docs/reports versus unrelated runtime state.
- Re-run final Workspace gates for the release-lane package.
- Verify R6 release audit evidence is visible in the Work Item detail UI or DOM.
- Update docs so R6 is marked complete and this R7 packaging/profile-readiness task is the active task.
- Write a final packaging/readiness report under `dogfood-output/release-lane-packaging-profile-readiness-latest.md` plus timestamped copy.
- Produce a profile-readiness matrix covering:
  - existing profiles: `default`, `planner`, `builder`, `researcher`, `websonar`;
  - missing proposed profiles: `deployer` / `merge-healer`, `supervisor`;
  - required capabilities, model/provider, gateway need, auth source, profile-home path, and Workspace mapping requirements;
  - what is safe to create now versus what still needs code/policy support.

### Out of scope / non-negotiables

- Do **not** create `~/.hermes/profiles/deployer`, `~/.hermes/profiles/supervisor`, or any new gateway/runtime directories in this slice.
- Do **not** start another product feature slice such as generic Idea Intake / Autopilot while the release-lane branch is dirty.
- Do **not** commit or push unless D3n13r explicitly authorizes packaging after the report.
- Do **not** change live project policy, always-on/retry/PR/cleanup settings, or ABACUS deploy state.
- Do **not** map Supervisor or Deploy to `builder` as a fallback.
- Preserve PATCH partial-update safety, R5 branch-evidence recovery, and R6 release-audit gate semantics.

## 3. Required inspection first

Run and record:

```bash
git status --short --branch
git diff --stat
git diff --name-only
hermes profile list
hermes profile show builder
hermes profile show planner
hermes profile show researcher
```

Read:

- `docs/handoff/current-slice-status.md`
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
- `docs/plans/2026-05-01-hermes-workspace-r6-release-supervisor-audit-gate-plan.md`
- `dogfood-output/release-supervisor-audit-gate-latest.md`
- `docs/plans/2026-04-25-hermes-workspace-profiles-workflow-rearchitecture.md`
- Hermes profile docs/skill notes already summarized in the plan: profiles must be first-class profile homes, not ad-hoc overlays.

## 4. Task plan

### Task 1 — Diff classification and stale-doc cleanup

Create a package inventory that groups current files into:

1. release-lane source changes that belong in this package;
2. release-lane docs/plans/reports that belong in this package;
3. unrelated runtime/project/candidate-repo state that must not be touched;
4. generated artifacts that need verification or regeneration.

Update the implementation index if it still says R6 is active after this plan becomes active.

### Task 2 — Final gate rerun for package confidence

Run and record:

```bash
pnpm exec tsc --noEmit --pretty false
pnpm exec eslint . --max-warnings=0
pnpm vitest run --reporter=dot
pnpm build
git diff --check
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
curl --max-time 12 -fsS http://127.0.0.1:3456/ -o /tmp/hermes-workspace-root.html && wc -c /tmp/hermes-workspace-root.html
```

If a gate fails, fix only changed-file/package blockers. Do not start unrelated cleanup.

### Task 3 — Live UI/API spot check for R6 evidence

Verify an actual Work Item detail route/API response exposes release-audit fields/copy. At minimum:

- API GET for the R6 work item or a synthetic/read-only fixture-like existing item includes release audit fields when present;
- live DOM/browser check proves release audit evidence copy appears on the Work Item detail screen;
- no console errors related to the Work Item detail screen.

### Task 4 — Profile-readiness matrix

Write a concise but operational matrix in the final report:

| Role | Current profile? | Proposed profile home | Gateway needed? | Model/provider | Capabilities required | Safe next action |
|---|---|---|---|---|---|---|

CEO expectation:

- `deployer` / `merge-healer` may be deterministic server code today; if a profile is proposed, it must own integration/deploy evidence only after exact permissions and branch safety are defined.
- `supervisor` should audit/veto release evidence and produce structured output; it must not be a hidden Builder alias.
- New profiles require first-class `~/.hermes/profiles/<name>/` homes with config/auth/logs/gateway state, not overlays.
- Discord gateways are optional and likely unnecessary for Workspace-only profiles unless D3n13r explicitly asks for Discord interaction.

### Task 5 — Final report and handoff

Write:

- `dogfood-output/release-lane-packaging-profile-readiness-latest.md`
- `dogfood-output/release-lane-packaging-profile-readiness-<timestamp>.md`

Report must include:

- verdict: package-ready / blocked;
- exact gate results;
- live UI/API evidence;
- diff classification;
- profile-readiness matrix;
- recommended next owner action: commit/push package, then authorize dedicated profile creation/mapping plan if package-ready.

Update `docs/handoff/current-slice-status.md` before stopping. Keep it compact.

## 5. Acceptance criteria

- [ ] R6 is no longer represented as active after R7 starts; R7 packaging/profile-readiness is the active task.
- [ ] Dirty worktree is classified and package boundaries are clear.
- [ ] Full typecheck, ESLint, Vitest, build, diff-check, service smoke, and root smoke are recorded.
- [ ] R6 release-audit UI/API evidence is live-verified.
- [ ] No new Hermes profiles, gateways, or profile directories are created in this slice.
- [ ] Profile-readiness matrix makes an explicit go/no-go recommendation for `deployer` / `merge-healer` and `supervisor`.
- [ ] Final report and compact handoff are updated.

## 6. Copy-paste Builder prompt

```text
proceed on Hermes Workspace

Repo: /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
Read first: docs/handoff/current-slice-status.md
Active plan: docs/plans/2026-05-01-hermes-workspace-r7-release-lane-packaging-profile-readiness-plan.md

Execute R7 Release Lane Packaging + Profile Readiness. This is not a new feature build and not ad-hoc profile creation. Classify the dirty R3/R4/R5/R6/R7 worktree, rerun full gates, live-verify R6 release-audit evidence, write dogfood-output/release-lane-packaging-profile-readiness-latest.md plus timestamped copy, and update docs/handoff/current-slice-status.md. Do not create Deploy/Supervisor profiles, do not map them to Builder, and do not commit/push unless D3n13r explicitly authorizes packaging.
```
