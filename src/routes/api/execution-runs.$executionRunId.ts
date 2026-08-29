import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { getExecutionRun } from '../../server/execution-runs-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/execution-runs/$executionRunId')({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const run = getExecutionRun(params.executionRunId)
        if (!run) {
          return jsonResponse({ error: 'Execution run not found' }, 404)
        }

        return jsonResponse({ run })
      },
    },
  },
})
