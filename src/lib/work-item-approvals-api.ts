import { WorkItemApprovalDecision } from './projects-api'

const WORK_ITEM_APPROVALS_BASE = '/api/work-item-approvals'

export type WorkItemApprovalRecord = {
  id: string
  workItemId: string
  projectId: string
  phase: 'review' | 'deploy'
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected'
  requestedBy: string
  requestedAt: string
  resolvedBy?: string
  resolvedAt?: string
  notes?: string
  resolutionNotes?: string
  createdAt: string
  updatedAt: string
}

export type ApprovalInboxEntry = {
  approvalId: string
  workItemId: string
  workItemTitle: string
  projectId: string
  projectName: string
  phase: 'review' | 'deploy'
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected'
  requestedBy: string
  requestedAt: string
  resolvedBy?: string
  resolvedAt?: string
  notes?: string
  resolutionNotes?: string
}

export type WorkItemApprovalResolutionPayload = {
  approval: WorkItemApprovalRecord
  workItem: {
    id: string
    projectId: string
    status: 'inbox' | 'ready' | 'active' | 'blocked' | 'done' | 'cancelled'
    phase?: 'research' | 'build' | 'review' | 'deploy'
  }
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const message = typeof body?.error === 'string' ? body.error : fallback
  return new Error(message)
}

export async function fetchApprovalInbox(): Promise<Array<ApprovalInboxEntry>> {
  const response = await fetch(WORK_ITEM_APPROVALS_BASE)
  if (!response.ok) {
    throw await readError(response, `Failed to fetch approval inbox: ${response.status}`)
  }
  const data = (await response.json()) as { approvals?: Array<ApprovalInboxEntry> }
  return data.approvals ?? []
}

export async function resolveWorkItemApproval(
  approvalId: string,
  input: {
    decision: WorkItemApprovalDecision
    resolvedBy?: string
    notes?: string
  },
): Promise<WorkItemApprovalResolutionPayload> {
  const response = await fetch(`${WORK_ITEM_APPROVALS_BASE}/${encodeURIComponent(approvalId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw await readError(response, `Failed to resolve work item approval: ${response.status}`)
  }

  return (await response.json()) as WorkItemApprovalResolutionPayload
}
