import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import {
  reconcileAllWorkItemAutonomy,
  reconcileWorkItemAutonomy,
} from '../../server/work-item-orchestrator'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/work-items/orchestrator/reconcile')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const workItemId = new URL(request.url).searchParams.get('workItemId')?.trim()
        if (workItemId) {
          const result = await reconcileWorkItemAutonomy(workItemId)
          return jsonResponse({
            checked: 1,
            changed: result.changed ? 1 : 0,
            events: result.events,
            findings: [],
            blocked: result.blocked,
          })
        }

        return jsonResponse(await reconcileAllWorkItemAutonomy())
      },
    },
  },
})
