import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { recoverMissingBranchEvidence } from '../../server/work-item-branch-evidence-recovery'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function statusForError(message: string): number {
  if (message === 'Work item not found') return 404
  if (message === 'Project not found') return 400
  return 400
}

export const Route = createFileRoute('/api/work-items/$workItemId/branch-evidence-recovery')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const routeParams = params as { workItemId?: string }
        const workItemId = routeParams.workItemId
        if (!workItemId) return jsonResponse({ error: 'Work item not found' }, 404)
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          const branchName = asOptionalString(body.branchName)
          if (!branchName) return jsonResponse({ error: 'branchName is required' }, 400)

          const result = await recoverMissingBranchEvidence({
            workItemId,
            branchName,
            baseBranch: asOptionalString(body.baseBranch),
            operatorNote: asOptionalString(body.operatorNote),
          })

          return jsonResponse({
            workItem: result.workItem,
            recovery: {
              branchName: result.branchName,
              baseBranch: result.baseBranch,
              mergeBaseCommit: result.mergeBaseCommit,
              branchHeadCommit: result.branchHeadCommit,
              commitsAhead: result.commitsAhead,
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return jsonResponse({ error: message }, statusForError(message))
        }
      },
    },
  },
})
