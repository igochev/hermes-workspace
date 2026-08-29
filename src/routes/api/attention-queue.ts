import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { refreshAttentionQueue } from '../../server/attention-queue'
import { listAttentionQueueItems } from '../../server/attention-queue-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/attention-queue')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const refresh = new URL(request.url).searchParams.get('refresh') === 'true'
        const items = refresh ? refreshAttentionQueue() : listAttentionQueueItems({ status: 'open' })
        return jsonResponse({ items })
      },
    },
  },
})
