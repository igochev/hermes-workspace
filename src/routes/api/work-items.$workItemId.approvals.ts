import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import {
  listWorkItemApprovals,
  requestWorkItemApproval,
} from '../../server/work-item-approvals'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/work-items/$workItemId/approvals')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)
        return jsonResponse({ approvals: listWorkItemApprovals(params.workItemId) })
      },

      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const phase = body.phase === 'deploy' ? 'deploy' : 'review'
          const approval = requestWorkItemApproval(params.workItemId, {
            requestedBy: typeof body.requestedBy === 'string' ? body.requestedBy : undefined,
            notes: typeof body.notes === 'string' ? body.notes : undefined,
            phase,
          })
          return jsonResponse({ approval }, 201)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status =
            message === 'Work item not found' || message === 'Project not found'
              ? 404
              : message === 'Work item must be in review phase'
                ? 409
                : 500
          return jsonResponse({ error: message }, status)
        }
      },
    },
  },
})
