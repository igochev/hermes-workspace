import type {
  ProjectAutopilotPolicy,
  ProjectAutopilotSchedulePreset,
  ProjectAutopilotScoutSource,
} from './projects-api'

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const message = typeof body?.error === 'string' ? body.error : fallback
  return new Error(message)
}

export async function fetchProjectAutopilotSchedule(projectId: string): Promise<{
  projectId: string
  autopilotPolicy: ProjectAutopilotPolicy
}> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/autopilot-schedule`)
  if (!response.ok) {
    throw await readError(response, `Failed to fetch project autopilot schedule: ${response.status}`)
  }
  return readJson(response)
}

export async function saveProjectAutopilotSchedule(
  projectId: string,
  autopilotPolicy: Partial<
    Pick<
      ProjectAutopilotPolicy,
      'schedulePreset' | 'scoutProfile' | 'suggestionLimit' | 'scoutSources'
    >
  >,
): Promise<{ projectId: string; autopilotPolicy: ProjectAutopilotPolicy; schedule: string | null }> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/autopilot-schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ autopilotPolicy }),
  })

  if (!response.ok) {
    throw await readError(response, `Failed to save project autopilot schedule: ${response.status}`)
  }

  return readJson(response)
}

export async function disableProjectAutopilotSchedule(projectId: string): Promise<{
  projectId: string
  autopilotPolicy: ProjectAutopilotPolicy
}> {
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/autopilot-schedule`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw await readError(response, `Failed to disable project autopilot schedule: ${response.status}`)
  }

  return readJson(response)
}

export const PROJECT_AUTOPILOT_SCHEDULE_PRESET_LABELS: Record<ProjectAutopilotSchedulePreset, string> = {
  manual: 'Manual',
  daily: 'Daily (9:00)',
  weekly: 'Weekly (Monday 9:00)',
}

export const PROJECT_AUTOPILOT_SCOUT_SOURCE_LABELS: Record<ProjectAutopilotScoutSource, string> = {
  manual: 'Manual',
  autopilot: 'Autopilot',
  'repo-health-scout': 'Repo health scout',
  'failing-tests-scout': 'Failing tests scout',
  'stale-docs-scout': 'Stale docs scout',
  'ux-friction-scout': 'UX friction scout',
  'dependency-api-scout': 'Dependency/API scout',
  'architecture-debt-scout': 'Architecture debt scout',
}
