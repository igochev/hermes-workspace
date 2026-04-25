import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProject } from '../../server/projects-store'
import { listWorkItemApprovals } from '../../server/work-item-approvals'
import { syncWorkItemExecutionState } from '../../server/work-item-execution'
import {
  deleteWorkItem,
  getWorkItem,
  updateWorkItem,
  type WorkItemPhase,
  type WorkItemPriority,
  type WorkItemRiskLevel,
  type WorkItemStatus,
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

function buildWorkItemPayload(workItemId: string) {
  const workItem = getWorkItem(workItemId)
  if (!workItem) return null
  return {
    workItem: {
      ...workItem,
      approvals: listWorkItemApprovals(workItem.id).slice().reverse(),
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

        const sync = new URL(request.url).searchParams.get('syncExecution') === 'true'
        if (sync) {
          try {
            const result = await syncWorkItemExecutionState(params.workItemId)
            return jsonResponse({
              workItem: {
                ...result.workItem,
                approvals: listWorkItemApprovals(result.workItem.id).slice().reverse(),
              },
              project: result.project,
              execution: result.execution,
            })
          } catch (error) {
            return jsonResponse(
              { error: error instanceof Error ? error.message : 'Failed to sync work item execution' },
              500,
            )
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
          const updates = {
            ...(typeof body.title === 'string' ? { title: body.title } : {}),
            ...(typeof body.description === 'string' ? { description: body.description } : {}),
            ...(isWorkItemStatus(body.status) ? { status: body.status } : {}),
            ...(isWorkItemPhase(body.phase) ? { phase: body.phase } : {}),
            ...(isWorkItemPriority(body.priority) ? { priority: body.priority } : {}),
            ...(isWorkItemRiskLevel(body.riskLevel) ? { riskLevel: body.riskLevel } : {}),
            ...(body.assignedProfile === null || typeof body.assignedProfile === 'string'
              ? { assignedProfile: (body.assignedProfile as string | null) ?? undefined }
              : {}),
            ...(typeof body.repoPathSnapshot === 'string'
              ? { repoPathSnapshot: body.repoPathSnapshot }
              : {}),
            ...(body.missionId === null || typeof body.missionId === 'string'
              ? { missionId: (body.missionId as string | null) ?? undefined }
              : {}),
            ...(body.missionLink === null || typeof body.missionLink === 'string'
              ? { missionLink: (body.missionLink as string | null) ?? undefined }
              : {}),
            ...(Array.isArray(body.sessionKeys)
              ? {
                  sessionKeys: body.sessionKeys.filter(
                    (value): value is string => typeof value === 'string',
                  ),
                }
              : {}),
            ...(body.branchName === null || typeof body.branchName === 'string'
              ? { branchName: (body.branchName as string | null) ?? undefined }
              : {}),
            ...(body.prUrl === null || typeof body.prUrl === 'string'
              ? { prUrl: (body.prUrl as string | null) ?? undefined }
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
                  notes: body.notes.filter((value): value is string => typeof value === 'string'),
                }
              : {}),
          }

          const workItem = updateWorkItem(params.workItemId, updates)

          if (!workItem) return jsonResponse({ error: 'Work item not found' }, 404)
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
