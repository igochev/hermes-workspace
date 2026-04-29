import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { getAttentionQueueItem, markAttentionQueueItemResolved } from '../../server/attention-queue-store'
import { launchWorkItemIntoConductor } from '../../server/work-item-launch'
import { applyWorkItemLifecycleTransition } from '../../server/work-item-lifecycle'
import {

  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem
} from '../../server/work-items-store'
import type {WorkItemPhase} from '../../server/work-items-store';
import type { WorkItemRecoveryActionType } from '../../server/work-item-recovery-actions'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_ACTION_TYPES: Array<WorkItemRecoveryActionType> = [
  'relaunch_phase',
  'return_to_build',
  'request_review',
  'mark_resolved',
  'cancel_work_item',
  'dismiss_attention',
]

function readActionType(value: unknown): WorkItemRecoveryActionType | null {
  return VALID_ACTION_TYPES.includes(value as WorkItemRecoveryActionType)
    ? (value as WorkItemRecoveryActionType)
    : null
}

function readPhase(value: unknown, fallback?: WorkItemPhase): WorkItemPhase {
  if (value === 'research' || value === 'build' || value === 'review' || value === 'deploy') return value
  return fallback ?? 'build'
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function resolveAttention(attentionItemId: unknown) {
  const id = readOptionalString(attentionItemId)
  if (!id) return null
  return markAttentionQueueItemResolved(id)
}

function recoveryNote(actionType: WorkItemRecoveryActionType, notes?: string): string {
  const suffix = notes ? ` ${notes}` : ''
  if (actionType === 'relaunch_phase') return `Recovery action: relaunched phase.${suffix}`
  if (actionType === 'return_to_build') return `Recovery action: returned work item to build.${suffix}`
  if (actionType === 'request_review') return `Recovery action: requested review.${suffix}`
  if (actionType === 'mark_resolved') return `Recovery action: attention marked externally resolved.${suffix}`
  if (actionType === 'cancel_work_item') return `Recovery action: cancelled work item.${suffix}`
  return `Recovery action: attention dismissed.${suffix}`
}

export const Route = createFileRoute('/api/work-items/$workItemId/recovery-actions')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const actionType = readActionType(body.actionType)
          if (!actionType) return jsonResponse({ error: 'Invalid recovery action type' }, 400)

          const workItem = getWorkItem(params.workItemId)
          if (!workItem) return jsonResponse({ error: 'Work item not found' }, 404)

          const notes = readOptionalString(body.notes)
          const attentionItemId = readOptionalString(body.attentionItemId)
          const attentionBefore = attentionItemId ? getAttentionQueueItem(attentionItemId) : null
          if (attentionBefore?.workItemId && attentionBefore.workItemId !== workItem.id) {
            return jsonResponse({ error: 'Attention item does not belong to this work item' }, 400)
          }

          if (actionType === 'relaunch_phase') {
            const phase = readPhase(body.phase, workItem.phase)
            appendWorkItemHistoryEntry(workItem.id, {
              action: 'note',
              status: workItem.status,
              phase,
              note: recoveryNote(actionType, notes),
              missionId: workItem.missionId,
              sessionKey: workItem.sessionKeys.at(-1),
              sessionKeyPrefix: workItem.missionSessionKeyPrefix,
              profile: workItem.assignedProfile,
            })
            const launch = await launchWorkItemIntoConductor(workItem.id, { phase, supervised: true })
            const attentionItem = resolveAttention(body.attentionItemId)
            return jsonResponse({ ...launch, attentionItem }, 201)
          }

          if (actionType === 'return_to_build') {
            const updated = updateWorkItem(workItem.id, {
              status: 'active',
              phase: 'build',
              blockedReason: undefined,
              missionState: 'unknown',
              missionLastError: undefined,
            })
            if (!updated) throw new Error('Failed to update work item lifecycle state')
            const withHistory = appendWorkItemHistoryEntry(updated.id, {
              action: 'status-change',
              status: 'active',
              phase: 'build',
              note: recoveryNote(actionType, notes),
              missionId: updated.missionId,
              sessionKey: updated.sessionKeys.at(-1),
              sessionKeyPrefix: updated.missionSessionKeyPrefix,
              profile: updated.assignedProfile,
            })
            const attentionItem = resolveAttention(body.attentionItemId)
            return jsonResponse({ workItem: withHistory ?? updated, attentionItem })
          }

          if (actionType === 'request_review') {
            const result = applyWorkItemLifecycleTransition(workItem.id, {
              action: 'request_review',
              actor: 'operator',
              notes: notes ?? 'Recovery action requested review.',
            })
            const attentionItem = resolveAttention(body.attentionItemId)
            return jsonResponse({ ...result, attentionItem })
          }

          if (actionType === 'cancel_work_item') {
            const result = applyWorkItemLifecycleTransition(workItem.id, {
              action: 'cancel',
              actor: 'operator',
              notes: notes ?? 'Cancelled from recovery actions.',
            })
            const attentionItem = resolveAttention(body.attentionItemId)
            return jsonResponse({ ...result, attentionItem })
          }

          const withHistory = appendWorkItemHistoryEntry(workItem.id, {
            action: 'note',
            status: workItem.status,
            phase: workItem.phase,
            note: recoveryNote(actionType, notes),
            missionId: workItem.missionId,
            sessionKey: workItem.sessionKeys.at(-1),
            sessionKeyPrefix: workItem.missionSessionKeyPrefix,
            profile: workItem.assignedProfile,
          })
          const attentionItem = resolveAttention(body.attentionItemId)
          return jsonResponse({ workItem: withHistory ?? workItem, attentionItem })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status = message === 'Work item not found' ? 404 : message.includes('valid') ? 400 : 500
          return jsonResponse({ error: message }, status)
        }
      },
    },
  },
})
