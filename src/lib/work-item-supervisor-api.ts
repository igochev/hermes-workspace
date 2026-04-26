import type { SupervisorFinding } from '../server/work-item-supervisor'

export type WorkItemSupervisorReconcileResponse = {
  checked: number
  findings: Array<SupervisorFinding>
}

export async function reconcileWorkItemSupervisor(options: {
  workItemId?: string
} = {}): Promise<WorkItemSupervisorReconcileResponse> {
  const params = new URLSearchParams()
  if (options.workItemId) params.set('workItemId', options.workItemId)
  const query = params.toString()
  const response = await fetch(`/api/work-items/supervisor/reconcile${query ? `?${query}` : ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const payload = (await response.json().catch(() => ({}))) as Partial<WorkItemSupervisorReconcileResponse> & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Failed to reconcile work item supervisor (${response.status})`)
  }

  return {
    checked: typeof payload.checked === 'number' ? payload.checked : 0,
    findings: Array.isArray(payload.findings) ? payload.findings : [],
  }
}
