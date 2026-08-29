'use client'

import { Link, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import {
  buildExecutionsViewModel,
  parseExecutionsRouteInput,
} from './executions-view-model'
import type { ExecutionsFilters } from './executions-view-model'
import type { ExecutionRunRecord } from '../../server/execution-runs-store'

export const EXECUTIONS_SCREEN_TITLE = 'Executions'
export const EXECUTIONS_SCREEN_HELP_COPY =
  'Work-item execution attempts for Planner, Builder, Reviewer, and Merge-Healer.'
export const EXECUTIONS_SCREEN_SEARCH_PLACEHOLDER =
  'Search execution, session, work item, or legacy job...'
export const EXECUTIONS_NAVIGATION_COPY = 'Executions'
export const EXECUTIONS_DEFINITIONS_LINK_COPY = 'Open reusable job definitions'
export const EXECUTIONS_LEGACY_NO_RECORD_TITLE =
  'Execution trace not yet recorded'

export type LegacyExecutionLookup = {
  status: 'no_durable_run'
  jobId: string
  projectId?: string
  workItemId?: string
  message: string
}

export type ExecutionsApiResponse = {
  runs: Array<ExecutionRunRecord>
  filters: ExecutionsFilters
  legacyLookup: LegacyExecutionLookup | null
}

export type ExecutionsScreenLegacyLanding = {
  title: string
  message: string
  workItemHref: string | null
}

export type ExecutionsScreenViewModel = ReturnType<
  typeof buildExecutionsViewModel
> & {
  legacyLanding: ExecutionsScreenLegacyLanding | null
}

export function buildExecutionsScreenViewModel(
  runs: Array<ExecutionRunRecord>,
  input: {
    filters?: ExecutionsFilters
    legacyLookup?: LegacyExecutionLookup | null
  } = {},
): ExecutionsScreenViewModel {
  const base = buildExecutionsViewModel(runs, { filters: input.filters })
  const legacyLookup = input.legacyLookup ?? null
  return {
    ...base,
    legacyLanding:
      legacyLookup && base.runs.length === 0
        ? {
            title: EXECUTIONS_LEGACY_NO_RECORD_TITLE,
            message:
              legacyLookup.workItemId && !legacyLookup.projectId
                ? `${legacyLookup.message} Project context is required to open the Work Item from this legacy trace.`
                : legacyLookup.message,
            workItemHref:
              legacyLookup.projectId && legacyLookup.workItemId
                ? `/projects/${encodeURIComponent(legacyLookup.projectId)}/work-items/${encodeURIComponent(legacyLookup.workItemId)}`
                : null,
          }
        : null,
  }
}

function buildExecutionRunsApiUrl(filters: ExecutionsFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return search ? `/api/execution-runs?${search}` : '/api/execution-runs'
}

async function fetchExecutionRuns(
  filters: ExecutionsFilters,
): Promise<ExecutionsApiResponse> {
  const res = await fetch(buildExecutionRunsApiUrl(filters))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as Partial<ExecutionsApiResponse>
  return {
    runs: Array.isArray(data.runs) ? data.runs : [],
    filters: data.filters ?? filters,
    legacyLookup: data.legacyLookup ?? null,
  }
}

function formatDate(value: string | undefined): string {
  if (!value) return 'Unknown'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function label(value: string | undefined): string {
  return value && value.trim().length > 0 ? value : '—'
}

export function ExecutionsScreen() {
  const location = useRouterState({ select: (state) => state.location })
  const parsed = parseExecutionsRouteInput({
    search: location.search as Record<string, unknown>,
  })
  const filters = parsed.filters
  const query = useQuery({
    queryKey: ['mission-control', 'executions', filters],
    queryFn: () => fetchExecutionRuns(filters),
    staleTime: 10_000,
  })
  const data = query.data ?? { runs: [], filters, legacyLookup: null }
  const viewModel = buildExecutionsScreenViewModel(data.runs, {
    filters: data.filters,
    legacyLookup: data.legacyLookup,
  })

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 text-[var(--theme-text)] sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
              Mission Control
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {EXECUTIONS_SCREEN_TITLE}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--theme-muted)]">
              {EXECUTIONS_SCREEN_HELP_COPY}
            </p>
          </div>
          <Link
            to="/jobs"
            className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
          >
            {EXECUTIONS_DEFINITIONS_LINK_COPY}
          </Link>
        </div>
      </header>

      <div className="grid gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 md:grid-cols-[1fr_auto_auto]">
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--theme-muted)]">
          Search
          <input
            disabled
            value={filters.q ?? filters.jobId ?? ''}
            placeholder={EXECUTIONS_SCREEN_SEARCH_PLACEHOLDER}
            className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--theme-muted)]">
          State
          <select
            disabled
            value={filters.state ?? ''}
            className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)]"
          >
            <option value="">Any state</option>
            <option value="queued">Queued</option>
            <option value="scheduled">Legacy scheduled</option>
            <option value="running">Running</option>
            <option value="succeeded">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="stale">Stale</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--theme-muted)]">
          Phase
          <select
            disabled
            value={filters.phase ?? ''}
            className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)]"
          >
            <option value="">Any phase</option>
            <option value="research">Research</option>
            <option value="build">Build</option>
            <option value="review">Review</option>
            <option value="deploy">Deploy</option>
          </select>
        </label>
      </div>

      {query.isLoading ? (
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-muted)]">
          Loading executions…
        </div>
      ) : query.isError ? (
        <div className="rounded-2xl border border-[var(--theme-danger)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-text)]">
          Failed to load executions:{' '}
          {query.error instanceof Error ? query.error.message : 'Unknown error'}
        </div>
      ) : viewModel.legacyLanding ? (
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5">
          <h2 className="text-xl font-semibold">
            {viewModel.legacyLanding.title}
          </h2>
          <p className="mt-2 text-sm text-[var(--theme-muted)]">
            {viewModel.legacyLanding.message}
          </p>
          {viewModel.legacyLanding.workItemHref ? (
            <a
              href={viewModel.legacyLanding.workItemHref}
              className="mt-4 inline-flex rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm text-[var(--theme-text)]"
            >
              Open Work Item
            </a>
          ) : null}
        </div>
      ) : viewModel.runs.length === 0 ? (
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-muted)]">
          No execution attempts match these filters yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {viewModel.runs.map((run) => (
            <Link
              key={run.id}
              to="/executions/$executionId"
              params={{ executionId: run.id }}
              className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 transition hover:border-[var(--theme-accent)]"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--theme-muted)]">
                    <span>{label(run.phase)}</span>
                    <span>·</span>
                    <span>{run.role}</span>
                    <span>·</span>
                    <span>{run.state}</span>
                  </div>
                  <h2 className="mt-2 text-lg font-semibold">
                    {run.jobName ?? run.id}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--theme-muted)]">
                    Work item {run.workItemId} · Job {run.jobId}
                  </p>
                </div>
                <div className="text-left text-xs text-[var(--theme-muted)] md:text-right">
                  <div>Last observed</div>
                  <div className="text-sm text-[var(--theme-text)]">
                    {formatDate(run.lastObservedAt)}
                  </div>
                  <div className="mt-2">
                    Session {label(run.sessionKeyPrefix ?? run.sessionKey)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
