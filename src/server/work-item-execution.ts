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
import { requestWorkItemReviewApproval, resolveWorkItemApprovalDecision } from './work-item-approvals'
import { getHermesJobById, getHermesJobRuns, listHermesJobs, type HermesJobInfo } from './hermes-jobs'
import { buildMissionLink, launchConductorMission } from './conductor-launch'
import { launchPlannerReview } from './work-item-launch'
import {
  parsePlannerReviewDecision,
  evaluateReviewQualityGate,
  type ReviewDecisionParseResult,
  type ReviewQualityGateResult,
} from './work-item-review-decision'

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

      // Launch Planner-as-Reviewer mission for two-phase pipeline items
      if (updated.planFilePath) {
        const project = getProject(updated.projectId)
        if (project) {
          launchPlannerReview(updated, project).then((reviewLaunch) => {
            if (reviewLaunch) {
              updateWorkItem(updated.id, {
                reviewJobId: reviewLaunch.reviewJobId,
                reviewState: reviewLaunch.reviewState,
              })
              appendWorkItemHistoryEntry(updated.id, {
                action: 'status-change',
                status: 'active',
                phase: 'review',
                note: `Planner review mission launched (${reviewLaunch.reviewJobId}). Reviewing build output against plan at ${updated.planFilePath}.`,
                missionId: reviewLaunch.reviewJobId,
                sessionKey: updated.sessionKeys.at(-1),
                profile: updated.assignedProfile,
              })
            }
          })
        }
      }
    }
  } else if (state === 'failed') {
    const transition = transitionForFailure(updated, readOptionalString(job?.last_error))
    if (transition) {
      updated = updateWorkItem(updated.id, {
        status: transition.status,
        phase: transition.phase,
        blockedReason: 'mission_failed',
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
        let reviewJob: HermesJobInfo | null = null
        try {
          reviewJob = await getHermesJobById(updated.reviewJobId)
        } catch {
          reviewJob = null
        }
        if (reviewJob) {
          const reviewState = deriveExecutionState(reviewJob)
          let parseResult: ReviewDecisionParseResult
          let gateResult: ReviewQualityGateResult

          // Extract review output text: latest run output, job last_error, or empty
          const jobRuns = await getHermesJobRuns(updated.reviewJobId).catch(() => [])
          const latestRun = jobRuns[0] ?? null
          const runOutputStr =
            latestRun?.output && typeof latestRun.output === 'object'
              ? JSON.stringify(latestRun.output, null, 2)
              : typeof latestRun?.output === 'string'
                ? latestRun.output
                : ''
          const jobErrorStr = readOptionalString(reviewJob.last_error) || ''
          const combinedText = [runOutputStr, jobErrorStr].filter(Boolean).join('\n\n')
          const outputText = combinedText || `reviewState=${reviewState}`

          if (reviewState === 'succeeded' || reviewState === 'failed') {
            parseResult = parsePlannerReviewDecision(outputText)
          } else {
            parseResult = { ok: false, error: `Review job state is ${reviewState} — not ready for evaluation.`, source: 'missing', warnings: [] }
          }

          // Persist parser/gate fields to work item
          const workItemUpdates: Record<string, unknown> = {}

          if (parseResult.ok) {
            workItemUpdates.reviewDecisionSummary = parseResult.parsed.summary
            workItemUpdates.reviewDecisionConfidence = parseResult.parsed.confidence
            workItemUpdates.reviewDecisionSource = parseResult.source
          } else {
            workItemUpdates.reviewParserError = parseResult.error || 'Unknown parse error'
          }

          // Evaluate quality gates
          const projectForGate = getProject(updated.projectId)
          gateResult = evaluateReviewQualityGate({
            workItem: updated,
            project: projectForGate ?? { reviewAutoApproval: { enabled: false, maxPriority: 'low' } },
            parseResult,
          })

          workItemUpdates.reviewQualityGateStatus = gateResult.status
          workItemUpdates.reviewQualityGateReasons = gateResult.reasons
          workItemUpdates.reviewMissingEvidence = gateResult.missingEvidence

          if (gateResult.autoResolvable && gateResult.status === 'fail') {
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
              updated = updateWorkItem(updated.id, {
                ...workItemUpdates,
                reviewState: 'failed' as const,
                reviewDecision: 'changes_requested' as const,
              }) ?? updated
              appendWorkItemHistoryEntry(updated.id, {
                action: 'status-change',
                status: 'active',
                phase: 'build',
                note: `Planner review requested changes: ${errorNote}. Returned to build for fixes.`,
                missionId: updated.missionId,
                sessionKey: updated.sessionKeys.at(-1),
                profile: updated.assignedProfile,
              })
            }
          } else if (gateResult.autoResolvable && gateResult.status === 'pass') {
            // Approved with passing gates — auto-resolve and advance to deploy
            const lastHistoryNote = updated.history.at(-1)?.note ?? ''
            if (!lastHistoryNote.includes('Planner review passed')) {
              resolveWorkItemApprovalDecision(pendingReview.id, {
                decision: 'approved',
                resolvedBy: 'planner',
                notes: `Planner review approved with structured decision. Gate status: pass.`,
              })
              updated = updateWorkItem(updated.id, {
                ...workItemUpdates,
                reviewState: 'succeeded' as const,
                reviewDecision: 'approved' as const,
              }) ?? updated
              appendWorkItemHistoryEntry(updated.id, {
                action: 'status-change',
                status: 'active',
                phase: 'deploy',
                note: 'Planner review passed all quality gates; automatically advanced work item to deploy.',
                missionId: updated.missionId,
                sessionKey: updated.sessionKeys.at(-1),
                profile: updated.assignedProfile,
              })
            }
          } else {
            // Manual review needed — set reviewDecision=manual_review, keep approval pending
            workItemUpdates.reviewDecision = 'manual_review' as const
            workItemUpdates.reviewState = reviewState === 'failed' ? ('failed' as const) : ('succeeded' as const)
            if (parseResult.ok) {
              workItemUpdates.reviewDecisionSummary = parseResult.parsed.summary
            }
            updated = updateWorkItem(updated.id, workItemUpdates) ?? updated

            const lastHistoryNote = updated.history.at(-1)?.note ?? ''
            if (!lastHistoryNote.includes('Manual review')) {
              appendWorkItemHistoryEntry(updated.id, {
                action: 'note',
                status: 'active',
                phase: 'review',
                note: gateResult.status === 'manual_review'
                  ? `Manual review required: ${gateResult.reasons.join('; ')}`
                  : `Manual review required — review completed but could not be auto-resolved with quality gates.`,
                missionId: updated.missionId,
                sessionKey: updated.sessionKeys.at(-1),
                profile: updated.assignedProfile,
              })
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
