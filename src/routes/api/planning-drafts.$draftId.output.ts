import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { recordPlannerOutput } from '../../server/work-item-planning'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/planning-drafts/$draftId/output')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          if (typeof body.rawOutput !== 'string') {
            return jsonResponse({ error: 'rawOutput is required' }, 400)
          }

          const draft = recordPlannerOutput(params.draftId, body.rawOutput)
          return jsonResponse({ draft })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status =
            message === 'Planning draft not found'
              ? 404
              : message.includes('rawOutput')
                ? 400
                : 500
          return jsonResponse({ error: message }, status)
        }
      },
    },
  },
})
