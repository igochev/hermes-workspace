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
