# Hermes Workspace — GochevBot-Inspired Operator UX Roadmap (2026-04-27)

> **Scope:** Mine a small number of useful GochevBot ideas into Hermes Workspace without reopening the old scope-explosion trap. Focus on terminology, information architecture, and work-item execution clarity.
>
> **Context:** User feedback from D3n13r: Work Item detail is too noisy/scroll-heavy; labels like `Mission Link /jobs?jobId=...` and `Hermes Job ID` are confusing because the sidebar also has `Jobs`, apparently meaning scheduled jobs. The current product direction remains stable single-lane Mission Control, not multi-worktree swarms.
>
> **Do not implement before:** the active live E2E blocker in `docs/handoff/current-slice-status.md` is resolved unless the owner explicitly reprioritizes UX cleanup.

## 1. Shortlisted GochevBot ideas worth bringing forward

These are the high-leverage ideas from GochevBot that fit the current Hermes Workspace shape.

### 1.1 Run Theater / Runs-as-evidence, not raw job IDs

**GochevBot idea:** Runs, tool calls, token/output traces, artifacts, and status belonged to an operator-visible run theater.

**Hermes Workspace adaptation:** Work Item detail should show a compact `Execution Evidence` cockpit:

- Planner run
- Builder run
- Reviewer run
- Merge-Healer run
- latest state
- branch / commit / PR / test evidence
- direct “open trace” action

Avoid dumping internal IDs into the main summary. IDs should live behind “Advanced details”.

### 1.2 Mission War Room, but renamed to Work Item Cockpit

**GochevBot idea:** Mission War Room gave one focused page for a mission.

**Hermes Workspace adaptation:** Do not add a separate Missions page now. Improve the existing Work Item detail page into a `Work Item Cockpit` with sections ordered by operator need:

1. Current state + next action
2. Evidence timeline
3. Acceptance criteria / plan
4. Review / quality gate
5. Recovery actions
6. Advanced raw IDs

### 1.3 Morning Review / attention queue

**GochevBot idea:** Morning reports and triage surfaces helped the operator understand what happened overnight.

**Hermes Workspace adaptation:** Keep this as a later dashboard enhancement after single-lane PASS:

- “What changed overnight?”
- “What needs approval?”
- “What failed?”
- “What got merged?”
- “What is parked?”

### 1.4 Safety vocabulary from GochevBot

**GochevBot idea:** Kill switch, dry run, branch isolation, manual approval, review gates.

**Hermes Workspace adaptation:** Keep the controls, but simplify labels around the single-lane model:

- Lane paused
- Work item parked
- Branch unsafe
- Evidence missing
- Merge failed
- Review changes requested

### 1.5 Integration Crucible → Merge-Healer evidence

**GochevBot idea:** Integration Crucible was a dedicated integration/review gate.

**Hermes Workspace adaptation:** Do not add a new page yet. Make Merge-Healer evidence visible inside project/work-item surfaces:

- base branch
- feature branch
- merge commit
- conflict files
- test command/result
- PR link

## 2. Current UX/terminology problems observed

### UX-001 — “Jobs” means two different things

**Current state:**

- Sidebar has `Jobs` at `/jobs`.
- `JobsScreen` is a scheduled/cron-style jobs manager: schedule, next run, last run, pause/resume, run now, repeat, skills.
- Work Item detail shows `Hermes Job ID`, `Mission Link`, and values like `/jobs?jobId=b005736466b9`.
- `buildMissionLink(jobId)` currently returns `/jobs?jobId=${jobId}`.
- `JobsScreen` search only searches `name` and `prompt`; it does not appear to consume the `jobId` query parameter or highlight/open the referenced job.

**Why this is bad:**

The operator sees “Mission Link /jobs?jobId=...” and reasonably asks: is this a scheduled job? a run? a mission? a work-item execution? The system is leaking backend implementation vocabulary instead of explaining what happened.

**Recommended direction:**

Rename user-facing scheduled jobs to **Scheduled Jobs** everywhere practical.

Rename Work Item execution references:

- `Hermes Job ID` → `Execution Job ID` or hide under Advanced
- `Mission Link` → `Execution Trace` / `Open execution job`
- `Mission State` → `Execution State`
- `Mission Last Run` → `Last Execution`
- `Mission Last Error` → `Execution Error`

If the link still points to `/jobs?jobId=...`, the Jobs page must support deep-link behavior:

- parse `jobId` from search params
- filter/highlight matching job
- auto-expand run history for that job
- show a clear empty state if missing

Better medium-term direction: add a dedicated trace route such as `/runs/:runId` or `/executions/:jobId`, then keep `/jobs` only for scheduled job definitions.

### UX-002 — Work Item detail starts with too much raw metadata

**Current state:**

`Mission Control Summary` currently renders many raw fields at once:

- Project
- Repo Snapshot
- Mission ID
- Hermes Job ID
- Hermes Job Name
- Session Prefix
- Mission Link
- Mission State
- Mission Last Run
- Mission Last Error
- Blocked reason
- Blocked guidance
- Assigned Profile
- Risk Level
- Plan File Path
- review parser/gate/evidence fields
- launch sessions
- created/updated timestamps

**Why this is bad:**

It forces scrolling and makes the page feel like a database record instead of an operator cockpit. The most important questions are buried:

- What is happening now?
- What should I do next?
- Did Planner/Builder/Reviewer/Merge-Healer pass?
- Where is the evidence?
- Is the branch safe?

**Recommended direction:**

Split the page into progressive disclosure:

1. **Operator Summary** — current phase, lane state, execution state, next action, branch, PR/test result if present.
2. **Execution Evidence** — role timeline with links.
3. **Plan & Acceptance** — planner draft, criteria, notes.
4. **Review & Quality Gate** — review decision, missing evidence, gate reasons.
5. **Recovery** — only visible when attention/recovery actions exist.
6. **Advanced IDs** — collapsed by default: job IDs, session prefixes, raw links, created/updated.

### UX-003 — “Mission” vocabulary should be removed from Hermes Workspace core surfaces

**Current state:**

The Work Item model and UI still use `mission*` fields: `missionId`, `missionJobId`, `missionLink`, `missionState`, `missionLastRunAt`, `missionLastError`. Dashboard labels also say `Failed missions` / `Running missions`.

**Why this is bad:**

Hermes Workspace has chosen `Project` + `Work Item` + `Lane` as the main product vocabulary. “Mission” is emotionally strong, but now it competes with Work Item and Conductor. It also revives GochevBot mental-model complexity.

**Recommended direction:**

Do not rename internal fields immediately if that risks churn. Start with user-facing labels:

- Failed missions → Failed executions
- Running missions → Running executions
- Mission Control Summary → Work Item Cockpit / Operator Summary
- Mission Link → Execution Trace
- Mission ID → Work Item execution ID or hide

Later, optionally migrate internal field names from `mission*` to `execution*` once the product is stable.

### UX-004 — `jobId` is not equivalent to `runId`, but the UI makes it feel equivalent

**Current observed model:**

- `jobId` appears to identify the Hermes scheduled job / cron job definition created by the Conductor launch path.
- `runId` appears in `WorkItemRunTimelineRow`, but `ConductorLaunchResult.runId` is currently `null` at creation time.
- Session keys are synthesized as `cron_${jobId}_pending` / `cron_${jobId}_`.

**Operator interpretation:**

The user sees job/run/session IDs and cannot tell which one is the actual execution trace.

**Recommended direction:**

Adopt explicit terminology:

- **Scheduled Job**: reusable/scheduled definition in `/jobs`.
- **Execution Run**: a single actual invocation/attempt.
- **Session**: Hermes chat/agent session key.
- **Work Item**: product unit of work.

Main UI should show “Execution Run” first when available. Job ID and session key should be secondary.

### UX-005 — Link-looking strings are rendered as raw text

**Current state:**

`Mission Link` renders `/jobs?jobId=...` as a string via `<Detail />`, not necessarily as an actionable button/link.

**Why this is bad:**

If it looks like a URL, it should be clickable and explain what it opens.

**Recommended direction:**

Render as an action button:

- `Open execution trace`
- `Open scheduled job`
- `Copy ID`

Raw href belongs under Advanced.

## 3. Prioritized implementation slices

### P0 — Terminology cleanup and deep-link sanity

**Goal:** Remove immediate confusion without changing backend behavior.

**Likely files:**

- `src/lib/i18n.ts`
- `src/components/mobile-tab-bar.tsx`
- `src/components/mobile-hamburger-menu.tsx`
- `src/screens/chat/components/chat-sidebar.tsx`
- `src/screens/jobs/jobs-screen.tsx`
- `src/screens/projects/work-item-detail-screen.tsx`
- tests for the affected screen constants

**Scope:**

- Rename user-facing `/jobs` labels to `Scheduled Jobs` where space allows.
- Rename Work Item detail labels from Mission/Job ambiguity to Execution vocabulary.
- Add helper text on `/jobs`: “Scheduled/repeating jobs. Work-item execution traces may link here until dedicated Runs view exists.”
- Make `/jobs?jobId=...` filter/highlight/expand the target job or show a precise not-found message.

**Verification:**

- Search for visible `Mission Link`, `Hermes Job ID`, `Failed missions`, `Running missions` in key Mission Control surfaces.
- Navigate to `/jobs?jobId=<known>` and confirm the target is visible/highlighted.
- Build and live-click verify.

### P1 — Work Item Cockpit progressive disclosure

**Goal:** Reduce scrolling and make the page answer operator questions first.

**Likely files:**

- `src/screens/projects/work-item-detail-screen.tsx`
- `src/server/work-item-run-timeline.ts`
- `src/screens/projects/work-item-detail-screen.test.tsx`

**Scope:**

- Replace the current dense `Mission Control Summary` with a compact `Operator Summary`.
- Move raw IDs into a collapsed `Advanced execution metadata` section.
- Promote branch/merge/test/PR evidence above raw IDs.
- Use GochevBot’s “Run Theater” idea only as a compact timeline, not as a new full subsystem.

**Verification:**

- Work Item detail first viewport shows current state, next action, and evidence summary without scrolling.
- Raw IDs are still available, but collapsed.
- Existing execution sync/recovery controls remain reachable.

### P2 — Dedicated Runs / Executions surface

**Goal:** Stop using Scheduled Jobs as the trace destination for Work Item execution.

**Likely files:** TBD after current E2E blocker is fixed.

**Scope:**

- Add `/executions/:id` or `/runs/:id` for one actual work-item attempt.
- Link Work Item timeline rows directly to run/session trace.
- Keep `/jobs` only for scheduled definitions.

**Verification:**

- A Work Item can have Planner/Builder/Reviewer/Merge-Healer execution links that do not route to the scheduled jobs manager.

### P3 — Morning Review / overnight operator digest

**Goal:** Bring forward GochevBot’s morning-review value after the lane works.

**Scope:**

- Daily summary: done / failed / parked / needs approval / merged.
- Per-project lane summary.
- “Open next attention item” flow.

**Verification:**

- Dashboard gives the operator the next decision in under 10 seconds.

## 4. Non-goals

Do **not** add these from GochevBot yet:

- separate Missions page
- swarm visual graph
- debate chamber
- multi-node campaign DAGs
- parallel worktrees
- market trend strategist loops
- Genesis/Ignition-style project forge

Those remain future inspiration only. The current product needs terminology clarity and one reliable lane first.

## 5. Recommendation

Yes, it is a good idea to mine GochevBot — but only in handful-sized pieces.

The highest-leverage immediate slice is **P0: Terminology cleanup and deep-link sanity**. It directly addresses the user’s confusion and should be small enough to implement safely after the active live E2E blocker is fixed.
