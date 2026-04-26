import { listExecutionRuns, type ExecutionRunRecord } from './execution-runs-store'
import { syncWorkItemExecutionState } from './work-item-execution'
import {
  getWorkItem,
  listWorkItems,
  type WorkItemMissionState,
  type WorkItemRecord,
  type WorkItemReviewState,
} from './work-items-store'

export type SupervisorFindingKind =
  | 'mission_failed'
  | 'review_failed'
  | 'mission_stale'
  | 'review_stale'
  | 'job_missing'
  | 'sync_error'
export type SupervisorFindingSeverity = 'info' | 'warning' | 'critical'
export type SupervisorFinding = {
  id: string
  workItemId: string
  projectId: string
  kind: SupervisorFindingKind
  severity: SupervisorFindingSeverity
  message: string
  jobId?: string
  role?: 'mission' | 'review'
  observedAt: string
}

export type SupervisorThresholds = {
  scheduledMs: number
  runningMs: number
  reviewRunningMs: number
}

export type ReconcileWorkItemExecutionResult = {
  checked: number
  findings: Array<SupervisorFinding>
}

export const DEFAULT_SUPERVISOR_THRESHOLDS: SupervisorThresholds = {
  scheduledMs: 30 * 60 * 1000,
  runningMs: 4 * 60 * 60 * 1000,
  reviewRunningMs: 2 * 60 * 60 * 1000,
}

const ACTIVE_STATES = new Set(['scheduled', 'running', 'failed'])

function isTrackedMissionState(state: WorkItemMissionState | undefined): boolean {
  return Boolean(state && ACTIVE_STATES.has(state))
}

function isTrackedReviewState(state: WorkItemReviewState | undefined): boolean {
  return Boolean(state && ACTIVE_STATES.has(state))
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function roleJobId(workItem: WorkItemRecord, role: 'mission' | 'review'): string | undefined {
  if (role === 'review') return optionalString(workItem.reviewJobId)
  return optionalString(workItem.missionJobId) ?? optionalString(workItem.missionId)
}

function findingId(params: {
  workItemId: string
  kind: SupervisorFindingKind
  role?: 'mission' | 'review'
  jobId?: string
  observedAt: string
}): string {
  return [params.workItemId, params.role ?? 'work-item', params.kind, params.jobId ?? 'no-job', params.observedAt].join(':')
}

function buildFinding(params: {
  workItem: WorkItemRecord
  kind: SupervisorFindingKind
  severity: SupervisorFindingSeverity
  message: string
  observedAt: string
  jobId?: string
  role?: 'mission' | 'review'
}): SupervisorFinding {
  return {
    id: findingId({
      workItemId: params.workItem.id,
      kind: params.kind,
      role: params.role,
      jobId: params.jobId,
      observedAt: params.observedAt,
    }),
    workItemId: params.workItem.id,
    projectId: params.workItem.projectId,
    kind: params.kind,
    severity: params.severity,
    message: params.message,
    jobId: params.jobId,
    role: params.role,
    observedAt: params.observedAt,
  }
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function latestRunForRole(
  runs: Array<ExecutionRunRecord>,
  role: 'mission' | 'review',
): ExecutionRunRecord | null {
  const matching = runs.filter((run) => run.role === role)
  if (matching.length === 0) return null
  return matching.sort((a, b) => {
    const aTime = parseTime(a.lastObservedAt) ?? parseTime(a.updatedAt) ?? parseTime(a.createdAt) ?? 0
    const bTime = parseTime(b.lastObservedAt) ?? parseTime(b.updatedAt) ?? parseTime(b.createdAt) ?? 0
    return bTime - aTime
  })[0] ?? null
}

function getRunsForDetection(params: {
  workItem: WorkItemRecord
  runs?: Array<ExecutionRunRecord>
}): Array<ExecutionRunRecord> {
  if (params.runs && params.runs.length > 0) return params.runs
  return listExecutionRuns({ workItemId: params.workItem.id })
}

export function isWorkItemExecutionCandidate(workItem: WorkItemRecord): boolean {
  return (
    workItem.status === 'active' ||
    isTrackedMissionState(workItem.missionState) ||
    isTrackedReviewState(workItem.reviewState)
  )
}

function detectRoleFindings(params: {
  workItem: WorkItemRecord
  runs: Array<ExecutionRunRecord>
  role: 'mission' | 'review'
  state: WorkItemMissionState | WorkItemReviewState | undefined
  now: Date
  thresholds: SupervisorThresholds
}): Array<SupervisorFinding> {
  const { workItem, role, state, now, thresholds } = params
  if (!state || !ACTIVE_STATES.has(state)) return []

  const observedAt = now.toISOString()
  const jobId = roleJobId(workItem, role)
  const run = latestRunForRole(params.runs, role)
  const runJobId = optionalString(run?.jobId)
  const effectiveJobId = jobId ?? runJobId
  const findings: Array<SupervisorFinding> = []

  if (state === 'failed') {
    const error = role === 'mission' ? optionalString(workItem.missionLastError) : optionalString(run?.error)
    findings.push(
      buildFinding({
        workItem,
        kind: role === 'mission' ? 'mission_failed' : 'review_failed',
        severity: 'critical',
        role,
        jobId: effectiveJobId,
        observedAt,
        message: `${role === 'mission' ? 'Mission' : 'Review'} execution failed${error ? `: ${error}` : '.'}`,
      }),
    )
    return findings
  }

  if (!effectiveJobId) {
    findings.push(
      buildFinding({
        workItem,
        kind: 'job_missing',
        severity: 'warning',
        role,
        observedAt,
        message: `${role === 'mission' ? 'Mission' : 'Review'} execution is ${state}, but no job id is recorded.`,
      }),
    )
    return findings
  }

  const lastObserved =
    parseTime(run?.lastObservedAt) ??
    parseTime(run?.lastRunAt) ??
    parseTime(role === 'mission' ? workItem.missionLastRunAt : undefined) ??
    null

  if (lastObserved === null) return findings

  const ageMs = now.getTime() - lastObserved
  const thresholdMs =
    state === 'scheduled'
      ? thresholds.scheduledMs
      : role === 'review'
        ? thresholds.reviewRunningMs
        : thresholds.runningMs

  if (ageMs > thresholdMs) {
    findings.push(
      buildFinding({
        workItem,
        kind: role === 'mission' ? 'mission_stale' : 'review_stale',
        severity: 'warning',
        role,
        jobId: effectiveJobId,
        observedAt,
        message: `${role === 'mission' ? 'Mission' : 'Review'} execution has been ${state} for ${Math.floor(ageMs / 60000)} minutes.`,
      }),
    )
  }

  return findings
}

export function detectStaleExecution(params: {
  workItem: WorkItemRecord
  runs?: Array<ExecutionRunRecord>
  now?: Date
  thresholds?: Partial<SupervisorThresholds>
}): Array<SupervisorFinding> {
  const workItem = params.workItem
  if (!isWorkItemExecutionCandidate(workItem)) return []

  const thresholds = { ...DEFAULT_SUPERVISOR_THRESHOLDS, ...params.thresholds }
  const runs = getRunsForDetection({ workItem, runs: params.runs })
  const now = params.now ?? new Date()

  return [
    ...detectRoleFindings({
      workItem,
      runs,
      role: 'mission',
      state: workItem.missionState,
      now,
      thresholds,
    }),
    ...detectRoleFindings({
      workItem,
      runs,
      role: 'review',
      state: workItem.reviewState,
      now,
      thresholds,
    }),
  ]
}

export async function reconcileWorkItemExecution(workItemId: string): Promise<ReconcileWorkItemExecutionResult> {
  const beforeSync = getWorkItem(workItemId)
  if (!beforeSync) return { checked: 0, findings: [] }

  try {
    await syncWorkItemExecutionState(workItemId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error'
    return {
      checked: 1,
      findings: [
        buildFinding({
          workItem: beforeSync,
          kind: 'sync_error',
          severity: 'warning',
          role: beforeSync.reviewState ? 'review' : 'mission',
          jobId: roleJobId(beforeSync, beforeSync.reviewState ? 'review' : 'mission'),
          observedAt: new Date().toISOString(),
          message: `Execution sync failed: ${message}`,
        }),
      ],
    }
  }

  const workItem = getWorkItem(workItemId) ?? beforeSync
  const findings = detectStaleExecution({ workItem, runs: listExecutionRuns({ workItemId }) })
  return { checked: 1, findings }
}

export async function reconcileAllWorkItemExecutions(): Promise<ReconcileWorkItemExecutionResult> {
  const candidates = listWorkItems().filter(isWorkItemExecutionCandidate)
  const allFindings: Array<SupervisorFinding> = []

  for (const workItem of candidates) {
    const result = await reconcileWorkItemExecution(workItem.id)
    allFindings.push(...result.findings)
  }

  return { checked: candidates.length, findings: allFindings }
}
