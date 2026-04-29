import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProject } from '../../server/projects-store'
import { listWorkItemApprovals } from '../../server/work-item-approvals'
import { getLatestPlanningDraftForWorkItem } from '../../server/planning-drafts-store'
import { syncWorkItemExecutionState } from '../../server/work-item-execution'
import { buildWorkItemRunTimeline } from '../../server/work-item-run-timeline'
import {
  deleteWorkItem,
  getWorkItem,
  updateWorkItem,
} from '../../server/work-items-store'
import type {
  WorkItemBlockedReason,
  WorkItemPhase,
  WorkItemPriority,
  WorkItemRiskLevel,
  WorkItemStatus,
} from '../../server/work-items-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isWorkItemStatus(value: unknown): value is WorkItemStatus {
  return (
    value === 'inbox' ||
    value === 'ready' ||
    value === 'active' ||
    value === 'blocked' ||
    value === 'done' ||
    value === 'cancelled'
  )
}

function isWorkItemPhase(value: unknown): value is WorkItemPhase {
  return (
    value === 'research' ||
    value === 'build' ||
    value === 'review' ||
    value === 'deploy'
  )
}

function isWorkItemPriority(value: unknown): value is WorkItemPriority {
  return value === 'high' || value === 'medium' || value === 'low'
}

function isWorkItemRiskLevel(value: unknown): value is WorkItemRiskLevel {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isWorkItemBlockedReason(
  value: unknown,
): value is WorkItemBlockedReason {
  return (
    value === 'mission_failed' ||
    value === 'review_feedback' ||
    value === 'blocked_by_dependency' ||
    value === 'external' ||
    value === 'other'
  )
}

function buildWorkItemPayload(workItemId: string) {
  const workItem = getWorkItem(workItemId)
  if (!workItem) return null
  return {
    workItem: {
      ...workItem,
      approvals: listWorkItemApprovals(workItem.id).slice().reverse(),
      latestPlanningDraft: getLatestPlanningDraftForWorkItem(workItem.id),
      runTimeline: buildWorkItemRunTimeline(workItem),
    },
    project: getProject(workItem.projectId),
  }
}

export const Route = createFileRoute('/api/work-items/$workItemId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const sync =
          new URL(request.url).searchParams.get('syncExecution') === 'true'
        if (sync) {
          try {
            const result = await syncWorkItemExecutionState(params.workItemId)
            return jsonResponse({
              workItem: {
                ...result.workItem,
                approvals: listWorkItemApprovals(result.workItem.id)
                  .slice()
                  .reverse(),
                latestPlanningDraft: getLatestPlanningDraftForWorkItem(
                  result.workItem.id,
                ),
                runTimeline: buildWorkItemRunTimeline(result.workItem),
              },
              project: result.project,
              execution: result.execution,
            })
          } catch (error) {
            const payload = buildWorkItemPayload(params.workItemId)
            if (!payload)
              return jsonResponse({ error: 'Work item not found' }, 404)
            return jsonResponse({
              ...payload,
              executionSyncWarning:
                error instanceof Error
                  ? error.message
                  : 'Failed to sync work item execution',
            })
          }
        }

        const payload = buildWorkItemPayload(params.workItemId)
        if (!payload) return jsonResponse({ error: 'Work item not found' }, 404)
        return jsonResponse(payload)
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          const updates: Parameters<typeof updateWorkItem>[1] = {
            ...(typeof body.title === 'string' ? { title: body.title } : {}),
            ...(typeof body.description === 'string'
              ? { description: body.description }
              : {}),
            ...(isWorkItemStatus(body.status) ? { status: body.status } : {}),
            ...(isWorkItemPhase(body.phase) ? { phase: body.phase } : {}),
            ...(isWorkItemPriority(body.priority)
              ? { priority: body.priority }
              : {}),
            ...(isWorkItemRiskLevel(body.riskLevel)
              ? { riskLevel: body.riskLevel }
              : {}),
            ...(body.blockedReason === null
              ? { blockedReason: undefined }
              : isWorkItemBlockedReason(body.blockedReason)
                ? { blockedReason: body.blockedReason }
                : {}),
            ...(body.assignedProfile === null ||
            typeof body.assignedProfile === 'string'
              ? {
                  assignedProfile: body.assignedProfile ?? undefined,
                }
              : {}),
            ...(typeof body.repoPathSnapshot === 'string'
              ? { repoPathSnapshot: body.repoPathSnapshot }
              : {}),
            ...(body.missionId === null || typeof body.missionId === 'string'
              ? { missionId: body.missionId ?? undefined }
              : {}),
            ...(body.missionLink === null ||
            typeof body.missionLink === 'string'
              ? {
                  missionLink: body.missionLink ?? undefined,
                }
              : {}),
            ...(Array.isArray(body.sessionKeys)
              ? {
                  sessionKeys: body.sessionKeys.filter(
                    (value): value is string => typeof value === 'string',
                  ),
                }
              : {}),
            ...(body.branchName === null || typeof body.branchName === 'string'
              ? { branchName: body.branchName ?? undefined }
              : {}),
            ...(body.prUrl === null || typeof body.prUrl === 'string'
              ? { prUrl: body.prUrl ?? undefined }
              : {}),
            ...(Array.isArray(body.artifactPaths)
              ? {
                  artifactPaths: body.artifactPaths.filter(
                    (value): value is string => typeof value === 'string',
                  ),
                }
              : {}),
            ...(Array.isArray(body.acceptanceCriteria)
              ? {
                  acceptanceCriteria: body.acceptanceCriteria.filter(
                    (value): value is string => typeof value === 'string',
                  ),
                }
              : {}),
            ...(Array.isArray(body.criteriaStatus)
              ? {
                  criteriaStatus: body.criteriaStatus
                    .filter(
                      (value): value is { text?: unknown; met?: unknown } =>
                        Boolean(value) && typeof value === 'object',
                    )
                    .map((value) => ({
                      text: typeof value.text === 'string' ? value.text : '',
                      met: value.met === true,
                    })),
                }
              : {}),
            ...(Array.isArray(body.notes)
              ? {
                  notes: body.notes.filter(
                    (value): value is string => typeof value === 'string',
                  ),
                }
              : {}),
            ...(body.planFilePath === null ||
            typeof body.planFilePath === 'string'
              ? {
                  planFilePath: body.planFilePath ?? undefined,
                }
              : {}),
            ...(body.reviewJobId === null ||
            typeof body.reviewJobId === 'string'
              ? {
                  reviewJobId: body.reviewJobId ?? undefined,
                }
              : {}),
            ...(body.reviewState === 'scheduled' ||
            body.reviewState === 'running' ||
            body.reviewState === 'succeeded' ||
            body.reviewState === 'failed' ||
            body.reviewState === 'unknown'
              ? { reviewState: body.reviewState }
              : {}),
            ...(body.reviewDecision === 'approved' ||
            body.reviewDecision === 'changes_requested'
              ? { reviewDecision: body.reviewDecision }
              : {}),
            ...(body.reviewDecisionSummary === null ||
            typeof body.reviewDecisionSummary === 'string'
              ? {
                  reviewDecisionSummary:
                    body.reviewDecisionSummary ?? undefined,
                }
              : {}),
            ...(body.reviewDecisionConfidence === 'low' ||
            body.reviewDecisionConfidence === 'medium' ||
            body.reviewDecisionConfidence === 'high'
              ? { reviewDecisionConfidence: body.reviewDecisionConfidence }
              : {}),
            ...(body.reviewDecisionSource === 'json' ||
            body.reviewDecisionSource === 'decision-line-fallback'
              ? { reviewDecisionSource: body.reviewDecisionSource }
              : {}),
            ...(body.reviewParserError === null ||
            typeof body.reviewParserError === 'string'
              ? {
                  reviewParserError: body.reviewParserError ?? undefined,
                }
              : {}),
            ...(body.reviewQualityGateStatus === 'pass' ||
            body.reviewQualityGateStatus === 'fail' ||
            body.reviewQualityGateStatus === 'manual_review'
              ? { reviewQualityGateStatus: body.reviewQualityGateStatus }
              : {}),
            ...(Array.isArray(body.reviewQualityGateReasons)
              ? {
                  reviewQualityGateReasons:
                    body.reviewQualityGateReasons.filter(
                      (v: unknown): v is string => typeof v === 'string',
                    ),
                }
              : {}),
            ...(Array.isArray(body.reviewMissingEvidence)
              ? {
                  reviewMissingEvidence: body.reviewMissingEvidence.filter(
                    (v: unknown): v is string => typeof v === 'string',
                  ),
                }
              : {}),
            ...(Array.isArray(body.labels)
              ? {
                  labels: body.labels.filter(
                    (value): value is string => typeof value === 'string',
                  ),
                }
              : {}),
          }

          const workItem = updateWorkItem(params.workItemId, updates)

          if (!workItem)
            return jsonResponse({ error: 'Work item not found' }, 404)
          return jsonResponse(buildWorkItemPayload(workItem.id))
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },

      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const deleted = deleteWorkItem(params.workItemId)
        if (!deleted) return jsonResponse({ error: 'Work item not found' }, 404)
        return jsonResponse({ ok: true })
      },
    },
  },
})
