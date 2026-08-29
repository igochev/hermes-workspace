import type {
  PlanningDraftRecord,
  ProjectRecord,
  WorkItemRecord,
} from './projects-api'

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const message =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.detail === 'string'
        ? body.detail
        : fallback
  return new Error(message)
}

export async function prepareWorkItemWithPlanner(
  workItemId: string,
  input: {
    orchestratorModel?: string
    workerModel?: string
    projectsDir?: string
    maxParallel?: number
    supervised?: boolean
  } = {},
): Promise<{
  workItem: WorkItemRecord
  project: ProjectRecord
  draft: PlanningDraftRecord
  launch: {
    ok: true
    sessionKey: string
    sessionKeyPrefix: string
    jobId: string
    jobName: string
    runId: null
    phase: 'research'
    profile: string
  }
}> {
  const response = await fetch(`/api/work-items/${encodeURIComponent(workItemId)}/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) throw await readError(response, `Failed to prepare work item: ${response.status}`)
  return readJson(response)
}

export async function fetchWorkItemPlanningDrafts(workItemId: string): Promise<Array<PlanningDraftRecord>> {
  const response = await fetch(`/api/work-items/${encodeURIComponent(workItemId)}/planning-drafts`)
  if (!response.ok) throw await readError(response, `Failed to fetch planning drafts: ${response.status}`)
  const data = await readJson<{ drafts?: Array<PlanningDraftRecord> }>(response)
  return data.drafts ?? []
}

export async function recordPlanningDraftOutput(
  draftId: string,
  rawOutput: string,
): Promise<PlanningDraftRecord> {
  const response = await fetch(`/api/planning-drafts/${encodeURIComponent(draftId)}/output`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawOutput }),
  })

  if (!response.ok) throw await readError(response, `Failed to record planning draft output: ${response.status}`)
  const data = await readJson<{ draft: PlanningDraftRecord }>(response)
  return data.draft
}

export async function acceptPlanningDraft(
  draftId: string,
): Promise<{ workItem: WorkItemRecord; project: ProjectRecord; draft: PlanningDraftRecord }> {
  const response = await fetch(`/api/planning-drafts/${encodeURIComponent(draftId)}/accept`, {
    method: 'POST',
  })

  if (!response.ok) throw await readError(response, `Failed to accept planning draft: ${response.status}`)
  return readJson(response)
}

export async function updatePlanningDraft(
  draftId: string,
  input: { status: 'revision_requested' | 'cancelled'; parseError?: string },
): Promise<PlanningDraftRecord> {
  const response = await fetch(`/api/planning-drafts/${encodeURIComponent(draftId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) throw await readError(response, `Failed to update planning draft: ${response.status}`)
  const data = await readJson<{ draft: PlanningDraftRecord }>(response)
  return data.draft
}
