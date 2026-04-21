import { getProject, type ProjectRecord } from './projects-store'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem,
  type WorkItemMissionState,
  type WorkItemPhase,
  type WorkItemRecord,
} from './work-items-store'
import { getHermesJobById, listHermesJobs, type HermesJobInfo } from './hermes-jobs'
import { buildMissionLink } from './conductor-launch'

export type SyncedExecutionState = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'

export type WorkItemExecutionSyncResult = {
  workItem: WorkItemRecord
  project: ProjectRecord
  execution: {
    state: SyncedExecutionState
    job: HermesJobInfo | null
    transitionApplied: null | 'build->review' | 'active->blocked'
  }
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asOptionalString(value: string): string | undefined {
  return value.length > 0 ? value : undefined
}

function deriveExecutionState(job: HermesJobInfo | null): SyncedExecutionState {
  if (!job) return 'unknown'
  if (job.last_status === 'ok') return 'succeeded'
  if (job.last_status === 'error') return 'failed'
  if (job.state === 'running') return 'running'
  if (job.state === 'scheduled') return 'scheduled'
  return 'unknown'
}

async function resolveJobForWorkItem(workItem: WorkItemRecord): Promise<HermesJobInfo | null> {
  const missionId = readOptionalString(workItem.missionId)
  if (!missionId) return null

  const direct = await getHermesJobById(missionId)
  if (direct) return direct

  const jobs = await listHermesJobs()
  return jobs.find((job) => readOptionalString(job.name) === missionId) ?? null
}

function applyMissionFields(workItem: WorkItemRecord, job: HermesJobInfo | null, state: SyncedExecutionState) {
  const fallbackMissionId = readOptionalString(workItem.missionId)
  const resolvedJobId = job?.id ?? (fallbackMissionId || undefined)
  const lastError = readOptionalString(job?.last_error)
  return {
    missionId: resolvedJobId,
    missionLink: resolvedJobId ? buildMissionLink(resolvedJobId) : workItem.missionLink,
    missionState: (state === 'unknown' ? 'unknown' : state) as WorkItemMissionState,
    missionLastRunAt: job?.last_run_at ?? workItem.missionLastRunAt,
    missionLastError: state === 'failed' ? asOptionalString(lastError) ?? workItem.missionLastError : undefined,
  }
}

function transitionForSuccess(workItem: WorkItemRecord): { status: WorkItemRecord['status']; phase: WorkItemPhase; note: string } | null {
  if (workItem.status === 'active' && workItem.phase === 'build') {
    return {
      status: 'active',
      phase: 'review',
      note: 'Execution succeeded; advanced work item into review.',
    }
  }
  return null
}

function transitionForFailure(workItem: WorkItemRecord, reason: string): { status: WorkItemRecord['status']; phase?: WorkItemPhase; note: string } | null {
  if (workItem.status === 'blocked') return null
  return {
    status: 'blocked',
    phase: workItem.phase,
    note: reason ? `Execution failed: ${reason}` : 'Execution failed; work item is now blocked.',
  }
}

export async function syncWorkItemExecutionState(workItemId: string): Promise<WorkItemExecutionSyncResult> {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')

  const project = getProject(workItem.projectId)
  if (!project) throw new Error('Project not found')

  const job = await resolveJobForWorkItem(workItem)
  const state = deriveExecutionState(job)
  const missionFields = applyMissionFields(workItem, job, state)
  let updated = updateWorkItem(workItem.id, missionFields)
  if (!updated) throw new Error('Failed to persist mission sync state')

  let transitionApplied: WorkItemExecutionSyncResult['execution']['transitionApplied'] = null

  if (state === 'succeeded') {
    const transition = transitionForSuccess(updated)
    if (transition) {
      updated = updateWorkItem(updated.id, {
        status: transition.status,
        phase: transition.phase,
        ...missionFields,
      })
      if (!updated) throw new Error('Failed to update work item after success transition')
      updated = appendWorkItemHistoryEntry(updated.id, {
        action: 'status-change',
        status: transition.status,
        phase: transition.phase,
        note: transition.note,
        missionId: updated.missionId,
        sessionKey: updated.sessionKeys.at(-1),
        profile: updated.assignedProfile,
      })
      if (!updated) throw new Error('Failed to append success history entry')
      transitionApplied = 'build->review'
    }
  } else if (state === 'failed') {
    const transition = transitionForFailure(updated, readOptionalString(job?.last_error))
    if (transition) {
      updated = updateWorkItem(updated.id, {
        status: transition.status,
        phase: transition.phase,
        ...missionFields,
      })
      if (!updated) throw new Error('Failed to update work item after failure transition')
      updated = appendWorkItemHistoryEntry(updated.id, {
        action: 'status-change',
        status: transition.status,
        phase: transition.phase,
        note: transition.note,
        missionId: updated.missionId,
        sessionKey: updated.sessionKeys.at(-1),
        profile: updated.assignedProfile,
      })
      if (!updated) throw new Error('Failed to append failure history entry')
      transitionApplied = 'active->blocked'
    }
  }

  return {
    workItem: updated,
    project,
    execution: {
      state,
      job,
      transitionApplied,
    },
  }
}
