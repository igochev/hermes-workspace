import type { WorkItemCriterionStatus, WorkItemLifecycleAction } from './projects-api'

const WORK_ITEMS_BASE = '/api/work-items'

export type WorkItemExecutionState = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'

export type WorkItemExecutionPayload = {
  workItem: {
    id: string
    missionId?: string
    missionJobId?: string
    missionJobName?: string
    missionSessionKeyPrefix?: string
    missionLink?: string
    missionState?: WorkItemExecutionState
    missionLastRunAt?: string
    missionLastError?: string
    status: string
    phase?: string
    riskLevel?: 'low' | 'medium' | 'high'
    acceptanceCriteria: Array<string>
    criteriaStatus: Array<WorkItemCriterionStatus>
    notes: Array<string>
    history: Array<Record<string, unknown>>
    approvals?: Array<Record<string, unknown>>
  }
  project: Record<string, unknown> | null
  execution: {
    state: WorkItemExecutionState
    job: {
      id: string
      name: string
      state: string
      last_run_at?: string | null
      last_status?: string | null
      last_error?: string | null
      next_run_at?: string | null
    } | null
    jobRuns: Array<{
      id: string
      status: string
      startedAt: string | null
      finishedAt: string | null
      durationMs?: number
      error?: string
      deliverySummary?: string
      chatSessionKey?: string
      output?: unknown
    }>
    latestRun: {
      id: string
      status: string
      startedAt: string | null
      finishedAt: string | null
      durationMs?: number
      error?: string
      deliverySummary?: string
      chatSessionKey?: string
      output?: unknown
    } | null
    latestSessionKey: string | null
    transitionApplied: null | 'build->review' | 'active->blocked'
  }
}

export type WorkItemLifecyclePayload = {
  workItem: Record<string, unknown>
  project: Record<string, unknown> | null
  approval?: Record<string, unknown>
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const message = typeof body?.error === 'string' ? body.error : fallback
  return new Error(message)
}

export async function syncWorkItemExecution(workItemId: string): Promise<WorkItemExecutionPayload> {
  const response = await fetch(`${WORK_ITEMS_BASE}/${encodeURIComponent(workItemId)}?syncExecution=true`)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to sync work item execution')
  }
  return response.json() as Promise<WorkItemExecutionPayload>
}

export async function applyWorkItemLifecycleAction(
  workItemId: string,
  input: {
    action: WorkItemLifecycleAction
    actor?: string
    notes?: string
  },
): Promise<WorkItemLifecyclePayload> {
  const response = await fetch(`${WORK_ITEMS_BASE}/${encodeURIComponent(workItemId)}/lifecycle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw await readError(response, `Failed to apply work item lifecycle action: ${response.status}`)
  }
  return response.json() as Promise<WorkItemLifecyclePayload>
}
