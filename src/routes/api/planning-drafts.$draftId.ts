import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { getPlanningDraft, updatePlanningDraft } from '../../server/planning-drafts-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function asPatchStatus(value: unknown): 'revision_requested' | 'cancelled' | undefined {
  return value === 'revision_requested' || value === 'cancelled' ? value : undefined
}

export const Route = createFileRoute('/api/planning-drafts/$draftId')({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const draft = getPlanningDraft(params.draftId)
        if (!draft) return jsonResponse({ error: 'Planning draft not found' }, 404)
        return jsonResponse({ draft })
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const draft = getPlanningDraft(params.draftId)
        if (!draft) return jsonResponse({ error: 'Planning draft not found' }, 404)

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const status = asPatchStatus(body.status)
          if (!status) {
            return jsonResponse({ error: 'status must be revision_requested or cancelled' }, 400)
          }

          const updated = updatePlanningDraft(draft.id, {
            status,
            revisionRequestedAt: status === 'revision_requested' ? new Date().toISOString() : undefined,
            parseError:
              typeof body.parseError === 'string'
                ? body.parseError
                : status === 'revision_requested'
                  ? draft.parseError
                  : undefined,
          })

          if (!updated) return jsonResponse({ error: 'Planning draft not found' }, 404)
          return jsonResponse({ draft: updated })
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
