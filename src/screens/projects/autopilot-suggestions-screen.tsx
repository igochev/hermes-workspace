'use client'

import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/toast'
import { fetchProjects } from '@/lib/projects-api'
import {
  acceptAutopilotSuggestion,
  archiveAutopilotSuggestion,
  AUTOPILOT_SUGGESTION_EFFORT_LABELS,
  AUTOPILOT_SUGGESTION_IMPACT_LABELS,
  AUTOPILOT_SUGGESTION_RISK_LABELS,
  AUTOPILOT_SUGGESTION_SOURCE_LABELS,
  AUTOPILOT_SUGGESTION_STATUS_LABELS,
  convertAutopilotSuggestion,
  fetchAutopilotSuggestions,
  rejectAutopilotSuggestion,
  type AutopilotSuggestionRecord,
  type AutopilotSuggestionStatus,
} from '@/lib/autopilot-suggestions-api'

export const AUTOPILOT_SUGGESTIONS_QUERY_KEY = ['mission-control', 'autopilot-suggestions'] as const
export const AUTOPILOT_SUGGESTIONS_EMPTY_COPY =
  'No autopilot suggestions yet. Run a scout or create a manual suggestion to seed the inbox.'
export const AUTOPILOT_SUGGESTION_CONVERT_BUTTON_LABEL = 'Convert to Work Item'
export const AUTOPILOT_SUGGESTION_ACTION_LABELS = {
  accept: 'Accept',
  reject: 'Reject',
  archive: 'Archive',
} as const
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

export function AutopilotSuggestionsScreen() {
  const queryClient = useQueryClient()

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
      action: 'accept' | 'reject' | 'archive' | 'convert'
    }) => {
      if (action === 'accept') return acceptAutopilotSuggestion(id)
      if (action === 'reject') return rejectAutopilotSuggestion(id, 'Operator triage rejection')
      if (action === 'archive') return archiveAutopilotSuggestion(id)
      return convertAutopilotSuggestion(id)
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

  const suggestions = suggestionsQuery.data ?? []
  const projects = projectsQuery.data ?? []
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
          <div className="mt-4 flex flex-wrap gap-2">
            {AUTOPILOT_SUGGESTIONS_FILTER_OPTIONS.map((option) => (
              <span
                key={option.value}
                className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-1 text-[11px] text-[var(--theme-muted)]"
              >
                {option.label}
              </span>
            ))}
          </div>
        </header>

        {suggestionsQuery.isLoading ? (
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-muted)]">
            Loading suggestions…
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-muted)]">
            {AUTOPILOT_SUGGESTIONS_EMPTY_COPY}
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
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
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
}: {
  suggestion: AutopilotSuggestionRecord
  projectName: string
  actionPending: boolean
  onAccept: () => void
  onReject: () => void
  onArchive: () => void
  onConvert: () => void
}) {
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
