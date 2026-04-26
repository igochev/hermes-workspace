import type { ProjectRecord, WorkItemPhase, WorkItemRecord } from './projects-api'
import type { LaunchCapacityDecision } from '../server/role-capacity-policy'

const WORK_ITEMS_BASE = '/api/work-items'

export type WorkItemLaunchRequest = {
  phase?: 'research' | 'build' | 'review' | 'deploy'
  orchestratorModel?: string
  workerModel?: string
  projectsDir?: string
  maxParallel?: number
  supervised?: boolean
  phaseProfiles?: Record<'research' | 'build' | 'review' | 'deploy', string>
}

export type WorkItemLaunchResponse = {
  workItem: WorkItemRecord
  project: ProjectRecord
  capacityDecision: LaunchCapacityDecision
  launch: {
    ok: true
    sessionKey: string
    sessionKeyPrefix: string
    jobId: string
    jobName: string
    runId: null
    phase: WorkItemPhase
    profile: string | null
  }
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const message =
    typeof body?.error === 'string'
      ? body.error
      : typeof body?.detail === 'string'
        ? body.detail
        : fallback
  return new Error(message)
}

export async function launchWorkItem(
  workItemId: string,
  input: WorkItemLaunchRequest,
): Promise<WorkItemLaunchResponse> {
  const response = await fetch(`${WORK_ITEMS_BASE}/${workItemId}/launch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await readError(response, `Failed to launch work item: ${response.status}`)
  return readJson<WorkItemLaunchResponse>(response)
}
