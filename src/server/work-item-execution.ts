import { getProject } from './projects-store'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem,
} from './work-items-store'
import {
  requestWorkItemReviewApproval,
  resolveWorkItemApprovalDecision,
} from './work-item-approvals'
import {
  getHermesJobById,
  getHermesJobRuns,
  listHermesJobs,
} from './hermes-jobs'
import { buildMissionLink } from './conductor-launch'
import { launchPlannerReview } from './work-item-launch'
import { getExecutionRun, upsertExecutionRun } from './execution-runs-store'
import { buildExecutionTraceHref } from './work-item-run-timeline'
import {
  getLatestHermesJobOutput,
  parseBuilderEvidenceOutput,
} from './hermes-job-output'
import {
  evaluateReviewQualityGate,
  parsePlannerReviewDecision,
} from './work-item-review-decision'
import type { ExecutionRunRecord, ExecutionRunState } from './execution-runs-store'
import type {
  BuilderStructuredEvidence,
  HermesJobOutputSnapshot,
} from './hermes-job-output'
import type {
  WorkItemMissionState,
  WorkItemPhase,
  WorkItemRecord,
} from './work-items-store'
import type { ProjectRecord } from './projects-store'
import type { HermesJobInfo } from './hermes-jobs'
import type { CronRun } from '../components/cron-manager/cron-types'
import type {
  ReviewDecisionParseResult,
  ReviewQualityGateResult,
} from './work-item-review-decision'

export type SyncedExecutionState =
  | 'scheduled'
  | 'running'
  | 'stale'
  | 'succeeded'
  | 'failed'
  | 'unknown'

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

function extractRunOutputText(run: CronRun | null): string {
  const output = (run as (CronRun & { output?: unknown }) | null)?.output
  if (typeof output === 'string') return output
  const outputRecord = asRecord(output)
  if (!outputRecord) return ''
  return Object.values(outputRecord)
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    )
    .join('\n')
}

function isStaleHeartbeat(
  job: HermesJobInfo | null,
  latestRun: CronRun | null,
): boolean {
  if (!job) return false
  const observedAt =
    readOptionalString(latestRun?.finishedAt) ||
    readOptionalString(latestRun?.startedAt) ||
    readOptionalString(job.last_run_at)
  if (!observedAt) return false
  const observedMs = Date.parse(observedAt)
  if (!Number.isFinite(observedMs)) return false
  return Date.now() - observedMs > 30 * 60 * 1000
}

function evaluateBuilderEvidence(params: {
  project: ProjectRecord
  workItem: WorkItemRecord
  state: SyncedExecutionState
  latestRun: CronRun | null
  fallbackOutputText?: string
}): {
  state: SyncedExecutionState
  evidence?: BuilderStructuredEvidence
  error?: string
} {
  if (!params.project.autonomyLanePolicy.enabled) return { state: params.state }
  if (params.workItem.phase !== 'build') return { state: params.state }
  if (params.state !== 'succeeded' && params.state !== 'failed')
    return { state: params.state }

  const outputText =
    params.fallbackOutputText?.trim() || extractRunOutputText(params.latestRun)
  if (!outputText.trim()) {
    return params.state === 'succeeded'
      ? {
          state: 'failed',
          error: 'Builder completed without structured build evidence.',
        }
      : { state: params.state }
  }

  const parsed = parseBuilderEvidenceOutput(outputText)
  if (!parsed.ok) {
    return {
      state: 'failed',
      error:
        'error' in parsed
          ? parsed.error
          : 'Builder evidence failed validation.',
    }
  }
  if (parsed.evidence.workItemId !== params.workItem.id) {
    return {
      state: 'failed',
      error: 'Builder evidence workItemId did not match this work item.',
    }
  }
  if (parsed.evidence.status === 'failed') {
    return {
      state: 'failed',
      evidence: parsed.evidence,
      error: parsed.evidence.testSummary,
    }
  }
  return { state: 'succeeded', evidence: parsed.evidence }
}

function deriveExecutionState(job: HermesJobInfo | null): SyncedExecutionState {
  if (!job) return 'unknown'
  if (job.last_status === 'ok') return 'succeeded'
  if (job.last_status === 'error') return 'failed'
  if (job.state === 'running' || job.state === 'active') return 'running'
  if (
    job.state === 'scheduled' ||
    job.state === 'queued' ||
    job.state === 'pending'
  )
    return 'scheduled'
  return 'unknown'
}

function deriveRunState(
  jobState: SyncedExecutionState,
  run: CronRun | null,
): ExecutionRunState {
  if (jobState === 'stale') return 'stale'
  if (!run) return jobState
  const status = readOptionalString(run.status)
  if (status === 'success' || status === 'ok') return 'succeeded'
  if (status === 'error' || status === 'failed') return 'failed'
  if (status === 'running') return 'running'
  if (status === 'queued' || status === 'pending' || status === 'scheduled')
    return 'scheduled'
  return jobState
}

function executionRunStateToSynced(state: ExecutionRunState): SyncedExecutionState {
  if (state === 'queued') return 'scheduled'
  return state
}

function executionRunStateToReviewState(
  state: ExecutionRunState,
): WorkItemRecord['reviewState'] {
  if (state === 'queued') return 'scheduled'
  if (state === 'stale') return 'running'
  return state
}

function extractExecutionRunOutputText(run: ExecutionRunRecord | null): string {
  if (!run) return ''
  return [run.finalResponse, run.latestOutputText, run.error, run.summary]
    .map((value) => readOptionalString(value))
    .filter(Boolean)
    .join('\n\n')
}

function isReviewStateReady(state: SyncedExecutionState): boolean {
  return state === 'succeeded' || state === 'failed'
}

function resolveImmediateMissionExecutionRun(
  workItem: WorkItemRecord,
): ExecutionRunRecord | null {
  const missionId = readOptionalString(workItem.missionId)
  const missionJobId = readOptionalString(
    (workItem as WorkItemRecord & { missionJobId?: string }).missionJobId,
  )
  const candidates = Array.from(new Set([missionId, missionJobId].filter(Boolean)))
  for (const candidate of candidates) {
    const run = getExecutionRun(candidate)
    if (run && run.engine === 'hermes-session') return run
  }
  return null
}

function executionRunStateToMissionState(
  state: ExecutionRunState,
): WorkItemMissionState {
  if (state === 'queued') return 'scheduled'
  if (state === 'stale') return 'running'
  return state
}

function applyImmediateMissionFields(
  workItem: WorkItemRecord,
  run: ExecutionRunRecord,
) {
  const missionLink = buildExecutionTraceHref({ executionRunId: run.id })
  return {
    missionId: run.id,
    missionJobId: undefined,
    missionJobName: undefined,
    missionSessionKeyPrefix: run.sessionKeyPrefix,
    missionLink: missionLink ?? workItem.missionLink,
    missionState: executionRunStateToMissionState(run.state),
    missionLastRunAt: run.lastObservedAt,
    missionLastError: run.state === 'failed' ? run.error : undefined,
  }
}

function recordExecutionRun(params: {
  workItem: WorkItemRecord
  project: ProjectRecord
  role: 'mission' | 'review'
  state: SyncedExecutionState
  job: HermesJobInfo
  run: CronRun | null
  sessionKeyPrefix?: string
  evidence?: {
    branchName?: string
    prUrl?: string
    artifactPaths?: Array<string>
  }
  outputText?: string
}): void {
  const run = params.run
  const outputText =
    params.outputText?.trim() || extractRunOutputText(run).trim()
  upsertExecutionRun({
    workItemId: params.workItem.id,
    projectId: params.project.id,
    role: params.role,
    phase: params.role === 'review' ? 'review' : params.workItem.phase,
    engine: 'cron-legacy',
    jobId: params.job.id,
    jobName: params.job.name,
    runId: readOptionalString(run?.id),
    state: deriveRunState(params.state, run),
    sessionKey: readOptionalString(run?.chatSessionKey),
    sessionKeyPrefix:
      params.sessionKeyPrefix ??
      (params.job.id ? `cron_${params.job.id}_` : undefined),
    startedAt: readOptionalString(run?.startedAt),
    finishedAt: readOptionalString(run?.finishedAt),
    lastRunAt: readOptionalString(params.job.last_run_at),
    error:
      params.state === 'failed'
        ? readOptionalString(params.job.last_error) ||
          readOptionalString(
            (run as (CronRun & { error?: unknown }) | null)?.error,
          )
        : undefined,
    summary: outputText ? 'Imported legacy scheduled-job evidence.' : undefined,
    latestOutputText: outputText || undefined,
    finalResponse:
      outputText && (params.state === 'succeeded' || params.state === 'failed')
        ? outputText
        : undefined,
    branchName: params.evidence?.branchName,
    prUrl: params.evidence?.prUrl,
    artifactPaths: params.evidence?.artifactPaths,
  })
}

async function resolveJobForWorkItem(
  workItem: WorkItemRecord,
): Promise<HermesJobInfo | null> {
  const missionJobId = readOptionalString(
    (workItem as WorkItemRecord & { missionJobId?: string }).missionJobId,
  )
  const missionJobName = readOptionalString(
    (workItem as WorkItemRecord & { missionJobName?: string }).missionJobName,
  )
  const missionId = readOptionalString(workItem.missionId)
  const candidateIds = Array.from(
    new Set([missionJobId, missionId].filter(Boolean)),
  )

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

  const candidateNames = Array.from(
    new Set([missionJobName, missionId].filter(Boolean)),
  )
  return (
    jobs.find((job) => candidateNames.includes(readOptionalString(job.name))) ??
    jobs.find((job) => candidateIds.includes(readOptionalString(job.id))) ??
    null
  )
}

function localOutputJobForWorkItem(
  workItem: WorkItemRecord,
  output: HermesJobOutputSnapshot | null,
): HermesJobInfo | null {
  const jobId =
    readOptionalString(
      (workItem as WorkItemRecord & { missionJobId?: string }).missionJobId,
    ) || readOptionalString(workItem.missionId)
  if (!jobId || !output?.latestOutputText?.trim()) return null
  return {
    id: jobId,
    name:
      readOptionalString(
        (workItem as WorkItemRecord & { missionJobName?: string })
          .missionJobName,
      ) || jobId,
    state: 'scheduled',
    last_run_at: output.lastObservedAt,
    last_status: 'ok',
    last_error: null,
    next_run_at: null,
  }
}

function applyMissionFields(
  workItem: WorkItemRecord,
  job: HermesJobInfo | null,
  state: SyncedExecutionState,
) {
  const fallbackMissionId = readOptionalString(workItem.missionId)
  const fallbackMissionJobId = readOptionalString(
    (workItem as WorkItemRecord & { missionJobId?: string }).missionJobId,
  )
  const fallbackMissionJobName = readOptionalString(
    (workItem as WorkItemRecord & { missionJobName?: string }).missionJobName,
  )
  const fallbackSessionPrefix = readOptionalString(
    (workItem as WorkItemRecord & { missionSessionKeyPrefix?: string })
      .missionSessionKeyPrefix,
  )
  const resolvedJobId = job?.id || fallbackMissionJobId || fallbackMissionId
  const resolvedJobName =
    readOptionalString(job?.name) || fallbackMissionJobName || undefined
  const lastError = readOptionalString(job?.last_error)
  const missionSessionKeyPrefix =
    fallbackSessionPrefix ||
    (resolvedJobId ? `cron_${resolvedJobId}_` : undefined)
  return {
    missionId: resolvedJobId,
    missionJobId: resolvedJobId,
    missionJobName: resolvedJobName,
    missionSessionKeyPrefix,
    missionLink: resolvedJobId
      ? buildMissionLink(resolvedJobId)
      : workItem.missionLink,
    missionState: (state === 'unknown'
      ? 'unknown'
      : state === 'stale'
        ? 'running'
        : state) as WorkItemMissionState,
    missionLastRunAt: job?.last_run_at ?? workItem.missionLastRunAt,
    missionLastError:
      state === 'failed'
        ? (asOptionalString(lastError) ?? workItem.missionLastError)
        : undefined,
  }
}

function transitionForSuccess(workItem: WorkItemRecord): {
  status: WorkItemRecord['status']
  phase: WorkItemPhase
  note: string
} | null {
  if (
    (workItem.status === 'active' || workItem.status === 'blocked') &&
    workItem.phase === 'build'
  ) {
    return {
      status: 'active',
      phase: 'review',
      note:
        workItem.status === 'blocked'
          ? 'Recovered valid Builder evidence; advanced work item into review.'
          : 'Execution succeeded; advanced work item into review.',
    }
  }
  return null
}

function transitionForFailure(
  workItem: WorkItemRecord,
  reason: string,
): {
  status: WorkItemRecord['status']
  phase?: WorkItemPhase
  note: string
} | null {
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

export async function syncWorkItemExecutionState(
  workItemId: string,
): Promise<WorkItemExecutionSyncResult> {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')

  const project = getProject(workItem.projectId)
  if (!project) throw new Error('Project not found')

  const immediateMissionRun = resolveImmediateMissionExecutionRun(workItem)
  let job: HermesJobInfo | null = null
  if (!immediateMissionRun) {
    try {
      job = await resolveJobForWorkItem(workItem)
    } catch {
      job = null
    }
  }
  let localOutput: HermesJobOutputSnapshot | null = null
  if (!job && !immediateMissionRun) {
    const fallbackJobId =
      readOptionalString(
        (workItem as WorkItemRecord & { missionJobId?: string }).missionJobId,
      ) || readOptionalString(workItem.missionId)
    if (fallbackJobId) {
      localOutput = await getLatestHermesJobOutput(fallbackJobId).catch(
        () => null,
      )
      job = localOutputJobForWorkItem(workItem, localOutput)
    }
  }
  const immediateOutputText = extractExecutionRunOutputText(immediateMissionRun)
  let state = immediateMissionRun
    ? executionRunStateToSynced(immediateMissionRun.state)
    : deriveExecutionState(job)
  let missionFields = immediateMissionRun
    ? applyImmediateMissionFields(workItem, immediateMissionRun)
    : applyMissionFields(workItem, job, state)
  let updated = updateWorkItem(workItem.id, missionFields)
  if (!updated) throw new Error('Failed to persist mission sync state')

  const resolvedJobId = readOptionalString(
    (missionFields as { missionJobId?: string }).missionJobId,
  )
  const jobRuns = resolvedJobId
    ? await getHermesJobRuns(resolvedJobId).catch(() => [])
    : []
  const latestRun = jobRuns.length > 0 ? jobRuns[0] : null
  const latestSessionKey =
    immediateMissionRun?.sessionKey ??
    latestRun?.chatSessionKey ??
    jobRuns.find(
      (run) =>
        typeof run.chatSessionKey === 'string' &&
        run.chatSessionKey.trim().length > 0,
    )?.chatSessionKey ??
    null
  const runEvidence = extractRunEvidence(latestRun)
  const builderEvidence = evaluateBuilderEvidence({
    project,
    workItem: updated,
    state,
    latestRun,
    fallbackOutputText: immediateOutputText || localOutput?.latestOutputText,
  })
  if (builderEvidence.state !== state) {
    state = builderEvidence.state
    missionFields = immediateMissionRun
      ? {
          ...applyImmediateMissionFields(updated, immediateMissionRun),
          missionState: executionRunStateToMissionState(state),
          missionLastError:
            state === 'failed'
              ? builderEvidence.error ?? immediateMissionRun.error
              : undefined,
        }
      : applyMissionFields(updated, job, state)
    updated = updateWorkItem(updated.id, missionFields)
    if (!updated)
      throw new Error('Failed to persist Builder evidence sync state')
  } else if (
    state === 'running' &&
    !immediateMissionRun &&
    project.autonomyLanePolicy.enabled &&
    isStaleHeartbeat(job, latestRun)
  ) {
    state = 'stale'
    missionFields = applyMissionFields(updated, job, state)
    updated = updateWorkItem(updated.id, missionFields)
    if (!updated)
      throw new Error('Failed to persist stale Builder heartbeat state')
  }
  const structuredEvidence = builderEvidence.evidence
  const evidenceForRun = {
    branchName: structuredEvidence?.branchName ?? runEvidence.branchName,
    prUrl: runEvidence.prUrl,
    artifactPaths: structuredEvidence?.artifactPaths.length
      ? structuredEvidence.artifactPaths
      : runEvidence.artifactPaths,
  }

  if (job) {
    recordExecutionRun({
      workItem,
      project,
      role: 'mission',
      state,
      job,
      run: latestRun,
      sessionKeyPrefix: missionFields.missionSessionKeyPrefix,
      evidence: evidenceForRun,
      outputText: localOutput?.latestOutputText,
    })
  }

  if (latestSessionKey && !updated.sessionKeys.includes(latestSessionKey)) {
    updated = updateWorkItem(updated.id, {
      sessionKeys: Array.from(
        new Set([...updated.sessionKeys, latestSessionKey]),
      ),
      ...missionFields,
    })
    if (!updated)
      throw new Error('Failed to persist latest execution session key')
  }

  if (
    evidenceForRun.branchName ||
    evidenceForRun.prUrl ||
    (evidenceForRun.artifactPaths && evidenceForRun.artifactPaths.length > 0)
  ) {
    updated = updateWorkItem(updated.id, {
      branchName: evidenceForRun.branchName ?? updated.branchName,
      prUrl: evidenceForRun.prUrl ?? updated.prUrl,
      artifactPaths:
        evidenceForRun.artifactPaths && evidenceForRun.artifactPaths.length > 0
          ? Array.from(
              new Set([
                ...updated.artifactPaths,
                ...evidenceForRun.artifactPaths,
              ]),
            )
          : updated.artifactPaths,
      ...missionFields,
    })
    if (!updated) throw new Error('Failed to persist Hermes execution evidence')
  }

  let transitionApplied: WorkItemExecutionSyncResult['execution']['transitionApplied'] =
    null

  if (state === 'succeeded') {
    const transition = transitionForSuccess(updated)
    if (transition) {
      updated = updateWorkItem(updated.id, {
        status: transition.status,
        phase: transition.phase,
        blockedReason: undefined,
        laneState: project.autonomyLanePolicy.enabled
          ? 'reviewing'
          : updated.laneState,
        laneParkedAt: project.autonomyLanePolicy.enabled
          ? undefined
          : updated.laneParkedAt,
        laneBlockedReason: project.autonomyLanePolicy.enabled
          ? undefined
          : updated.laneBlockedReason,
        ...missionFields,
      })
      if (!updated)
        throw new Error('Failed to update work item after success transition')
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

      // Launch Planner-as-Reviewer mission for two-phase pipeline items
      if (updated.planFilePath) {
        const reviewProject = getProject(updated.projectId)
        const reviewWorkItem = updated
        if (reviewProject) {
          launchPlannerReview(reviewWorkItem, reviewProject).then((reviewLaunch) => {
            if (reviewLaunch) {
              updateWorkItem(reviewWorkItem.id, {
                reviewJobId: reviewLaunch.reviewJobId,
                reviewState: reviewLaunch.reviewState,
              })
              appendWorkItemHistoryEntry(reviewWorkItem.id, {
                action: 'status-change',
                status: 'active',
                phase: 'review',
                note: `Planner review mission launched (${reviewLaunch.reviewJobId}). Reviewing build output against plan at ${reviewWorkItem.planFilePath}.`,
                missionId: reviewLaunch.reviewJobId,
                sessionKey: reviewWorkItem.sessionKeys.at(-1),
                profile: reviewWorkItem.assignedProfile,
              })
            }
          })
        }
      }
    }
  } else if (state === 'failed') {
    const transition = transitionForFailure(
      updated,
      builderEvidence.error ?? readOptionalString(job?.last_error),
    )
    if (transition) {
      updated = updateWorkItem(updated.id, {
        status: transition.status,
        phase: transition.phase,
        blockedReason: 'mission_failed',
        laneState: project.autonomyLanePolicy.enabled
          ? 'blocked'
          : updated.laneState,
        laneParkedAt: project.autonomyLanePolicy.enabled
          ? new Date().toISOString()
          : updated.laneParkedAt,
        laneBlockedReason: project.autonomyLanePolicy.enabled
          ? builderEvidence.error ||
            readOptionalString(job?.last_error) ||
            'Builder failed.'
          : updated.laneBlockedReason,
        ...missionFields,
      })
      if (!updated)
        throw new Error('Failed to update work item after failure transition')
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

  // Auto-resolve Planner review approval using structured decision parsing and quality gates
  if (
    updated.status === 'active' &&
    updated.phase === 'review' &&
    updated.reviewJobId &&
    !updated.reviewDecision
  ) {
    try {
      const { listWorkItemApprovals } = await import('./work-item-approvals')
      const pendingApprovals = listWorkItemApprovals(updated.id)
      const pendingReview = pendingApprovals.find(
        (a) => a.phase === 'review' && a.status === 'pending',
      )
      if (pendingReview) {
        const reviewExecutionRun = getExecutionRun(updated.reviewJobId)
        let reviewJob: HermesJobInfo | null = null
        let reviewState: SyncedExecutionState = 'unknown'
        let reviewOutputText = ''
        let isImmediateReviewExecution = false

        if (reviewExecutionRun) {
          isImmediateReviewExecution = true
          reviewState = executionRunStateToSynced(reviewExecutionRun.state)
          reviewOutputText = extractExecutionRunOutputText(reviewExecutionRun)
        } else {
          try {
            reviewJob = await getHermesJobById(updated.reviewJobId)
          } catch {
            reviewJob = null
          }
          if (reviewJob) {
            reviewState = deriveExecutionState(reviewJob)

            // Extract review output text: latest run output, job last_error, or empty
            const reviewJobRuns = await getHermesJobRuns(updated.reviewJobId).catch(
              () => [],
            )
            const latestReviewRun = reviewJobRuns.length > 0 ? reviewJobRuns[0] : null
            recordExecutionRun({
              workItem: updated,
              project,
              role: 'review',
              state: reviewState,
              job: reviewJob,
              run: latestReviewRun,
              sessionKeyPrefix: `cron_${reviewJob.id}_`,
            })
            const runOutputStr = extractRunOutputText(latestReviewRun)
            const jobErrorStr = readOptionalString(reviewJob.last_error) || ''
            reviewOutputText = [runOutputStr, jobErrorStr]
              .filter(Boolean)
              .join('\n\n')
          }
        }

        if (reviewExecutionRun || reviewJob) {
          let parseResult: ReviewDecisionParseResult
          const outputText = reviewOutputText || `reviewState=${reviewState}`

          if (isReviewStateReady(reviewState)) {
            parseResult = parsePlannerReviewDecision(outputText)
          } else {
            parseResult = {
              ok: false,
              error: `Review ${
                isImmediateReviewExecution ? 'execution' : 'job'
              } state is ${reviewState} — not ready for evaluation.`,
              source: 'missing',
              warnings: [],
            }
          }

          // Persist parser/gate fields to work item
          const workItemUpdates: Record<string, unknown> = {}

          if (parseResult.ok) {
            workItemUpdates.reviewDecisionSummary = parseResult.parsed.summary
            workItemUpdates.reviewDecisionConfidence =
              parseResult.parsed.confidence
            workItemUpdates.reviewDecisionSource = parseResult.source
          } else {
            workItemUpdates.reviewParserError =
              (parseResult as { ok: false; error: string }).error ||
              'Unknown parse error'
          }

          // Evaluate quality gates
          const projectForGate = getProject(updated.projectId)
          const gateResult = evaluateReviewQualityGate({
            workItem: updated,
            project: projectForGate ?? {
              reviewAutoApproval: { enabled: false, maxPriority: 'low' },
            },
            parseResult,
          })

          workItemUpdates.reviewQualityGateStatus = gateResult.status
          workItemUpdates.reviewQualityGateReasons = gateResult.reasons
          workItemUpdates.reviewMissingEvidence = gateResult.missingEvidence

          if (!isReviewStateReady(reviewState)) {
            updated =
              updateWorkItem(updated.id, {
                ...workItemUpdates,
                reviewState: reviewExecutionRun
                  ? executionRunStateToReviewState(reviewExecutionRun.state)
                  : reviewState === 'scheduled'
                    ? ('scheduled' as const)
                    : reviewState === 'running'
                      ? ('running' as const)
                      : ('unknown' as const),
              }) ?? updated
          } else if (gateResult.autoResolvable && gateResult.status === 'fail') {
            // changes_requested — auto-resolve back to build
            const errorNote =
              parseResult.ok && parseResult.parsed.summary
                ? parseResult.parsed.summary
                : 'Planner review requested changes — no structured details available.'

            // Dedup: skip if latest history already contains this message
            const lastHistoryNote = updated.history.at(-1)?.note ?? ''
            if (!lastHistoryNote.includes('Planner review requested changes')) {
              resolveWorkItemApprovalDecision(pendingReview.id, {
                decision: 'changes_requested',
                resolvedBy: 'planner',
                notes: `Planner review found issues: ${errorNote}. Returning work item to build for fixes.`,
              })
              updated =
                updateWorkItem(updated.id, {
                  ...workItemUpdates,
                  reviewState: 'failed' as const,
                  reviewDecision: 'changes_requested' as const,
                }) ?? updated
              updated =
                appendWorkItemHistoryEntry(updated.id, {
                  action: 'status-change',
                  status: 'active',
                  phase: 'build',
                  note: `Planner review requested changes: ${errorNote}. Returned to build for fixes.`,
                  missionId: updated.missionId,
                  sessionKey: updated.sessionKeys.at(-1),
                  profile: updated.assignedProfile,
                }) ?? updated
            }
          } else if (
            gateResult.autoResolvable &&
            gateResult.status === 'pass'
          ) {
            // Approved with passing gates — auto-resolve and advance to deploy
            const lastHistoryNote = updated.history.at(-1)?.note ?? ''
            if (!lastHistoryNote.includes('Planner review passed')) {
              resolveWorkItemApprovalDecision(pendingReview.id, {
                decision: 'approved',
                resolvedBy: 'planner',
                notes: `Planner review approved with structured decision. Gate status: pass.`,
              })
              updated =
                updateWorkItem(updated.id, {
                  ...workItemUpdates,
                  reviewState: 'succeeded' as const,
                  reviewDecision: 'approved' as const,
                }) ?? updated
              updated =
                appendWorkItemHistoryEntry(updated.id, {
                  action: 'status-change',
                  status: 'active',
                  phase: 'deploy',
                  note: 'Planner review passed all quality gates; automatically advanced work item to deploy.',
                  missionId: updated.missionId,
                  sessionKey: updated.sessionKeys.at(-1),
                  profile: updated.assignedProfile,
                }) ?? updated
            }
          } else {
            // Completed but not auto-resolvable — set manual_review, keep approval pending
            workItemUpdates.reviewDecision = 'manual_review' as const
            workItemUpdates.reviewState =
              reviewState === 'failed'
                ? ('failed' as const)
                : ('succeeded' as const)
            if (parseResult.ok) {
              workItemUpdates.reviewDecisionSummary = parseResult.parsed.summary
            }
            updated = updateWorkItem(updated.id, workItemUpdates) ?? updated

            const lastHistoryNote = updated.history.at(-1)?.note ?? ''
            if (!lastHistoryNote.includes('Manual review')) {
              updated =
                appendWorkItemHistoryEntry(updated.id, {
                  action: 'note',
                  status: 'active',
                  phase: 'review',
                  note:
                    gateResult.status === 'manual_review'
                      ? `Manual review required: ${gateResult.reasons.join('; ')}`
                      : `Manual review required — review completed but could not be auto-resolved with quality gates.`,
                  missionId: updated.missionId,
                  sessionKey: updated.sessionKeys.at(-1),
                  profile: updated.assignedProfile,
                }) ?? updated
            }
          }
        }
      }
    } catch {
      // Non-fatal — skip auto-resolve on this sync cycle
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
