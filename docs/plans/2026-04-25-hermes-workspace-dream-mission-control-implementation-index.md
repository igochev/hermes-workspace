# Hermes Workspace — Dream Mission Control Implementation Plan Index (Updated 2026-05-01)

> **For Hermes:** This is the implementation entrypoint for Dream Mission Control. Builder should start here only after reading `docs/handoff/current-slice-status.md`.
>
> **Current active implementation plan:** `docs/plans/2026-05-01-hermes-workspace-r8-release-lane-package-commit-plan.md`
>
> **Queued batch plans:** R8 package baseline → R9 release profile contracts → R10 Supervisor profile/audit launch → R11 Merge-Healer profile controlled repair → R12 profile-backed release-lane gauntlet.
>
> **Previous active implementation plan:** `docs/plans/2026-05-01-hermes-workspace-r7-release-lane-packaging-profile-readiness-plan.md`
>
> **Most recently completed implementation plan:** `docs/plans/2026-05-01-hermes-workspace-r7-release-lane-packaging-profile-readiness-plan.md` (package-ready; report `dogfood-output/release-lane-packaging-profile-readiness-latest.md`)
>
> **Next roadmap task selected by Main/CEO:** Batch queue created to reduce owner round-trips. R8 first packages/commits/pushes the classified release-lane bundle; R9 defines profile contracts; R10 creates/wires Supervisor; R11 creates/wires Merge-Healer under controlled repair policy; R12 runs the profile-backed release-lane gauntlet. Live work item ids are recorded in `docs/handoff/current-slice-status.md`.
>
> **Previous stabilization plan:** `docs/plans/2026-04-29-hermes-workspace-eslint-baseline-stabilization-plan.md`
>
> **Previous stabilization plan:** `docs/plans/2026-04-29-hermes-workspace-typescript-baseline-stabilization-plan.md`
>
> **Previous stabilization plan:** `docs/plans/2026-04-29-hermes-workspace-operator-ux-merge-readiness-hardening-plan.md`
>
> **Previous Operator UX Clarity plan:** `docs/plans/2026-04-29-hermes-workspace-p3-morning-review-overnight-digest-plan.md`
>
> **Previous Operator UX Clarity plan:** `docs/plans/2026-04-29-hermes-workspace-p2-dedicated-runs-executions-architecture-plan.md`
>
> **Previous Operator UX Clarity plan:** `docs/plans/2026-04-28-hermes-workspace-p1-work-item-cockpit-progressive-disclosure-plan.md`
>
> **Previous Operator UX Clarity plan:** `docs/plans/2026-04-28-hermes-workspace-p0-terminology-deeplink-sanity-plan.md`
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
> **Release-lane design update, 2026-05-01:** The target release lane is evidence-gated auto-merge, not blind auto-commit: Researcher/Planner prepares plans and acceptance criteria, Builder implements, Planner/Reviewer independently reviews, Merge-Healer integrates only when policy/approval/test gates pass, and a future Supervisor profile audits/vetoes the chain. Deploy/Merge and Supervisor should become dedicated profiles in a future slice; the current ABACUS deploy proof uses the deterministic server-side Merge-Healer with Deploy/Supervisor intentionally unmapped.
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

### Operator UX Clarity Cycle — active hardening

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| P0 | `2026-04-28-hermes-workspace-p0-terminology-deeplink-sanity-plan.md` | Rename confusing scheduled-job/work-item execution labels and make `/jobs?jobId=...` a sane temporary execution-trace landing path | Shipped / Main-reviewed; P0 evidence recorded in current handoff |
| P1 | `2026-04-28-hermes-workspace-p1-work-item-cockpit-progressive-disclosure-plan.md` | Work Item Cockpit progressive disclosure: Operator Summary first, raw IDs advanced/collapsed, evidence promoted | Shipped / Main-reviewed; P1 evidence recorded in current handoff |
| P2 | `2026-04-29-hermes-workspace-p2-dedicated-runs-executions-architecture-plan.md` | Dedicated Executions surface so work-item traces stop landing on Scheduled Jobs | Shipped / Main-reviewed; P2 evidence recorded in current handoff |
| P3 | `2026-04-29-hermes-workspace-p3-morning-review-overnight-digest-plan.md` | Morning Review / overnight operator digest | Functionally shipped / Main-reviewed; H1 hardening complete |
| H1 | `2026-04-29-hermes-workspace-operator-ux-merge-readiness-hardening-plan.md` | Terminology, lint, changed-file type cleanup, and final merge-readiness evidence for P0-P3 Operator UX changes | Complete / Main-reviewed; accepted for merge-readiness packaging. Final review: `dogfood-output/operator-ux-merge-readiness-main-review-latest.md` |

### TypeScript / ESLint Baseline Stabilization — shipped

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| T1 | `2026-04-29-hermes-workspace-typescript-baseline-stabilization-plan.md` | Clear repo-wide `pnpm exec tsc --noEmit` baseline debt so TypeScript can become a hard gate again | Shipped / Main-reviewed; committed at `840a67e`; final report `dogfood-output/typescript-baseline-stabilization-final-latest.md` |
| E1 | `2026-04-29-hermes-workspace-eslint-baseline-stabilization-plan.md` | Clear repo-wide ESLint baseline debt so `pnpm exec eslint . --max-warnings=0` can become a hard autonomous merge gate | Shipped; committed/pushed at `d0edae3`; final report `dogfood-output/eslint-baseline-stabilization-final-latest.md` |

### Production Dogfood Real-Idea Readiness + Real Executions Runtime — active hardening

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| Q1 | `2026-04-29-hermes-workspace-production-dogfood-queue-hygiene-real-idea-readiness-plan.md` | Clean stale ABACUS dummy/test queue items safely, preserve historical evidence, prove no stale item can auto-run, and prepare the lane for one real Family Command Center idea | Shipped; real idea created (`697d0059-a3ca-438e-b92c-481f39e7566b`) |
| R1 | `2026-04-29-hermes-workspace-real-executions-runtime-plan.md` | Replace Scheduled Job-backed Work Item launches with first-class real `/executions` runs: clickable live progress, logs/output, final results, artifacts, errors, and no normal Work Item cron-job creation | Shipped; committed/pushed at `bf6706a`; final dogfood PASS with work item `a77f3914-26cd-4cb0-b2dd-fc06eba33e7d`, execution `7b217f97-691c-4976-a6f8-35041a26591b`, report `dogfood-output/real-executions-runtime-final-latest.md` |
| R2 | `2026-04-30-hermes-workspace-immediate-execution-observability-hardening-plan.md` | Hardening after R1: stream/session heartbeat into immediate `ExecutionRunRecord`, parse immediate review final output from execution records, preserve legacy Scheduled Job compatibility, and dogfood no-new-jobs evidence | Shipped; committed/pushed at `da9681e`; final report `dogfood-output/immediate-execution-observability-final-latest.md`; Main review `dogfood-output/immediate-execution-observability-main-review-latest.md` |
| R3 | `2026-04-30-hermes-workspace-real-abacus-daily-brief-autonomous-gauntlet-plan.md` | Real product proof: take D3n13r's real Family Command Center ABACUS Daily Brief idea through Planner → Builder → Reviewer/Merge-Healer evidence using `/executions`, not dummy dogfood items | Conditionally accepted through review: Planner accepted; latest Builder execution `8581323c-20e3-4900-9764-d2aa67a2d52d` succeeded; latest Reviewer execution `867839e9-afe5-4ae7-a2fc-9e75d4f19228` returned `DECISION: APPROVED`; review approval `03d15c23-7896-4154-9c37-bd5e79c9117d` is approved. Deploy/release remains blocked by R4 missing branch evidence. |
| R4 | `2026-05-01-hermes-workspace-autonomous-release-policy-activation-plan.md` | Owner-approved conservative lane activation for the real ABACUS project: backup first, enable `autonomyLanePolicy.enabled` only, keep always-on/retry/PR/cleanup disabled/manual/dry-run, run Merge-Healer reconcile for the approved work item, and record merge/block evidence | Completed / BLOCKED BY MERGE-HEALER: backup `/home/d3ni3/.hermes/backups/autonomous-release-policy-20260501T150739Z`; policy enabled conservatively; reconcile only for work item `697d0059-a3ca-438e-b92c-481f39e7566b`; final state `blocked/deploy`, `laneState=blocked`, `mergeState=failed`, reason `Merge-Healer blocked: work item has no feature branch evidence.` Report: `dogfood-output/real-abacus-autonomous-release-latest.md`. |
| R5 | `2026-05-01-hermes-workspace-r5-branch-evidence-recovery-plan.md` | Supported recovery for R4 blocker: add validated branch-evidence recovery API, create real ABACUS recovery branch from `main`, attach evidence through API, and retry existing Merge-Healer without force-merge or manual success evidence | Completed / ACCEPTED MERGED: validated branch evidence attached through API, Merge-Healer merged ABACUS commit `b744cfa16be2a5d3c5d6f36cbc81af89765169ac`; final report `dogfood-output/real-abacus-branch-evidence-recovery-latest.md`. |
| R6 | `2026-05-01-hermes-workspace-r6-release-supervisor-audit-gate-plan.md` | Make the release/deploy Supervisor audit gate explicit before Merge-Healer: durable audit state, gate helper, orchestrator behavior, visible Work Item evidence, and no silent Supervisor→Builder fallback | Complete / Builder-verified; final report `dogfood-output/release-supervisor-audit-gate-latest.md`. |
| R7 | `2026-05-01-hermes-workspace-r7-release-lane-packaging-profile-readiness-plan.md` | Package/review release-lane R3/R4/R5/R6 work, resolve stale docs, rerun final gates, and produce deployer/merge-healer + supervisor profile-readiness matrix without creating profiles yet | Complete / package-ready; final report `dogfood-output/release-lane-packaging-profile-readiness-latest.md`. Awaiting D3n13r/Main packaging authorization before commit/push. |
| R8 | `2026-05-01-hermes-workspace-r8-release-lane-package-commit-plan.md` | Stage only the R7-classified release-lane package, rerun gates, commit/push if owner-authorized, and create a clean baseline before profiles | Active / ready for Builder |
| R9 | `2026-05-01-hermes-workspace-r9-release-profile-contracts-plan.md` | Define first-class release role contracts/readiness and prove no Builder fallback before live profile creation | Queued after R8 |
| R10 | `2026-05-01-hermes-workspace-r10-supervisor-profile-creation-audit-launch-plan.md` | Create/wire the read-only Supervisor profile and structured release audit launch | Queued after R9 |
| R11 | `2026-05-01-hermes-workspace-r11-merge-healer-profile-controlled-repair-plan.md` | Create/wire dedicated Merge-Healer profile for bounded conflict/test repair under policy gates | Queued after R10 |
| R12 | `2026-05-01-hermes-workspace-r12-profile-backed-release-lane-gauntlet-plan.md` | Prove the profile-backed release lane on one controlled work item with API/UI/evidence | Queued after R11 |

### Production Acceptance Cycle — superseded by single-lane correction

| Order | Plan | Purpose | Status |
|---:|---|---|---|
| 1 | `2026-04-27-hermes-workspace-production-acceptance-real-project-plan.md` | Final real-project acceptance gauntlet: candidate repo baseline, all Hermes tests/build/lint, service/API smoke, live dogfood, browser spot-check, verdict report | Historical / superseded until single-lane branch autonomy is implemented |

---

## 3. Current project architecture baseline

Current inspected baseline:

- Branch: `my-hermes-workspace-dev`
- Commit inspected for this update: `da9681e` plus active Real ABACUS Daily Brief Autonomous Gauntlet planning docs
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
| `2026-04-29-hermes-workspace-real-executions-runtime-plan.md` | Shipped | Historical; final dogfood PASS proved clickable live `/executions/:executionId` trace for work item `a77f3914-26cd-4cb0-b2dd-fc06eba33e7d`, execution `7b217f97-691c-4976-a6f8-35041a26591b`; report `dogfood-output/real-executions-runtime-final-latest.md` |
| `2026-05-01-hermes-workspace-autonomous-release-policy-activation-plan.md` | Completed / blocked then recovered by R5 | R4 enabled conservative single-lane policy for real ABACUS and correctly blocked on missing branch evidence; R5 added supported branch-evidence recovery and Merge-Healer merged the item. Reports: `dogfood-output/real-abacus-autonomous-release-latest.md`, `dogfood-output/real-abacus-branch-evidence-recovery-latest.md`. |
| `2026-04-30-hermes-workspace-real-abacus-daily-brief-autonomous-gauntlet-plan.md` | Completed through R5 merge evidence | Real ABACUS Daily Brief Planner → Builder → Reviewer proof succeeded; R4 proved Merge-Healer blocks on missing branch evidence; R5 recovered with validated branch evidence and produced Merge-Healer merge evidence. |
| `2026-04-30-hermes-workspace-immediate-execution-observability-hardening-plan.md` | Shipped hardening plan | Historical; committed/pushed at `da9681e`; made immediate execution heartbeat/latest-output and immediate review/mission sync first-class before real-product dogfood |
| `2026-04-29-hermes-workspace-production-dogfood-queue-hygiene-real-idea-readiness-plan.md` | Shipped real-idea readiness plan | Historical; stale ABACUS dummy/test queue cleaned safely and real idea work item `697d0059-a3ca-438e-b92c-481f39e7566b` created |
| `2026-04-29-hermes-workspace-eslint-baseline-stabilization-plan.md` | Shipped stabilization plan | Historical; full `pnpm exec eslint . --max-warnings=0` is green and package committed/pushed at `d0edae3`; final report `dogfood-output/eslint-baseline-stabilization-final-latest.md` |
| `2026-04-29-hermes-workspace-typescript-baseline-stabilization-plan.md` | Shipped / Main-reviewed stabilization plan | Historical; full `tsc --noEmit` is green and package committed at `840a67e`; final report `dogfood-output/typescript-baseline-stabilization-final-latest.md` |
| `2026-04-29-hermes-workspace-operator-ux-merge-readiness-hardening-plan.md` | Complete / Main-reviewed stabilization plan | Historical; Operator UX accepted and pushed at `3384ccb`; final review `dogfood-output/operator-ux-merge-readiness-main-review-latest.md` |
| `2026-04-29-hermes-workspace-p3-morning-review-overnight-digest-plan.md` | Functionally shipped / Main-reviewed Operator UX Clarity P3 plan | Historical until hardening passes; Morning Review server view model, `/api/morning-review`, Dashboard overnight digest card, next-attention action, live Dashboard verification |
| `2026-04-29-hermes-workspace-p2-dedicated-runs-executions-architecture-plan.md` | Shipped / Main-reviewed Operator UX Clarity P2 plan | Historical; dedicated `/executions` list/detail surfaces, legacy jobId trace fallback, Work Item trace links moved off Scheduled Jobs |
| `2026-04-28-hermes-workspace-p1-work-item-cockpit-progressive-disclosure-plan.md` | Shipped / Main-reviewed Operator UX Clarity P1 plan | Historical; Work Item Cockpit / Operator Summary, evidence-first layout, collapsed advanced execution metadata, first-viewport live verification |
| `2026-04-28-hermes-workspace-p0-terminology-deeplink-sanity-plan.md` | Shipped / Main-reviewed Operator UX Clarity P0 plan | Historical; scheduled-job terminology, work-item execution labels, `/jobs?jobId=...` temporary deep-link behavior |
| `2026-04-27-hermes-workspace-gochevbot-inspired-ux-roadmap.md` | Current UX roadmap / P3 source | Context only; P3 now has its own detailed plan |
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
  └─ shipped; first viewport now shows operator summary/evidence and collapses raw execution metadata

P2: Dedicated Executions surface
  └─ shipped; replaces Scheduled Jobs as the work-item execution trace destination

P3: Morning Review / overnight digest
  └─ functionally shipped; Main review found merge-readiness hardening needed

T1/E1: TypeScript + ESLint baseline stabilization
  └─ shipped; `pnpm exec tsc --noEmit --pretty false` and `pnpm exec eslint . --max-warnings=0` are now hard green gates

R1: Real Executions Runtime
  └─ shipped at `bf6706a`; owner correction implemented so `/executions` are real clickable run traces/results, not Scheduled Jobs or one-shot cron definitions

R2: Immediate Execution Observability Hardening
  └─ shipped at `da9681e`; active immediate runs now expose heartbeat/latest-output/final evidence and immediate mission/review sync reads `ExecutionRunRecord`

R3: Real ABACUS Daily Brief Autonomous Gauntlet
  └─ conditionally accepted through review; Planner/Builder/Reviewer succeeded and review approved; deploy/release now blocked by R4 missing branch evidence

R4: Autonomous Release Policy Activation
  └─ completed with BLOCKED BY MERGE-HEALER; conservative lane policy is enabled, but Merge-Healer refused to merge work item 697d0059-a3ca-438e-b92c-481f39e7566b because branchName/baseBranch feature-branch evidence is missing

R5: Branch Evidence Recovery
  └─ completed with ACCEPTED / MERGED; validated branch evidence was attached through the new API for mission/697d0059-daily-brief-recovery, then Merge-Healer produced merge commit b744cfa16be2a5d3c5d6f36cbc81af89765169ac without manual merge-success evidence

R6: Release Supervisor Audit Gate
  └─ complete; first-class release-audit gate/evidence added before Merge-Healer, with no Supervisor→Builder fallback and no new profile/gateway creation

R7: Release Lane Packaging + Profile Readiness
  └─ complete / package-ready; report dogfood-output/release-lane-packaging-profile-readiness-latest.md; no Deploy/Supervisor profiles created or mapped

R8 → R12: Release profile enablement batch
  └─ R8 clean package baseline first; R9 contracts/no-fallback; R10 Supervisor profile; R11 Merge-Healer profile; R12 profile-backed release-lane gauntlet. Do not jump to profile creation before R8/R9 pass.
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

Main/CEO created a five-plan Builder batch so D3n13r does not need to request every next handoff manually:

1. R8 `2026-05-01-hermes-workspace-r8-release-lane-package-commit-plan.md` — package/commit/push the R7-classified release-lane bundle first.
2. R9 `2026-05-01-hermes-workspace-r9-release-profile-contracts-plan.md` — define release role contracts/readiness and no-fallback behavior.
3. R10 `2026-05-01-hermes-workspace-r10-supervisor-profile-creation-audit-launch-plan.md` — create/wire Supervisor for read-only release audit.
4. R11 `2026-05-01-hermes-workspace-r11-merge-healer-profile-controlled-repair-plan.md` — create/wire Merge-Healer for controlled repair.
5. R12 `2026-05-01-hermes-workspace-r12-profile-backed-release-lane-gauntlet-plan.md` — prove the profile-backed release lane end-to-end.

Builder must execute them in order. Do not create profiles before R8 and R9 pass, do not map missing profiles to Builder, and do not create Discord gateways unless D3n13r explicitly authorizes them.

## 10. After R1 ships

R1 shipped and was committed/pushed at `bf6706a`. Evidence recorded in:

- `dogfood-output/real-executions-runtime-final-latest.md`
- Work item: `a77f3914-26cd-4cb0-b2dd-fc06eba33e7d`
- Execution run: `7b217f97-691c-4976-a6f8-35041a26591b`
- Screenshot: `/home/d3ni3/.hermes/profiles/builder/cache/screenshots/browser_screenshot_8a169dfa537a4f6d881ebb770c84d576.png`

Main/CEO selected R2 observability hardening as the next slice because the roadmap still called for event/heartbeat truth and supervisor-grade execution evidence. R2 shipped at `da9681e`. After R2, Main selected R3 real-product dogfood: use the real Family Command Center ABACUS Daily Brief work item (`697d0059-a3ca-438e-b92c-481f39e7566b`) to prove Planner → Builder → Reviewer/Merge-Healer with first-class `/executions` evidence.
