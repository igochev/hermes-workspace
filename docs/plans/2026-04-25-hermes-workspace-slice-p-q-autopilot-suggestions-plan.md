# Slice P/Q Implementation Plan — Autopilot Suggestions + Project Scout Schedules

> **For Hermes:** Use `subagent-driven-development` to implement this plan after Slice N/O. Cheaper models should keep Autopilot suggest-only in the first implementation.

**Goal:** Add a Multica-like Autopilot layer that periodically scouts projects and creates reviewable suggestions, then lets the Developer accept/reject/convert those suggestions into work items.

**Architecture:** Add a file-backed `AutopilotSuggestion` model, suggestion inbox routes/UI, project Autopilot policy, and safe schedule prompt generation. Autopilot jobs must create suggestions only; they must not mutate code or launch Builder.

**Tech Stack:** TypeScript, TanStack Router/React, file-backed JSON stores, existing Hermes Jobs APIs, Vitest.

---

## 1. Product behavior

### Target user flow

1. User opens project Autopilot tab.
2. User enables daily/weekly scout or manual scout.
3. Autopilot scout inspects repo and creates suggestions.
4. Suggestions appear in global and project inboxes.
5. User can accept, reject, archive, or convert a suggestion.
6. Conversion creates a rough Work Item in `inbox/research` that then goes through Slice N/O Planner enrichment.

---

## 2. Suggestion model

### Create `src/server/autopilot-suggestions-store.ts`

Back file:

```ts
path.join(HERMES_HOME, 'autopilot-suggestions.json')
```

Types:

```ts
export type AutopilotSuggestionStatus = 'new' | 'accepted' | 'rejected' | 'converted' | 'archived'
export type AutopilotSuggestionImpact = 'low' | 'medium' | 'high'
export type AutopilotSuggestionRisk = 'low' | 'medium' | 'high'
export type AutopilotSuggestionEffort = 'small' | 'medium' | 'large'
export type AutopilotSuggestionSource =
  | 'manual'
  | 'autopilot'
  | 'repo-health-scout'
  | 'failing-tests-scout'
  | 'stale-docs-scout'
  | 'ux-friction-scout'
  | 'dependency-api-scout'
  | 'architecture-debt-scout'

export type AutopilotSuggestionRecord = {
  id: string
  projectId: string
  title: string
  rationale: string
  evidence: Array<string>
  suggestedAcceptanceCriteria: Array<string>
  impact: AutopilotSuggestionImpact
  risk: AutopilotSuggestionRisk
  effort: AutopilotSuggestionEffort
  labels: Array<string>
  source: AutopilotSuggestionSource
  status: AutopilotSuggestionStatus
  rejectionReason?: string
  convertedWorkItemId?: string
  createdAt: string
  updatedAt: string
}
```

Functions:

```ts
listAutopilotSuggestions(filters?)
getAutopilotSuggestion(id)
createAutopilotSuggestion(input)
updateAutopilotSuggestion(id, updates)
acceptAutopilotSuggestion(id)
rejectAutopilotSuggestion(id, reason?)
archiveAutopilotSuggestion(id)
markAutopilotSuggestionConverted(id, workItemId)
deleteAutopilotSuggestionsForProject(projectId)
```

Normalization:

- Unknown status → `new`.
- Unknown impact/risk → `medium`.
- Unknown effort → `medium`.
- Unknown source → `autopilot`.
- Arrays string-only, trimmed, deduped.
- Sort newest first in list.

---

## 3. Suggestion routes

Create:

```txt
src/routes/api/autopilot-suggestions.ts
src/routes/api/autopilot-suggestions.$suggestionId.ts
src/routes/api/autopilot-suggestions.$suggestionId.convert.ts
```

Contracts:

### `GET /api/autopilot-suggestions`

Query filters: `projectId`, `status`, `source`.

Response:

```ts
{ suggestions: AutopilotSuggestionRecord[] }
```

### `POST /api/autopilot-suggestions`

Validates project exists and title is non-empty. Creates suggestion only.

### `GET /api/autopilot-suggestions/:suggestionId`

Returns `{ suggestion, project }`.

### `PATCH /api/autopilot-suggestions/:suggestionId`

Allows metadata/status edits but not `projectId` or `convertedWorkItemId`.

### `POST /api/autopilot-suggestions/:suggestionId/convert`

Creates Work Item:

```ts
createWorkItem({
  projectId: suggestion.projectId,
  title: suggestion.title,
  description: suggestion.rationale,
  status: 'inbox',
  phase: 'research',
  priority: suggestion.impact === 'high' ? 'high' : suggestion.impact === 'low' ? 'low' : 'medium',
  riskLevel: suggestion.risk,
  labels: Array.from(new Set(['autopilot', ...suggestion.labels])),
  acceptanceCriteria: suggestion.suggestedAcceptanceCriteria,
  notes: [
    `Autopilot suggestion rationale: ${suggestion.rationale}`,
    `Evidence: ${suggestion.evidence.join('\n')}`,
    `Source: ${suggestion.source}`,
    `Impact: ${suggestion.impact}; Risk: ${suggestion.risk}; Effort: ${suggestion.effort}`,
  ],
})
```

Then mark suggestion converted with work item id.

---

## 4. Client API

Create `src/lib/autopilot-suggestions-api.ts`.

Exports:

```ts
fetchAutopilotSuggestions(filters?)
createAutopilotSuggestion(input)
updateAutopilotSuggestion(id, input)
acceptAutopilotSuggestion(id)
rejectAutopilotSuggestion(id, rejectionReason?)
archiveAutopilotSuggestion(id)
convertAutopilotSuggestion(id)
```

Also export label maps for status/impact/risk/effort/source.

---

## 5. Suggestion Inbox UI

Create:

```txt
src/screens/projects/autopilot-suggestions-screen.tsx
src/screens/projects/autopilot-suggestions-screen.test.tsx
src/routes/projects/autopilot.tsx
```

UI:

- filters: New, Accepted, Rejected, Converted, Archived;
- project filter optional;
- source filter optional;
- cards with title, project, rationale, evidence count, impact/risk/effort chips, labels, source, created age;
- actions: Accept, Reject, Convert to Work Item, Archive, Open Project.

Add project-level route:

```txt
src/routes/projects/$projectId/autopilot.tsx
src/screens/projects/project-autopilot-screen.tsx
src/screens/projects/project-autopilot-screen.test.tsx
```

Project Autopilot screen includes:

- schedule panel;
- safety copy: “suggestions only — no direct code changes”;
- project-filtered suggestions list.

---

## 6. Project Autopilot policy

### Modify `src/server/projects-store.ts`

Add:

```ts
export type ProjectAutopilotPolicy = {
  enabled: boolean
  schedulePreset: 'manual' | 'daily' | 'weekly'
  scoutProfile?: string
  suggestionLimit: number
  scoutSources: Array<AutopilotSuggestionSource>
  jobId?: string
  jobName?: string
  lastCreatedAt?: string
}
```

Extend `ProjectRecord`:

```ts
autopilotPolicy: ProjectAutopilotPolicy
```

Defaults:

```ts
{
  enabled: false,
  schedulePreset: 'manual',
  suggestionLimit: 5,
  scoutSources: ['repo-health-scout', 'stale-docs-scout', 'architecture-debt-scout'],
}
```

Mirror types in `src/lib/projects-api.ts`.

---

## 7. Safe scout prompt builder

Create:

```txt
src/server/autopilot-scout-prompts.ts
src/server/autopilot-scout-prompts.test.ts
```

Function:

```ts
buildProjectAutopilotScoutPrompt({ project, policy, suggestionsEndpoint }): string
```

Prompt must include:

- project id/name/repoPath/defaultBranch;
- strict “suggest only” rules;
- `Do not modify files`;
- `Do not create branches, commits, PRs, work items, or code changes`;
- create only suggestions via `/api/autopilot-suggestions`;
- JSON schema;
- suggestion limit;
- dedupe instructions;
- evidence requirement.

---

## 8. Project Autopilot schedule route

Create:

```txt
src/routes/api/projects.$projectId.autopilot-schedule.ts
src/lib/project-autopilot-api.ts
```

Routes:

- `GET /api/projects/:projectId/autopilot-schedule`
- `POST /api/projects/:projectId/autopilot-schedule`
- `DELETE /api/projects/:projectId/autopilot-schedule`

Behavior:

1. authenticate;
2. load project;
3. normalize policy;
4. build prompt server-side;
5. create/update/pause Hermes job;
6. save jobId/jobName in `project.autopilotPolicy`.

Refactor needed:

- Add server-side create/update/pause/resume job helpers to `src/server/hermes-jobs.ts` instead of duplicating `src/routes/api/hermes-jobs.ts` logic.

Schedule mapping:

```ts
manual -> no recurring schedule or disabled job
daily  -> every day at 9am
weekly -> every Monday at 9am
```

---

## 9. TDD tasks

### Task 1 — Suggestion store

Files:

- `src/server/autopilot-suggestions-store.test.ts`
- `src/server/autopilot-suggestions-store.ts`

Tests:

- create/list/filter;
- normalize malformed fields;
- accept/reject/archive/convert transitions;
- convertedWorkItemId persistence;
- delete by project;
- invalid JSON backing file safe fallback.

Run:

```bash
pnpm vitest run src/server/autopilot-suggestions-store.test.ts
```

### Task 2 — Suggestion API routes

Files:

- `src/routes/api/autopilot-suggestions.ts`
- `src/routes/api/autopilot-suggestions.$suggestionId.ts`
- `src/routes/api/autopilot-suggestions.$suggestionId.convert.ts`

Tests if route-test patterns are available; otherwise rely on store/service tests + build.

Verify:

- unauthorized → 401;
- missing project → 404;
- create suggestion → 201;
- convert creates inbox/research work item and marks suggestion converted.

### Task 3 — Client API and inbox UI helpers

Files:

- `src/lib/autopilot-suggestions-api.ts`
- `src/screens/projects/autopilot-suggestions-screen.test.tsx`
- `src/screens/projects/autopilot-suggestions-screen.tsx`
- `src/routes/projects/autopilot.tsx`

Tests:

- status labels;
- action labels;
- empty state copy;
- card displays impact/risk/effort/source;
- convert button label.

### Task 4 — Project Autopilot policy

Files:

- `src/server/projects-store.test.ts`
- `src/server/projects-store.ts`
- `src/lib/projects-api.ts`

Tests:

- default disabled policy;
- normalization of schedulePreset/suggestionLimit/sources;
- existing project records load with default policy.

### Task 5 — Safe prompt builder

Files:

- `src/server/autopilot-scout-prompts.test.ts`
- `src/server/autopilot-scout-prompts.ts`

Tests:

- includes project info;
- includes endpoint;
- includes schema fields;
- says suggest only;
- forbids file/code/branch/commit/PR/work-item mutation;
- includes suggestion limit.

### Task 6 — Job helper refactor

Files:

- `src/server/hermes-jobs.ts`
- possibly `src/routes/api/hermes-jobs.ts`

Goal:

- expose server-side `createHermesJob`, `updateHermesJob`, `pauseHermesJob`, `resumeHermesJob` helpers;
- keep existing job UI/API behavior unchanged.

Tests:

- if existing tests cover jobs, update them;
- otherwise keep change minimal and verify `pnpm build`.

### Task 7 — Project schedule API/UI

Files:

- `src/routes/api/projects.$projectId.autopilot-schedule.ts`
- `src/lib/project-autopilot-api.ts`
- `src/screens/projects/project-autopilot-screen.test.tsx`
- `src/screens/projects/project-autopilot-screen.tsx`
- `src/routes/projects/$projectId/autopilot.tsx`

Tests:

- safety copy visible;
- manual/daily/weekly options;
- source checkboxes;
- save schedule calls API helper;
- project suggestions render.

### Task 8 — Navigation

Files:

- `src/screens/projects/projects-screen.tsx`
- `src/screens/projects/project-detail-screen.tsx`
- maybe shell/nav component if necessary.

Add links to global/project Autopilot pages.

---

## 10. Full verification

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
pnpm vitest run src/server/autopilot-suggestions-store.test.ts src/server/autopilot-scout-prompts.test.ts src/server/projects-store.test.ts src/screens/projects/autopilot-suggestions-screen.test.tsx src/screens/projects/project-autopilot-screen.test.tsx
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Manual flow:

1. Create suggestion through API.
2. Verify it appears in `/projects/autopilot`.
3. Reject it and confirm status/reason.
4. Create another suggestion and convert it.
5. Confirm new work item appears in project inbox/research.
6. Open project Autopilot tab.
7. Enable daily scout with researcher profile and limit 3.
8. Confirm Hermes job exists with safe prompt.
9. Trigger job manually.
10. Confirm it creates suggestions only, not code changes or work items.

---

## 11. Definition of Done

- Suggestions are first-class records.
- Global and project inboxes exist.
- Suggestions can be accepted/rejected/archived/converted.
- Conversion creates rough work item, not ready build.
- Project Autopilot schedule can be configured.
- Scout prompt is safe and generated server-side.
- Autopilot is suggest-only by default.
- Tests/build/live verification pass.
