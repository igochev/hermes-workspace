import {
  getMappedPhaseProfile,
  normalizePhaseProfiles,
  type ConductorPhaseProfiles,
  type ConductorPhaseKey,
} from '../lib/conductor-phase-profiles'
import { getProject, type ProjectRecord } from './projects-store'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem,
  type WorkItemPhase,
  type WorkItemRecord,
} from './work-items-store'
import {
  buildMissionLink,
  launchConductorMission,
  type ConductorLaunchResult,
} from './conductor-launch'

export type WorkItemLaunchRequest = {
  phase?: unknown
  orchestratorModel?: unknown
  workerModel?: unknown
  projectsDir?: unknown
  maxParallel?: unknown
  supervised?: unknown
  phaseProfiles?: unknown
}

export type WorkItemLaunchResponse = {
  workItem: WorkItemRecord
  project: ProjectRecord
  launch: ConductorLaunchResult & {
    phase: WorkItemPhase
    profile: string | null
  }
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLaunchPhase(value: unknown, fallback?: WorkItemPhase): WorkItemPhase {
  return value === 'research' || value === 'build' || value === 'review' || value === 'deploy'
    ? value
    : fallback ?? 'build'
}

function resolveLaunchProfile(
  workItem: WorkItemRecord,
  project: ProjectRecord,
  phase: WorkItemPhase,
  requestPhaseProfiles: ConductorPhaseProfiles,
): string | null {
  const explicit = readOptionalString(workItem.assignedProfile)
  if (explicit) return explicit

  const projectProfile = getMappedPhaseProfile(project.phaseProfiles, phase as ConductorPhaseKey)
  if (projectProfile) return projectProfile

  return getMappedPhaseProfile(requestPhaseProfiles, phase as ConductorPhaseKey)
}

function buildLaunchPhaseProfiles(params: {
  project: ProjectRecord
  requestPhaseProfiles: ConductorPhaseProfiles
  phase: WorkItemPhase
  profile: string | null
}): ConductorPhaseProfiles {
  const projectPhaseProfiles = normalizePhaseProfiles(params.project.phaseProfiles)
  const merged: ConductorPhaseProfiles = {
    ...params.requestPhaseProfiles,
    ...projectPhaseProfiles,
  }

  if (params.profile) {
    merged[params.phase as ConductorPhaseKey] = params.profile
  }

  return merged
}

function buildAcceptanceCriteriaBlock(workItem: WorkItemRecord): string[] {
  if (workItem.acceptanceCriteria.length === 0) return ['Acceptance criteria: none recorded.']
  return ['Acceptance criteria:', ...workItem.acceptanceCriteria.map((item) => `- ${item}`)]
}

function buildNotesBlock(workItem: WorkItemRecord): string[] {
  if (workItem.notes.length === 0) return []
  return ['Operator notes:', ...workItem.notes.map((item) => `- ${item}`)]
}

function buildPhaseOutcomeBlock(phase: WorkItemPhase): string[] {
  if (phase === 'research') {
    return [
      'Primary outcome for this research/planning launch:',
      '- turn the idea/request into a grounded plan',
      '- draft acceptance criteria',
      '- identify open questions, constraints, and recommended next build slice',
      '- If acceptance criteria are incomplete, propose them explicitly in the output',
    ]
  }

  return [
    'Primary outcome for this launch:',
    '- execute the requested phase with concrete repo-grounded outputs',
  ]
}

export function buildWorkItemLaunchGoal(params: {
  workItem: WorkItemRecord
  project: ProjectRecord
  phase: WorkItemPhase
  profile: string | null
}): string {
  const { workItem, project, phase, profile } = params
  const repoPath = readOptionalString(workItem.repoPathSnapshot) || project.repoPath
  return [
    `Execute Mission Control work item \"${workItem.title}\" for project \"${project.name}\".`,
    `Work item ID: ${workItem.id}`,
    `Launch phase: ${phase}`,
    `Repository path: ${repoPath}`,
    ...(project.defaultBranch ? [`Default branch: ${project.defaultBranch}`] : []),
    ...(project.repoUrl ? [`Repository URL: ${project.repoUrl}`] : []),
    ...(profile ? [`Preferred Hermes profile for this phase: ${profile}`] : []),
    '',
    'Description:',
    workItem.description || 'No additional description provided.',
    '',
    ...buildPhaseOutcomeBlock(phase),
    '',
    ...buildAcceptanceCriteriaBlock(workItem),
    ...(workItem.notes.length > 0 ? ['', ...buildNotesBlock(workItem)] : []),
    '',
    'Treat this as a tracked Mission Control launch. Keep the repo path grounded, produce concrete outputs, and reference the work item ID in summaries.',
  ].join('\n')
}

export async function launchWorkItemIntoConductor(
  workItemId: string,
  request: WorkItemLaunchRequest,
): Promise<WorkItemLaunchResponse> {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')

  const project = getProject(workItem.projectId)
  if (!project) throw new Error('Project not found')
  if (!readOptionalString(workItem.repoPathSnapshot) && !readOptionalString(project.repoPath)) {
    throw new Error('Project repoPath is required before launching work')
  }

  const requestPhaseProfiles = normalizePhaseProfiles(request.phaseProfiles)
  const phase = normalizeLaunchPhase(request.phase, workItem.phase)
  const profile = resolveLaunchProfile(workItem, project, phase, requestPhaseProfiles)
  const goal = buildWorkItemLaunchGoal({ workItem, project, phase, profile })
  const launchPhaseProfiles = buildLaunchPhaseProfiles({
    project,
    requestPhaseProfiles,
    phase,
    profile,
  })

  const launch = await launchConductorMission({
    goal,
    orchestratorModel: readOptionalString(request.orchestratorModel),
    workerModel: readOptionalString(request.workerModel),
    projectsDir: readOptionalString(request.projectsDir),
    maxParallel:
      typeof request.maxParallel === 'number' && Number.isFinite(request.maxParallel)
        ? request.maxParallel
        : undefined,
    supervised: request.supervised === true,
    phaseProfiles: launchPhaseProfiles,
    name: `work-item-${phase}-${project.slug}-${workItem.id.slice(0, 8)}`,
    deliver: 'local',
  })

  const sessionKeys = Array.from(new Set([...workItem.sessionKeys, launch.sessionKey]))
  const missionLink = buildMissionLink(launch.jobId)
  const nextWorkItem = updateWorkItem(workItem.id, {
    status: 'active',
    phase,
    missionId: launch.jobId,
    missionJobId: launch.jobId,
    missionJobName: launch.jobName,
    missionSessionKeyPrefix: launch.sessionKeyPrefix,
    missionLink,
    missionState: 'scheduled',
    sessionKeys,
    repoPathSnapshot: readOptionalString(workItem.repoPathSnapshot) || project.repoPath,
  })

  if (!nextWorkItem) throw new Error('Failed to update work item after launch')

  const note = profile
    ? `Launched ${phase} via Conductor using profile ${profile}.`
    : `Launched ${phase} via Conductor.`

  const updatedWithHistory = appendWorkItemHistoryEntry(workItem.id, {
    action: 'launch',
    phase,
    status: 'active',
    note,
    missionId: launch.jobId,
    sessionKey: launch.sessionKey,
    sessionKeyPrefix: launch.sessionKeyPrefix,
    profile: profile ?? undefined,
  })

  if (!updatedWithHistory) throw new Error('Failed to record work item launch history')

  return {
    workItem: updatedWithHistory,
    project,
    launch: {
      ...launch,
      phase,
      profile,
    },
  }
}
