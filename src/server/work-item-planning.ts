import { getProject, type ProjectRecord } from './projects-store'
import {
  acceptPlanningDraft,
  createPlanningDraft,
  getPlanningDraft,
  updatePlanningDraft,
  type PlanningDraftRecord,
} from './planning-drafts-store'
import { parsePlannerStructuredOutput } from './planner-output-schema'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem,
  type WorkItemRecord,
} from './work-items-store'
import { launchConductorMission, type ConductorLaunchResult } from './conductor-launch'

export type PrepareWorkItemRequest = {
  orchestratorModel?: unknown
  workerModel?: unknown
  projectsDir?: unknown
  maxParallel?: unknown
  supervised?: unknown
  laneContext?: PlannerLaneContext
}

export type PlannerLaneContext = {
  currentBranch?: string
  baseBranch?: string
  headCommit?: string
  previousCompletedSummary?: string
}

export type PrepareWorkItemResponse = {
  workItem: WorkItemRecord
  project: ProjectRecord
  draft: PlanningDraftRecord
  launch: ConductorLaunchResult & {
    phase: 'research'
    profile: string
  }
}

export type WorkItemPlanningAcceptResponse = {
  workItem: WorkItemRecord
  project: ProjectRecord
  draft: PlanningDraftRecord
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolvePlannerProfile(project: ProjectRecord): string {
  return readOptionalString(project.phaseProfiles.research) || 'planner'
}

function buildPlannerDraftPlanPath(project: ProjectRecord, workItem: WorkItemRecord): string {
  return `docs/plans/${project.slug}-${workItem.id.slice(0, 8)}-planner-draft.md`
}

export function buildPlannerEnrichmentGoal(params: {
  project: ProjectRecord
  workItem: WorkItemRecord
  plannerProfile: string
  planFilePath: string
  laneContext?: PlannerLaneContext
}): string {
  const { project, workItem, plannerProfile, planFilePath, laneContext } = params
  const repoPath = readOptionalString(workItem.repoPathSnapshot) || project.repoPath
  const laneContextLines = laneContext
    ? [
        '',
        'Lane-entry current code context:',
        laneContext.currentBranch
          ? `- Current branch: ${laneContext.currentBranch}`
          : null,
        laneContext.baseBranch ? `- Base branch: ${laneContext.baseBranch}` : null,
        laneContext.headCommit
          ? `- Current HEAD commit: ${laneContext.headCommit}`
          : null,
        laneContext.previousCompletedSummary
          ? `- Previous completed work item summary: ${laneContext.previousCompletedSummary}`
          : null,
        '- Plan against the current code/docs at the HEAD commit above; do not assume stale pre-lane repository state.',
      ].filter((line): line is string => Boolean(line))
    : []

  return [
    `Prepare work item \"${workItem.title}\" for Mission Control project \"${project.name}\" using Planner enrichment.`,
    `Work item ID: ${workItem.id}`,
    `Project ID: ${project.id}`,
    `Repository path: ${repoPath}`,
    `Planner profile: ${plannerProfile}`,
    '',
    'Planner-only constraints:',
    '- Do NOT modify source code files.',
    '- Do NOT launch Builder or any implementation/deploy mission.',
    '- You may only write one planning markdown artifact plus your final structured JSON output.',
    '',
    `Write the plan markdown to: ${repoPath}/${planFilePath}`,
    '',
    'Include in the markdown plan:',
    '- implementation approach',
    '- files likely to change',
    '- test strategy',
    '- risks and mitigations',
    '- acceptance criteria rationale',
    '- open questions',
    '',
    'Then output final JSON (object only) matching this exact schema:',
    '{',
    '  "title": string,',
    '  "description": string,',
    '  "priority": "high" | "medium" | "low",',
    '  "riskLevel": "low" | "medium" | "high",',
    '  "labels": string[],',
    '  "acceptanceCriteria": string[],',
    '  "notes": string[],',
    '  "planFilePath": string,',
    '  "openQuestions": string[],',
    '  "suggestedPhase": "research" | "build"',
    '}',
    '',
    'Description:',
    workItem.description || 'No additional description provided.',
    ...laneContextLines,
    '',
    `Reference work item ID ${workItem.id} and repo path ${repoPath} in your plan narrative.`,
  ].join('\n')
}

export async function prepareWorkItemWithPlanner(
  workItemId: string,
  request: PrepareWorkItemRequest,
): Promise<PrepareWorkItemResponse> {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')

  const project = getProject(workItem.projectId)
  if (!project) throw new Error('Project not found')

  const plannerProfile = resolvePlannerProfile(project)
  const planFilePath = buildPlannerDraftPlanPath(project, workItem)

  const requestedDraft = createPlanningDraft({
    workItemId: workItem.id,
    projectId: project.id,
    status: 'requested',
    plannerProfile,
  })

  const goal = buildPlannerEnrichmentGoal({
    project,
    workItem,
    plannerProfile,
    planFilePath,
    laneContext: request.laneContext,
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
    phaseProfiles: { research: plannerProfile },
    name: `work-item-plan-${project.slug}-${workItem.id.slice(0, 8)}`,
    deliver: 'local',
  })

  const runningDraft = updatePlanningDraft(requestedDraft.id, {
    status: 'running',
    plannerJobId: launch.jobId,
    plannerJobName: launch.jobName,
    plannerSessionKey: launch.sessionKey,
    plannerSessionKeyPrefix: launch.sessionKeyPrefix,
    plannerProfile,
    plannerLink: `/jobs?jobId=${encodeURIComponent(launch.jobId)}`,
  })

  if (!runningDraft) throw new Error('Failed to update planning draft')

  const withHistory = appendWorkItemHistoryEntry(workItem.id, {
    action: 'note',
    note: `Planner enrichment requested via profile ${plannerProfile}. Draft ${runningDraft.id.slice(0, 8)} is running.`,
    profile: plannerProfile,
    missionId: launch.jobId,
    sessionKey: launch.sessionKey,
    sessionKeyPrefix: launch.sessionKeyPrefix,
    phase: 'research',
    status: workItem.status,
  })

  if (!withHistory) throw new Error('Failed to append planning history note')

  return {
    workItem: withHistory,
    project,
    draft: runningDraft,
    launch: {
      ...launch,
      phase: 'research',
      profile: plannerProfile,
    },
  }
}

export function recordPlannerOutput(draftId: string, rawOutput: string): PlanningDraftRecord {
  const draft = getPlanningDraft(draftId)
  if (!draft) throw new Error('Planning draft not found')

  const parsed = parsePlannerStructuredOutput(rawOutput)
  if (parsed.ok) {
    const updated = updatePlanningDraft(draft.id, {
      status: 'structured_ready',
      rawOutput,
      structuredOutput: parsed.output,
      parseWarnings: parsed.warnings,
      parseError: undefined,
      planFilePath: parsed.output.planFilePath,
    })
    if (!updated) throw new Error('Failed to update planning draft')
    return updated
  }

  const failed = updatePlanningDraft(draft.id, {
    status: 'parse_failed',
    rawOutput,
    structuredOutput: undefined,
    parseWarnings: parsed.warnings,
    parseError: parsed.error,
  })

  if (!failed) throw new Error('Failed to update planning draft')
  return failed
}

export function applyPlanningDraftToWorkItem(draftId: string): WorkItemPlanningAcceptResponse {
  const draft = getPlanningDraft(draftId)
  if (!draft) throw new Error('Planning draft not found')
  if (draft.status !== 'structured_ready' || !draft.structuredOutput) {
    throw new Error('Planning draft is not ready for acceptance')
  }

  const workItem = getWorkItem(draft.workItemId)
  if (!workItem) throw new Error('Work item not found')

  const project = getProject(draft.projectId)
  if (!project) throw new Error('Project not found')

  const prepared = draft.structuredOutput
  const updatedWorkItem = updateWorkItem(workItem.id, {
    title: prepared.title,
    description: prepared.description,
    priority: prepared.priority,
    riskLevel: prepared.riskLevel,
    labels: prepared.labels,
    acceptanceCriteria: prepared.acceptanceCriteria,
    notes: prepared.notes,
    planFilePath: prepared.planFilePath,
    status: 'ready',
    phase: 'build',
  })

  if (!updatedWorkItem) throw new Error('Failed to update work item from planning draft')

  const withHistory = appendWorkItemHistoryEntry(updatedWorkItem.id, {
    action: 'status-change',
    status: 'ready',
    phase: 'build',
    note: `Accepted Planner draft ${draft.id.slice(0, 8)} and prepared work item for Builder launch.`,
    profile: draft.plannerProfile,
  })

  if (!withHistory) throw new Error('Failed to append planning acceptance history')

  const acceptedDraft = acceptPlanningDraft(draft.id)
  if (!acceptedDraft) throw new Error('Failed to mark planning draft accepted')

  return {
    workItem: withHistory,
    project,
    draft: acceptedDraft,
  }
}
