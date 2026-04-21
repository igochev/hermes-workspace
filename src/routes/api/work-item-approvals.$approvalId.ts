import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { resolveWorkItemApprovalDecision } from '../../server/work-item-approvals'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/work-item-approvals/$approvalId')({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        try {
          const body = (await request.json()) as Record<string, unknown>
          const decision = body.decision
          if (
            decision !== 'approved' &&
            decision !== 'changes_requested' &&
            decision !== 'rejected'
          ) {
            return jsonResponse({ error: 'decision is required' }, 400)
          }

          const result = resolveWorkItemApprovalDecision(params.approvalId, {
            decision,
            resolvedBy: typeof body.resolvedBy === 'string' ? body.resolvedBy : undefined,
            notes: typeof body.notes === 'string' ? body.notes : undefined,
          })

          return jsonResponse(result)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status =
            message === 'Approval not found' ||
            message === 'Work item not found'
              ? 404
              : message === 'Approval already resolved'
                ? 409
                : 500
          return jsonResponse({ error: message }, status)
        }
      },
    },
  },
})
