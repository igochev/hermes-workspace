import { getWorkItem, updateWorkItem, appendWorkItemHistoryEntry, type WorkItemRecord } from './work-items-store'
import { requestWorkItemApproval, requestWorkItemReviewApproval, type WorkItemApprovalRecord } from './work-item-approvals'

export type WorkItemLifecycleAction =
  | 'send_to_planning'
  | 'mark_ready'
  | 'request_review'
  | 'request_deploy_approval'
  | 'resume_build'
  | 'cancel'
  | 'back_to_research'
  | 'back_to_build'
  | 'back_to_inbox'

export type ApplyWorkItemLifecycleTransitionInput = {
  action: WorkItemLifecycleAction
  actor?: string
  notes?: string
}

export type ApplyWorkItemLifecycleTransitionResult = {
  workItem: WorkItemRecord
  approval?: WorkItemApprovalRecord
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function assertActionAllowed(workItem: WorkItemRecord, action: WorkItemLifecycleAction): void {
  if (action === 'cancel') {
    if (workItem.status === 'done' || workItem.status === 'cancelled') {
      throw new Error('cancel is only valid for non-terminal work items (inbox, ready, active, blocked)')
    }
    return
  }

  if (action === 'back_to_research') {
    if (
      (workItem.status === 'active' && (workItem.phase === 'build' || workItem.phase === 'review')) ||
      (workItem.status === 'blocked' && workItem.phase === 'build')
    ) {
      return
    }
    throw new Error('back_to_research is only valid for active build, active review, or blocked build work items')
  }

  if (action === 'back_to_build') {
    if (workItem.status === 'active' && workItem.phase === 'deploy') return
    throw new Error('back_to_build is only valid for active deploy work items')
  }

  if (action === 'back_to_inbox') {
    if (workItem.status === 'active' && workItem.phase === 'research') return
    throw new Error('back_to_inbox is only valid for active research work items')
  }

  if (action === 'send_to_planning') {
    if (workItem.status === 'inbox' && workItem.phase === 'research') return
    throw new Error('send_to_planning is only valid for inbox research work items')
  }

  if (action === 'mark_ready') {
    if (workItem.status === 'active' && workItem.phase === 'research') return
    throw new Error('mark_ready is only valid for active research work items')
  }

  if (action === 'request_review') {
    if (workItem.status === 'active' && workItem.phase === 'build') return
    throw new Error('request_review is only valid for active build work items')
  }

  if (action === 'request_deploy_approval') {
    if (workItem.status === 'active' && workItem.phase === 'deploy') return
    throw new Error('request_deploy_approval is only valid for active deploy work items')
  }

  if (workItem.status === 'blocked' && workItem.phase === 'build') return
  throw new Error('resume_build is only valid for blocked build work items')
}

export function applyWorkItemLifecycleTransition(
  workItemId: string,
  input: ApplyWorkItemLifecycleTransitionInput,
): ApplyWorkItemLifecycleTransitionResult {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')

  assertActionAllowed(workItem, input.action)

  const actor = readOptionalString(input.actor)
  const notes = readOptionalString(input.notes)

  if (input.action === 'send_to_planning') {
    const updated = updateWorkItem(workItem.id, {
      status: 'active',
      phase: 'research',
    })
    if (!updated) throw new Error('Failed to update work item lifecycle state')
    const withHistory = appendWorkItemHistoryEntry(updated.id, {
      action: 'status-change',
      status: 'active',
      phase: 'research',
      note: notes ? `Sent to planning with Researcher: ${notes}` : 'Sent to planning with Researcher.',
      missionId: updated.missionId,
      sessionKey: updated.sessionKeys.at(-1),
      sessionKeyPrefix: updated.missionSessionKeyPrefix,
      profile: updated.assignedProfile,
    })
    if (!withHistory) throw new Error('Failed to record lifecycle history entry')
    return { workItem: withHistory }
  }

  if (input.action === 'mark_ready') {
    const updated = updateWorkItem(workItem.id, {
      status: 'ready',
      phase: undefined,
    })
    if (!updated) throw new Error('Failed to update work item lifecycle state')
    const withHistory = appendWorkItemHistoryEntry(updated.id, {
      action: 'status-change',
      status: 'ready',
      phase: undefined,
      note: notes ? `Planning complete; marked ready for build: ${notes}` : 'Planning complete; marked ready for build.',
      missionId: updated.missionId,
      sessionKey: updated.sessionKeys.at(-1),
      sessionKeyPrefix: updated.missionSessionKeyPrefix,
      profile: updated.assignedProfile,
    })
    if (!withHistory) throw new Error('Failed to record lifecycle history entry')
    return { workItem: withHistory }
  }

  if (input.action === 'resume_build') {
    const updated = updateWorkItem(workItem.id, {
      status: 'active',
      phase: 'build',
      missionState: 'unknown',
      missionLastError: undefined,
    })
    if (!updated) throw new Error('Failed to update work item lifecycle state')
    const withHistory = appendWorkItemHistoryEntry(updated.id, {
      action: 'status-change',
      status: 'active',
      phase: 'build',
      note: notes
        ? `Resumed blocked build work for relaunch: ${notes}`
        : 'Resumed blocked build work for relaunch.',
      missionId: updated.missionId,
      sessionKey: updated.sessionKeys.at(-1),
      sessionKeyPrefix: updated.missionSessionKeyPrefix,
      profile: updated.assignedProfile,
    })
    if (!withHistory) throw new Error('Failed to record lifecycle history entry')
    return { workItem: withHistory }
  }

  if (input.action === 'request_deploy_approval') {
    const approval = requestWorkItemApproval(workItem.id, {
      requestedBy: actor,
      notes,
      phase: 'deploy',
    })
    const refreshed = getWorkItem(workItem.id)
    if (!refreshed) throw new Error('Work item not found after lifecycle transition')
    return {
      workItem: refreshed,
      approval,
    }
  }

  if (input.action === 'cancel') {
    if (!notes?.trim()) {
      throw new Error('cancel requires a reason note explaining why the work item is being cancelled')
    }
    const updated = updateWorkItem(workItem.id, {
      status: 'cancelled',
      phase: undefined,
    })
    if (!updated) throw new Error('Failed to update work item lifecycle state')
    const withHistory = appendWorkItemHistoryEntry(updated.id, {
      action: 'status-change',
      status: 'cancelled',
      phase: undefined,
      note: `Cancelled: ${notes}`,
      missionId: updated.missionId,
      sessionKey: updated.sessionKeys.at(-1),
      sessionKeyPrefix: updated.missionSessionKeyPrefix,
      profile: updated.assignedProfile,
    })
    if (!withHistory) throw new Error('Failed to record lifecycle history entry')
    return { workItem: withHistory }
  }

  if (input.action === 'back_to_research') {
    const updated = updateWorkItem(workItem.id, {
      status: 'active',
      phase: 'research',
    })
    if (!updated) throw new Error('Failed to update work item lifecycle state')
    const withHistory = appendWorkItemHistoryEntry(updated.id, {
      action: 'status-change',
      status: 'active',
      phase: 'research',
      note: notes ? `Returned to research for additional planning: ${notes}` : 'Returned to research for additional planning.',
      missionId: updated.missionId,
      sessionKey: updated.sessionKeys.at(-1),
      sessionKeyPrefix: updated.missionSessionKeyPrefix,
      profile: updated.assignedProfile,
    })
    if (!withHistory) throw new Error('Failed to record lifecycle history entry')
    return { workItem: withHistory }
  }

  if (input.action === 'back_to_build') {
    const updated = updateWorkItem(workItem.id, {
      status: 'active',
      phase: 'build',
    })
    if (!updated) throw new Error('Failed to update work item lifecycle state')
    const withHistory = appendWorkItemHistoryEntry(updated.id, {
      action: 'status-change',
      status: 'active',
      phase: 'build',
      note: notes ? `Returned to build for fixes: ${notes}` : 'Returned to build for fixes.',
      missionId: updated.missionId,
      sessionKey: updated.sessionKeys.at(-1),
      sessionKeyPrefix: updated.missionSessionKeyPrefix,
      profile: updated.assignedProfile,
    })
    if (!withHistory) throw new Error('Failed to record lifecycle history entry')
    return { workItem: withHistory }
  }

  if (input.action === 'back_to_inbox') {
    const updated = updateWorkItem(workItem.id, {
      status: 'inbox',
      phase: 'research',
    })
    if (!updated) throw new Error('Failed to update work item lifecycle state')
    const withHistory = appendWorkItemHistoryEntry(updated.id, {
      action: 'status-change',
      status: 'inbox',
      phase: 'research',
      note: notes ? `Returned to inbox for refinement: ${notes}` : 'Returned to inbox for refinement.',
      missionId: updated.missionId,
      sessionKey: updated.sessionKeys.at(-1),
      sessionKeyPrefix: updated.missionSessionKeyPrefix,
      profile: updated.assignedProfile,
    })
    if (!withHistory) throw new Error('Failed to record lifecycle history entry')
    return { workItem: withHistory }
  }

  // Default: request_review (must be last — fallthrough action)
  let updated = updateWorkItem(workItem.id, {
    status: 'active',
    phase: 'review',
  })
  if (!updated) throw new Error('Failed to update work item lifecycle state')

  updated = appendWorkItemHistoryEntry(updated.id, {
    action: 'status-change',
    status: 'active',
    phase: 'review',
    note: notes ? `Requested review; moved work item into review: ${notes}` : 'Requested review; moved work item into review.',
    missionId: updated.missionId,
    sessionKey: updated.sessionKeys.at(-1),
    sessionKeyPrefix: updated.missionSessionKeyPrefix,
    profile: updated.assignedProfile,
  })
  if (!updated) throw new Error('Failed to record lifecycle history entry')

  const approval = requestWorkItemReviewApproval(updated.id, {
    requestedBy: actor,
    notes,
  })

  const refreshed = getWorkItem(updated.id)
  if (!refreshed) throw new Error('Work item not found after lifecycle transition')

  return {
    workItem: refreshed,
    approval,
  }
}
