import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { prepareWorkItemWithPlanner } from '../../server/work-item-planning'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/work-items/$workItemId/prepare')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const payload = await prepareWorkItemWithPlanner(params.workItemId, body)
          return jsonResponse(payload, 201)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status =
            message === 'Work item not found' || message === 'Project not found'
              ? 404
              : message.includes('required')
                ? 400
                : 500
          return jsonResponse({ error: message }, status)
        }
      },
    },
  },
})
