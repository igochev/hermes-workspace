import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProject } from '../../server/projects-store'
import {
  createWorkItem,
  listWorkItems,
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

export const Route = createFileRoute('/api/work-items')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        return jsonResponse({
          workItems: listWorkItems({
            projectId: url.searchParams.get('projectId') || undefined,
            status: isWorkItemStatus(url.searchParams.get('status'))
              ? (url.searchParams.get('status') as WorkItemStatus)
              : undefined,
            phase: isWorkItemPhase(url.searchParams.get('phase'))
              ? (url.searchParams.get('phase') as WorkItemPhase)
              : undefined,
          }),
        })
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          if (!body.projectId || typeof body.projectId !== 'string') {
            return jsonResponse({ error: 'projectId is required' }, 400)
          }
          if (!body.title || typeof body.title !== 'string') {
            return jsonResponse({ error: 'title is required' }, 400)
          }

          const project = getProject(body.projectId)
          if (!project) {
            return jsonResponse({ error: 'Project not found' }, 404)
          }

          const workItem = createWorkItem({
            id: typeof body.id === 'string' ? body.id : undefined,
            projectId: body.projectId,
            title: body.title,
            description: typeof body.description === 'string' ? body.description : '',
            status: isWorkItemStatus(body.status) ? body.status : undefined,
            phase: isWorkItemPhase(body.phase) ? body.phase : undefined,
            priority: isWorkItemPriority(body.priority) ? body.priority : undefined,
            riskLevel: isWorkItemRiskLevel(body.riskLevel) ? body.riskLevel : undefined,
            assignedProfile:
              typeof body.assignedProfile === 'string'
                ? body.assignedProfile
                : undefined,
            repoPathSnapshot:
              typeof body.repoPathSnapshot === 'string' && body.repoPathSnapshot.trim()
                ? body.repoPathSnapshot
                : project.repoPath,
            missionId: typeof body.missionId === 'string' ? body.missionId : undefined,
            missionLink: typeof body.missionLink === 'string' ? body.missionLink : undefined,
            sessionKeys: Array.isArray(body.sessionKeys)
              ? body.sessionKeys.filter(
                  (value): value is string => typeof value === 'string',
                )
              : [],
            branchName:
              typeof body.branchName === 'string' ? body.branchName : undefined,
            prUrl: typeof body.prUrl === 'string' ? body.prUrl : undefined,
            artifactPaths: Array.isArray(body.artifactPaths)
              ? body.artifactPaths.filter(
                  (value): value is string => typeof value === 'string',
                )
              : [],
            acceptanceCriteria: Array.isArray(body.acceptanceCriteria)
              ? body.acceptanceCriteria.filter(
                  (value): value is string => typeof value === 'string',
                )
              : [],
            criteriaStatus: Array.isArray(body.criteriaStatus)
              ? body.criteriaStatus
                  .filter(
                    (value): value is { text?: unknown; met?: unknown } =>
                      Boolean(value) && typeof value === 'object',
                  )
                  .map((value) => ({
                    text: typeof value.text === 'string' ? value.text : '',
                    met: value.met === true,
                  }))
              : [],
            notes: Array.isArray(body.notes)
              ? body.notes.filter((value): value is string => typeof value === 'string')
              : [],
          })

          return jsonResponse({ workItem }, 201)
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
