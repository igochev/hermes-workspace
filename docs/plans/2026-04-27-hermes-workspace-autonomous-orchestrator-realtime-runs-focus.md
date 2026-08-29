# Hermes Workspace — Autonomous Orchestrator + Real-Time Run Visibility Focus

Date: 2026-04-27

## Non-negotiable direction

From now on, Hermes Workspace Mission Control work focuses on three outcomes only:

1. **Perfect implementation of the missing autonomous orchestrator**
   - Creating a work item must automatically start and progress the workflow.
   - The real test must create exactly one work item and then forbid manual status/phase movement by the tester.
   - Manual `PATCH status/phase`, manual lifecycle calls, or manual profile CLI invocations are not valid workflow proof.

2. **Real-time visibility into what each profile/agent is doing**
   - D3n13r does not trust claims like “running” or “working” without live evidence.
   - The Work Item must expose live execution state: which profile is active, what job/session/run exists, current status, logs/output tail, artifacts, errors, and next expected transition.
   - The operator must be able to click from the work item into the relevant run/profile activity without hunting through unrelated pages.

3. **Perfect real-work-item E2E testing of autonomous code delivery**
   - One real work item in the production-like candidate repo must autonomously travel end-to-end.
   - It must launch the appropriate Hermes profiles automatically.
   - It must produce real candidate repo product-code/test diffs.
   - It must run affected candidate tests and record evidence.
   - It must fail if the workflow only moves state without real profile output or real code results.

## Best UI/UX practice for kanban agent-executed runs

The best pattern is **not** a separate disconnected “jobs page” as the primary experience. Jobs can remain as a deep technical view, but the operator cockpit must live on the **Work Item detail page**, because the work item is the unit of intent and accountability.

Recommended UI model:

### 1. Kanban card = glanceable execution signals

Each card should show compact live signals:

- current phase: Research / Build / Review / Deploy
- current profile: Planner / Builder / Reviewer / Deployer
- run state: Queued / Starting / Running / Waiting / Succeeded / Failed / Stale
- elapsed time or last heartbeat
- attention badges: Output ready, Approval needed, Failed, Stuck, Diff produced

The card should answer: “Is this thing doing anything right now?”

### 2. Work Item detail = execution cockpit

Inside each work item, add a dedicated **Runs / Agents** cockpit section with a phase timeline:

```text
Research / Planner   queued → running → output ingested → complete
Build / Builder      queued → running → code diff detected → tests running → complete
Review / Reviewer    queued → running → approved/changes requested
Deploy               queued → running → done
```

Each phase row should include:

- profile name and resolved profile source
- job id / run id / session key
- state and timestamps
- live output/log tail
- last heartbeat
- artifacts / plan path / changed files / PR URL
- error if failed
- action buttons only when appropriate: open session, view full logs, retry, stop, request review, approve/reject

### 3. “Live run drawer” from phase row

Clicking a phase row should open a side drawer or embedded panel, not navigate away by default.

The drawer should show:

- streaming logs / latest output
- current tool/action summary if available
- files touched / diff summary
- test commands and status
- raw session/job links for debugging

This keeps the operator in context while still exposing real evidence.

### 4. Separate Jobs page = secondary technical audit

A Jobs/Runs page is still useful for global operations:

- all running jobs
- stuck jobs
- failed jobs
- profile load
- retry/kill controls

But it should not be the primary UI for understanding one work item. The Work Item page must own the operator story.

### 5. State language must be honest

Avoid vague labels like “In progress” unless backed by evidence.

Use precise states:

- `No job launched`
- `Job scheduled`
- `Agent session started`
- `Last heartbeat 12s ago`
- `Planner output waiting for ingestion`
- `Builder changed 2 files`
- `Tests running`
- `Review approval pending`
- `Stuck: no run heartbeat for 30m`

## Real autonomous orchestrator requirements

The orchestrator must own a state machine like:

```text
Inbox/Research
  → auto launch Planner
  → ingest planner output
  → accept/prepare into Ready/Build if policy allows
Ready/Build
  → auto launch Builder
  → sync changed files/test evidence
  → move to Review if successful
Active/Review
  → auto launch Reviewer or create approval
  → apply approved/changes_requested decision
Active/Deploy
  → auto launch Deploy or resolve deployment approval
  → Done only after evidence
```

Implementation should be server-side and idempotent:

- safe to run repeatedly
- one active run per work item phase unless retry policy allows
- no duplicate work items
- no duplicate launches for the same phase/run key
- all transitions history-recorded with evidence

## Real E2E acceptance rules

The autonomous E2E harness must:

1. Create exactly one work item with unique `e2eRunId`.
2. Snapshot candidate repo git status before creation.
3. Start/trigger only the orchestrator, not manual phase moves.
4. Poll work item state and run events until timeout.
5. Fail if any phase was moved by direct test PATCH/lifecycle call.
6. Require Planner run evidence and ingested planning output.
7. Require Builder run evidence.
8. Require candidate repo changed product-code/test files.
9. Require affected tests to run with recorded output.
10. Require review/deploy/done evidence based on real run output or explicit approval policy.
11. Write a report with timeline, run IDs, session links, changed files, test output, screenshots, and final verdict.

A pass means the autonomous system worked. Anything else is a fail.
