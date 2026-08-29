import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import {
  getAutopilotSuggestion,
  markAutopilotSuggestionConverted,
} from '../../server/autopilot-suggestions-store'
import { getProject } from '../../server/projects-store'
import { prepareWorkItemWithPlanner } from '../../server/work-item-planning'
import { createWorkItem } from '../../server/work-items-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type ConvertMode = 'work-item' | 'work-item-and-plan' | 'work-item-plan-build-queued'

function readConvertMode(value: unknown): ConvertMode {
  return value === 'work-item-and-plan' || value === 'work-item-plan-build-queued'
    ? value
    : 'work-item'
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

        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const mode = readConvertMode(body.mode)
        const shouldRequestPlanning = mode === 'work-item-and-plan' || mode === 'work-item-plan-build-queued'
        const shouldQueueBuild = mode === 'work-item-plan-build-queued'

        const uniqueLabels = Array.from(new Set(['autopilot', ...suggestion.labels]))
        const evidenceText = suggestion.evidence.length > 0 ? suggestion.evidence.join('\n') : 'None provided.'

        const workItem = createWorkItem({
          projectId: suggestion.projectId,
          title: suggestion.title,
          description: suggestion.rationale,
          status: shouldRequestPlanning ? 'active' : 'inbox',
          phase: 'research',
          priority: mapImpactToPriority(suggestion.impact),
          riskLevel: suggestion.risk,
          labels: uniqueLabels,
          acceptanceCriteria: suggestion.suggestedAcceptanceCriteria,
          sourceSuggestionId: suggestion.id,
          sourceSuggestionTitle: suggestion.title,
          sourceSuggestionEvidence: suggestion.evidence,
          autopilotBuildIntent: shouldQueueBuild ? 'build-after-accepted-plan' : undefined,
          notes: [
            `Autopilot suggestion rationale: ${suggestion.rationale}`,
            `Evidence: ${evidenceText}`,
            `Source: ${suggestion.source}`,
            `Impact: ${suggestion.impact}; Risk: ${suggestion.risk}; Effort: ${suggestion.effort}`,
            ...(shouldQueueBuild
              ? ['Autopilot build intent queued: launch build only after an operator accepts the planner draft.']
              : []),
          ],
          repoPathSnapshot: project.repoPath,
        })

        const planningResult = shouldRequestPlanning
          ? await prepareWorkItemWithPlanner(workItem.id, {
              supervised: true,
            })
          : undefined
        const plannedWorkItem = planningResult?.workItem ?? workItem
        const planningDraft = planningResult?.draft

        const converted = markAutopilotSuggestionConverted(suggestion.id, plannedWorkItem.id)
        return jsonResponse({
          suggestion: converted,
          workItem: plannedWorkItem,
          ...(planningDraft ? { planningDraft } : {}),
        }, 201)
      },
    },
  },
})
