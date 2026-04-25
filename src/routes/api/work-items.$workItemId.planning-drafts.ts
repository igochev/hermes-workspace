import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { getWorkItem } from '../../server/work-items-store'
import { listPlanningDrafts } from '../../server/planning-drafts-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/work-items/$workItemId/planning-drafts')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const workItem = getWorkItem(params.workItemId)
        if (!workItem) {
          return jsonResponse({ error: 'Work item not found' }, 404)
        }

        return jsonResponse({
          drafts: listPlanningDrafts({ workItemId: workItem.id }).slice().reverse(),
        })
      },
    },
  },
})
