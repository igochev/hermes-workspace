import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { buildMorningReviewDigest, formatMorningReviewForDiscord } from '../../server/morning-review'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function parseLookbackHours(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : 18
  if (!Number.isFinite(parsed)) return 18
  return Math.max(1, Math.min(72, parsed))
}

export const Route = createFileRoute('/api/morning-review')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const url = new URL(request.url)
        const lookbackHours = parseLookbackHours(url.searchParams.get('lookbackHours'))
        const format = url.searchParams.get('format')
        const digest = buildMorningReviewDigest({ lookbackHours })

        if (format === 'discord') {
          return jsonResponse({
            digest,
            message: formatMorningReviewForDiscord(digest),
          })
        }

        return jsonResponse({ digest })
      },
    },
  },
})
