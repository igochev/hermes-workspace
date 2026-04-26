# Hermes Workspace — Next Cycle Mission Control Gap Analysis (2026-04-26)

> **Scope:** CEO/Main architecture analysis after shipped Dream Mission Control slices N/O, P/Q, T/U, R/S.
> **Repo inspected:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
> **Baseline:** branch `my-hermes-workspace-dev`, commit `ac52b9b`, handoff says all planned slices shipped and full `pnpm vitest run` passed 261/261.

## Executive conclusion

The project now has the right Mission Control backbone: project work items, Planner enrichment, Autopilot suggestions, structured review gates, durable execution runs, attention queue, and role capacity advisories.

The next cycle should stop adding broad new architecture and instead close the operator trust gaps that make a developer feel they still need to babysit:

1. **Dashboard telemetry truth:** token/cost usage and runtime statistics are not first-class Mission Control metrics. Current `/api/context-usage` estimates one active session context; dashboard Mission Control counters focus on projects/work items/attention, not total role/session usage.
2. **Chat/session realtime truth:** the persistent sidebar still polls `/api/sessions` every 15s. `/api/chat-events` exists, but the main workspace chat sidebar is not wired to use it for session-list invalidation/update, so visible session state can lag and feel refresh-dependent.
3. **Profile/role confidence:** phase routing exists and launch resolution is good, but there is no operator-facing preflight that proves configured profiles actually exist, are authenticated, have expected model/provider, and can be launched through the ACP profile path before work starts.
4. **Autopilot is safe but passive:** suggestions can be accepted/converted, schedules can run, but it does not yet feel like a developer-grade autonomous delegation lane with policies, confidence, quick actions, suggested next launches, and visible safety boundaries per project.
5. **Recovery remains manual:** R/S intentionally avoided auto-retry. That was correct for the first supervisor slice, but the next reliability jump is recommended recovery actions: relaunch failed/stale work, request review again, dismiss/resolve attention, and make recovery evidence durable.

## What is already solid

- **Work Item as source of truth** is now well established in `src/server/work-items-store.ts`, `src/lib/projects-api.ts`, work-item lifecycle routes, and detail UI.
- **Phase/profile routing** exists in `src/lib/conductor-phase-profiles.ts` and `src/server/work-item-launch.ts`; launch resolution order is explicit: work-item `assignedProfile`, then project `phaseProfiles`, then request phase profiles.
- **Planning and review quality** are no longer raw text only: Planner/reviewer structured output parsers and quality gates exist.
- **Execution observability** has durable execution-run store, supervisor route, global attention queue, and capacity advisory integration.
- **Dashboard already has Mission Control counters and attention cards**, but not yet hard token/session telemetry.

## Gap details and recommended slices

### Gap 1 — Dashboard token/cost/runtime telemetry is not trustworthy enough

**Current state:**
- `src/routes/api/context-usage.ts` estimates context for one session, using model context windows and session/message fetches.
- `src/screens/dashboard/dashboard-screen.tsx` builds Mission Control summaries from projects, work items, approvals, and attention queue.
- User specifically reports dashboard statistics, especially token usage, are not showing properly.

**Why it matters:** Mission Control must show burn rate, active model/session cost, and role usage before the operator can trust autonomous work.

**Fix scope:** Slice V/W. Add a server-side telemetry aggregate and dashboard cards/table for active sessions, total tokens, model/provider, context %, stale/missing telemetry, and per-role/project run usage.

### Gap 2 — Chat sessions feel stale / refresh-dependent

**Current state:**
- `src/components/workspace-shell.tsx` fetches `/api/sessions` with `refetchInterval: 15_000` and `staleTime: 10_000`.
- `/api/chat-events` exists and broadcasts Hermes chat events, but main workspace session sidebar is not wired as a realtime session index subscriber.
- Gateway/live-feed components use `/api/chat-events`; the primary chat sidebar does not.

**Why it matters:** A Mission Control operator must see “where-what is happening” without manual refresh.

**Fix scope:** Slice V/W. Add a reusable chat-events session invalidation hook, reduce stale session drift, surface connection status, and test that incoming chat events invalidate/update `chatQueryKeys.sessions`.

### Gap 3 — Profiles/roles are mapped, but not proven ready

**Current state:**
- Project `phaseProfiles` model exists.
- Work item launch resolves profile correctly in `src/server/work-item-launch.ts`.
- `src/lib/conductor-phase-profiles.ts` tells Conductor to spawn workers with `hermes -p <profile> --acp --stdio`.
- No preflight tells the operator whether `research`, `build`, `review`, `deploy`, `supervisor`, and Autopilot scout profiles exist, are authenticated, and have usable model config.

**Why it matters:** Autonomous coding fails badly when a role is missing auth/model/tooling. The operator needs a green/red profile readiness board before launching work.

**Fix scope:** Slice X/Y. Add role/profile readiness API, project preflight panel, launch blockers/warnings, and profile mapping validation.

### Gap 4 — Autopilot is suggestions-only, but not developer-grade delegation yet

**Current state:**
- `src/screens/projects/project-autopilot-screen.tsx` has schedule policy and scout sources.
- `src/screens/projects/autopilot-suggestions-screen.tsx` accepts/rejects/archives/converts suggestions.
- Converted suggestions can flow to work items, but the UI does not yet make the “idea → plan → build → review” next action obvious.

**Why it matters:** The dream flow is: D3n13r drops an idea, Mission Control plans it, executes it, reviews it, and only asks for attention at decision points.

**Fix scope:** Slice Z/AA. Add Autopilot delegation policies, confidence/evidence scoring, one-click “Convert + Plan” and “Convert + Plan + Build when ready” operator actions, with safe defaults.

### Gap 5 — Supervisor detects trouble but recovery actions are not first-class

**Current state:**
- R/S added stale/failed/missing execution detection and attention items.
- Recovery still requires the operator to navigate manually and decide the relaunch/review action.

**Why it matters:** Stable autonomous coding needs guided recovery more than raw error visibility.

**Fix scope:** Slice AB/AC. Add recommended recovery actions to attention items and work item detail: relaunch phase, request review again, mark externally resolved, cancel, or return to build.

## Prioritized next cycle

| Order | Slice | Primary user pain addressed | Why now |
|---:|---|---|---|
| 1 | V/W — Telemetry + Realtime Session Truth | Dashboard token stats and stale chat sessions | Directly matches user-reported broken-feeling features |
| 2 | X/Y — Profile/Role Readiness Preflight | “Are my Hermes roles actually implemented and launchable?” | Prevents autonomous failures before adding more automation |
| 3 | Z/AA — Autopilot Delegation Policies | Better Autopilot for developer delegation | Turns safe suggestions into useful semi-autonomous delegation |
| 4 | AB/AC — Recovery Actions + Supervisor Controls | Less babysitting when runs fail/stall | Converts observability into actionable self-healing workflow |

## Verification strategy for this cycle

Each slice must ship with:

- focused unit tests for pure helpers/store logic;
- route/API tests for new server contracts;
- screen tests for operator-visible UI contracts;
- targeted adjacent tests from the touched areas;
- full `pnpm vitest run`;
- `pnpm build`;
- service restart and live smoke when runtime/UI/API changed.

Live verification anchors:

- Dashboard: `http://localhost:3456/dashboard`
- Projects: `http://localhost:3456/projects`
- Autopilot: `http://localhost:3456/projects/autopilot`
- Active project detail, if present in data: `http://localhost:3456/projects/46b401f9-9243-472f-b5b7-04bf34596906`

## Continuation

Builder should start with Slice V/W:

`docs/plans/2026-04-26-hermes-workspace-slice-v-w-telemetry-realtime-truth-plan.md`
