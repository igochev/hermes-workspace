import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { listExecutionRuns } from '../../server/execution-runs-store'
import { getWorkItem } from '../../server/work-items-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/work-items/$workItemId/execution-runs')({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const workItem = getWorkItem(params.workItemId)
        if (!workItem) {
          return jsonResponse({ error: 'Work item not found' }, 404)
        }

        return jsonResponse({
          workItemId: workItem.id,
          runs: listExecutionRuns({ workItemId: workItem.id }),
        })
      },
    },
  },
})
