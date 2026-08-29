import type { ExecutionRunRecord } from '../server/execution-runs-store'

export type WorkItemExecutionRunsResponse = {
  workItemId: string
  runs: Array<ExecutionRunRecord>
}

export async function fetchWorkItemExecutionRuns(
  workItemId: string,
): Promise<WorkItemExecutionRunsResponse> {
  const response = await fetch(`/api/work-items/${encodeURIComponent(workItemId)}/execution-runs`)
  const payload = (await response.json().catch(() => ({}))) as Partial<WorkItemExecutionRunsResponse> & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Failed to fetch execution runs (${response.status})`)
  }

  return {
    workItemId: typeof payload.workItemId === 'string' ? payload.workItemId : workItemId,
    runs: Array.isArray(payload.runs) ? payload.runs : [],
  }
}
