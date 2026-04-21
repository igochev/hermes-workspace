import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProject } from '../../server/projects-store'
import {
  deleteWorkItem,
  getWorkItem,
  updateWorkItem,
  type WorkItemPhase,
  type WorkItemPriority,
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

function buildWorkItemPayload(workItemId: string) {
  const workItem = getWorkItem(workItemId)
  if (!workItem) return null
  return {
    workItem,
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
          const workItem = updateWorkItem(params.workItemId, {
            title: typeof body.title === 'string' ? body.title : undefined,
            description:
              typeof body.description === 'string' ? body.description : undefined,
            status: isWorkItemStatus(body.status) ? body.status : undefined,
            phase: isWorkItemPhase(body.phase) ? body.phase : undefined,
            priority: isWorkItemPriority(body.priority) ? body.priority : undefined,
            assignedProfile:
              body.assignedProfile === null || typeof body.assignedProfile === 'string'
                ? (body.assignedProfile ?? undefined)
                : undefined,
            repoPathSnapshot:
              typeof body.repoPathSnapshot === 'string'
                ? body.repoPathSnapshot
                : undefined,
            missionId:
              body.missionId === null || typeof body.missionId === 'string'
                ? (body.missionId ?? undefined)
                : undefined,
            sessionKeys: Array.isArray(body.sessionKeys)
              ? body.sessionKeys.filter(
                  (value): value is string => typeof value === 'string',
                )
              : undefined,
            branchName:
              body.branchName === null || typeof body.branchName === 'string'
                ? (body.branchName ?? undefined)
                : undefined,
            prUrl:
              body.prUrl === null || typeof body.prUrl === 'string'
                ? (body.prUrl ?? undefined)
                : undefined,
            artifactPaths: Array.isArray(body.artifactPaths)
              ? body.artifactPaths.filter(
                  (value): value is string => typeof value === 'string',
                )
              : undefined,
            acceptanceCriteria: Array.isArray(body.acceptanceCriteria)
              ? body.acceptanceCriteria.filter(
                  (value): value is string => typeof value === 'string',
                )
              : undefined,
            notes: Array.isArray(body.notes)
              ? body.notes.filter((value): value is string => typeof value === 'string')
              : undefined,
          })

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
