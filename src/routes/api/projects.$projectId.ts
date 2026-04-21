import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  deleteProject,
  getProject,
  updateProject,
} from '../../server/projects-store'
import {
  deleteWorkItemsForProject,
  listWorkItems,
} from '../../server/work-items-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function buildProjectPayload(projectId: string) {
  const project = getProject(projectId)
  if (!project) return null
  const workItems = listWorkItems({ projectId })
  return {
    project: {
      ...project,
      workItemCount: workItems.length,
      activeWorkItemCount: workItems.filter((item) => item.status === 'active').length,
      doneWorkItemCount: workItems.filter((item) => item.status === 'done').length,
    },
    workItems,
  }
}

export const Route = createFileRoute('/api/projects/$projectId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const payload = buildProjectPayload(params.projectId)
        if (!payload) return jsonResponse({ error: 'Project not found' }, 404)
        return jsonResponse(payload)
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          const project = updateProject(params.projectId, {
            name: typeof body.name === 'string' ? body.name : undefined,
            repoPath: typeof body.repoPath === 'string' ? body.repoPath : undefined,
            repoUrl:
              body.repoUrl === null || typeof body.repoUrl === 'string'
                ? (body.repoUrl ?? undefined)
                : undefined,
            defaultBranch:
              body.defaultBranch === null || typeof body.defaultBranch === 'string'
                ? (body.defaultBranch ?? undefined)
                : undefined,
            description:
              body.description === null || typeof body.description === 'string'
                ? (body.description ?? undefined)
                : undefined,
          })

          if (!project) return jsonResponse({ error: 'Project not found' }, 404)
          return jsonResponse(buildProjectPayload(project.id))
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },

      DELETE: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const deleted = deleteProject(params.projectId)
        if (!deleted) return jsonResponse({ error: 'Project not found' }, 404)
        const deletedWorkItems = deleteWorkItemsForProject(params.projectId)
        return jsonResponse({ ok: true, deletedWorkItems })
      },
    },
  },
})
