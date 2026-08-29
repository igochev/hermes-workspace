import type {
  ExecutionRunRecord,
  ExecutionRunState,
} from '../../server/execution-runs-store'
import type { WorkItemPhase } from '../../server/work-items-store'

export type ExecutionsFilters = {
  jobId?: string
  workItemId?: string
  projectId?: string
  state?: ExecutionRunState
  phase?: WorkItemPhase
  q?: string
}

export type ExecutionsRouteInput = {
  params?: Record<string, unknown>
  search?: Record<string, unknown>
}

export type ParsedExecutionsRouteInput = {
  executionId?: string
  filters: ExecutionsFilters
}

const VALID_STATES: ReadonlyArray<ExecutionRunState> = [
  'queued',
  'scheduled',
  'running',
  'succeeded',
  'failed',
  'stale',
  'unknown',
]
const VALID_PHASES: ReadonlyArray<WorkItemPhase> = [
  'research',
  'build',
  'review',
  'deploy',
]

function optionalString(value: unknown): string | undefined {
  if (Array.isArray(value)) return optionalString(value[0])
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined
}

function optionalState(value: unknown): ExecutionRunState | undefined {
  const normalized = optionalString(value)
  return VALID_STATES.includes(normalized as ExecutionRunState)
    ? (normalized as ExecutionRunState)
    : undefined
}

function optionalPhase(value: unknown): WorkItemPhase | undefined {
  const normalized = optionalString(value)
  return VALID_PHASES.includes(normalized as WorkItemPhase)
    ? (normalized as WorkItemPhase)
    : undefined
}

export function parseExecutionsRouteInput(
  input: ExecutionsRouteInput,
): ParsedExecutionsRouteInput {
  const search = input.search ?? {}
  return {
    executionId: optionalString(input.params?.executionId),
    filters: {
      jobId: optionalString(search.jobId),
      workItemId: optionalString(search.workItemId),
      projectId: optionalString(search.projectId),
      state: optionalState(search.state),
      phase: optionalPhase(search.phase),
      q: optionalString(search.q),
    },
  }
}

export type ExecutionListItemViewModel = ExecutionRunRecord & {
  href: string
}

export type ExecutionsViewModel = {
  filters: ExecutionsFilters
  runs: Array<ExecutionListItemViewModel>
}

function includesText(value: string | undefined, query: string): boolean {
  return Boolean(value?.toLowerCase().includes(query))
}

function matchesSearch(
  run: ExecutionRunRecord,
  query: string | undefined,
): boolean {
  if (!query) return true
  const normalized = query.toLowerCase()
  return [
    run.id,
    run.jobId,
    run.jobName,
    run.runId,
    run.sessionKey,
    run.sessionKeyPrefix,
    run.workItemId,
    run.projectId,
  ].some((value) => includesText(value, normalized))
}

function observedTimestamp(run: ExecutionRunRecord): string {
  return run.lastObservedAt || run.updatedAt || run.createdAt
}

export function buildExecutionsViewModel(
  runs: Array<ExecutionRunRecord>,
  input: { filters?: ExecutionsFilters } = {},
): ExecutionsViewModel {
  const filters = input.filters ?? {}
  const filteredRuns = runs
    .filter((run) => (filters.jobId ? run.jobId === filters.jobId : true))
    .filter((run) =>
      filters.workItemId ? run.workItemId === filters.workItemId : true,
    )
    .filter((run) =>
      filters.projectId ? run.projectId === filters.projectId : true,
    )
    .filter((run) => (filters.state ? run.state === filters.state : true))
    .filter((run) => (filters.phase ? run.phase === filters.phase : true))
    .filter((run) => matchesSearch(run, filters.q))
    .sort((a, b) => observedTimestamp(b).localeCompare(observedTimestamp(a)))
    .map((run) => ({
      ...run,
      href: `/executions/${encodeURIComponent(run.id)}`,
    }))

  return {
    filters,
    runs: filteredRuns,
  }
}
