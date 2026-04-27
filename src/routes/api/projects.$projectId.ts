import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  deleteProject,
  updateProject,
} from '../../server/projects-store'
import { buildProjectDetailPayload } from '../../server/project-detail'
import { deleteWorkItemsForProject } from '../../server/work-items-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function buildProjectPayload(projectId: string) {
  return buildProjectDetailPayload(projectId)
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
            phaseProfiles:
              body.phaseProfiles === null
                ? { research: '', build: '', review: '', deploy: '' }
                : body.phaseProfiles && typeof body.phaseProfiles === 'object' && !Array.isArray(body.phaseProfiles)
                  ? body.phaseProfiles
                  : undefined,
            runtimeProfiles:
              body.runtimeProfiles === null
                ? {}
                : body.runtimeProfiles && typeof body.runtimeProfiles === 'object' && !Array.isArray(body.runtimeProfiles)
                  ? body.runtimeProfiles
                  : undefined,
            reviewAutoApproval:
              body.reviewAutoApproval === null
                ? { enabled: false, maxPriority: 'low' }
                : body.reviewAutoApproval && typeof body.reviewAutoApproval === 'object' && !Array.isArray(body.reviewAutoApproval)
                  ? body.reviewAutoApproval
                  : undefined,
            autopilotPolicy:
              body.autopilotPolicy === null
                ? {}
                : body.autopilotPolicy && typeof body.autopilotPolicy === 'object' && !Array.isArray(body.autopilotPolicy)
                  ? body.autopilotPolicy
                  : undefined,
            autonomyLanePolicy:
              body.autonomyLanePolicy === null
                ? {}
                : body.autonomyLanePolicy &&
                    typeof body.autonomyLanePolicy === 'object' &&
                    !Array.isArray(body.autonomyLanePolicy)
                  ? body.autonomyLanePolicy
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
