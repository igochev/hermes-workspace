import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import {
  reconcileAllWorkItemExecutions,
  reconcileWorkItemExecution,
} from '../../server/work-item-supervisor'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/work-items/supervisor/reconcile')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const workItemId = new URL(request.url).searchParams.get('workItemId')?.trim()
        const result = workItemId
          ? await reconcileWorkItemExecution(workItemId)
          : await reconcileAllWorkItemExecutions()

        return jsonResponse(result)
      },
    },
  },
})
