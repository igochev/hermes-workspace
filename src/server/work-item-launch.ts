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
  type WorkItemReviewDecision,
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

function isTwoPhaseLaunchCandidate(workItem: WorkItemRecord, phase: WorkItemPhase): boolean {
  // When a ready work item is launched for build, trigger the two-phase pipeline:
  // Phase 1 = Plan (Planner writes plan), Phase 2 = Build (Builder implements)
  return workItem.status === 'ready' && phase === 'build'
}

function buildTwoPhaseLaunchGoal(params: {
  workItem: WorkItemRecord
  project: ProjectRecord
  plannerProfile: string | null
  builderProfile: string | null
  planFilePath: string
}): string {
  const { workItem, project, plannerProfile, builderProfile, planFilePath } = params
  const repoPath = readOptionalString(workItem.repoPathSnapshot) || project.repoPath
  const fullPlanPath = `${repoPath}/${planFilePath}`

  return [
    `Execute a TWO-PHASE Launch Build pipeline for work item "${workItem.title}" of project "${project.name}".`,
    `Work item ID: ${workItem.id}`,
    `Repository path: ${repoPath}`,
    ...(project.defaultBranch ? [`Default branch: ${project.defaultBranch}`] : []),
    ...(project.repoUrl ? [`Repository URL: ${project.repoUrl}`] : []),
    '',
    '======================================================================',
    'PHASE 1 — Plan (Research / Planning)',
    '======================================================================',
    `Profile: ${plannerProfile || 'planner'}`,
    '',
    'Your FIRST task is to write a plan document at:',
    `  ${fullPlanPath}`,
    '',
    'Phase 1 outcomes:',
    '- Fully understand the work item description and acceptance criteria',
    '- Explore the codebase at the repository path',
    '- Write a comprehensive plan as a markdown file at the path above',
    '- The plan MUST include: implementation approach, files to change, test strategy, and how to verify each acceptance criterion',
    '- If acceptance criteria are incomplete, propose and draft them explicitly in the plan',
    '- Identify any open questions, constraints, or recommended build slice breakdown',
    '',
    'Description:',
    workItem.description || 'No additional description provided.',
    '',
    ...buildAcceptanceCriteriaBlock(workItem),
    ...(workItem.notes.length > 0 ? ['', ...buildNotesBlock(workItem)] : []),
    '',
    '======================================================================',
    'PHASE 2 — Build (Implementation)',
    '======================================================================',
    `Profile: ${builderProfile || 'builder'}`,
    '',
    'After Phase 1 is COMPLETE and the plan file is written, execute Phase 2:',
    '',
    'Phase 2 tasks:',
    '- Read and follow the plan from Phase 1 at:',
    `  ${fullPlanPath}`,
    '- Implement per the plan using TDD approach (tests first, then implementation)',
    '- Verify all acceptance criteria are met',
    '- Commit changes and create a PR if the repo has a default branch configured',
    '',
    '======================================================================',
    '',
    'CRITICAL RULES:',
    '- Execute Phase 1 FIRST, then Phase 2. Do NOT reorder or skip either phase.',
    '- The plan file produced in Phase 1 is the authoritative contract for Phase 2.',
    '- Keep both phases grounded in the real repository at the given path.',
    '',
    'Treat this as a tracked Mission Control two-phase launch. Reference the work item ID in all summaries.',
  ].join('\n')
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

export function buildPlannerReviewGoal(workItem: WorkItemRecord, project: ProjectRecord): string {
  const repoPath = readOptionalString(workItem.repoPathSnapshot) || project.repoPath
  const fullPlanPath = workItem.planFilePath ? `${repoPath}/${workItem.planFilePath}` : 'no plan file recorded'
  const criteriaLines = buildAcceptanceCriteriaBlock(workItem)
  const criteriaProgress = workItem.criteriaStatus.length > 0
    ? `Criteria completion: ${workItem.criteriaStatus.filter((c) => c.met).length}/${workItem.criteriaStatus.length} criteria met.`
    : 'No criteria status tracked.'

  return [
    `You are acting as a **Reviewer** for Hermes Mission Control. Review the build output for work item "${workItem.title}" of project "${project.name}".`,
    `Work item ID: ${workItem.id}`,
    `Repository path: ${repoPath}`,
    ...(project.defaultBranch ? [`Default branch: ${project.defaultBranch}`] : []),
    ...(project.repoUrl ? [`Repository URL: ${project.repoUrl}`] : []),
    '',
    '======================================================================',
    'REVIEW CONTEXT',
    '======================================================================',
    '',
    'Description:',
    workItem.description || 'No additional description provided.',
    '',
    ...criteriaLines,
    criteriaProgress,
    '',
    `Plan file path: ${fullPlanPath}`,
    '',
    '======================================================================',
    'YOUR TASK',
    '======================================================================',
    '',
    '1. Review the Builder output against the plan authored at the path above.',
    '2. Check each acceptance criterion against what was actually implemented.',
    '3. Verify that the implementation follows the plan approach and all criteria are demonstrably met.',
    '',
    '======================================================================',
    'DECISION',
    '======================================================================',
    '',
    'You MUST end your output with a clear DECISION line on its own line:',
    '',
    '  DECISION: APPROVED',
    '  (advance the work item to deploy — criteria are met and implementation is sound)',
    '',
    '  OR',
    '',
    '  DECISION: CHANGES_REQUESTED',
    '  (return the work item to build — criteria are not fully met or implementation has issues)',
    '',
    'Include a brief rationale for your decision in a SUMMARY section before the DECISION line.',
    '',
    ...(workItem.notes.length > 0 ? ['', ...buildNotesBlock(workItem)] : []),
    '',
    'Treat this as a tracked Mission Control Planner review. Reference the work item ID in all summaries.',
  ].join('\n')
}

export function launchPlannerReview(workItem: WorkItemRecord, project: ProjectRecord): Promise<{
  reviewJobId: string
  reviewState: 'scheduled'
} | null> {
  if (!workItem.planFilePath) return Promise.resolve(null)

  const goal = buildPlannerReviewGoal(workItem, project)
  const phase = 'review'
  const profile = resolveLaunchProfile(workItem, project, phase, normalizePhaseProfiles({}))
  if (!profile) return Promise.resolve(null)

  const launchPhaseProfiles = buildLaunchPhaseProfiles({
    project,
    requestPhaseProfiles: normalizePhaseProfiles({}),
    phase,
    profile,
  })

  return launchConductorMission({
    goal,
    phaseProfiles: launchPhaseProfiles,
    name: `work-item-review-${project.slug}-${workItem.id.slice(0, 8)}`,
    deliver: 'local',
  }).then((launch) => ({
    reviewJobId: launch.jobId,
    reviewState: 'scheduled' as const,
  })).catch(() => null)
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
  const isTwoPhase = isTwoPhaseLaunchCandidate(workItem, phase)

  // For two-phase pipeline, resolve both profiles and build combined goal
  let resolvedProfile: string | null
  let goal: string
  let launchPhaseProfiles: ConductorPhaseProfiles
  let planFilePath: string | undefined

  if (isTwoPhase) {
    const plannerProfile = resolveLaunchProfile(workItem, project, 'research', requestPhaseProfiles)
    const builderProfile = resolveLaunchProfile(workItem, project, 'build', requestPhaseProfiles)
    planFilePath = `docs/plans/${project.slug}-${workItem.id.slice(0, 8)}-plan.md`

    goal = buildTwoPhaseLaunchGoal({
      workItem,
      project,
      plannerProfile,
      builderProfile,
      planFilePath,
    })

    // Build phase profiles ensuring both research and build are covered
    launchPhaseProfiles = buildLaunchPhaseProfiles({
      project,
      requestPhaseProfiles,
      phase,
      profile: builderProfile,
    })
    // Also ensure the planner profile is in research slot
    if (plannerProfile && launchPhaseProfiles.research !== plannerProfile) {
      launchPhaseProfiles.research = plannerProfile
    }

    // Use builder profile as the primary display profile
    resolvedProfile = builderProfile
  } else {
    resolvedProfile = resolveLaunchProfile(workItem, project, phase, requestPhaseProfiles)
    goal = buildWorkItemLaunchGoal({ workItem, project, phase, profile: resolvedProfile })
    launchPhaseProfiles = buildLaunchPhaseProfiles({
      project,
      requestPhaseProfiles,
      phase,
      profile: resolvedProfile,
    })
  }

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
  const wasRecoveryLaunch = workItem.status === 'blocked' || workItem.missionState === 'failed'

  const workItemUpdates: Record<string, unknown> = {
    status: 'active',
    phase,
    missionId: launch.jobId,
    missionJobId: launch.jobId,
    missionJobName: launch.jobName,
    missionSessionKeyPrefix: launch.sessionKeyPrefix,
    missionLink,
    missionState: 'scheduled',
    missionLastError: undefined,
    sessionKeys,
    repoPathSnapshot: readOptionalString(workItem.repoPathSnapshot) || project.repoPath,
  }

  // For two-phase pipeline, set the plan file path on the work item
  if (isTwoPhase && planFilePath) {
    workItemUpdates.planFilePath = planFilePath
  }

  const nextWorkItem = updateWorkItem(workItem.id, workItemUpdates)

  if (!nextWorkItem) throw new Error('Failed to update work item after launch')

  const note = isTwoPhase
    ? `Launched two-phase pipeline (Phase 1: ${resolvedProfile} plan → Phase 2: build) via Conductor. Plan path: ${planFilePath}`
    : wasRecoveryLaunch
      ? resolvedProfile
        ? `Relaunched ${phase} via Conductor using profile ${resolvedProfile} after failure recovery.`
        : `Relaunched ${phase} via Conductor after failure recovery.`
      : resolvedProfile
        ? `Launched ${phase} via Conductor using profile ${resolvedProfile}.`
        : `Launched ${phase} via Conductor.`

  const updatedWithHistory = appendWorkItemHistoryEntry(workItem.id, {
    action: 'launch',
    phase,
    status: 'active',
    note,
    missionId: launch.jobId,
    sessionKey: launch.sessionKey,
    sessionKeyPrefix: launch.sessionKeyPrefix,
    profile: resolvedProfile ?? undefined,
  })

  if (!updatedWithHistory) throw new Error('Failed to record work item launch history')

  return {
    workItem: updatedWithHistory,
    project,
    launch: {
      ...launch,
      phase,
      profile: resolvedProfile,
    },
  }
}
