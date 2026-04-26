# Slice V/W Implementation Plan — Telemetry + Realtime Session Truth

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Make Mission Control dashboard statistics and chat sessions trustworthy by adding aggregate token/session telemetry and realtime session-list updates.

**Architecture:** Add a server-side telemetry aggregate that normalizes session token/context data, then wire dashboard cards/table to it. Add a reusable browser hook that subscribes to `/api/chat-events` and invalidates/updates `chatQueryKeys.sessions` when chat activity arrives, replacing the current “wait up to 15s or refresh” feel.

**Tech Stack:** TanStack Start routes, TanStack Query, React, Vitest, existing Hermes API helpers, existing SSE `/api/chat-events`.

---

## Current context

Observed seams:

- Dashboard Mission Control summary lives in `src/screens/dashboard/dashboard-screen.tsx`.
- Single-session context estimate route exists at `src/routes/api/context-usage.ts`.
- Session sidebar query lives in `src/components/workspace-shell.tsx` and currently uses `refetchInterval: 15_000`, `staleTime: 10_000`.
- Session query keys and fetch helpers live in `src/screens/chat/chat-queries.ts`.
- Chat events SSE route exists at `src/routes/api/chat-events.ts`.
- Gateway components already consume `/api/chat-events`, but the main sidebar does not.

## Acceptance criteria

1. Dashboard displays a Mission Control telemetry area with:
   - total visible session tokens;
   - active/recent sessions count;
   - highest context % session;
   - model/provider breakdown when available;
   - clear “telemetry unavailable / estimated” state when Hermes does not expose exact fields.
2. Dashboard no longer implies token stats are exact when they are estimated.
3. Session sidebar updates within a few seconds of incoming chat events without manual refresh.
4. Browser exposes SSE connection state for sessions: live, reconnecting, or polling fallback.
5. Existing chat streaming behavior does not duplicate messages.
6. Full regression and build pass.

## Task 1: Add session telemetry aggregate helpers

**Objective:** Create pure helpers that normalize session summaries into dashboard-ready telemetry.

**Files:**
- Create: `src/server/session-telemetry.ts`
- Test: `src/server/session-telemetry.test.ts`

**Steps:**
1. Write tests for `buildSessionTelemetrySummary(sessions)` covering empty, exact tokens, missing tokens, and context percent.
2. Implement helper types:
   - `SessionTelemetryItem`
   - `SessionTelemetrySummary`
   - `TelemetryAccuracy = 'exact' | 'estimated' | 'unavailable'`
3. Normalize common Hermes fields: `input_tokens`, `output_tokens`, `cache_read_tokens`, `totalTokens`, `tokenCount`, `model`, `provider`, `updatedAt`, `message_count`.
4. Sort top sessions by recent activity and token usage.
5. Run: `pnpm test src/server/session-telemetry.test.ts`

## Task 2: Add `/api/session-telemetry` route

**Objective:** Expose normalized telemetry from existing session APIs without duplicating Hermes fetch logic in dashboard.

**Files:**
- Create: `src/routes/api/session-telemetry.ts`
- Modify if needed: `src/routeTree.gen.ts` via normal route generation/build
- Test: `src/server/session-telemetry-routes.test.ts` or colocated route test pattern already used in repo

**Steps:**
1. Inspect route test conventions in `src/server/*routes.test.ts`.
2. Write route tests for authorized success and session API unavailable fallback.
3. Route should call existing `listSessions(50, 0)` and `toSessionSummary`, then `buildSessionTelemetrySummary`.
4. Return `{ ok: true, summary, items, generatedAt }`.
5. Do not fail dashboard when telemetry is partial; mark `accuracy` instead.
6. Run focused tests.

## Task 3: Add client API and dashboard telemetry cards

**Objective:** Render telemetry truth on `/dashboard`.

**Files:**
- Create: `src/lib/session-telemetry-api.ts`
- Modify: `src/screens/dashboard/dashboard-screen.tsx`
- Test: `src/screens/dashboard/dashboard-screen.test.ts`

**Steps:**
1. Add `fetchSessionTelemetry()` client helper.
2. Add dashboard query key, `refetchInterval: 15_000`, `staleTime: 5_000`.
3. Add exported constants for card labels:
   - `Session tokens`
   - `Recent sessions`
   - `Highest context`
   - `Telemetry accuracy`
4. Add tests locking labels and summary helper usage.
5. Render a compact telemetry row plus top 5 sessions table.
6. Make copy explicit: `Estimated from Hermes session metadata` or `Exact token totals from Hermes`.
7. Run dashboard tests.

## Task 4: Add realtime session-events hook

**Objective:** Subscribe to `/api/chat-events` and invalidate sessions immediately on relevant events.

**Files:**
- Create: `src/screens/chat/hooks/use-session-events-refresh.ts`
- Test: `src/screens/chat/hooks/use-session-events-refresh.test.tsx` if existing hook test setup supports it; otherwise test exported event classification helper in `.test.ts`.
- Modify: `src/components/workspace-shell.tsx`

**Steps:**
1. Extract pure helper `shouldRefreshSessionsForChatEvent(eventName, data)`.
2. Refresh on: `connected`, `user_message`, `message`, `assistant_message`, `done`, `error`, `session_updated` if present.
3. Debounce invalidation to avoid event storms (e.g. 500–1000ms).
4. Hook uses `EventSource('/api/chat-events')` when browser supports it.
5. On error, close stream and fall back to existing polling; expose status.
6. Call hook in `WorkspaceShell`, passing queryClient and `chatQueryKeys.sessions`.
7. Keep the existing polling interval as a fallback, but lower staleness when SSE is live.

## Task 5: Add visible session freshness state

**Objective:** Make the operator aware whether session data is live or polling.

**Files:**
- Modify: `src/components/workspace-shell.tsx`
- Modify if needed: `src/screens/chat/components/chat-sidebar.tsx`
- Test: closest existing sidebar/shell test, or add lightweight render test if there is precedent

**Steps:**
1. Add tiny status text/icon near sidebar header: `Live`, `Reconnecting`, `Polling`.
2. Do not add noisy toasts.
3. Ensure collapsed sidebar remains clean.
4. Test that status prop renders when provided.

## Task 6: Verification

Run:

```bash
pnpm test src/server/session-telemetry.test.ts src/screens/dashboard/dashboard-screen.test.ts
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Live smoke:

1. Open `http://localhost:3456/dashboard`.
2. Confirm telemetry cards render and do not claim false precision.
3. Open chat sidebar and send/receive a message.
4. Confirm sessions update without manual refresh and status shows live/polling truth.

## Risks / pitfalls

- Do not trust token fields blindly; Hermes may expose cumulative tokens, context tokens, or no token data depending on provider/runtime.
- Do not connect multiple unbounded EventSources; ensure cleanup on unmount.
- Do not route chat message content through telemetry; use metadata only.
- Avoid introducing duplicate message rendering. This slice should refresh session lists, not rewrite chat message stream handling.
