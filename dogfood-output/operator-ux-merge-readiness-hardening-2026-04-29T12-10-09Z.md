# Operator UX Merge-Readiness Hardening — 2026-04-29T12-10-09Z

## Verdict

**READY FOR MAIN/CEO FINAL MERGE-READINESS REVIEW.**

Functional gates are green. Targeted P3/hardening ESLint is clean (exit 0; only existing `.eslintignore` deprecation warning). Full `tsc --noEmit` still fails, but after hardening there are no remaining errors in the Operator UX changed-file set from P0/P1/P2/P3/H1; remaining output is broad/baseline debt in older routes/tests/server modules.

## Changes in this hardening pass

- Dashboard visible terminology hardening:
  - Added case-insensitive banned-label coverage for `mission link`, `hermes job id`, `failed missions`, `running missions`.
  - Replaced remaining Dashboard empty-state copy with execution/work-item vocabulary.
- Morning Review ordering polish:
  - Added coverage that `needs_approval` entries sort oldest pending approval first.
  - Preserved next-attention priority: critical failed → pending approval → parked → warning failed → changed.
- Targeted lint/type cleanup:
  - Cleaned targeted P3/hardening ESLint errors.
  - Fixed changed-file TypeScript blockers in Dashboard fixtures, executions select attributes, Autopilot scout source typing, and run timeline API type parity.

## Command evidence

| Gate | Result |
|---|---|
| RED Dashboard terminology test | Failed as expected: missing `DASHBOARD_MISSION_CONTROL_QUEUE_EMPTY_COPY` / old mission copy coverage gap |
| RED Morning Review ordering test | Failed as expected: `needs_approval` sorted newer before older |
| Focused P3/H1 tests | PASS — `pnpm test src/server/morning-review.test.ts src/server/morning-review-routes.test.ts src/screens/dashboard/dashboard-screen.test.ts src/server/work-item-notification-digest.test.ts -- --runInBand` → 4 files / 34 tests |
| Full regression | PASS — `pnpm vitest run` → 79 files / 508 tests |
| Build | PASS — `pnpm build` with existing Vite sourcemap/dynamic-import/chunk warnings |
| Whitespace | PASS — `git diff --check` |
| Targeted ESLint | PASS — `pnpm exec eslint src/server/morning-review.ts src/routes/api/morning-review.ts src/lib/morning-review-api.ts src/screens/dashboard/dashboard-screen.tsx src/server/morning-review.test.ts src/server/morning-review-routes.test.ts src/lib/morning-review-api.test.ts src/screens/dashboard/dashboard-screen.test.ts` (only `.eslintignore` warning) |
| Full TypeScript | FAIL expected/baseline — `pnpm exec tsc --noEmit --pretty false`; no Operator UX changed-file blockers remain |
| Service/API smoke | PASS — `systemctl --user restart hermes-workspace.service`, active; API/root smoke passed on retry attempt 2 |

## TypeScript classification

Full `tsc --noEmit` still fails from broad debt outside this hardening set, including:

- legacy route handler test typing (`options.server.handlers` possibly undefined / TanStack handler property access) in attention queue, autopilot suggestions, profile readiness, session telemetry, work-item detail, supervisor/orchestrator/recovery route tests;
- older store/test fixture drift around normalized `ProjectRecord` / `WorkItemRecord` fields in profile readiness and work-item launch tests;
- existing nullability issues in `work-item-approvals`, `work-item-execution`, `work-item-lifecycle`, and `work-item-orchestrator`;
- unrelated `src/routes/api/work-items.$workItemId.ts` PATCH typing and `src/screens/chat/hooks/use-session-events-refresh.ts` timer typing.

Changed-file blockers cleaned in this pass:

- `src/screens/dashboard/dashboard-screen.test.ts` fixture fields normalized;
- `src/screens/dashboard/dashboard-screen.tsx` fallback provider nullability fixed;
- `src/screens/executions/executions-screen.tsx` invalid `readOnly` on `<select>` removed;
- `src/screens/projects/project-autopilot-screen.tsx` scout source state typed as `ProjectAutopilotScoutSource`;
- `src/lib/projects-api.ts` includes `executionRunId` on `WorkItemRunTimelineRow` to match durable execution rows.

## Live browser / DOM evidence

Route: `http://127.0.0.1:3456/dashboard`

Onboarding was bypassed with `localStorage.setItem('hermes-onboarding-complete','true')` and reload.

DOM checks scoped to `main`:

- Morning Review visible near top: yes.
- Bucket labels visible in UI: Changed, Needs Approval, Failed, Merged, Parked.
- `Open next attention item` href: `/projects/production-dogfood-family-command-center-abacus/work-items/84bfe2c2-e899-437a-8a6c-a6fa9884886d`.
- `Open execution` hrefs: `/executions/d8e5b085-e234-41a2-ac54-a0b939b8e06c`, `/executions/eb050f55-55ca-4b78-b442-2a67177bac54`.
- Case-insensitive banned labels absent: `mission link`, `hermes job id`, `failed missions`, `running missions`.
- Browser console after verification: clean; no JS errors.

## API smoke summary

`/api/morning-review?lookbackHours=18` returned digest summary:

```json
{"changed":2,"needs_approval":0,"failed":2,"merged":0,"parked":2,"total":6}
```

`/api/morning-review?lookbackHours=18&format=discord` returned message header:

```text
**🌅 Morning Review — Mission Control**
```

## Recommendation

Main/CEO should perform final merge-readiness review. Do not start P4/new product work until Main accepts this hardening package and the remaining broad `tsc --noEmit` debt is either accepted as baseline or separately planned.
