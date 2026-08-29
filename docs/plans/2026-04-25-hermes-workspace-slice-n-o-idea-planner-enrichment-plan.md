# Slice N/O Implementation Plan — Idea Intake + Planner Enrichment

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task. Cheaper models should not read the whole roadmap; this file is self-contained.

**Goal:** Let the Developer capture a rough idea, ask Planner to enrich it into a structured draft, review/accept the draft, then launch Builder only after the idea is prepared.

**Architecture:** Add a separate file-backed `PlanningDraft` store and structured Planner output parser. Planner enrichment launches a Planner-only research mission and stores a draft. Accepting a valid draft mutates the Work Item into `ready/build`. Invalid Planner output never mutates the Work Item.

**Tech Stack:** TanStack Router/React, TypeScript, file-backed JSON stores under `$HERMES_HOME`, existing Conductor/Hermes job launch helpers, Vitest.

---

## 1. Product behavior

### Current problem

Today the user can create work items, and the two-phase Launch Build flow tells Planner to write a plan before Builder runs. That is too late and too hidden. The Developer wants to dump rough ideas and have Planner prepare them before Builder work starts.

### Target behavior

1. User creates rough idea with title and optional description.
2. Work item defaults to `status='inbox'`, `phase='research'`.
3. Work-item detail shows **Prepare with Planner**.
4. Prepare launches a Planner-only mission; no Builder launch.
5. Planner writes a plan and returns structured JSON.
6. Structured output is stored in a `PlanningDraft`.
7. UI shows draft diff.
8. User accepts draft.
9. Work item becomes `status='ready'`, `phase='build'`, with title/description/criteria/labels/risk/plan path populated.
10. Builder launch is allowed only after preparation.

---

## 2. Data model

### Create `src/server/planning-drafts-store.ts`

Back file:

```ts
path.join(HERMES_HOME, 'planning-drafts.json')
```

Types:

```ts
export type PlanningDraftStatus =
  | 'requested'
  | 'running'
  | 'structured_ready'
  | 'parse_failed'
  | 'accepted'
  | 'revision_requested'
  | 'cancelled'

export type PlannerStructuredOutput = {
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  riskLevel: 'low' | 'medium' | 'high'
  labels: Array<string>
  acceptanceCriteria: Array<string>
  notes: Array<string>
  planFilePath: string
  openQuestions: Array<string>
  suggestedPhase: 'research' | 'build'
}

export type PlanningDraftRecord = {
  id: string
  workItemId: string
  projectId: string
  status: PlanningDraftStatus
  plannerJobId?: string
  plannerJobName?: string
  plannerSessionKey?: string
  plannerSessionKeyPrefix?: string
  plannerProfile?: string
  plannerLink?: string
  rawOutput?: string
  structuredOutput?: PlannerStructuredOutput
  parseWarnings: Array<string>
  parseError?: string
  planFilePath?: string
  createdAt: string
  updatedAt: string
  acceptedAt?: string
  revisionRequestedAt?: string
}
```

Store functions:

```ts
createPlanningDraft(input)
getPlanningDraft(id)
getLatestPlanningDraftForWorkItem(workItemId)
listPlanningDrafts(filters?)
updatePlanningDraft(id, updates)
acceptPlanningDraft(id)
deletePlanningDraft(id)
deletePlanningDraftsForWorkItem(workItemId)
deletePlanningDraftsForProject(projectId)
```

Normalization rules:

- Trim strings.
- Deduplicate labels, criteria, notes, open questions.
- Unknown status defaults to `requested`.
- Missing arrays default to `[]`.
- Store must never mutate `WorkItemRecord`.

---

## 3. Structured Planner output parser

### Create `src/server/planner-output-schema.ts`

Use `zod` because it already exists in `package.json`.

Parser API:

```ts
export function parsePlannerStructuredOutput(raw: string):
  | { ok: true; output: PlannerStructuredOutput; warnings: Array<string> }
  | { ok: false; error: string; warnings: Array<string> }
```

Support:

1. raw JSON object;
2. fenced markdown JSON block;
3. prose around JSON with a warning.

Reject:

- invalid JSON;
- empty/missing `title`;
- empty/missing `description`;
- empty `acceptanceCriteria`;
- missing `planFilePath`;
- invalid priority/risk/suggestedPhase.

Required schema:

```ts
const PlannerStructuredOutputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  riskLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  labels: z.array(z.string().trim().min(1)).default([]),
  acceptanceCriteria: z.array(z.string().trim().min(1)).min(1),
  notes: z.array(z.string().trim().min(1)).default([]),
  planFilePath: z.string().trim().min(1),
  openQuestions: z.array(z.string().trim().min(1)).default([]),
  suggestedPhase: z.enum(['research', 'build']).default('build'),
})
```

---

## 4. Planner enrichment service

### Create `src/server/work-item-planning.ts`

Service API:

```ts
export async function prepareWorkItemWithPlanner(workItemId: string, request: PrepareWorkItemRequest): Promise<PrepareWorkItemResponse>
export function recordPlannerOutput(draftId: string, rawOutput: string): PlanningDraftRecord
export function applyPlanningDraftToWorkItem(draftId: string): WorkItemPlanningAcceptResponse
export function buildPlannerEnrichmentGoal(params): string
```

`prepareWorkItemWithPlanner` must:

1. load work item;
2. load project;
3. resolve Planner profile from project `phaseProfiles.research` or fallback `planner`;
4. create a `PlanningDraft` with `status='requested'`;
5. build a Planner-only goal;
6. call `launchConductorMission` with research/planner phase profiles;
7. update draft to `running` with job/session metadata;
8. append work-item history note: `Planner enrichment requested...`;
9. return work item, project, draft, launch metadata.

Planner prompt must include:

- no source-code modifications except the plan markdown;
- no Builder launch;
- write plan to `docs/plans/{project.slug}-{workItem.id.slice(0, 8)}-planner-draft.md`;
- output final JSON matching schema exactly;
- include acceptance criteria and open questions;
- reference work item id and project repo path.

`recordPlannerOutput` must:

- save raw output always;
- parse structured output;
- if valid: set `status='structured_ready'`, `structuredOutput`, `planFilePath`;
- if invalid: set `status='parse_failed'`, `parseError`, `parseWarnings`;
- never mutate work item.

`applyPlanningDraftToWorkItem` must:

- require `status='structured_ready'`;
- require `structuredOutput`;
- update work item fields:
  - `title`, `description`, `priority`, `riskLevel`, `labels`, `acceptanceCriteria`, `notes`, `planFilePath`, `status='ready'`, `phase='build'`;
- append history note;
- mark draft `accepted`.

Do not overwrite execution fields: `missionJobId`, `missionState`, `branchName`, `prUrl`, `artifactPaths`, `reviewJobId`.

---

## 5. Routes

Create:

```txt
src/routes/api/work-items.$workItemId.prepare.ts
src/routes/api/work-items.$workItemId.planning-drafts.ts
src/routes/api/planning-drafts.$draftId.ts
src/routes/api/planning-drafts.$draftId.output.ts
src/routes/api/planning-drafts.$draftId.accept.ts
```

Contracts:

- `POST /api/work-items/:workItemId/prepare` → starts Planner enrichment.
- `GET /api/work-items/:workItemId/planning-drafts` → list drafts for work item.
- `GET /api/planning-drafts/:draftId` → fetch draft.
- `PATCH /api/planning-drafts/:draftId` → revision/cancel metadata only.
- `POST /api/planning-drafts/:draftId/output` body `{ rawOutput: string }` → parse/store output.
- `POST /api/planning-drafts/:draftId/accept` → apply valid draft to work item.

All routes must:

- call `isAuthenticated(request)`;
- return `401` if unauthorized;
- return `404` for missing work item/draft/project;
- return `400` for invalid draft state or bad body;
- never return 500 for parser failures.

---

## 6. Existing route/type updates

### `src/routes/api/work-items.$workItemId.ts`

Include latest draft in detail response:

```ts
latestPlanningDraft: getLatestPlanningDraftForWorkItem(workItem.id)
```

### `src/lib/projects-api.ts`

Add missing field:

```ts
planFilePath?: string
latestPlanningDraft?: PlanningDraftRecord | null
```

Export `PlanningDraftRecord` and related types.

### `src/lib/planning-drafts-api.ts`

Create client helpers:

```ts
prepareWorkItemWithPlanner(workItemId, input)
fetchWorkItemPlanningDrafts(workItemId)
recordPlanningDraftOutput(draftId, rawOutput)
acceptPlanningDraft(draftId)
updatePlanningDraft(draftId, input)
```

### `src/server/work-item-launch.ts`

Add a guard:

- Build launch from `inbox/research` rough idea with no `planFilePath` should fail with: `Work item must be prepared by Planner before Builder launch`.
- Ready items with `planFilePath` proceed.
- Research/planning launch remains allowed.

---

## 7. UI

### `src/screens/projects/project-detail-screen.tsx`

- Make create form copy say **Capture rough idea**.
- Preserve defaults: `status='inbox'`, `phase='research'`.
- Card signal helper should show:
  - `Needs Planner` for `inbox/research` with no structured draft.
  - `Draft ready` when latest draft is `structured_ready` if available.
  - `Planner revision needed` when latest draft is `parse_failed` if available.

### `src/screens/projects/work-item-detail-screen.tsx`

Add **Planner Enrichment** panel:

States:

1. no draft → button `Prepare with Planner`;
2. requested/running → show job/session metadata;
3. structured_ready → show diff preview and `Accept Planner Draft`;
4. parse_failed → show error/warnings and `Request Revision` guidance;
5. accepted → show accepted timestamp and plan path.

Add helpers for tests:

```ts
getPlanningDraftStatusLabel(status?: string): string
getPlanningDraftGuidance(status?: string): string
canLaunchBuildFromPlanningState(workItem, latestDraft): boolean
buildPlanningDraftDiff(currentWorkItem, structuredOutput): Array<{ label; before; after }>
```

Disable/guide Build launch when rough idea is unprepared.

---

## 8. TDD tasks

### Task 1 — PlanningDraft store

**Files:**
- Create: `src/server/planning-drafts-store.test.ts`
- Create: `src/server/planning-drafts-store.ts`

Tests:

- creates draft with defaults;
- lists by workItemId/projectId/status;
- latest draft returns newest updatedAt;
- update stores raw/structured/parse fields;
- accept marks acceptedAt;
- delete by work item/project;
- invalid JSON backing file returns empty list.

Run:

```bash
pnpm vitest run src/server/planning-drafts-store.test.ts
```

### Task 2 — Planner output parser

**Files:**
- Create: `src/server/planner-output-schema.test.ts`
- Create: `src/server/planner-output-schema.ts`

Tests:

- parses raw JSON;
- parses fenced JSON;
- trims/dedupes arrays;
- rejects invalid JSON;
- rejects missing planFilePath;
- rejects empty acceptanceCriteria;
- rejects invalid enum;
- warns on surrounding prose.

Run:

```bash
pnpm vitest run src/server/planner-output-schema.test.ts
```

### Task 3 — Planner service

**Files:**
- Create: `src/server/work-item-planning.test.ts`
- Create: `src/server/work-item-planning.ts`

Tests:

- prepare creates draft and launches Planner/research only;
- prompt contains schema and “do not modify code / do not launch Builder”;
- prepare does not mutate work-item fields;
- valid output becomes structured_ready;
- invalid output becomes parse_failed and leaves work item unchanged;
- accepting draft mutates work item to ready/build;
- accepting invalid draft throws.

Run:

```bash
pnpm vitest run src/server/work-item-planning.test.ts
```

### Task 4 — API routes

**Files:**
- Create route files listed in section 5.
- Add route tests if current route-test pattern supports them; otherwise cover route logic through service tests plus build.

Target behavior:

- unauthorized → 401;
- missing record → 404;
- parser failure → 200/400 with draft status `parse_failed`, not 500;
- accept valid draft returns updated work item.

Run route-related tests and build.

### Task 5 — Launch guard

**Files:**
- Modify: `src/server/work-item-launch.ts`
- Modify: `src/server/work-item-launch.test.ts`

Tests:

- rough idea build launch rejected;
- ready item with planFilePath proceeds;
- research launch still allowed;
- existing two-phase behavior still passes.

Run:

```bash
pnpm vitest run src/server/work-item-launch.test.ts
```

### Task 6 — Client API/types

**Files:**
- Modify: `src/lib/projects-api.ts`
- Create: `src/lib/planning-drafts-api.ts`

Verification:

```bash
pnpm build
```

### Task 7 — UI helper tests

**Files:**
- Modify: `src/screens/projects/work-item-detail-screen.test.ts`
- Modify: `src/screens/projects/project-detail-screen.test.ts`

Tests:

- status labels/guidance;
- rough idea says Needs Planner;
- Build launch gating helper;
- diff builder output;
- parse failed guidance.

Run:

```bash
pnpm vitest run src/screens/projects/work-item-detail-screen.test.ts src/screens/projects/project-detail-screen.test.ts
```

### Task 8 — UI implementation

**Files:**
- Modify: `src/screens/projects/work-item-detail-screen.tsx`
- Modify: `src/screens/projects/project-detail-screen.tsx`

Implement panel/cards/buttons.

Run all targeted tests.

---

## 9. Full verification

```bash
cd /home/d3ni3/.Hermes/workspace/projects/hermes-workspace
pnpm vitest run src/server/planning-drafts-store.test.ts src/server/planner-output-schema.test.ts src/server/work-item-planning.test.ts src/server/work-item-launch.test.ts src/screens/projects/work-item-detail-screen.test.ts src/screens/projects/project-detail-screen.test.ts
pnpm vitest run
pnpm build
systemctl --user restart hermes-workspace.service
systemctl --user is-active hermes-workspace.service
```

Manual verification:

1. Create rough idea with title only.
2. Confirm it appears as Inbox/Research and Needs Planner.
3. Open detail and click Prepare with Planner.
4. Confirm draft running state and no Builder launch.
5. Submit valid structured output via output endpoint.
6. Confirm draft diff appears.
7. Accept draft.
8. Confirm work item is Ready/Build with criteria and plan path.
9. Launch Build and confirm it proceeds.
10. Repeat invalid JSON path; confirm work item unchanged and parse_failed shown.

---

## 10. Definition of Done

- Rough ideas are first-class and easy.
- Planner enrichment is Planner-only.
- Structured output is validated before work-item mutation.
- Invalid Planner output never corrupts a work item.
- Accepted draft prepares the work item for Builder.
- UI clearly shows draft state and next action.
- All tests/build/live verification pass.
