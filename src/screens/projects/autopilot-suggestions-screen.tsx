'use client'

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {AutopilotSuggestionImpact, AutopilotSuggestionRecord, AutopilotSuggestionRisk, AutopilotSuggestionSource, AutopilotSuggestionStatus} from '@/lib/autopilot-suggestions-api';
import { toast } from '@/components/ui/toast'
import { recommendAutopilotDelegationAction } from '@/server/autopilot-delegation-policy'
import { fetchProjects } from '@/lib/projects-api'
import {
  AUTOPILOT_SUGGESTION_EFFORT_LABELS,
  AUTOPILOT_SUGGESTION_IMPACT_LABELS,
  AUTOPILOT_SUGGESTION_RISK_LABELS,
  AUTOPILOT_SUGGESTION_SOURCE_LABELS,
  AUTOPILOT_SUGGESTION_STATUS_LABELS,





  acceptAutopilotSuggestion,
  archiveAutopilotSuggestion,
  convertAutopilotSuggestion,
  fetchAutopilotSuggestions,
  rejectAutopilotSuggestion
} from '@/lib/autopilot-suggestions-api'

export const AUTOPILOT_SUGGESTIONS_QUERY_KEY = ['mission-control', 'autopilot-suggestions'] as const
export const AUTOPILOT_SUGGESTIONS_EMPTY_COPY =
  'No autopilot suggestions yet. Run a scout or create a manual suggestion to seed the inbox.'
export const AUTOPILOT_SUGGESTION_CONVERT_BUTTON_LABEL = 'Convert to Work Item'
export const AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUTTON_LABEL = 'Convert + Plan'
export const AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUILD_BUTTON_LABEL = 'Convert + Plan + Build Queued'
export const AUTOPILOT_SUGGESTION_DELEGATION_SAFETY_COPY =
  'No code is launched until policy/operator conditions are met.'
export const AUTOPILOT_SUGGESTION_ACTION_LABELS = {
  accept: 'Accept',
  reject: 'Reject',
  archive: 'Archive',
} as const
export const AUTOPILOT_SUGGESTIONS_CLICKABILITY_AUDIT = [
  { surface: 'refresh', label: 'Refresh', kind: 'button', target: 'invalidate-autopilot-suggestions' },
  { surface: 'filters', label: 'Status/Project/Source/Impact/Risk filters', kind: 'button', target: 'setFilters' },
  { surface: 'accept', label: AUTOPILOT_SUGGESTION_ACTION_LABELS.accept, kind: 'button', target: 'acceptAutopilotSuggestion' },
  { surface: 'reject', label: AUTOPILOT_SUGGESTION_ACTION_LABELS.reject, kind: 'button', target: 'rejectAutopilotSuggestion' },
  { surface: 'archive', label: AUTOPILOT_SUGGESTION_ACTION_LABELS.archive, kind: 'button', target: 'archiveAutopilotSuggestion' },
  { surface: 'convert', label: AUTOPILOT_SUGGESTION_CONVERT_BUTTON_LABEL, kind: 'button', target: 'convertAutopilotSuggestion:work-item' },
  { surface: 'convert-plan', label: AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUTTON_LABEL, kind: 'button', target: 'convertAutopilotSuggestion:work-item-and-plan' },
  { surface: 'convert-plan-build', label: AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUILD_BUTTON_LABEL, kind: 'button', target: 'convertAutopilotSuggestion:work-item-plan-build-queued' },
  { surface: 'open-project', label: 'Open Project', kind: 'link', target: '/projects/:projectId' },
] as const
export const AUTOPILOT_SUGGESTIONS_FILTER_OPTIONS: Array<{
  value: AutopilotSuggestionStatus
  label: string
}> = [
  { value: 'new', label: 'New' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'converted', label: 'Converted' },
  { value: 'archived', label: 'Archived' },
]


export const AUTOPILOT_SUGGESTIONS_SOURCE_FILTER_OPTIONS = Object.entries(
  AUTOPILOT_SUGGESTION_SOURCE_LABELS,
).map(([value, label]) => ({ value: value as AutopilotSuggestionSource, label }))

export const AUTOPILOT_SUGGESTIONS_IMPACT_FILTER_OPTIONS = Object.entries(
  AUTOPILOT_SUGGESTION_IMPACT_LABELS,
).map(([value, label]) => ({ value: value as AutopilotSuggestionImpact, label }))

export const AUTOPILOT_SUGGESTIONS_RISK_FILTER_OPTIONS = Object.entries(
  AUTOPILOT_SUGGESTION_RISK_LABELS,
).map(([value, label]) => ({ value: value as AutopilotSuggestionRisk, label }))

export type AutopilotSuggestionFilters = {
  status?: AutopilotSuggestionStatus | 'all'
  projectId?: string | 'all'
  source?: AutopilotSuggestionSource | 'all'
  impact?: AutopilotSuggestionImpact | 'all'
  risk?: AutopilotSuggestionRisk | 'all'
}

export function applyAutopilotSuggestionFilters(
  suggestions: Array<AutopilotSuggestionRecord>,
  filters: AutopilotSuggestionFilters,
): Array<AutopilotSuggestionRecord> {
  return suggestions.filter((suggestion) => {
    if (filters.status && filters.status !== 'all' && suggestion.status !== filters.status) return false
    if (filters.projectId && filters.projectId !== 'all' && suggestion.projectId !== filters.projectId) return false
    if (filters.source && filters.source !== 'all' && suggestion.source !== filters.source) return false
    if (filters.impact && filters.impact !== 'all' && suggestion.impact !== filters.impact) return false
    if (filters.risk && filters.risk !== 'all' && suggestion.risk !== filters.risk) return false
    return true
  })
}

function formatRecommendedAction(action: ReturnType<typeof recommendAutopilotDelegationAction>['recommendedAction']): string {
  if (action === 'work-item') return 'Convert to Work Item'
  if (action === 'work-item-and-plan') return 'Convert + Plan'
  if (action === 'work-item-plan-build-queued') return 'Convert + Plan + Build Queued'
  return 'Manual review before planning'
}


export function AutopilotSuggestionsScreen() {
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<AutopilotSuggestionFilters>({
    status: 'all',
    projectId: 'all',
    source: 'all',
    impact: 'all',
    risk: 'all',
  })

  const suggestionsQuery = useQuery({
    queryKey: AUTOPILOT_SUGGESTIONS_QUERY_KEY,
    queryFn: () => fetchAutopilotSuggestions(),
    refetchInterval: 30_000,
  })

  const projectsQuery = useQuery({
    queryKey: ['mission-control', 'projects'],
    queryFn: fetchProjects,
    refetchInterval: 60_000,
  })

  const refreshSuggestions = async () => {
    await queryClient.invalidateQueries({ queryKey: AUTOPILOT_SUGGESTIONS_QUERY_KEY })
  }

  const actionMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: 'accept' | 'reject' | 'archive' | 'convert' | 'convert-plan' | 'convert-plan-build'
    }) => {
      if (action === 'accept') return acceptAutopilotSuggestion(id)
      if (action === 'reject') return rejectAutopilotSuggestion(id, 'Operator triage rejection')
      if (action === 'archive') return archiveAutopilotSuggestion(id)
      if (action === 'convert-plan') return convertAutopilotSuggestion(id, 'work-item-and-plan')
      if (action === 'convert-plan-build') return convertAutopilotSuggestion(id, 'work-item-plan-build-queued')
      return convertAutopilotSuggestion(id, 'work-item')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTOPILOT_SUGGESTIONS_QUERY_KEY })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects'] })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'work-items'] })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Autopilot action failed', { type: 'error' })
    },
  })

  const rawSuggestions = suggestionsQuery.data ?? []
  const projects = projectsQuery.data ?? []
  const suggestions = applyAutopilotSuggestionFilters(rawSuggestions, filters)
  const projectNameById = new Map(projects.map((project) => [project.id, project.name]))

  return (
    <div className="min-h-full bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-medium text-ink">Autopilot Suggestions</h1>
              <p className="mt-2 text-sm text-[var(--theme-muted)]">
                Suggestion inbox for scout findings. Accept, reject, archive, or convert to rough work items.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshSuggestions()}
              className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)]"
            >
              Refresh
            </button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <FilterSelect
              label="Status"
              value={filters.status ?? 'all'}
              options={AUTOPILOT_SUGGESTIONS_FILTER_OPTIONS}
              onChange={(value) => setFilters((current) => ({ ...current, status: value as AutopilotSuggestionStatus | 'all' }))}
            />
            <FilterSelect
              label="Project"
              value={filters.projectId ?? 'all'}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={(value) => setFilters((current) => ({ ...current, projectId: value }))}
            />
            <FilterSelect
              label="Source"
              value={filters.source ?? 'all'}
              options={AUTOPILOT_SUGGESTIONS_SOURCE_FILTER_OPTIONS}
              onChange={(value) => setFilters((current) => ({ ...current, source: value as AutopilotSuggestionSource | 'all' }))}
            />
            <FilterSelect
              label="Impact"
              value={filters.impact ?? 'all'}
              options={AUTOPILOT_SUGGESTIONS_IMPACT_FILTER_OPTIONS}
              onChange={(value) => setFilters((current) => ({ ...current, impact: value as AutopilotSuggestionImpact | 'all' }))}
            />
            <FilterSelect
              label="Risk"
              value={filters.risk ?? 'all'}
              options={AUTOPILOT_SUGGESTIONS_RISK_FILTER_OPTIONS}
              onChange={(value) => setFilters((current) => ({ ...current, risk: value as AutopilotSuggestionRisk | 'all' }))}
            />
          </div>
        </header>

        {suggestionsQuery.isLoading ? (
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-muted)]">
            Loading suggestions…
          </div>
        ) : rawSuggestions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-muted)]">
            {AUTOPILOT_SUGGESTIONS_EMPTY_COPY}
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-muted)]">
            No suggestions match the selected filters.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {suggestions.map((suggestion) => {
              const pendingId = actionMutation.variables?.id
              const actionPending = actionMutation.isPending && pendingId === suggestion.id
              const projectName = projectNameById.get(suggestion.projectId) ?? suggestion.projectId
              return (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  projectName={projectName}
                  actionPending={actionPending}
                  onAccept={() => actionMutation.mutate({ id: suggestion.id, action: 'accept' })}
                  onReject={() => actionMutation.mutate({ id: suggestion.id, action: 'reject' })}
                  onArchive={() => actionMutation.mutate({ id: suggestion.id, action: 'archive' })}
                  onConvert={() => actionMutation.mutate({ id: suggestion.id, action: 'convert' })}
                  onConvertPlan={() => actionMutation.mutate({ id: suggestion.id, action: 'convert-plan' })}
                  onConvertPlanBuild={() => actionMutation.mutate({ id: suggestion.id, action: 'convert-plan-build' })}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}


function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string | 'all') => void
}) {
  return (
    <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-sm normal-case tracking-normal text-[var(--theme-text)]"
      >
        <option value="all">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function SuggestionCard({
  suggestion,
  projectName,
  actionPending,
  onAccept,
  onReject,
  onArchive,
  onConvert,
  onConvertPlan,
  onConvertPlanBuild,
}: {
  suggestion: AutopilotSuggestionRecord
  projectName: string
  actionPending: boolean
  onAccept: () => void
  onReject: () => void
  onArchive: () => void
  onConvert: () => void
  onConvertPlan: () => void
  onConvertPlanBuild: () => void
}) {
  const recommendation = recommendAutopilotDelegationAction(suggestion, {
    buildAfterAcceptedPlan: true,
  })

  return (
    <article className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">{suggestion.title}</p>
        <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-0.5 text-[11px] text-[var(--theme-text)]">
          {AUTOPILOT_SUGGESTION_STATUS_LABELS[suggestion.status]}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--theme-muted)]">{projectName}</p>
      <p className="mt-3 text-sm text-[var(--theme-text)]">{suggestion.rationale}</p>
      <p className="mt-3 text-xs text-[var(--theme-muted)]">
        Evidence {suggestion.evidence.length} • {AUTOPILOT_SUGGESTION_IMPACT_LABELS[suggestion.impact]} •{' '}
        {AUTOPILOT_SUGGESTION_RISK_LABELS[suggestion.risk]} • {AUTOPILOT_SUGGESTION_EFFORT_LABELS[suggestion.effort]}
      </p>
      <p className="mt-1 text-xs text-[var(--theme-muted)]">
        Source: {AUTOPILOT_SUGGESTION_SOURCE_LABELS[suggestion.source]}
      </p>
      <div className="mt-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-xs text-[var(--theme-text)]">
        <p>
          Recommended: {formatRecommendedAction(recommendation.recommendedAction)} • Confidence:{' '}
          {recommendation.confidence} • Evidence quality: {recommendation.evidenceQuality}
        </p>
        <p className="mt-1 text-[var(--theme-muted)]">{recommendation.operatorCopy}</p>
        {recommendation.riskWarning ? (
          <p className="mt-1 text-amber-600">{recommendation.riskWarning}</p>
        ) : null}
        <p className="mt-1 text-[var(--theme-muted)]">{AUTOPILOT_SUGGESTION_DELEGATION_SAFETY_COPY}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={actionPending}
          onClick={onAccept}
          className="rounded-full border border-[var(--theme-border)] px-3 py-1 text-xs text-[var(--theme-text)]"
        >
          {AUTOPILOT_SUGGESTION_ACTION_LABELS.accept}
        </button>
        <button
          type="button"
          disabled={actionPending}
          onClick={onReject}
          className="rounded-full border border-[var(--theme-border)] px-3 py-1 text-xs text-[var(--theme-text)]"
        >
          {AUTOPILOT_SUGGESTION_ACTION_LABELS.reject}
        </button>
        <button
          type="button"
          disabled={actionPending}
          onClick={onArchive}
          className="rounded-full border border-[var(--theme-border)] px-3 py-1 text-xs text-[var(--theme-text)]"
        >
          {AUTOPILOT_SUGGESTION_ACTION_LABELS.archive}
        </button>
        <button
          type="button"
          disabled={actionPending}
          onClick={onConvert}
          className="rounded-full bg-[var(--theme-accent)] px-3 py-1 text-xs text-white"
        >
          {AUTOPILOT_SUGGESTION_CONVERT_BUTTON_LABEL}
        </button>
        <button
          type="button"
          disabled={actionPending}
          onClick={onConvertPlan}
          className="rounded-full bg-[var(--theme-accent)] px-3 py-1 text-xs text-white"
        >
          {AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUTTON_LABEL}
        </button>
        <button
          type="button"
          disabled={actionPending}
          onClick={onConvertPlanBuild}
          className="rounded-full border border-[var(--theme-accent)] px-3 py-1 text-xs text-[var(--theme-accent)]"
        >
          {AUTOPILOT_SUGGESTION_CONVERT_PLAN_BUILD_BUTTON_LABEL}
        </button>
        <Link
          to="/projects/$projectId"
          params={{ projectId: suggestion.projectId }}
          className="rounded-full border border-[var(--theme-border)] px-3 py-1 text-xs text-[var(--theme-text)]"
        >
          Open Project
        </Link>
      </div>
    </article>
  )
}
