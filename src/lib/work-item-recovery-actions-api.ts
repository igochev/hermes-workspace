import type { AttentionQueueItem } from '@/server/attention-queue-store'
import type { WorkItemRecoveryAction, WorkItemRecoveryActionType } from '@/server/work-item-recovery-actions'
import type { WorkItemPhase } from './projects-api'

const WORK_ITEMS_BASE = '/api/work-items'

export type ExecuteWorkItemRecoveryActionInput = {
  actionType: WorkItemRecoveryActionType
  attentionItemId?: string
  phase?: WorkItemPhase
  notes?: string
}

export type ExecuteWorkItemRecoveryActionResult = {
  workItem?: Record<string, unknown>
  project?: Record<string, unknown> | null
  launch?: Record<string, unknown>
  attentionItem?: AttentionQueueItem | null
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const message = typeof body?.error === 'string' ? body.error : fallback
  return new Error(message)
}

export async function executeWorkItemRecoveryAction(
  workItemId: string,
  input: ExecuteWorkItemRecoveryActionInput,
): Promise<ExecuteWorkItemRecoveryActionResult> {
  const response = await fetch(`${WORK_ITEMS_BASE}/${encodeURIComponent(workItemId)}/recovery-actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw await readError(response, `Failed to execute recovery action: ${response.status}`)
  }

  return response.json() as Promise<ExecuteWorkItemRecoveryActionResult>
}

export function toRecoveryActionInput(
  action: WorkItemRecoveryAction,
  attentionItemId: string,
  notes?: string,
): ExecuteWorkItemRecoveryActionInput {
  return {
    actionType: action.type,
    attentionItemId,
    phase: action.phase,
    notes,
  }
}
