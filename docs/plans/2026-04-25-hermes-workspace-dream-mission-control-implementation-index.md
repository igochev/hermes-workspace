# Hermes Workspace — Dream Mission Control Implementation Plan Index (2026-04-25)

> **For Hermes:** This is the implementation entrypoint for the new Dream Mission Control roadmap. Cheaper implementer models should start here, then open only the specific slice plan they are assigned.
>
> **CEO/Architect source roadmap:** `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-roadmap.md`
>
> **Repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`

---

## 1. Why this index exists

The previous roadmap documents contain valuable history, but they are now too long and too mixed between completed slice logs, old assumptions, and new strategy. This index separates the new roadmap into executable work packages that a less expensive model can follow without re-reading every historical document.

**Rule for implementers:** do not implement from the high-level roadmap directly. Implement from the detailed slice plans below.

---

## 2. Canonical implementation order

| Order | Plan | Purpose | Why here |
|---:|---|---|---|
| 1 | `2026-04-25-hermes-workspace-slice-n-o-idea-planner-enrichment-plan.md` | Rough idea → Planner-prepared draft → ready work item | Highest user-value; enables easy delegation |
| 2 | `2026-04-25-hermes-workspace-slice-p-q-autopilot-suggestions-plan.md` | Project-aware Autopilot suggestion inbox and scout schedules | Adds Multica-like proactive ideation safely |
| 3 | `2026-04-25-hermes-workspace-slice-t-u-structured-review-quality-gates-plan.md` | Parse Planner review output and enforce quality gates | Prevents false approvals before scaling automation |
| 4 | `2026-04-25-hermes-workspace-slice-r-s-execution-runs-supervisor-plan.md` | Durable run records, stale supervisor, global attention, capacity policy | Reduces babysitting and improves operational reliability |

This order is intentional:

1. make manual delegation easy;
2. add safe proactive suggestions;
3. harden quality gates;
4. harden runtime supervision and cockpit experience.

---

## 3. Current project architecture baseline

Current inspected baseline:

- Branch: `my-hermes-workspace-dev`
- Recent commit inspected: `a07667f GPT 5.5 New Roadmap vision of Hermes Workspace`
- Test command: `pnpm vitest run` or `pnpm test`
- Build command: `pnpm build`
- Service: `hermes-workspace.service`
- Local app: `http://localhost:3456`

Core existing seams:

| Area | Existing files |
|---|---|
| Projects | `src/server/projects-store.ts`, `src/routes/api/projects.ts`, `src/routes/api/projects.$projectId.ts` |
| Work items | `src/server/work-items-store.ts`, `src/routes/api/work-items.ts`, `src/routes/api/work-items.$workItemId.ts` |
| Lifecycle | `src/server/work-item-lifecycle.ts`, `src/routes/api/work-items.$workItemId.lifecycle.ts` |
| Launch/execution | `src/server/work-item-launch.ts`, `src/server/work-item-execution.ts`, `src/server/conductor-launch.ts` |
| Approvals | `src/server/work-item-approvals.ts`, `src/routes/api/work-item-approvals*.ts` |
| Project board | `src/screens/projects/project-detail-screen.tsx`, `src/lib/projects-view-model.ts` |
| Work-item cockpit | `src/screens/projects/work-item-detail-screen.tsx` |
| Dashboard | `src/screens/dashboard/dashboard-screen.tsx` |
| Generic jobs | `src/server/hermes-jobs.ts`, `src/routes/api/hermes-jobs*.ts`, `src/screens/jobs/jobs-screen.tsx` |
| Client API types | `src/lib/projects-api.ts`, `src/lib/work-item-launch-api.ts`, `src/lib/work-item-execution-api.ts` |

---

## 4. Non-negotiable architecture rules

1. **Work Item is the source of truth.** Hermes jobs and Conductor runs are execution engines only.
2. **Structured output before mutation.** Planner/Reviewer output must be parsed and validated before mutating work-item fields or approvals.
3. **Suggestions before autonomous code.** Autopilot creates suggestions, not direct work items or code changes, until approved by policy/operator.
4. **File-backed first, DB later.** Keep these slices merge-safe using current JSON-store conventions.
5. **No automatic retries in first supervisor slice.** Observe and escalate first; recover later.
6. **No random UI-triggered automation.** Use server routes/helpers so rules are testable.
7. **TDD is mandatory.** Add failing tests first where practical, then minimal implementation.
8. **Every slice updates docs/handoff after verification.** Keep continuation accurate.

---

## 5. Execution protocol for cheaper implementer models

For each assigned plan:

1. Read this index.
2. Read only the assigned detailed plan.
3. Inspect the exact files named in that plan.
4. Create a todo list from the plan tasks.
5. Implement one task at a time.
6. For each task:
   - write failing test;
   - run focused test and confirm RED;
   - implement minimal code;
   - run focused test and confirm GREEN;
   - run adjacent regression tests;
   - update docs if task changes behavior.
7. After all tasks in the plan:
   - run all targeted tests named in the plan;
   - run `pnpm vitest run` or `pnpm test`;
   - run `pnpm build`;
   - restart service if runtime behavior changed;
   - live verify when UI/API changed;
   - update roadmap/handoff with shipped status.

Recommended controller workflow:

- Use `subagent-driven-development`.
- Dispatch one implementer per task.
- After each task, run two reviews:
  1. spec compliance;
  2. code quality.
- Do not let implementers broaden scope to later slices.

---

## 6. Documentation map and status

| Document | Status | How to use now |
|---|---|---|
| `2026-04-25-hermes-workspace-dream-mission-control-roadmap.md` | Canonical north-star | Strategy only; do not implement directly |
| This index | Canonical implementation entrypoint | Start here after context reset |
| `slice-n-o-idea-planner-enrichment-plan.md` | Detailed plan | Implement first |
| `slice-p-q-autopilot-suggestions-plan.md` | Detailed plan | Implement after Slice N/O |
| `slice-t-u-structured-review-quality-gates-plan.md` | Detailed plan | Implement before scaling automation further |
| `slice-r-s-execution-runs-supervisor-plan.md` | Detailed plan | Implement after quality gates, or earlier if stale jobs become painful |
| `2026-04-25-hermes-workspace-dream-mission-control-slices-plan.md` | Historical shipped slices A-M | Use for context only |
| `2026-04-25-hermes-workspace-workflow-quality-analysis.md` | Historical gap analysis | Mostly superseded; useful for decisions behind A-M |
| `2026-04-25-hermes-workspace-profiles-workflow-rearchitecture.md` | Profile/pipeline architecture record | Use for profile assumptions |
| `2026-04-22-hermes-workspace-mission-control-continuation-handoff.md` | Continuation handoff | Must point here after this doc update |
| `2026-04-21-hermes-workspace-mission-control-roadmap.md` | Long historical roadmap | Keep; append snapshots only |

---

## 7. Slice dependencies

```text
Slice N/O: PlanningDraft + structured Planner output
  └─ enables safer Builder launch and better acceptance criteria

Slice P/Q: Autopilot suggestions + schedules
  └─ can convert suggestions into rough work items that use Slice N/O

Slice T/U: Structured review + quality gates
  └─ depends on existing Planner-as-Reviewer and benefits from Slice N/O plan evidence

Slice R/S/V/X: Runs + supervisor + attention + capacity
  └─ can be built incrementally; execution runs improve review/evidence and attention queue
```

Recommended hard dependency:

- Build **Slice N/O before Slice P/Q**, because accepted Autopilot suggestions should flow into the same Planner enrichment path.

Recommended soft dependency:

- Build **Slice T/U before fully trusting Autopilot-generated work**, because review must be structured and safe.

---

## 8. Definition of Done for every plan

A plan is not shipped until:

- all new tests pass;
- relevant existing tests pass;
- full regression passes;
- `pnpm build` passes;
- route tree / generated route artifacts are updated if necessary;
- service restarts if runtime changed;
- UI/API live verification is completed;
- continuation handoff and relevant roadmap docs are updated.

---

## 9. Immediate next action

Start with:

`docs/plans/2026-04-25-hermes-workspace-slice-n-o-idea-planner-enrichment-plan.md`

The first implementation sub-slice should be **PlanningDraft store + parser tests**, not UI.
