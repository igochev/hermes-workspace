# Hermes Workspace — Dream Mission Control Implementation Plan Index (Updated 2026-04-26)

> **For Hermes:** This is the implementation entrypoint for Dream Mission Control. Builder should start here only after reading `docs/handoff/current-slice-status.md`.
>
> **Current active implementation plan:** `docs/plans/2026-04-28-hermes-workspace-p0-terminology-deeplink-sanity-plan.md`
>
> **Previous merge-readiness plan:** `docs/plans/2026-04-28-hermes-workspace-always-on-merge-readiness-plan.md`
>
> **Previous always-on policy plan:** `docs/plans/2026-04-28-hermes-workspace-always-on-operator-policy-plan.md`
>
> **Previous single-lane hardening plan:** `docs/plans/2026-04-28-hermes-workspace-single-lane-production-hardening-plan.md`
>
> **Previous production-readiness plan:** `docs/plans/2026-04-26-hermes-workspace-production-readiness-dogfood-plan.md`
>
> **Previous CEO/Architect gap analysis:** `docs/plans/2026-04-26-hermes-workspace-next-cycle-gap-analysis.md`
>
> **Roadmap correction, 2026-04-27:** Default execution model is **single-lane autonomy per repo/project**: one active work item, one dedicated feature branch, Planner → Builder → Reviewer → Merge-Healer, persistent evidence, visible recovery controls. Parallel worktrees are future opt-in optimization only after single-lane autonomy and merge healing are proven.
>
> **Repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

---

## 1. Why this index exists

This index keeps Builder sessions cheap and reliable. Historical roadmaps and shipped slice plans remain valuable, but Builder should implement only the active detailed plan referenced by `docs/handoff/current-slice-status.md`.

**Rule for implementers:** do not implement from high-level analysis directly. Implement from the detailed slice plan in the handoff.

---

## 2. Canonical implementation order

### Cycle 1 — shipped

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-25-hermes-workspace-slice-n-o-idea-planner-enrichment-plan.md` | Rough idea → Planner-prepared draft → ready work item | Shipped |
| 2 | `2026-04-25-hermes-workspace-slice-p-q-autopilot-suggestions-plan.md` | Project-aware Autopilot suggestion inbox and scout schedules | Shipped |
| 3 | `2026-04-25-hermes-workspace-slice-t-u-structured-review-quality-gates-plan.md` | Parse Planner review output and enforce quality gates | Shipped |
| 4 | `2026-04-25-hermes-workspace-slice-r-s-execution-runs-supervisor-plan.md` | Durable run records, stale supervisor, global attention, capacity policy | Shipped |

### Cycle 2 — shipped

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-26-hermes-workspace-slice-v-w-telemetry-realtime-truth-plan.md` | Dashboard token/session telemetry and realtime session updates | Shipped |
| 2 | `2026-04-26-hermes-workspace-slice-x-y-profile-role-preflight-plan.md` | Profile/role readiness preflight for phase mappings and launches | Shipped but exposed production UX gap: readiness was not fully actionable |
| 3 | `2026-04-26-hermes-workspace-slice-z-aa-autopilot-delegation-policies-plan.md` | Developer-grade Autopilot delegation policies and Convert+Plan actions | Shipped |
| 4 | `2026-04-26-hermes-workspace-slice-ab-ac-recovery-actions-supervisor-controls-plan.md` | Recovery actions and supervisor controls for failed/stale runs | Shipped |

### Production Readiness Cycle — shipped

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-26-hermes-workspace-production-readiness-dogfood-plan.md` | Real-project dogfood against `family_command_center-ABACUS`, Profile Readiness actionability, and UI clickability audit | Shipped |

### Single-Lane Autonomy Roadmap — shipped

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-27-hermes-workspace-single-lane-autonomy-roadmap-implementation-plan.md` | Reframe Mission Control around one stable autonomous lane per repo/project: branch-based execution, Planner-on-lane-entry, Builder evidence, Merge-Healer, lane cockpit, branch-based E2E | Shipped; live Task 8 PASS report `dogfood-output/single-lane-autonomy-e2e-2026-04-27T22-39-20-392Z.md` |

### Single-Lane Production Hardening — shipped

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-28-hermes-workspace-single-lane-production-hardening-plan.md` | Turn the one-item single-lane PASS into production reliability: repeatable harness, 3-item sequential gauntlet, blocked recovery, UI truth, repo hygiene, final ACCEPTED/CONDITIONALLY ACCEPTED/REJECTED verdict | Shipped; ACCEPTED for supervised production daily use. Report: `dogfood-output/single-lane-production-hardening-latest.md` |

### Always-On Operator Policy — shipped

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-28-hermes-workspace-always-on-operator-policy-plan.md` | Define and implement owner-approved policy for bounded retries, lane escalation notifications, PR publishing gates, and branch/stash cleanup retention before fully unattended operation | Shipped; ACCEPTED FOR SUPERVISED ALWAYS-ON POLICY ONLY. Report: `dogfood-output/always-on-policy-gauntlet-latest.md` |

### Always-On Merge Readiness / Type-Lint Stabilization — shipped

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-28-hermes-workspace-always-on-merge-readiness-plan.md` | Clean changed-file TypeScript/ESLint blockers, preserve green functional verification, and produce a final pre-commit review package for the completed Always-On slice | Shipped; committed and pushed at `d3026c4`; final package `dogfood-output/always-on-merge-readiness-final-latest.md` |

### Operator UX Clarity Cycle — active

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| P0 | `2026-04-28-hermes-workspace-p0-terminology-deeplink-sanity-plan.md` | Rename confusing scheduled-job/work-item execution labels and make `/jobs?jobId=...` a sane temporary execution-trace landing path | Active |
| P1 | `2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md` | Work Item Cockpit progressive disclosure: Operator Summary first, raw IDs advanced/collapsed, evidence promoted | Queued; Main/CEO to create detailed plan after P0 review |
| P2 | `2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md` | Dedicated Runs/Executions surface so work-item traces stop landing on Scheduled Jobs | Queued; requires architecture plan after P1 |
| P3 | `2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md` | Morning Review / overnight operator digest | Queued; requires architecture plan after P2 |

### Production Acceptance Cycle — superseded by single-lane correction

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-27-hermes-workspace-production-acceptance-real-project-plan.md` | Final real-project acceptance gauntlet: candidate repo baseline, all Hermes tests/build/lint, service/API smoke, live dogfood, browser spot-check, verdict report | Historical / superseded until single-lane branch autonomy is implemented |

---

## 3. Current project architecture baseline

Current inspected baseline:

- Branch: `my-hermes-workspace-dev`
- Commit inspected for this update: `d3026c4`
- Test command: `pnpm vitest run` or `pnpm test`
- Build command: `pnpm build`
- Service: `hermes-workspace.service`
- Local app: `http://localhost:3456`

Core seams:

| Area | Existing files |
|---|---|
| Projects | `src/server/projects-store.ts`, `src/routes/api/projects.ts`, `src/routes/api/projects.$projectId.ts` |
| Work items | `src/server/work-items-store.ts`, `src/routes/api/work-items.ts`, `src/routes/api/work-items.$workItemId.ts` |
| Lifecycle | `src/server/work-item-lifecycle.ts`, `src/routes/api/work-items.$workItemId.lifecycle.ts` |
| Launch/execution | `src/server/work-item-launch.ts`, `src/server/work-item-execution.ts`, `src/server/conductor-launch.ts` |
| Phase profiles | `src/lib/conductor-phase-profiles.ts`, `src/server/work-item-launch.ts` |
| Approvals/review gates | `src/server/work-item-approvals.ts`, `src/server/work-item-review-decision.ts`, `src/routes/api/work-item-approvals*.ts` |
| Execution runs/supervisor | `src/server/execution-runs-store.ts`, `src/server/work-item-supervisor.ts`, `src/routes/api/work-items.supervisor.reconcile.ts` |
| Attention queue | `src/server/attention-queue.ts`, `src/server/attention-queue-store.ts`, `src/routes/api/attention-queue.ts` |
| Autopilot | `src/server/autopilot-suggestions-store.ts`, `src/routes/api/autopilot-suggestions*`, `src/screens/projects/*autopilot*` |
| Dashboard | `src/screens/dashboard/dashboard-screen.tsx` |
| Jobs / scheduled jobs | `src/screens/jobs/jobs-screen.tsx`, `src/lib/jobs-api.ts`, `src/routes/api/jobs*` |
| Work-item detail UX | `src/screens/projects/work-item-detail-screen.tsx`, `src/server/work-item-run-timeline.ts` |
| Chat sessions/events | `src/components/workspace-shell.tsx`, `src/screens/chat/chat-queries.ts`, `src/routes/api/sessions.ts`, `src/routes/api/chat-events.ts` |

---

## 4. Non-negotiable architecture rules

1. **Work Item is the source of truth.** Hermes jobs and Conductor runs are execution engines only.
2. **Structured output before mutation.** Planner/Reviewer output must be parsed and validated before mutating work-item fields or approvals.
3. **Suggestions before autonomous code.** Autopilot creates suggestions and policy-gated plans, not silent direct code changes.
4. **File-backed first, DB later.** Keep new stores merge-safe using current JSON-store conventions.
5. **Observe before auto-retry.** Recovery actions can be recommended and clicked; fully automatic retry loops need an explicit future policy.
6. **No random UI-triggered automation.** Use server routes/helpers so rules are testable.
7. **TDD is mandatory.** Add failing tests first where practical, then minimal implementation.
8. **Every slice updates docs/handoff after verification.** Keep continuation accurate.
9. **Preserve PATCH partial-update safety.** Do not include undefined fields that wipe arrays such as `acceptanceCriteria`.
10. **Role routing must be visible.** If a work item launches through a profile, the operator should see which profile and why.
11. **Single-lane autonomy is the default.** Each repo/project should process one active autonomous work item at a time on one dedicated feature branch. Queue additional work; do not silently spawn parallel worktrees.
12. **Plan from current code.** Planner should normally prepare a work item when it is entering the lane, after previous successful work has been integrated, so plans account for the latest code/docs.
13. **Blocked does not mean frozen.** A blocked item may be parked with explicit evidence and recovery controls so the lane can continue to the next queued item without hidden parallelism.
14. **Merge-Healer before parallelism.** Autonomous merge/rebase/test/conflict healing must be first-class and visible before worktree-based parallel execution becomes a default option.

---

## 5. Execution protocol for Builder

When the user sends a minimal prompt like `proceed on Hermes Workspace`:

1. Navigate to the repo: `~/.Hermes/workspace/projects/hermes-workspace`.
2. Read first: `docs/handoff/current-slice-status.md`.
3. Read this index for architecture rules if needed.
4. Read only the active detailed slice plan from the handoff.
5. Implement the next uncompleted task.
6. Update `docs/handoff/current-slice-status.md` after each task or before stopping.
7. Report tests/build/live verification status.

For every task:

1. inspect exact files named in the plan;
2. write failing tests where practical;
3. run focused test and confirm RED;
4. implement minimal code;
5. run focused test and adjacent tests;
6. update handoff.

For every shipped slice:

```bash
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Then live verify UI/API changes.

---

## 6. Documentation map and status

| Document | Status | How to use now |
|---|---|---|
| `2026-04-28-hermes-workspace-p0-terminology-deeplink-sanity-plan.md` | Active Operator UX Clarity plan | Builder executes now: scheduled-job terminology, work-item execution labels, `/jobs?jobId=...` deep-link behavior, live UI verification |
| `2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md` | Current UX roadmap / queued P1-P3 source | Use for P1/P2/P3 context only; do not implement directly until Main creates each detailed plan |
| `2026-04-28-hermes-workspace-always-on-merge-readiness-plan.md` | Shipped stabilization plan | Historical; final package `dogfood-output/always-on-merge-readiness-final-latest.md`; committed at `d3026c4` |
| `2026-04-28-hermes-workspace-always-on-operator-policy-plan.md` | Shipped owner-policy plan | Accepted for supervised always-on policy only; report `dogfood-output/always-on-policy-gauntlet-latest.md` |
| `2026-04-28-hermes-workspace-single-lane-production-hardening-plan.md` | Shipped | Accepted supervised production daily use; report `dogfood-output/single-lane-production-hardening-latest.md` |
| `2026-04-27-hermes-workspace-single-lane-autonomy-roadmap-implementation-plan.md` | Shipped | Single-lane autonomy implementation; live Task 8 PASS report exists |
| `2026-04-27-hermes-workspace-production-acceptance-real-project-plan.md` | Historical / superseded | Revisit after single-lane autonomy is functional |
| `2026-04-26-hermes-workspace-production-readiness-dogfood-plan.md` | Shipped production-readiness plan | Historical context; harness and clickability coverage created here |
| `2026-04-26-hermes-workspace-next-cycle-gap-analysis.md` | Previous analysis | Strategy/context only; do not implement directly |
| This index | Current implementation entrypoint | Builder reads after handoff |
| `2026-04-26-hermes-workspace-slice-v-w-telemetry-realtime-truth-plan.md` | Shipped | Historical context/regression expectations |
| `2026-04-26-hermes-workspace-slice-x-y-profile-role-preflight-plan.md` | Shipped with discovered UX gap | Historical context; production readiness plan now fixes actionability |
| `2026-04-26-hermes-workspace-slice-z-aa-autopilot-delegation-policies-plan.md` | Shipped | Historical context/regression expectations |
| `2026-04-26-hermes-workspace-slice-ab-ac-recovery-actions-supervisor-controls-plan.md` | Shipped | Historical context/regression expectations |
| Cycle 1 slice plans N/O, P/Q, T/U, R/S | Shipped historical implementation plans | Use only for context/regression expectations |
| `2026-04-25-hermes-workspace-profiles-workflow-rearchitecture.md` | Profile/pipeline architecture record | Use for profile assumptions |
| `2026-04-25-hermes-workspace-workflow-quality-analysis.md` | Historical gap analysis | Mostly superseded by 2026-04-26 analysis |
| `2026-04-21-hermes-workspace-mission-control-roadmap.md` | Long historical roadmap | Keep; append snapshots only if needed |

---

## 7. Current queued dependency graph

```text
P0: Terminology cleanup + /jobs?jobId deep-link sanity
  └─ removes immediate scheduled-job / execution-trace confusion

P1: Work Item Cockpit progressive disclosure
  └─ depends on P0 vocabulary; reorganizes first viewport and advanced metadata

P2: Dedicated Runs / Executions surface
  └─ depends on P1 cockpit and requires an architecture decision for execution IDs/routes

P3: Morning Review / overnight digest
  └─ depends on trustworthy cockpit/execution evidence so digest is grounded in real lane state
```

---

## 8. Definition of Done for every plan

A plan is not shipped until:

- all new tests pass;
- relevant existing tests pass;
- full regression passes;
- `pnpm build` passes;
- route tree/generated route artifacts are updated if necessary;
- service restarts if runtime changed;
- UI/API live verification is completed;
- continuation handoff and relevant docs are updated.

---

## 9. Immediate next action

Start with:

`docs/plans/2026-04-28-hermes-workspace-p0-terminology-deeplink-sanity-plan.md`

Builder should execute Task 1 first: add visible copy constants and baseline tests for terminology. Purpose: remove immediate UX confusion before deeper Work Item Cockpit and Runs/Executions surfaces.

## 10. After P0 ships

When P0 is complete, Builder should update the handoff with focused tests, full regression/build result, service/root smoke, browser/DOM evidence for `/jobs`, `/jobs?jobId=...`, Work Item detail, and Dashboard labels. Main/CEO should then review P0 and create the detailed P1 Work Item Cockpit progressive-disclosure plan. P2 and P3 remain queued architecture slices after P1.
