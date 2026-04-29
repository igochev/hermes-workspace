import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { getProject } from '../../server/projects-store'
import {





  acceptAutopilotSuggestion,
  archiveAutopilotSuggestion,
  getAutopilotSuggestion,
  rejectAutopilotSuggestion,
  updateAutopilotSuggestion
} from '../../server/autopilot-suggestions-store'
import type {AutopilotSuggestionEffort, AutopilotSuggestionImpact, AutopilotSuggestionRisk, AutopilotSuggestionSource, AutopilotSuggestionStatus} from '../../server/autopilot-suggestions-store';

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

export const Route = createFileRoute('/api/autopilot-suggestions/$suggestionId')({
  server: {
    handlers: {
      GET: ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const suggestion = getAutopilotSuggestion(params.suggestionId)
        if (!suggestion) return jsonResponse({ error: 'Suggestion not found' }, 404)

        return jsonResponse({
          suggestion,
          project: getProject(suggestion.projectId),
        })
      },

      PATCH: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const current = getAutopilotSuggestion(params.suggestionId)
        if (!current) return jsonResponse({ error: 'Suggestion not found' }, 404)

        try {
          const body = (await request.json()) as Record<string, unknown>
          if (body.projectId !== undefined || body.convertedWorkItemId !== undefined) {
            return jsonResponse({ error: 'projectId and convertedWorkItemId are immutable' }, 400)
          }

          let suggestion = current
          const status = isStatus(body.status) ? body.status : undefined

          if (status === 'accepted') {
            suggestion = acceptAutopilotSuggestion(current.id) ?? current
          } else if (status === 'rejected') {
            suggestion = rejectAutopilotSuggestion(
              current.id,
              typeof body.rejectionReason === 'string' ? body.rejectionReason : undefined,
            ) ?? current
          } else if (status === 'archived') {
            suggestion = archiveAutopilotSuggestion(current.id) ?? current
          } else {
            suggestion = updateAutopilotSuggestion(current.id, {
              ...(typeof body.title === 'string' ? { title: body.title } : {}),
              ...(typeof body.rationale === 'string' ? { rationale: body.rationale } : {}),
              ...(Array.isArray(body.evidence)
                ? { evidence: body.evidence.filter((value): value is string => typeof value === 'string') }
                : {}),
              ...(Array.isArray(body.suggestedAcceptanceCriteria)
                ? {
                    suggestedAcceptanceCriteria: body.suggestedAcceptanceCriteria.filter(
                      (value): value is string => typeof value === 'string',
                    ),
                  }
                : {}),
              ...(isImpact(body.impact) ? { impact: body.impact } : {}),
              ...(isRisk(body.risk) ? { risk: body.risk } : {}),
              ...(isEffort(body.effort) ? { effort: body.effort } : {}),
              ...(Array.isArray(body.labels)
                ? { labels: body.labels.filter((value): value is string => typeof value === 'string') }
                : {}),
              ...(isSource(body.source) ? { source: body.source } : {}),
              ...(status ? { status } : {}),
              ...(typeof body.rejectionReason === 'string' || body.rejectionReason === null
                ? { rejectionReason: (body.rejectionReason) ?? undefined }
                : {}),
            }) ?? current
          }

          return jsonResponse({ suggestion })
        } catch {
          return jsonResponse({ error: 'Invalid request body' }, 400)
        }
      },
    },
  },
})
