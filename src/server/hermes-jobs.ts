import { getCronJobs, type CronJob } from './hermes-dashboard-api'

export type HermesJobInfo = Pick<
  CronJob,
  'id' | 'name' | 'state' | 'last_run_at' | 'last_status' | 'last_error' | 'next_run_at'
>

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
