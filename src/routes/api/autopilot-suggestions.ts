import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { getProject } from '../../server/projects-store'
import {
  createAutopilotSuggestion,
  listAutopilotSuggestions,
  type AutopilotSuggestionImpact,
  type AutopilotSuggestionRisk,
  type AutopilotSuggestionEffort,
  type AutopilotSuggestionSource,
  type AutopilotSuggestionStatus,
} from '../../server/autopilot-suggestions-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isStatus(value: unknown): value is AutopilotSuggestionStatus {
  return value === 'new' || value === 'accepted' || value === 'rejected' || value === 'converted' || value === 'archived'
}

function isImpact(value: unknown): value is AutopilotSuggestionImpact {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isRisk(value: unknown): value is AutopilotSuggestionRisk {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isEffort(value: unknown): value is AutopilotSuggestionEffort {
  return value === 'small' || value === 'medium' || value === 'large'
}

function isSource(value: unknown): value is AutopilotSuggestionSource {
  return (
    value === 'manual' ||
    value === 'autopilot' ||
    value === 'repo-health-scout' ||
    value === 'failing-tests-scout' ||
    value === 'stale-docs-scout' ||
    value === 'ux-friction-scout' ||
    value === 'dependency-api-scout' ||
    value === 'architecture-debt-scout'
  )
}

export const Route = createFileRoute('/api/autopilot-suggestions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const url = new URL(request.url)
        return jsonResponse({
          suggestions: listAutopilotSuggestions({
            projectId: url.searchParams.get('projectId') || undefined,
            status: isStatus(url.searchParams.get('status'))
              ? (url.searchParams.get('status') as AutopilotSuggestionStatus)
              : undefined,
            source: isSource(url.searchParams.get('source'))
              ? (url.searchParams.get('source') as AutopilotSuggestionSource)
              : undefined,
          }),
        })
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        try {
          const body = (await request.json()) as Record<string, unknown>
          if (!body.projectId || typeof body.projectId !== 'string') {
            return jsonResponse({ error: 'projectId is required' }, 400)
          }
          if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
            return jsonResponse({ error: 'title is required' }, 400)
          }

          const project = getProject(body.projectId)
          if (!project) {
            return jsonResponse({ error: 'Project not found' }, 404)
          }

          const suggestion = createAutopilotSuggestion({
            id: typeof body.id === 'string' ? body.id : undefined,
            projectId: body.projectId,
            title: body.title,
            rationale: typeof body.rationale === 'string' ? body.rationale : '',
            evidence: Array.isArray(body.evidence)
              ? body.evidence.filter((value): value is string => typeof value === 'string')
              : [],
            suggestedAcceptanceCriteria: Array.isArray(body.suggestedAcceptanceCriteria)
              ? body.suggestedAcceptanceCriteria.filter((value): value is string => typeof value === 'string')
              : [],
            impact: isImpact(body.impact) ? body.impact : undefined,
            risk: isRisk(body.risk) ? body.risk : undefined,
            effort: isEffort(body.effort) ? body.effort : undefined,
            labels: Array.isArray(body.labels)
              ? body.labels.filter((value): value is string => typeof value === 'string')
              : [],
            source: isSource(body.source) ? body.source : undefined,
            status: isStatus(body.status) ? body.status : undefined,
            rejectionReason: typeof body.rejectionReason === 'string' ? body.rejectionReason : undefined,
          })

          return jsonResponse({ suggestion }, 201)
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
