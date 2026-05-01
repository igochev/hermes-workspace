# R7 Release Lane Packaging + Profile Readiness — Dogfood Report

- **Repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- **Branch:** `my-hermes-workspace-dev`
- **HEAD:** `da9681ec11e7ce80bb72e52587e7f44d573496f5`
- **Completed:** 2026-05-01T20:42:59+03:00
- **Plan:** `docs/plans/2026-05-01-hermes-workspace-r7-release-lane-packaging-profile-readiness-plan.md`
- **Work item:** `60d35465-0bf7-4c72-b2ee-543faad67bc5`

## Verdict

**PACKAGE-READY for owner review/packaging authorization.**

Full release-lane gates reran green, R6 API/UI release-audit evidence is visible in the live app, and profile readiness is clear enough for Main/CEO to authorize packaging. This slice did **not** create deployer, merge-healer, or supervisor profiles, did **not** map them to Builder, and did **not** commit or push.

Recommended owner action:

1. Review this report and the classified dirty worktree.
2. If accepted, explicitly authorize packaging/commit/push for the release-lane bundle.
3. After the package is clean, create a separate owner-approved plan for first-class `deployer` / `merge-healer` and `supervisor` profiles/mapping.

## Required inspection results

### Git state

`git status --short --branch` showed branch `my-hermes-workspace-dev...origin/my-hermes-workspace-dev` with mixed staged/unstaged/untracked release-lane work.

- Staged adds/modifications include R5 branch-evidence recovery plan/report/source/route/tests and `src/routeTree.gen.ts`.
- Unstaged modifications include R6 release-audit gate source/tests, immediate execution/local execution support, API DTO/model persistence, UI detail evidence, roadmap/index/handoff docs.
- Untracked files include R3/R4/R6/R7 plans, R3/R4/R6 dogfood reports/evidence, and R6 helper/local execution files.

### Hermes profile inventory

`hermes profile list`:

| Profile | Model/provider | Gateway | Alias | Packaging note |
|---|---|---:|---|---|
| `default` | `gpt-5.5` / `openai-codex` | running | — | Existing Main/default profile. |
| `builder` | `gpt-5.5` / `openai-codex` | running | `builder` | Existing implementation profile; do not alias Deploy/Supervisor to it. |
| `planner` | `gpt-5.4` / `openai-codex` | stopped | `planner` | Existing planning/review-capable profile home. |
| `researcher` | `openai/gpt-4.1` / `openrouter` | stopped | `researcher` | Existing ad-hoc research profile home. |
| `websonar` | `gpt-5.2` | running | `websonar` | Existing web/research-oriented profile; not a release supervisor. |

`hermes profile show builder`, `planner`, and `researcher` all resolved first-class homes under `/home/d3ni3/.hermes/profiles/<name>` with `.env` and `SOUL.md` present.

Explicit profile non-creation check:

```text
deployer: absent
merge-healer: absent
supervisor: absent
```

## Diff classification

### 1. Release-lane source changes that belong in the package

R2/R3 immediate execution and real-run observability support:

- `src/server/local-hermes-execution.ts`
- `src/server/immediate-execution-launch.ts`
- `src/server/immediate-execution-launch.test.ts`
- `src/server/execution-runs-store.ts`
- `src/server/execution-runs-store.test.ts`
- `src/server/work-item-execution.ts`
- `src/server/work-item-execution.test.ts`
- `src/server/work-item-launch.ts`
- `src/server/work-item-launch.test.ts`

R5 branch-evidence recovery:

- `src/routes/api/work-items.$workItemId.branch-evidence-recovery.ts`
- `src/server/work-item-branch-evidence-recovery.ts`
- `src/server/work-item-branch-evidence-recovery.test.ts`
- `src/server/work-item-branch-evidence-recovery-routes.test.ts`
- `src/routeTree.gen.ts`

R6 release-audit gate and visible evidence:

- `src/server/work-item-release-audit-gate.ts`
- `src/server/work-item-orchestrator.ts`
- `src/server/work-item-orchestrator.test.ts`
- `src/server/work-items-store.ts`
- `src/server/work-items-store.test.ts`
- `src/server/projects-store.ts`
- `src/lib/projects-api.ts`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/screens/projects/work-item-detail-screen.test.ts`

### 2. Release-lane docs/plans/reports that belong in the package

- `docs/plans/2026-04-30-hermes-workspace-real-abacus-daily-brief-autonomous-gauntlet-plan.md`
- `docs/plans/2026-05-01-hermes-workspace-autonomous-release-policy-activation-plan.md`
- `docs/plans/2026-05-01-hermes-workspace-r5-branch-evidence-recovery-plan.md`
- `docs/plans/2026-05-01-hermes-workspace-r6-release-supervisor-audit-gate-plan.md`
- `docs/plans/2026-05-01-hermes-workspace-r7-release-lane-packaging-profile-readiness-plan.md`
- `docs/handoff/current-slice-status.md`
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-roadmap.md`
- `dogfood-output/real-abacus-*.md`
- `dogfood-output/real-abacus-daily-brief-*.md/json/png`
- `dogfood-output/release-supervisor-audit-gate-latest.md`
- `dogfood-output/release-lane-packaging-profile-readiness-latest.md`
- `dogfood-output/release-lane-packaging-profile-readiness-2026-05-01T17-42-59Z.md`

### 3. Unrelated runtime/project/candidate state that must not be touched

No candidate repo files were staged or edited by R7. Live runtime data under `/home/d3ni3/.hermes` was read for verification only. The existing mixed staged/unstaged state from prior R3/R4/R5/R6 work was preserved; R7 added only this report and docs/handoff/index cleanup.

### 4. Generated artifacts

- `src/routeTree.gen.ts` is a generated TanStack route artifact for the R5 branch-evidence recovery route and belongs in the package.
- `dist/` build output was regenerated by `pnpm build` but remains ignored/unpackaged.

## Final gate results

Commands run from `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`:

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit --pretty false` | ✅ pass |
| `pnpm exec eslint . --max-warnings=0` | ✅ pass |
| `pnpm vitest run --reporter=dot` | ✅ pass — 84 files / 566 tests |
| `pnpm build` | ✅ pass — Vite build completed; existing sourcemap/dynamic-import/chunk-size warnings only |
| `git diff --check` | ✅ pass |
| `systemctl --user restart hermes-workspace.service` | ✅ exit 0 |
| `systemctl --user is-active hermes-workspace.service` | ✅ `active` |
| `curl --max-time 12 -fsS http://127.0.0.1:3456/ -o /tmp/hermes-workspace-root.html && wc -c /tmp/hermes-workspace-root.html` | ✅ root smoke eventually succeeded after initial socket warmup; `10749 /tmp/hermes-workspace-root.html` |

Vitest warnings about portable gateway missing optional APIs (`sessions`, `enhancedChat`, `skills`, `config`, `dashboard`) are the known local dashboard/gateway capability state and did not block tests.

## Live R6 API/UI evidence

### API

`GET http://127.0.0.1:3456/api/work-items/0b8f7e04-498c-4229-b652-e2b0777818f7` for **R6 Release Supervisor Audit Gate** returned release-audit fields in the live API DTO:

```json
{
  "id": "0b8f7e04-498c-4229-b652-e2b0777818f7",
  "title": "R6 Release Supervisor Audit Gate",
  "status": "ready",
  "phase": "build",
  "releaseAuditState": null,
  "releaseAuditDecision": null,
  "releaseAuditSummary": null,
  "releaseAuditMissingEvidence": [],
  "releaseAuditReasons": [],
  "releaseAuditObservedAt": null,
  "releaseAuditProfile": null,
  "releaseAuditExecutionId": null,
  "releaseAuditMissionId": null
}
```

This verifies backward-compatible API visibility for work items that do not yet have audit decisions.

### DOM/browser

Live route checked:

`http://127.0.0.1:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906/work-items/0b8f7e04-498c-4229-b652-e2b0777818f7?v=r7verify`

Evidence:

- Onboarding modal was bypassed with `localStorage.setItem('hermes-onboarding-complete','true')`, then route was reloaded.
- Main page rendered the R6 work item detail screen.
- DOM HTML contains release-audit evidence rows under advanced execution metadata:
  - `Release supervisor audit evidence · Audit state` → `No release audit recorded`
  - `Release supervisor audit evidence · Audit decision` → `No supervisor decision recorded`
  - `Release supervisor audit evidence · Supervisor profile` → `No Supervisor profile recorded`
  - `Release supervisor audit evidence · Audit execution` → `No audit execution recorded`
- Browser console after the check: ✅ no console messages/errors.

## Profile-readiness matrix

| Role | Current profile? | Proposed profile home | Gateway needed? | Model/provider | Capabilities required | Safe next action |
|---|---|---|---|---|---|---|
| `default` / Main | ✅ yes | `/home/d3ni3/.hermes` | ✅ already running | `gpt-5.5` / `openai-codex` | Architecture decisions, owner approval, Discord-facing coordination | Keep as owner/CEO lane; do not overload with release automation. |
| `planner` | ✅ yes | `/home/d3ni3/.hermes/profiles/planner` | No for Workspace-only runs; stopped is acceptable | `gpt-5.4` / `openai-codex` | Plan generation, acceptance criteria, possible structured review | Package-ready existing role; can remain mapped for research/planning/review after owner approval. |
| `builder` | ✅ yes | `/home/d3ni3/.hermes/profiles/builder` | ✅ already running for Discord/operator | `gpt-5.5` / `openai-codex` | TDD implementation, tests/builds, code edits | Keep as implementation role only. **Do not** use as hidden deployer/supervisor fallback. |
| `researcher` | ✅ yes | `/home/d3ni3/.hermes/profiles/researcher` | No for Workspace-only runs; stopped is acceptable | `openai/gpt-4.1` / `openrouter` | Web/source reconnaissance, feasibility checks | Existing support role; not part of release gating unless a future plan says so. |
| `websonar` | ✅ yes | `/home/d3ni3/.hermes/profiles/websonar` | ✅ already running | `gpt-5.2` | Web-heavy research/search | Existing profile; not a release supervisor/deployer. |
| `deployer` | ❌ no | `/home/d3ni3/.hermes/profiles/deployer` if approved | Usually no Discord gateway; Workspace/server-launched only | TBD by owner; likely reliable code-capable model/provider with constrained permissions | Integration/deploy evidence collection, branch safety checks, test/deploy command execution, no broad repo mutation without policy | **Not safe to create in R7.** Safe next action is a dedicated profile-creation/mapping plan defining permissions, auth, repo sandboxing, and policy gates. |
| `merge-healer` | ❌ no; deterministic server Merge-Healer exists | `/home/d3ni3/.hermes/profiles/merge-healer` only if AI-assisted merge healing is approved | Usually no Discord gateway; Workspace/server-launched only | TBD; code-capable model/provider if AI merge repair is desired | Rebase/merge conflict repair, test reruns, branch hygiene, evidence artifact writing, hard repo safety budget | **Not safe to create in R7.** Continue deterministic server Merge-Healer until owner-approved profile plan defines conflict-repair boundaries. |
| `supervisor` | ❌ no | `/home/d3ni3/.hermes/profiles/supervisor` if approved | Usually no Discord gateway; Workspace/server-launched only | TBD; independent reviewer-grade model/provider | Structured release audit/veto output, missing-evidence detection, policy/risk assessment, no code mutation | **Not safe to create in R7.** R6 code is ready to expose/persist audit evidence; next profile plan must make Supervisor first-class and never alias to Builder. |

## Go/no-go for new profiles

- `deployer` / `merge-healer`: **NO-GO in this slice.** Deterministic server-side Merge-Healer is package-ready; profile creation needs a dedicated permissions/policy plan.
- `supervisor`: **NO-GO in this slice.** R6 made the release-audit gate explicit and visible, but a real Supervisor profile requires first-class home, model/provider choice, structured output contract, and explicit Workspace mapping.
- Discord gateways for these profiles: **NO by default.** Workspace-only server launches do not require public messaging gateways unless D3n13r explicitly asks for Discord interaction.

## Acceptance criteria status

- [x] R6 is no longer active; R7 packaging/profile-readiness is active/completed in handoff/index updates.
- [x] Dirty worktree classified with package boundaries.
- [x] Full typecheck, ESLint, Vitest, build, diff-check, service smoke, and root smoke recorded.
- [x] R6 release-audit UI/API evidence live-verified.
- [x] No new Hermes profiles, gateways, or profile directories created.
- [x] Profile-readiness matrix gives explicit go/no-go recommendation for `deployer` / `merge-healer` and `supervisor`.
- [x] Final report and compact handoff updated.
