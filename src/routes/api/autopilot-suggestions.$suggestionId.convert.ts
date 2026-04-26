import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import {
  getAutopilotSuggestion,
  markAutopilotSuggestionConverted,
} from '../../server/autopilot-suggestions-store'
import { getProject } from '../../server/projects-store'
import { createWorkItem } from '../../server/work-items-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mapImpactToPriority(impact: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
  if (impact === 'high') return 'high'
  if (impact === 'low') return 'low'
  return 'medium'
}

export const Route = createFileRoute('/api/autopilot-suggestions/$suggestionId/convert')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isAuthenticated(request)) return jsonResponse({ error: 'Unauthorized' }, 401)

        const suggestion = getAutopilotSuggestion(params.suggestionId)
        if (!suggestion) return jsonResponse({ error: 'Suggestion not found' }, 404)

        const project = getProject(suggestion.projectId)
        if (!project) return jsonResponse({ error: 'Project not found' }, 404)

        if (suggestion.status === 'converted' && suggestion.convertedWorkItemId) {
          return jsonResponse({ error: 'Suggestion already converted' }, 409)
        }

        const uniqueLabels = Array.from(new Set(['autopilot', ...suggestion.labels]))
        const evidenceText = suggestion.evidence.length > 0 ? suggestion.evidence.join('\n') : 'None provided.'

        const workItem = createWorkItem({
          projectId: suggestion.projectId,
          title: suggestion.title,
          description: suggestion.rationale,
          status: 'inbox',
          phase: 'research',
          priority: mapImpactToPriority(suggestion.impact),
          riskLevel: suggestion.risk,
          labels: uniqueLabels,
          acceptanceCriteria: suggestion.suggestedAcceptanceCriteria,
          sourceSuggestionId: suggestion.id,
          sourceSuggestionTitle: suggestion.title,
          sourceSuggestionEvidence: suggestion.evidence,
          notes: [
            `Autopilot suggestion rationale: ${suggestion.rationale}`,
            `Evidence: ${evidenceText}`,
            `Source: ${suggestion.source}`,
            `Impact: ${suggestion.impact}; Risk: ${suggestion.risk}; Effort: ${suggestion.effort}`,
          ],
          repoPathSnapshot: project.repoPath,
        })

        const converted = markAutopilotSuggestionConverted(suggestion.id, workItem.id)
        return jsonResponse({
          suggestion: converted,
          workItem,
        }, 201)
      },
    },
  },
})
