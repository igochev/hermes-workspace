import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { buildStatusDigest, digestStateHasChanged, formatDigestForDiscord, persistDigestHash } from '../../server/work-item-notification-digest'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/work-item-notification-digest')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const format = new URL(request.url).searchParams.get('format')
        const digest = buildStatusDigest()
        const hasChanged = digestStateHasChanged(digest.stateHash)

        if (format === 'discord') {
          const message = formatDigestForDiscord(digest)
          if (hasChanged) persistDigestHash(digest.stateHash)
          return jsonResponse({
            message,
            digest,
            hasChanged,
          })
        }

        return jsonResponse({
          digest,
          hasChanged,
          discordMessage: formatDigestForDiscord(digest),
        })
      },
    },
  },
})
