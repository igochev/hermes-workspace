# Hermes Workspace — Dream Mission Control Roadmap (CEO/Architect Audit, 2026-04-25)

> **For Hermes:** This is the high-level product/architecture roadmap for turning Hermes Workspace into the Developer's dreamed Mission Control: an easy, stable, autonomous Kanban control plane for Hermes multi-profile/role coding agents.
>
> **Source state inspected:** `my-hermes-workspace-dev` at `866b83d`; existing roadmap, continuation handoff, workflow-quality analysis, profiles/workflow re-architecture, and current source files under `src/server`, `src/screens/projects`, `src/screens/jobs`, and `src/lib`.
>
> **Relationship to existing docs:** This document supersedes the older “what is missing?” slice queue as the new north-star roadmap. Keep existing detailed slice plans as implementation history and convert this roadmap into executable slice plans incrementally.
>
> **Roadmap correction, 2026-04-27:** Mission Control is not a parallel worktree swarm by default. The product north star is: **A single-user Mission Control console where each project/repo has a stable autonomous lane. The lane processes one work item at a time on a dedicated feature branch, with Planner/Builder/Reviewer/Merge-Healer phases, persistent evidence, UI visibility, and operator recovery controls. Parallel worktrees are an optional future optimization after single-lane autonomy and merge healing are proven.**

---

## 1. CEO/Architect product verdict

Hermes Workspace already has the right foundation for Mission Control:

- canonical Projects and Work Items
- file-backed lifecycle state
- project board and work-item detail cockpit
- phase/profile routing
- first-class `default`, `planner`, `builder`, `researcher` profiles
- two-phase Planner → Builder launch flow
- Planner-as-Reviewer first pass
- approvals, deploy gate, cancellation/recovery transitions
- labels, WIP warning, blocked taxonomy, status digest, and label analytics

But it is still **not yet the dreamed autonomous coding Mission Control** because the user still has to babysit too many seams:

1. ideas do not yet become high-quality, ready-to-build work items automatically;
2. execution is launched as jobs, but not supervised as a durable autonomous lifecycle;
3. Planner review is treated mostly as job success/failure, not as structured quality evidence;
4. Autopilot is only a generic cron/jobs capability, not a project-aware improvement scout;
5. the Kanban board shows useful state, but not yet a true “what needs my attention right now?” command center;
6. profile/role routing exists, but role policy, capacity, cost, and fallback behavior are not first-class enough;
7. persistence and eventing are still lightweight and polling-oriented, which limits reliability as automation grows.

**Strategic conclusion:**

Do not add random features, and do not optimize for parallel worktrees before the single-lane loop is reliable. Build the next era around a stable per-repo autonomous lane:

```text
Idea / Autopilot suggestion
  → queued work item for the project/repo
  → Planner enrichment after the previous lane item finishes or after a blocked item is intentionally bypassed
  → CEO approval / policy auto-approval
  → dedicated feature branch in the canonical repo path
  → Builder implementation
  → Planner/Reviewer structured review
  → Merge-Healer integration into the configured base branch
  → deploy gate
  → evidence archive
  → retrospective learning
  → next queued work item
```

The product must feel like: “I add rough ideas and approve important gates; Mission Control handles one high-quality autonomous lane per repo, with planning, execution, review, merge healing, evidence, and escalation.” Overnight reliability and low babysitting are more important than multi-worktree throughput.

Default policy: one active autonomous work item per repo/project. If one item is blocked, Mission Control may park it with explicit blocked evidence and continue the next queued item, but it must not silently create a parallel merge burden. Parallel worktrees are a later opt-in advanced mode after single-lane autonomy and merge healing are proven.

---

## 2. Target north-star experience

### 2.1 For a manually entered idea

The Developer should be able to:

1. Open a project.
2. Click **Add Idea**.
3. Type a rough note like: “Improve dashboard so I see stale work and agent failures.”
4. Choose rough priority/risk only if desired.
5. Click **Prepare with Planner** or let policy auto-prepare.
6. Planner turns it into:
   - refined title/description
   - acceptance criteria
   - implementation plan path
   - suggested labels
   - risk estimate
   - target files/areas
   - open questions, if any
7. CEO reviews a clean draft and clicks **Approve for Build**.
8. Builder executes mostly autonomously.
9. Reviewer/Planner validates output against the plan and criteria.
10. Only real decisions surface to the Developer:
    - approve high-risk deploy
    - resolve blocker
    - accept/reject changes
    - tune policy

### 2.2 For Autopilot-discovered work

The Developer should be able to configure per project:

- “Every morning, scan this repo and suggest improvements.”
- “Watch failed tests, TODOs, stale docs, dependency risk, and UX friction.”
- “Use Researcher for web/API changes; use Planner for architecture.”
- “Only create suggestions, do not build automatically unless low-risk.”

Autopilot should produce a **Suggestion Inbox**:

- grouped by project
- ranked by impact/risk/effort
- with rationale and evidence
- one-click convert to Work Item
- optional bulk approve/reject

### 2.3 For day-to-day operation

The dashboard should answer in seconds:

- What is running?
- What is stuck?
- What needs my approval?
- Which agent/profile is overloaded or failing?
- What did agents change?
- What is safe to auto-approve?
- What should I delegate next?

### 2.3 For stable day/night autonomous operation

The Developer should be able to trust one repo/project lane to work for hours without babysitting:

1. Each project has a visible **Autonomous Lane** with capacity `1` by default.
2. The lane works on one active work item at a time on one dedicated feature branch.
3. Planner should normally run when the item is about to enter the lane, after the previous item has finished and the current codebase/docs include that previous work. This keeps plans up-to-date instead of planning a whole stale batch ahead of time.
4. If the current item becomes blocked, Mission Control parks it with explicit blocked evidence and recovery controls, then may continue with the next queued item without starting hidden parallel work on the same branch.
5. Merge-Healer owns integration into the configured base branch before the lane is considered free for the next item.
6. Parallel worktrees are visible, opt-in, advanced mode only after the branch-based lane and merge healing are stable.

---

## 3. What is missing — grouped by product capability

## 3.1 Idea Intake & Planner Enrichment

### Current state

- Work items can be created from the project screen.
- Acceptance criteria are optional and editable.
- Planner can produce a plan during two-phase Launch Build.
- But the “idea → prepared work item” flow is still too manual and too late; planning is coupled to build launch.

### Missing

1. **Dedicated Idea status/subflow**
   - Current `inbox/research` is close, but the UI should explicitly support “rough idea” vs “ready work item draft.”

2. **Prepare with Planner action before build**
   - Planner should enrich an idea without launching Builder.
   - Output should update work-item fields, not only create a markdown plan.

3. **Planner draft review UI**
   - Show proposed title/description/criteria/labels/risk/plan as a reviewable diff.
   - Allow accept all / cherry-pick / ask Planner to revise.

4. **Structured planning output contract**
   - Planner must return machine-readable fields, not just prose:
     - title
     - refinedDescription
     - acceptanceCriteria[]
     - labels[]
     - riskLevel
     - estimatedEffort
     - impactedFiles[]
     - openQuestions[]
     - planFilePath

5. **Idea templates**
   - Bug fix, feature, refactor, investigation, docs, dependency update, UI polish.

### Why it matters

This is the biggest ease-of-use gap. The Developer wants to dump rough ideas, not manually write specifications.

---

## 3.2 Autopilot / Project Scout

### Current state

- Generic Hermes Jobs UI exists.
- Status digest endpoint exists.
- Cron can be used manually to send digests.
- But there is no Mission-Control-native Autopilot concept.

### Missing

1. **Autopilot configuration per project**
   - schedule
   - scout profile (`default`, `planner`, `researcher`)
   - enabled checks
   - suggestion limits
   - minimum impact threshold
   - auto-create vs suggest-only

2. **Suggestion entity/model**
   - separate from Work Item until approved.
   - fields:
     - projectId
     - title
     - rationale
     - evidence
     - suggestedAcceptanceCriteria
     - impact
     - risk
     - effort
     - labels
     - source (`manual`, `autopilot`, `test`, `dependency`, `docs`, `ux`, `security`)
     - status (`new`, `accepted`, `rejected`, `converted`)

3. **Autopilot Scout prompt library**
   - repo health scout
   - failing-tests scout
   - stale-docs scout
   - UX friction scout
   - dependency/API scout
   - architecture debt scout

4. **Suggestion Inbox UI**
   - project-level and global.
   - rank by impact/risk/effort.
   - one-click convert to Work Item.
   - reject with reason to improve future scouting.

5. **Autopilot review cadence**
   - daily/weekly schedules visible in Mission Control, not hidden as generic jobs.

### Why it matters

This is the “Multica-like Autopilot” gap the Developer explicitly called out. Without it, Mission Control is reactive. With it, Mission Control becomes a proactive CTO assistant.

---

## 3.3 Autonomous Execution Supervisor

### Current state

- `launchConductorMission()` creates Hermes jobs scheduled shortly in the future.
- Work items track `missionJobId`, `missionState`, session keys, branch/PR/artifact evidence.
- `syncWorkItemExecutionState()` polls/syncs and applies build success/failure transitions.
- Detail screen refetches every 30 seconds.

### Missing

1. **Durable execution run entity**
   - The work item currently holds latest mission fields, but there is no rich run history model.
   - Need explicit `WorkItemRun` / `ExecutionRun` records:
     - runId/jobId/sessionId/profile/phase/status/start/end/error/evidence.

2. **Event-driven updates**
   - Current model relies heavily on polling and manual sync.
   - Add a server event bus / SSE / webhook callback path so work items update when jobs start/finish/fail.

3. **Supervisor loop**
   - A central server-side supervisor should detect:
     - scheduled too long
     - running too long
     - missing callback
     - failed but recoverable
     - repeated failure
     - stale review
   - It should produce explicit attention states.

4. **Retry/recovery policies**
   - per project/work item:
     - retry failed build once
     - ask Planner to triage failure
     - route to Researcher if unknown external/API issue
     - require CEO approval after N failures

5. **Run cancellation/kill integration**
   - Cancelled work items should pause/stop pending jobs where possible.

### Why it matters

Autonomy without supervision becomes babysitting. The Developer needs Mission Control to notice stale/failing execution and either recover or ask for a decision.

---

## 3.4 Structured Review & Quality Gates

### Current state

- Planner-as-Reviewer exists.
- Review job success → approval approved.
- Review job failed → changes requested.
- Acceptance criteria can be checked off.

### Missing

1. **Structured reviewer output parsing**
   - A job succeeding is not the same as “the code passed review.”
   - Parse reviewer output for:
     - `decision`
     - criterion-by-criterion status
     - defects
     - risk notes
     - test evidence
     - recommended next action

2. **Oracle/Reviewer role option**
   - Current decision says no dedicated Reviewer profile for now. That is fine short-term.
   - Long-term, add optional project policy:
     - Planner reviews own plan for normal work.
     - Oracle profile reviews high-risk or repeated-failure work.

3. **Quality gate checklist**
   - tests passed
   - build passed
   - lint/typecheck passed
   - acceptance criteria met
   - no unresolved blocker
   - evidence attached
   - PR/branch present when expected

4. **Automated gate enforcement**
   - Low-risk can auto-approve only if structured gates pass.
   - Medium/high-risk should require CEO approval with evidence summary.

5. **Review diff/evidence UI**
   - Show “why approved” or “why changes requested” on the work item, not buried in job output.

### Why it matters

This is the difference between “agents ran” and “agents delivered quality results.”

---

## 3.5 Kanban as True Command Center

### Current state

- Project board has useful columns, filters, labels, WIP warnings, urgency summary, analytics.
- Dashboard has broader status tiles.
- Work-item detail is the best current cockpit.

### Missing

1. **Global “Needs My Attention” cockpit**
   - One queue across projects:
     - approvals
     - blockers
     - failed missions
     - stale executions
     - Autopilot suggestions
     - high-risk ready-to-build items

2. **State age and stale badges**
   - How long in current state?
   - How long since last job event?
   - How long pending approval?

3. **Next best action per card**
   - Each card should say exactly one primary action:
     - Approve deploy
     - Review Planner draft
     - Resume build
     - Investigate failure
     - Convert suggestion
     - Sync execution

4. **Dependency/blocker view**
   - Some blocked work depends on another work item or external thing.
   - Add relationships/dependencies later.

5. **Board presets**
   - CEO view: attention and approvals.
   - Builder view: active build/rework.
   - Planner view: ideas needing planning.
   - Autopilot view: suggestions.

### Why it matters

The Developer should not scan the board manually. The UI should tell them where to look and what to do.

---

## 3.6 Multi-profile / Role Policy Layer

### Current state

- Profiles exist and route by phase.
- Project phase profile overrides exist.
- Assigned profile override exists per work item.

### Missing

1. **Role registry**
   - Distinguish role from profile instance:
     - CEO/Main
     - Planner
     - Builder
     - Researcher
     - Reviewer/Oracle
     - Autopilot Scout
   - Map roles to profiles per project.

2. **Capacity policy**
   - max concurrent builds per Builder
   - max concurrent planning jobs
   - per-profile cost budget
   - cooldown after failures

3. **Fallback routing**
   - if Builder unavailable → hold queue or fallback?
   - if Planner expensive budget exceeded → ask CEO or use cheaper mode?

4. **Project-specific prompts/skills**
   - each project should define:
     - repo conventions
     - test commands
     - coding style
     - allowed risk
     - deployment rules
   - These should be injected into Planner/Builder/Reviewer jobs.

5. **Cost/quality mode controls**
   - cheap scout / flagship planner / flagship builder should be explicit and visible.

### Why it matters

Hermes multi-profile power is the core differentiator. It needs governance, not just routing strings.

---

## 3.7 Evidence, Git, and Delivery Integration

### Current state

- Work item can store branch, PR URL, artifact paths, session keys.
- Extraction from job run output is best-effort.

### Missing

1. **Git branch/commit/PR contract**
   - Builder should always report:
     - branch name
     - commit hashes
     - changed files
     - PR URL if created
     - test commands run

2. **Artifact normalization**
   - Plan, implementation summary, test report, review report, failure triage should be first-class evidence types.

3. **Diff view in UI**
   - Show changed files and summaries from the work item.

4. **Merge/close loop**
   - After deploy approval, optionally merge PR or mark as ready-to-merge.
   - Record final delivery outcome.

### Why it matters

The Developer wants final product, not just a job log. Delivery evidence must be obvious and audit-friendly.

---

## 3.8 Reliability / Persistence / Data Integrity

### Current state

- File-backed persistence is merge-safe and simple.
- It has worked well for early Mission Control.

### Missing

1. **SQLite or embedded DB migration path**
   - File-backed JSON becomes fragile with concurrent jobs, callbacks, and richer run/event history.

2. **Append-only event log**
   - Keep lifecycle history immutable and queryable.

3. **Schema migrations**
   - Avoid ad-hoc normalize-only evolution once automation depends on data.

4. **Concurrency protection**
   - atomic writes/locks if staying file-backed short-term.

5. **Backup/export/import**
   - one-click export project state and evidence.

### Why it matters

Stable autonomy requires reliable state. A Mission Control system cannot lose or corrupt lifecycle decisions.

---

## 4. Prioritized roadmap

## P0 — Make rough ideas safely become executable work

### Slice N — Idea Intake + Planner Enrichment

**Goal:** Add a clean “rough idea → Planner-prepared work item draft” workflow.

**Scope:**
- Add `prepare_with_planner` action or separate endpoint.
- Add planning draft fields / `PlanningDraft` model.
- Planner returns structured JSON + plan file path.
- UI shows draft diff and accept/revise controls.

**Likely files:**
- `src/server/work-items-store.ts`
- `src/server/work-item-launch.ts` or new `src/server/work-item-planning.ts`
- `src/routes/api/work-items.$workItemId.prepare.ts`
- `src/screens/projects/work-item-detail-screen.tsx`
- `src/screens/projects/project-detail-screen.tsx`

**Acceptance criteria:**
- Developer can create a rough idea with minimal fields.
- Planner can enrich it without launching Builder.
- Draft can be accepted into work item fields.
- Planner output is saved as evidence.

### Slice O — Structured Planner Output Contract

**Goal:** Stop relying on prose-only planning output.

**Scope:**
- Define Zod schema for Planner draft.
- Add parser/validator for job output or future callback payload.
- Store parse warnings and raw output.

**Acceptance criteria:**
- Invalid Planner output does not corrupt work item.
- UI shows “needs Planner revision” when structured parse fails.

---

## P1 — Add Autopilot suggestions

### Slice P — Autopilot Suggestion Model + Inbox

**Goal:** Create a first-class Suggestion Inbox separate from approved Work Items.

**Scope:**
- Add suggestion store/model.
- Add APIs for list/create/accept/reject/convert.
- Add project/global inbox UI.

**Likely files:**
- `src/server/autopilot-suggestions-store.ts`
- `src/routes/api/autopilot-suggestions*.ts`
- `src/screens/projects/autopilot-suggestions-screen.tsx`
- nav/dashboard links

**Acceptance criteria:**
- Suggestions can be created, reviewed, rejected, and converted to Work Items.
- Converted suggestions preserve rationale/evidence in notes/history.

### Slice Q — Project Autopilot Scout Schedules

**Goal:** Make project-aware scheduled scouting easy to create and manage.

**Scope:**
- Add project Autopilot policy config.
- Add “Create Scout Schedule” UI.
- Generate safe self-contained cron prompts that inspect project repo and create suggestions only.

**Acceptance criteria:**
- User can enable daily/weekly scout for a project.
- Scout outputs suggestions, not direct code changes.
- Runs are visible from the project’s Autopilot tab.

---

## P2 — Make autonomous execution self-supervising

### Slice R — Execution Run Records

**Goal:** Track each planning/build/review/deploy run explicitly.

**Scope:**
- Add `WorkItemRun` or `ExecutionRun` store/model.
- Record launch, start, success, failure, stale, evidence.
- Link runs to work-item history.

**Acceptance criteria:**
- Work item can show a timeline of all runs, not only latest mission fields.
- Failed/retried/review runs remain auditable.

### Slice S — Execution Supervisor + Stale Detection

**Goal:** Detect stale/risky automation without manual babysitting.

**Scope:**
- Add server-side supervisor helper.
- Add stale thresholds by phase/profile.
- Add manual and scheduled reconcile endpoint.
- Surface stale states in dashboard/board/digest.

**Acceptance criteria:**
- Running too long becomes “needs attention.”
- Scheduled but never started becomes “stale scheduled.”
- Failed repeatedly escalates to CEO.

---

## P3 — Upgrade review from job-status to quality gate

### Slice T — Structured Review Decision Parser

**Goal:** Planner/Reviewer output becomes a real quality gate.

**Scope:**
- Define review decision schema.
- Parse review output into `reviewDecision`, per-criterion statuses, findings, evidence.
- Do not auto-approve solely because review job succeeded.

**Acceptance criteria:**
- `DECISION: CHANGES_REQUESTED` in successful job returns to build.
- Missing/invalid decision creates an attention item, not false approval.

### Slice U — Quality Gate Matrix

**Goal:** Project policy decides when work can auto-advance.

**Scope:**
- Gate matrix by risk/priority/phase.
- Low-risk auto-approval only when tests/build/criteria evidence is present.
- High-risk always requires CEO approval.

**Acceptance criteria:**
- Auto-approval is explainable and safe.
- UI shows exactly which gate passed/failed.

---

## P4 — Make the cockpit obvious and calm

### Slice V — Global Attention Queue

**Goal:** One prioritized queue for the Developer.

**Scope:**
- Build shared `attention` view model.
- Include approvals, blockers, failed/stale runs, suggestions, high-risk ready items.
- Render on dashboard and maybe sidebar badge.

**Acceptance criteria:**
- Dashboard answers “what needs me?” without scanning project boards.
- Each attention item has one recommended next action.

### Slice W — Work Item Detail 2.0: Delivery Cockpit

**Goal:** Make detail screen the single page for plan, execution, review, evidence, and next action.

**Scope:**
- Reorganize panels by lifecycle:
  - Intent
  - Plan
  - Execution Runs
  - Review Gate
  - Deploy Gate
  - Evidence
  - History
- Add primary next-action CTA.

**Acceptance criteria:**
- User can understand current state and next action in <10 seconds.

---

## P5 — Harden platform for long-term autonomy

### Slice X — Role Registry + Capacity/Cost Policy

**Goal:** Profiles become governed roles, not just strings.

**Scope:**
- Add role registry and project role mapping.
- Add capacity and cost policy fields.
- Add unavailable/fallback behavior.

**Acceptance criteria:**
- Project can say “Planner role uses planner profile; Builder uses builder; Scout uses researcher.”
- Launch is blocked or queued when role capacity is exceeded.

### Slice Y — Persistence Hardening

**Goal:** Prepare for richer autonomous state safely.

**Scope:**
- Decide between atomic JSON write + locks vs SQLite.
- If SQLite, add migration plan and importer from current JSON.
- Preserve easy backups.

**Acceptance criteria:**
- Concurrent automation writes cannot corrupt state.
- Existing data migrates cleanly.

---

## 5. Recommended immediate build sequence

The best next sequence is:

1. **Slice N — Idea Intake + Planner Enrichment**
   - highest user-value gap;
   - makes rough delegation easy;
   - improves quality before Build starts.

2. **Slice P — Autopilot Suggestion Model + Inbox**
   - creates the missing Multica-like proactive loop;
   - safe because suggestions require approval before work.

3. **Slice Q — Project Autopilot Scout Schedules**
   - wires schedules into the suggestion inbox;
   - converts generic jobs into project-aware Autopilot.

4. **Slice T — Structured Review Decision Parser**
   - prevents false approvals;
   - raises delivery quality.

5. **Slice R/S — Execution Runs + Supervisor**
   - reduces babysitting and stale job uncertainty.

This order prioritizes ease of delegation first, then proactive ideation, then quality/reliability hardening.

---

## 6. Non-negotiable architecture rules going forward

1. **Work Item is the system of record.**
   - Conductor/Hermes jobs are execution engines, not canonical workflow state.

2. **Do not trigger automation from random UI events.**
   - Use server-owned lifecycle actions and dedicated orchestration helpers.

3. **Structured outputs before autonomous state changes.**
   - Planner/Reviewer must produce parseable contracts before fields or approvals are auto-mutated.

4. **Suggestions before autonomous code changes.**
   - Autopilot scouts create suggestions; only approved work items launch builds unless policy explicitly allows low-risk auto-build.

5. **Every autonomous action must leave evidence.**
   - plan, run, review, decision, branch/PR/artifacts, and rationale.

6. **The UI must always show the next action.**
   - If the Developer has to infer what to do, Mission Control failed.

7. **Keep profile roles understandable.**
   - Main/CEO decides policy; Planner plans/reviews; Builder implements; Researcher scouts; optional Oracle reviews high risk.

8. **Favor safe defaults.**
   - suggest-only Autopilot;
   - high-risk manual approval;
   - stale detection before retries;
   - no silent destructive actions.

---

## 7. Open design decisions

1. **PlanningDraft storage:** embedded fields on Work Item vs separate `planning-drafts.json`.
   - Recommendation: separate `PlanningDraft` records to support revisions/diffs.

2. **Autopilot suggestions:** separate global store vs per-project embedded arrays.
   - Recommendation: separate `autopilot-suggestions.json` now, DB table later.

3. **Review profile:** Planner-only vs optional Oracle.
   - Recommendation: Planner by default; add Oracle role only for high-risk/repeated-failure policy.

4. **Persistence:** stay JSON with locks vs SQLite.
   - Recommendation: keep JSON for Slice N/P if scope is controlled; plan SQLite before execution-run/event history becomes large.

5. **Eventing:** poll/reconcile vs callback/SSE.
   - Recommendation: add supervisor/reconcile first; add SSE/callback once execution run records exist.

---

## 8. Implementation protocol for future slices

Detailed implementer-ready plans now exist and should be used instead of implementing from this high-level roadmap directly:

- `docs/plans/2026-04-25-hermes-workspace-dream-mission-control-implementation-index.md`
- `docs/plans/2026-04-25-hermes-workspace-slice-n-o-idea-planner-enrichment-plan.md`
- `docs/plans/2026-04-25-hermes-workspace-slice-p-q-autopilot-suggestions-plan.md`
- `docs/plans/2026-04-25-hermes-workspace-slice-t-u-structured-review-quality-gates-plan.md`
- `docs/plans/2026-04-25-hermes-workspace-slice-r-s-execution-runs-supervisor-plan.md`

For each slice:

1. inspect current implementation first;
2. write or update targeted tests before patching where practical;
3. patch minimal files only;
4. run targeted tests;
5. run full regression: `pnpm test` or `pnpm vitest run`;
6. run build: `pnpm build`;
7. restart service: `systemctl --user restart hermes-workspace.service`;
8. verify service active;
9. live verify at `http://localhost:3456`;
10. update this roadmap, detailed slice doc, and continuation handoff.

---

## 9. Bottom line

Hermes Workspace is already a strong operator console. The missing dream layer is not more raw buttons — it is **delegation intelligence**:

- rough ideas become Planner-prepared work items;
- Autopilot scouts propose improvements;
- Builder executes only approved/ready work;
- Reviewer produces structured quality decisions;
- Supervisor detects stale/failing automation;
- dashboard tells the Developer exactly what needs attention.

**Next recommended slice:** `Slice N — Idea Intake + Planner Enrichment`.
