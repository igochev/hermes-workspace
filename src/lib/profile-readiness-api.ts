import type { ProfileReadinessReport } from '../server/profile-readiness'

export type ProjectProfileReadinessResponse = {
  ok: true
  projectId: string
  workItemId?: string
  profileDiscoveryAvailable: boolean
  profileDiscoveryError?: string
  report: ProfileReadinessReport
}

export async function fetchProjectProfileReadiness(
  projectId: string,
  workItemId?: string,
): Promise<ProjectProfileReadinessResponse> {
  const params = new URLSearchParams()
  if (workItemId) params.set('workItemId', workItemId)
  const query = params.toString()
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/profile-readiness${query ? `?${query}` : ''}`,
  )
  const payload = (await response.json().catch(() => ({}))) as Partial<ProjectProfileReadinessResponse> & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Failed to fetch profile readiness (${response.status})`)
  }

  if (!payload.report) {
    throw new Error('Profile readiness response did not include a report')
  }

  return {
    ok: true,
    projectId: payload.projectId ?? projectId,
    workItemId: payload.workItemId,
    profileDiscoveryAvailable: payload.profileDiscoveryAvailable ?? false,
    profileDiscoveryError: payload.profileDiscoveryError,
    report: payload.report,
  }
}
