import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { getProject } from '../../server/projects-store'
import { listWorkItemApprovals } from '../../server/work-item-approvals'
import { listWorkItems } from '../../server/work-items-store'
import { buildLabelAnalytics } from '../../lib/projects-view-model'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/projects/$projectId/label-analytics')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const project = getProject(params.projectId)
        if (!project) return jsonResponse({ error: 'Project not found' }, 404)

        const workItems = listWorkItems({ projectId: params.projectId }).map((workItem) => ({
          ...workItem,
          approvals: listWorkItemApprovals(workItem.id).slice().reverse(),
        }))

        const analytics = buildLabelAnalytics(workItems)
        return jsonResponse(analytics)
      },
    },
  },
})
