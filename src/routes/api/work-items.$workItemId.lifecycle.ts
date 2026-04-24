import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { getProject } from '../../server/projects-store'
import { listWorkItemApprovals } from '../../server/work-item-approvals'
import {
  applyWorkItemLifecycleTransition,
  type WorkItemLifecycleAction,
} from '../../server/work-item-lifecycle'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isLifecycleAction(value: unknown): value is WorkItemLifecycleAction {
  return (
    value === 'send_to_planning' ||
    value === 'mark_ready' ||
    value === 'request_review' ||
    value === 'request_deploy_approval' ||
    value === 'resume_build'
  )
}

export const Route = createFileRoute('/api/work-items/$workItemId/lifecycle')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        try {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
          if (!isLifecycleAction(body.action)) {
            return jsonResponse({ error: 'action is required' }, 400)
          }

          const result = applyWorkItemLifecycleTransition(params.workItemId, {
            action: body.action,
            actor: typeof body.actor === 'string' ? body.actor : undefined,
            notes: typeof body.notes === 'string' ? body.notes : undefined,
          })

          return jsonResponse({
            workItem: {
              ...result.workItem,
              approvals: listWorkItemApprovals(result.workItem.id).slice().reverse(),
            },
            project: getProject(result.workItem.projectId),
            approval: result.approval,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const status =
            message === 'Work item not found' || message === 'Project not found'
              ? 404
              : message.includes('only valid')
                ? 409
                : 500
          return jsonResponse({ error: message }, status)
        }
      },
    },
  },
})
