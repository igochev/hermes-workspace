import { createFileRoute } from '@tanstack/react-router'

import { isAuthenticated } from '../../server/auth-middleware'
import { listExecutionRuns } from '../../server/execution-runs-store'
import type {
  ExecutionRunRole,
  ExecutionRunState,
  ListExecutionRunsFilters,
} from '../../server/execution-runs-store'
import type { WorkItemPhase } from '../../server/work-items-store'

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function optionalParam(url: URL, name: string): string | undefined {
  const value = url.searchParams.get(name)?.trim()
  return value ? value : undefined
}

function isExecutionRunState(
  value: string | undefined,
): value is ExecutionRunState {
  return (
    value === 'scheduled' ||
    value === 'running' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'stale' ||
    value === 'unknown'
  )
}

function isExecutionRunRole(
  value: string | undefined,
): value is ExecutionRunRole {
  return value === 'mission' || value === 'review' || value === 'supervisor'
}

function isWorkItemPhase(value: string | undefined): value is WorkItemPhase {
  return (
    value === 'research' ||
    value === 'build' ||
    value === 'review' ||
    value === 'deploy'
  )
}

function buildFilters(request: Request): ListExecutionRunsFilters {
  const url = new URL(request.url)
  const state = optionalParam(url, 'state')
  const phase = optionalParam(url, 'phase')
  const role = optionalParam(url, 'role')
  return {
    workItemId: optionalParam(url, 'workItemId'),
    projectId: optionalParam(url, 'projectId'),
    state: isExecutionRunState(state) ? state : undefined,
    phase: isWorkItemPhase(phase) ? phase : undefined,
    role: isExecutionRunRole(role) ? role : undefined,
    jobId: optionalParam(url, 'jobId'),
    q: optionalParam(url, 'q'),
  }
}

function buildLegacyLookup(
  filters: ListExecutionRunsFilters,
  runCount: number,
) {
  if (!filters.jobId || runCount > 0) return null
  return {
    status: 'no_durable_run',
    jobId: filters.jobId,
    projectId: filters.projectId,
    workItemId: filters.workItemId,
    message: `Scheduled job ${filters.jobId} was referenced by a work item, but no durable execution run record exists yet.`,
  }
}

export const Route = createFileRoute('/api/execution-runs')({
  server: {
    handlers: {
      GET: ({ request }) => {
        if (!isAuthenticated(request)) {
          return jsonResponse({ error: 'Unauthorized' }, 401)
        }

        const filters = buildFilters(request)
        const runs = listExecutionRuns(filters)
        return jsonResponse({
          runs,
          filters,
          legacyLookup: buildLegacyLookup(filters, runs.length),
        })
      },
    },
  },
})
