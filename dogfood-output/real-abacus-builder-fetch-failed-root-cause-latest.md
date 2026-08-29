# Real ABACUS Builder `fetch failed` Root-Cause Evidence

- **Timestamp:** 2026-04-30T17-59-19Z
- **Workspace repo:** `/home/d3ni3/.Hermes/workspace/projects/hermes-workspace`
- **Workspace baseline:** `da9681e` plus uncommitted R3 dogfood docs/reports
- **Real project:** `583dd0c7-5c3a-4195-a7fe-9873c929768a`
- **Real work item:** `697d0059-a3ca-438e-b92c-481f39e7566b`
- **Builder execution:** `9cbc03cc-bdd4-4913-940c-f0d645069e4b`
- **Verdict:** `MISSION CONTROL AUTONOMOUS BUILDER PATH BLOCKED`

## Summary

The failed Builder run was not primarily a candidate-repo implementation problem. The ABACUS patch was later repaired locally, but the Mission Control execution record is still truthfully failed/blocked.

Root-cause category: **architecture/capability mismatch in the immediate session execution path, with fallback transport/timeout handling surfacing as generic `fetch failed`.**

Evidence excludes command approval as the primary cause and does not support auth/provider failure as the primary cause. The active Hermes gateway did not expose the `/api/sessions` session API that Workspace tried first. Workspace then fell back to OpenAI-compatible `/v1/chat/completions`; that fallback did not complete inside the Workspace-side execution window and persisted a generic `fetch failed` after ~5 minutes.

## Persisted Workspace truth

From `/home/d3ni3/.hermes/work-item-execution-runs.json`:

```json
{
  "id": "9cbc03cc-bdd4-4913-940c-f0d645069e4b",
  "workItemId": "697d0059-a3ca-438e-b92c-481f39e7566b",
  "projectId": "583dd0c7-5c3a-4195-a7fe-9873c929768a",
  "role": "builder",
  "phase": "build",
  "engine": "hermes-session",
  "state": "failed",
  "profile": "builder",
  "startedAt": "2026-04-30T13:25:15.280Z",
  "finishedAt": "2026-04-30T13:30:15.676Z",
  "summary": "Builder execution failed to complete via immediate chat completion.",
  "latestOutputText": "Immediate execution failed while waiting on immediate chat completion fallback.",
  "error": "fetch failed"
}
```

From `/home/d3ni3/.hermes/work-items.json`, the work item remains:

- `status: blocked`
- `phase: build`
- `blockedReason: mission_failed`
- `missionId: 9cbc03cc-bdd4-4913-940c-f0d645069e4b`
- `missionLink: /executions/9cbc03cc-bdd4-4913-940c-f0d645069e4b`
- `missionState: failed`
- `missionLastError: fetch failed`
- `reviewJobId: null`

The history confirms the build launch and later blocked transition; no Reviewer launch should be considered valid until Builder is reconciled.

## Gateway/log evidence

From `/home/d3ni3/.hermes/logs/agent.log` around the target run:

```text
2026-04-30 16:24:59,163 ... "GET /v1/chat/completions HTTP/1.1" 405 ... "node"
2026-04-30 16:24:59,164 ... "GET /api/sessions HTTP/1.1" 404 ... "node"
2026-04-30 16:24:59,164 ... "GET /api/sessions/__probe__/chat/stream HTTP/1.1" 404 ... "node"
2026-04-30 16:25:15,280 ... "POST /api/sessions HTTP/1.1" 404 ... "node"
2026-04-30 16:42:14,430 ... [30/Apr/2026:16:25:14 +0300] "POST /v1/chat/completions HTTP/1.1" 200 0 "-" "node"
```

Interpretation:

1. Capability probes and the actual launch attempt show `/api/sessions` is unavailable (`404`) on the active gateway.
2. The `POST /api/sessions` at `16:25:15 +0300` aligns exactly with the run `startedAt` `2026-04-30T13:25:15.280Z`.
3. The fallback `/v1/chat/completions` request began around the same time but was only logged at `16:42:14` with HTTP `200` and response size `0`, long after Workspace persisted failure at `16:30:15 +0300`.
4. Builder profile logs did not contain target-run `fetch failed`, target execution id, or approval prompt evidence.

## Code-path evidence

Relevant implementation seams:

- `src/server/work-item-launch.ts` maps build-phase work item launches to immediate role `builder` and calls `launchImmediateExecution(...)`.
- `src/server/immediate-execution-launch.ts` first calls `createSession(...)`; missing session creation is treated specially when the message includes `/api/sessions` and `404`.
- `src/server/hermes-api.ts` `createSession(...)` posts to `/api/sessions`.
- `src/server/immediate-execution-launch.ts` fallback then calls `sendImmediateChatCompletion(...)`.
- `src/server/hermes-api.ts` `sendImmediateChatCompletion(...)` posts to `/v1/chat/completions` with `stream: false`.
- `src/server/immediate-execution-launch.ts` fallback failure writer stores the exact observed strings:
  - `latestOutputText: 'Immediate execution failed while waiting on immediate chat completion fallback.'`
  - `error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)`
  - `summary: '${roleTitle(input.role)} execution failed to complete via immediate chat completion.'`

`hermesPost(...)` in `src/server/hermes-api.ts` does not attach its own `AbortSignal.timeout(...)`, so the ~5-minute failure window is likely inherited from the caller/runtime/request/service boundary rather than explicit per-fetch timeout in `sendImmediateChatCompletion(...)` itself.

## Root-cause classification

| Candidate cause | Finding | Evidence |
|---|---|---|
| Command approval blocked | Not primary | No approval prompt/denial in run record or builder logs; failure is stored by immediate chat fallback, not approval handling. |
| Auth/provider failure | Not primary | Target session failure is `404`, not `401/403`; fallback reached `/v1/chat/completions`. Historical provider warnings exist but do not line up as target-run root cause. |
| Transport timeout/abort | Contributing/visible failure | Workspace failed after ~5 minutes with `fetch failed`; gateway later logged fallback completion with `200 0`, indicating disconnect/abort/empty response behavior. |
| Architecture/capability mismatch | Primary | Workspace tried session APIs (`/api/sessions`, `/api/sessions/.../chat/stream`) against a gateway exposing OpenAI-compatible chat-completions but not sessions. |

## Recommended next Builder plan

Do **not** continue R3 Task 5 Reviewer/Merge-Healer yet. First create/execute a narrow Workspace hardening slice for immediate Builder execution compatibility:

1. Add a regression test that simulates `/api/sessions` returning 404 and `/v1/chat/completions` being slow/empty/aborted.
2. Make capability selection explicit: if session API is absent, launch as `portable-chat-completions` without pretending the run has live session/stream semantics.
3. Add a bounded timeout and structured error classification for fallback: distinguish `session_api_missing`, `fallback_timeout`, `fallback_empty_response`, `fallback_fetch_failed`, and auth/provider failures.
4. Persist diagnostic fields on `ExecutionRunRecord`/latest output so `/executions/<id>` tells the operator which transport failed and what recovery action is valid.
5. Ensure work-item lifecycle remains blocked on failed fallback and provides a truthful Resume Build action rather than auto-advancing to review.
6. Only after this path is fixed should the real ABACUS item be resumed or owner-exception packaged.

## Current safe operating state

- Leave work item `697d0059-a3ca-438e-b92c-481f39e7566b` blocked/build.
- Do not manually mark Builder successful.
- Do not launch Reviewer/Merge-Healer.
- Candidate ABACUS product patch is locally repaired and separately verified, but Mission Control autonomous execution is still blocked.
