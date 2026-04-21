const WORK_ITEMS_BASE = '/api/work-items'

export type WorkItemExecutionState = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'

export type WorkItemExecutionPayload = {
  workItem: {
    id: string
    missionId?: string
    missionLink?: string
    missionState?: WorkItemExecutionState
    missionLastRunAt?: string
    missionLastError?: string
    status: string
    phase?: string
    history: Array<Record<string, unknown>>
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
    transitionApplied: null | 'build->review' | 'active->blocked'
  }
}

export async function syncWorkItemExecution(workItemId: string): Promise<WorkItemExecutionPayload> {
  const response = await fetch(`${WORK_ITEMS_BASE}/${encodeURIComponent(workItemId)}?syncExecution=true`)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to sync work item execution')
  }
  return response.json() as Promise<WorkItemExecutionPayload>
}
