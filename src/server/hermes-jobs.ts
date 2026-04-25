import { type CronRun } from '../components/cron-manager/cron-types'
import {
  BEARER_TOKEN,
  dashboardFetch,
  ensureGatewayProbed,
  HERMES_API,
} from './gateway-capabilities'
import { getCronJobs, getCronRuns, type CronJob } from './hermes-dashboard-api'

export type HermesJobInfo = Pick<
  CronJob,
  'id' | 'name' | 'state' | 'last_run_at' | 'last_status' | 'last_error' | 'next_run_at'
>

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

async function parseJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text || fallbackError)
  }

  if (!text.trim()) {
    return {} as T
  }

  return JSON.parse(text) as T
}

export async function listHermesJobs(): Promise<Array<HermesJobInfo>> {
  const jobs = await getCronJobs()
  return jobs.map((job) => ({
    id: job.id,
    name: job.name ?? job.id,
    state: job.state ?? 'unknown',
    last_run_at: job.last_run_at ?? null,
    last_status: (job as CronJob & { last_status?: string | null }).last_status ?? null,
    last_error: job.last_error ?? null,
    next_run_at: job.next_run_at ?? null,
  }))
}

export async function getHermesJobById(jobId: string): Promise<HermesJobInfo | null> {
  const jobs = await listHermesJobs()
  return jobs.find((job) => job.id === jobId) ?? null
}

export async function getHermesJobRuns(jobId: string): Promise<Array<CronRun>> {
  return getCronRuns(jobId)
}

export async function createHermesJob(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const capabilities = await ensureGatewayProbed()
  if (!capabilities.jobs) {
    throw new Error('Gateway does not support jobs API')
  }

  if (capabilities.dashboard.available) {
    const res = await dashboardFetch('/api/cron/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return parseJsonResponse(res, 'Failed to create Hermes dashboard cron job')
  }

  const res = await fetch(`${HERMES_API}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  })

  return parseJsonResponse(res, 'Failed to create Hermes job')
}

export async function updateHermesJob(
  jobId: string,
  updates: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const capabilities = await ensureGatewayProbed()
  if (!capabilities.jobs) {
    throw new Error('Gateway does not support jobs API')
  }

  if (capabilities.dashboard.available) {
    const res = await dashboardFetch(`/api/cron/jobs/${encodeURIComponent(jobId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    })
    return parseJsonResponse(res, 'Failed to update Hermes dashboard cron job')
  }

  const res = await fetch(`${HERMES_API}/api/jobs/${encodeURIComponent(jobId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  })

  return parseJsonResponse(res, 'Failed to update Hermes job')
}

export async function pauseHermesJob(jobId: string): Promise<Record<string, unknown>> {
  const capabilities = await ensureGatewayProbed()
  if (!capabilities.jobs) {
    throw new Error('Gateway does not support jobs API')
  }

  if (capabilities.dashboard.available) {
    const res = await dashboardFetch(`/api/cron/jobs/${encodeURIComponent(jobId)}/pause`, {
      method: 'POST',
    })
    return parseJsonResponse(res, 'Failed to pause Hermes dashboard cron job')
  }

  const res = await fetch(`${HERMES_API}/api/jobs/${encodeURIComponent(jobId)}/pause`, {
    method: 'POST',
    headers: authHeaders(),
  })

  return parseJsonResponse(res, 'Failed to pause Hermes job')
}

export async function resumeHermesJob(jobId: string): Promise<Record<string, unknown>> {
  const capabilities = await ensureGatewayProbed()
  if (!capabilities.jobs) {
    throw new Error('Gateway does not support jobs API')
  }

  if (capabilities.dashboard.available) {
    const res = await dashboardFetch(`/api/cron/jobs/${encodeURIComponent(jobId)}/resume`, {
      method: 'POST',
    })
    return parseJsonResponse(res, 'Failed to resume Hermes dashboard cron job')
  }

  const res = await fetch(`${HERMES_API}/api/jobs/${encodeURIComponent(jobId)}/resume`, {
    method: 'POST',
    headers: authHeaders(),
  })

  return parseJsonResponse(res, 'Failed to resume Hermes job')
}
