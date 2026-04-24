import { getProject, type ProjectRecord } from './projects-store'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem,
  type WorkItemMissionState,
  type WorkItemPhase,
  type WorkItemRecord,
} from './work-items-store'
import { type CronRun } from '../components/cron-manager/cron-types'
import { requestWorkItemReviewApproval } from './work-item-approvals'
import { getHermesJobById, getHermesJobRuns, listHermesJobs, type HermesJobInfo } from './hermes-jobs'
import { buildMissionLink } from './conductor-launch'

export type SyncedExecutionState = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'

export type WorkItemExecutionSyncResult = {
  workItem: WorkItemRecord
  project: ProjectRecord
  execution: {
    state: SyncedExecutionState
    job: HermesJobInfo | null
    jobRuns: Array<CronRun>
    latestRun: CronRun | null
    latestSessionKey: string | null
    transitionApplied: null | 'build->review' | 'active->blocked'
  }
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asOptionalString(value: string): string | undefined {
  return value.length > 0 ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readArrayOfStrings(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return value
    .flatMap((entry) => {
      if (typeof entry === 'string') return [entry.trim()]
      const record = asRecord(entry)
      if (!record) return []
      return [
        readOptionalString(record.path),
        readOptionalString(record.file),
        readOptionalString(record.outputPath),
        readOptionalString(record.url),
      ]
    })
    .filter(Boolean)
}

function extractRunEvidence(run: CronRun | null): {
  branchName?: string
  prUrl?: string
  artifactPaths?: Array<string>
} {
  const output = asRecord(run?.output)
  if (!output) return {}

  const artifactPaths = Array.from(
    new Set(
      [
        ...readArrayOfStrings(output.artifactPaths),
        ...readArrayOfStrings(output.artifacts),
        ...readArrayOfStrings(output.paths),
      ].filter(Boolean),
    ),
  )

  const branchName =
    readOptionalString(output.branchName) ||
    readOptionalString(output.branch) ||
    readOptionalString(output.gitBranch)
  const prUrl =
    readOptionalString(output.prUrl) ||
    readOptionalString(output.pullRequestUrl) ||
    readOptionalString(output.prURL)

  return {
    branchName: branchName || undefined,
    prUrl: prUrl || undefined,
    artifactPaths: artifactPaths.length > 0 ? artifactPaths : undefined,
  }
}

function deriveExecutionState(job: HermesJobInfo | null): SyncedExecutionState {
  if (!job) return 'unknown'
  if (job.last_status === 'ok') return 'succeeded'
  if (job.last_status === 'error') return 'failed'
  if (job.state === 'running' || job.state === 'active') return 'running'
  if (job.state === 'scheduled' || job.state === 'queued' || job.state === 'pending') return 'scheduled'
  return 'unknown'
}

async function resolveJobForWorkItem(workItem: WorkItemRecord): Promise<HermesJobInfo | null> {
  const missionJobId = readOptionalString((workItem as WorkItemRecord & { missionJobId?: string }).missionJobId)
  const missionJobName = readOptionalString((workItem as WorkItemRecord & { missionJobName?: string }).missionJobName)
  const missionId = readOptionalString(workItem.missionId)
  const candidateIds = Array.from(new Set([missionJobId, missionId].filter(Boolean)))

  for (const candidateId of candidateIds) {
    try {
      const direct = await getHermesJobById(candidateId)
      if (direct) return direct
    } catch {
      continue
    }
  }

  let jobs: Array<HermesJobInfo> = []
  try {
    jobs = await listHermesJobs()
  } catch {
    return null
  }

  const candidateNames = Array.from(new Set([missionJobName, missionId].filter(Boolean)))
  return (
    jobs.find((job) => candidateNames.includes(readOptionalString(job.name))) ??
    jobs.find((job) => candidateIds.includes(readOptionalString(job.id))) ??
    null
  )
}

function applyMissionFields(workItem: WorkItemRecord, job: HermesJobInfo | null, state: SyncedExecutionState) {
  const fallbackMissionId = readOptionalString(workItem.missionId)
  const fallbackMissionJobId = readOptionalString((workItem as WorkItemRecord & { missionJobId?: string }).missionJobId)
  const fallbackMissionJobName = readOptionalString((workItem as WorkItemRecord & { missionJobName?: string }).missionJobName)
  const fallbackSessionPrefix = readOptionalString((workItem as WorkItemRecord & { missionSessionKeyPrefix?: string }).missionSessionKeyPrefix)
  const resolvedJobId = job?.id ?? fallbackMissionJobId ?? fallbackMissionId ?? undefined
  const resolvedJobName = readOptionalString(job?.name) || fallbackMissionJobName || undefined
  const lastError = readOptionalString(job?.last_error)
  const missionSessionKeyPrefix = fallbackSessionPrefix || (resolvedJobId ? `cron_${resolvedJobId}_` : undefined)
  return {
    missionId: resolvedJobId,
    missionJobId: resolvedJobId,
    missionJobName: resolvedJobName,
    missionSessionKeyPrefix,
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
  const recoveryTail = ' Run Resume Build before relaunching the build mission.'
  return {
    status: 'blocked',
    phase: workItem.phase,
    note: reason
      ? `Execution failed: ${reason}.${recoveryTail}`
      : `Execution failed; work item is now blocked.${recoveryTail}`,
  }
}

export async function syncWorkItemExecutionState(workItemId: string): Promise<WorkItemExecutionSyncResult> {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')

  const project = getProject(workItem.projectId)
  if (!project) throw new Error('Project not found')

  let job: HermesJobInfo | null = null
  try {
    job = await resolveJobForWorkItem(workItem)
  } catch {
    job = null
  }
  const state = deriveExecutionState(job)
  const missionFields = applyMissionFields(workItem, job, state)
  let updated = updateWorkItem(workItem.id, missionFields)
  if (!updated) throw new Error('Failed to persist mission sync state')

  const resolvedJobId = readOptionalString((missionFields as { missionJobId?: string }).missionJobId)
  const jobRuns = resolvedJobId ? await getHermesJobRuns(resolvedJobId).catch(() => []) : []
  const latestRun = jobRuns[0] ?? null
  const latestSessionKey =
    latestRun?.chatSessionKey ??
    (jobRuns.find((run) => typeof run.chatSessionKey === 'string' && run.chatSessionKey.trim().length > 0)
      ?.chatSessionKey ??
      null)
  const runEvidence = extractRunEvidence(latestRun)

  if (latestSessionKey && !updated.sessionKeys.includes(latestSessionKey)) {
    updated = updateWorkItem(updated.id, {
      sessionKeys: Array.from(new Set([...updated.sessionKeys, latestSessionKey])),
      ...missionFields,
    })
    if (!updated) throw new Error('Failed to persist latest execution session key')
  }

  if (
    runEvidence.branchName ||
    runEvidence.prUrl ||
    (runEvidence.artifactPaths && runEvidence.artifactPaths.length > 0)
  ) {
    updated = updateWorkItem(updated.id, {
      branchName: runEvidence.branchName ?? updated.branchName,
      prUrl: runEvidence.prUrl ?? updated.prUrl,
      artifactPaths:
        runEvidence.artifactPaths && runEvidence.artifactPaths.length > 0
          ? Array.from(new Set([...updated.artifactPaths, ...runEvidence.artifactPaths]))
          : updated.artifactPaths,
      ...missionFields,
    })
    if (!updated) throw new Error('Failed to persist Hermes execution evidence')
  }

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
      requestWorkItemReviewApproval(updated.id, {
        requestedBy: 'system',
        notes: 'Execution succeeded; awaiting review approval.',
      })
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
      jobRuns,
      latestRun,
      latestSessionKey,
      transitionApplied,
    },
  }
}
