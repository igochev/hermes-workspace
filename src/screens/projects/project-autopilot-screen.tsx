'use client'

import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { fetchAutopilotSuggestions } from '@/lib/autopilot-suggestions-api'
import {
  disableProjectAutopilotSchedule,
  fetchProjectAutopilotSchedule,
  PROJECT_AUTOPILOT_SCHEDULE_PRESET_LABELS,
  PROJECT_AUTOPILOT_SCOUT_SOURCE_LABELS,
  saveProjectAutopilotSchedule,
} from '@/lib/project-autopilot-api'
import { fetchProject } from '@/lib/projects-api'

export const PROJECT_AUTOPILOT_SAFETY_COPY =
  'Autopilot is suggestions only — no direct code changes, commits, branches, PRs, or automatic work-item creation.'
export const PROJECT_AUTOPILOT_DELEGATION_POLICY_COPY =
  'Delegation policy: Convert + Plan may request Planner enrichment; Build Queued waits for an accepted planner draft. No code is launched until policy/operator conditions are met.'
export const PROJECT_AUTOPILOT_SAVE_BUTTON_LABEL = 'Save Autopilot Schedule'
export const PROJECT_AUTOPILOT_SCHEDULE_OPTIONS = [
  ['manual', 'Manual'],
  ['daily', 'Daily (9:00)'],
  ['weekly', 'Weekly (Monday 9:00)'],
] as const
export const PROJECT_AUTOPILOT_SCOUT_SOURCES = [
  'repo-health-scout',
  'failing-tests-scout',
  'stale-docs-scout',
  'ux-friction-scout',
  'dependency-api-scout',
  'architecture-debt-scout',
] as const

export function ProjectAutopilotScreen({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()

  const projectQuery = useQuery({
    queryKey: ['mission-control', 'project', projectId],
    queryFn: () => fetchProject(projectId),
  })

  const scheduleQuery = useQuery({
    queryKey: ['mission-control', 'project-autopilot-schedule', projectId],
    queryFn: () => fetchProjectAutopilotSchedule(projectId),
  })

  const suggestionsQuery = useQuery({
    queryKey: ['mission-control', 'autopilot-suggestions', projectId],
    queryFn: () => fetchAutopilotSuggestions({ projectId }),
    refetchInterval: 30_000,
  })

  const autopilotPolicy = scheduleQuery.data?.autopilotPolicy
  const [schedulePreset, setSchedulePreset] = useState<'manual' | 'daily' | 'weekly'>('manual')
  const [suggestionLimit, setSuggestionLimit] = useState('5')
  const [scoutProfile, setScoutProfile] = useState('')
  const [sources, setSources] = useState<Array<string>>([...PROJECT_AUTOPILOT_SCOUT_SOURCES.slice(0, 3)])

  useEffect(() => {
    if (!autopilotPolicy) return
    setSchedulePreset(autopilotPolicy.schedulePreset)
    setSuggestionLimit(String(autopilotPolicy.suggestionLimit))
    setScoutProfile(autopilotPolicy.scoutProfile ?? '')
    setSources(autopilotPolicy.scoutSources)
  }, [autopilotPolicy])

  const saveMutation = useMutation({
    mutationFn: () =>
      saveProjectAutopilotSchedule(projectId, {
        schedulePreset,
        suggestionLimit: Number.isFinite(Number(suggestionLimit)) ? Number(suggestionLimit) : 5,
        scoutProfile: scoutProfile.trim() || undefined,
        scoutSources: sources,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mission-control', 'project-autopilot-schedule', projectId],
      })
      toast('Autopilot schedule saved')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to save autopilot schedule', {
        type: 'error',
      })
    },
  })

  const disableMutation = useMutation({
    mutationFn: () => disableProjectAutopilotSchedule(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mission-control', 'project-autopilot-schedule', projectId],
      })
      toast('Autopilot schedule disabled')
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to disable autopilot schedule', {
        type: 'error',
      })
    },
  })

  const projectName = projectQuery.data?.project?.name ?? projectId
  const suggestions = suggestionsQuery.data ?? []

  return (
    <div className="min-h-full bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <Link to="/projects/$projectId" params={{ projectId }} className="text-xs text-[var(--theme-muted)]">
            ← Back to Project
          </Link>
          <h1 className="mt-2 text-2xl font-medium text-ink">{projectName} — Autopilot</h1>
          <p className="mt-2 text-sm text-[var(--theme-muted)]">{PROJECT_AUTOPILOT_SAFETY_COPY}</p>
          <p className="mt-2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-xs text-[var(--theme-text)]">
            {PROJECT_AUTOPILOT_DELEGATION_POLICY_COPY}
          </p>
        </header>

        <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Schedule policy</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                Schedule
              </label>
              <select
                value={schedulePreset}
                onChange={(event) => setSchedulePreset(event.target.value as 'manual' | 'daily' | 'weekly')}
                className="mt-1 w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2 text-sm text-[var(--theme-text)]"
              >
                {PROJECT_AUTOPILOT_SCHEDULE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                Suggestion limit
              </label>
              <Input
                nativeInput
                value={suggestionLimit}
                onChange={(event) => setSuggestionLimit(event.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                Scout profile (optional)
              </label>
              <Input
                nativeInput
                value={scoutProfile}
                onChange={(event) => setScoutProfile(event.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                Scout sources
              </p>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {PROJECT_AUTOPILOT_SCOUT_SOURCES.map((source) => (
                  <label key={source} className="inline-flex items-center gap-2 text-sm text-[var(--theme-text)]">
                    <input
                      type="checkbox"
                      checked={sources.includes(source)}
                      onChange={(event) => {
                        setSources((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, source]))
                            : current.filter((item) => item !== source),
                        )
                      }}
                    />
                    {PROJECT_AUTOPILOT_SCOUT_SOURCE_LABELS[source]}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="rounded-lg bg-[var(--theme-accent)] px-4 py-2 text-sm text-white"
            >
              {PROJECT_AUTOPILOT_SAVE_BUTTON_LABEL}
            </button>
            <button
              type="button"
              onClick={() => disableMutation.mutate()}
              disabled={disableMutation.isPending}
              className="rounded-lg border border-[var(--theme-border)] px-4 py-2 text-sm text-[var(--theme-text)]"
            >
              Disable schedule
            </button>
          </div>

          {autopilotPolicy ? (
            <p className="mt-3 text-xs text-[var(--theme-muted)]">
              Current: {PROJECT_AUTOPILOT_SCHEDULE_PRESET_LABELS[autopilotPolicy.schedulePreset]}
              {autopilotPolicy.jobId ? ` • Job ${autopilotPolicy.jobId}` : ''}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-ink">Project suggestions</h2>
          {suggestions.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--theme-muted)]">No suggestions yet for this project.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                  <p className="text-sm font-medium text-ink">{suggestion.title}</p>
                  <p className="mt-1 text-xs text-[var(--theme-muted)]">{suggestion.status} • {suggestion.source}</p>
                  <p className="mt-1 text-xs text-[var(--theme-text)]">Convert + Plan is available from the global suggestions inbox.</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
