import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  createProject,
  listProjects,
  type ProjectRecord,
} from '../../server/projects-store'
import { listWorkItems } from '../../server/work-items-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function toProjectSummary(project: ProjectRecord) {
  const workItems = listWorkItems({ projectId: project.id })
  return {
    ...project,
    workItemCount: workItems.length,
    activeWorkItemCount: workItems.filter((item) => item.status === 'active').length,
    doneWorkItemCount: workItems.filter((item) => item.status === 'done').length,
  }
}

export const Route = createFileRoute('/api/projects')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }
        return jsonResponse({
          projects: listProjects().map(toProjectSummary),
        })
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          if (!body.name || typeof body.name !== 'string') {
            return jsonResponse({ error: 'name is required' }, 400)
          }
          if (!body.repoPath || typeof body.repoPath !== 'string') {
            return jsonResponse({ error: 'repoPath is required' }, 400)
          }

          const project = createProject({
            id: typeof body.id === 'string' ? body.id : undefined,
            name: body.name,
            repoPath: body.repoPath,
            repoUrl: typeof body.repoUrl === 'string' ? body.repoUrl : undefined,
            defaultBranch:
              typeof body.defaultBranch === 'string'
                ? body.defaultBranch
                : undefined,
            description:
              typeof body.description === 'string' ? body.description : undefined,
            phaseProfiles:
              body.phaseProfiles && typeof body.phaseProfiles === 'object' && !Array.isArray(body.phaseProfiles)
                ? body.phaseProfiles
                : undefined,
            reviewAutoApproval:
              body.reviewAutoApproval && typeof body.reviewAutoApproval === 'object' && !Array.isArray(body.reviewAutoApproval)
                ? body.reviewAutoApproval
                : undefined,
          })

          return jsonResponse({ project: toProjectSummary(project) }, 201)
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
