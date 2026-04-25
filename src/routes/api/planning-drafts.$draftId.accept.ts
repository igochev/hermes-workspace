import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { applyPlanningDraftToWorkItem } from '../../server/work-item-planning'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/planning-drafts/$draftId/accept')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        try {
          const payload = applyPlanningDraftToWorkItem(params.draftId)
          return jsonResponse(payload)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status =
            message === 'Planning draft not found' ||
            message === 'Work item not found' ||
            message === 'Project not found'
              ? 404
              : message.includes('not ready for acceptance')
                ? 400
                : 500
          return jsonResponse({ error: message }, status)
        }
      },
    },
  },
})
