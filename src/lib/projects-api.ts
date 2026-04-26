const PROJECTS_BASE = '/api/projects'
const WORK_ITEMS_BASE = '/api/work-items'

export type PhaseProfiles = {
  research: string
  build: string
  review: string
  deploy: string
}

export type ReviewAutoApprovalPolicy = {
  enabled: boolean
  maxPriority: 'low' | 'medium' | 'high'
}

export type ProjectAutopilotSchedulePreset = 'manual' | 'daily' | 'weekly'
export type ProjectAutopilotScoutSource =
  | 'manual'
  | 'autopilot'
  | 'repo-health-scout'
  | 'failing-tests-scout'
  | 'stale-docs-scout'
  | 'ux-friction-scout'
  | 'dependency-api-scout'
  | 'architecture-debt-scout'

export type ProjectAutopilotPolicy = {
  enabled: boolean
  schedulePreset: ProjectAutopilotSchedulePreset
  scoutProfile?: string
  suggestionLimit: number
  scoutSources: Array<ProjectAutopilotScoutSource>
  jobId?: string
  jobName?: string
  lastCreatedAt?: string
}

export type ProjectRecord = {
  id: string
  name: string
  slug: string
  repoPath: string
  repoUrl?: string
  defaultBranch?: string
  description?: string
  phaseProfiles: PhaseProfiles
  reviewAutoApproval: ReviewAutoApprovalPolicy
  autopilotPolicy: ProjectAutopilotPolicy
  createdAt: string
  updatedAt: string
}

export type ProjectSummary = ProjectRecord & {
  workItemCount: number
  activeWorkItemCount: number
  doneWorkItemCount: number
}

export type WorkItemStatus = 'inbox' | 'ready' | 'active' | 'blocked' | 'done' | 'cancelled'
export type WorkItemPhase = 'research' | 'build' | 'review' | 'deploy'
export type WorkItemPriority = 'high' | 'medium' | 'low'
export type WorkItemRiskLevel = 'low' | 'medium' | 'high'
export type WorkItemBlockedReason =
  | 'mission_failed'
  | 'review_feedback'
  | 'blocked_by_dependency'
  | 'external'
  | 'other'

export type WorkItemCriterionStatus = {
  text: string
  met: boolean
}

export type PlanningDraftStatus =
  | 'requested'
  | 'running'
  | 'structured_ready'
  | 'parse_failed'
  | 'accepted'
  | 'revision_requested'
  | 'cancelled'

export type PlannerStructuredOutput = {
  title: string
  description: string
  priority: WorkItemPriority
  riskLevel: WorkItemRiskLevel
  labels: Array<string>
  acceptanceCriteria: Array<string>
  notes: Array<string>
  planFilePath: string
  openQuestions: Array<string>
  suggestedPhase: 'research' | 'build'
}

export type PlanningDraftRecord = {
  id: string
  workItemId: string
  projectId: string
  status: PlanningDraftStatus
  plannerJobId?: string
  plannerJobName?: string
  plannerSessionKey?: string
  plannerSessionKeyPrefix?: string
  plannerProfile?: string
  plannerLink?: string
  rawOutput?: string
  structuredOutput?: PlannerStructuredOutput
  parseWarnings: Array<string>
  parseError?: string
  planFilePath?: string
  createdAt: string
  updatedAt: string
  acceptedAt?: string
  revisionRequestedAt?: string
}

export type WorkItemRecord = {
  id: string
  projectId: string
  title: string
  description: string
  status: WorkItemStatus
  phase?: WorkItemPhase
  priority: WorkItemPriority
  riskLevel: WorkItemRiskLevel
  blockedReason?: WorkItemBlockedReason
  assignedProfile?: string
  labels: Array<string>
  repoPathSnapshot: string
  planFilePath?: string
  sourceSuggestionId?: string
  sourceSuggestionTitle?: string
  sourceSuggestionEvidence: Array<string>
  missionId?: string
  missionJobId?: string
  missionJobName?: string
  missionSessionKeyPrefix?: string
  missionLink?: string
  missionState?: 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'
  missionLastRunAt?: string
  missionLastError?: string
  reviewJobId?: string
  reviewState?: 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'
  reviewDecision?: 'approved' | 'changes_requested' | 'manual_review'
  reviewDecisionSummary?: string
  reviewDecisionConfidence?: 'low' | 'medium' | 'high'
  reviewDecisionSource?: 'json' | 'decision-line-fallback'
  reviewParserError?: string
  reviewQualityGateStatus?: 'pass' | 'fail' | 'manual_review'
  reviewQualityGateReasons: Array<string>
  reviewMissingEvidence: Array<string>
  sessionKeys: Array<string>
  branchName?: string
  prUrl?: string
  artifactPaths: Array<string>
  acceptanceCriteria: Array<string>
  criteriaStatus: Array<WorkItemCriterionStatus>
  notes: Array<string>
  approvals?: Array<{
    id: string
    workItemId: string
    projectId: string
    phase: 'review' | 'deploy'
    status: 'pending' | 'approved' | 'changes_requested' | 'rejected'
    requestedBy: string
    requestedAt: string
    resolvedBy?: string
    resolvedAt?: string
    notes?: string
    resolutionNotes?: string
    createdAt: string
    updatedAt: string
  }>
  latestPlanningDraft?: PlanningDraftRecord | null
  history: Array<{
    id: string
    action: 'launch' | 'status-change' | 'note'
    status?: WorkItemStatus
    phase?: WorkItemPhase
    note: string
    missionId?: string
    sessionKey?: string
    sessionKeyPrefix?: string
    profile?: string
    createdAt: string
  }>
  createdAt: string
  updatedAt: string
}

export type CreateProjectInput = {
  name: string
  repoPath: string
  repoUrl?: string
  defaultBranch?: string
  description?: string
  phaseProfiles?: Partial<PhaseProfiles>
  reviewAutoApproval?: Partial<ReviewAutoApprovalPolicy>
  autopilotPolicy?: Partial<ProjectAutopilotPolicy>
}

export type UpdateProjectInput = Partial<CreateProjectInput>

export type CreateWorkItemInput = {
  projectId: string
  title: string
  description?: string
  status?: WorkItemStatus
  phase?: WorkItemPhase
  priority?: WorkItemPriority
  riskLevel?: WorkItemRiskLevel
  blockedReason?: WorkItemBlockedReason
  assignedProfile?: string
  labels?: Array<string>
  repoPathSnapshot?: string
  sourceSuggestionId?: string
  sourceSuggestionTitle?: string
  sourceSuggestionEvidence?: Array<string>
  missionId?: string
  missionLink?: string
  sessionKeys?: Array<string>
  branchName?: string
  prUrl?: string
  artifactPaths?: Array<string>
  acceptanceCriteria?: Array<string>
  criteriaStatus?: Array<WorkItemCriterionStatus>
  notes?: Array<string>
}

export type UpdateWorkItemInput = Partial<Omit<CreateWorkItemInput, 'projectId'>>

export type ProjectDetailResponse = {
  project: ProjectSummary
  workItems: Array<WorkItemRecord>
}

export type WorkItemDetailResponse = {
  workItem: WorkItemRecord
  project: ProjectRecord | null
}

export type WorkItemApprovalDecision = 'approved' | 'changes_requested' | 'rejected'

export type WorkItemLifecycleAction =
  | 'send_to_planning'
  | 'mark_ready'
  | 'request_review'
  | 'request_deploy_approval'
  | 'resume_build'
  | 'cancel'
  | 'back_to_research'
  | 'back_to_build'
  | 'back_to_inbox'

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

export async function fetchProjects(): Promise<Array<ProjectSummary>> {
  const response = await fetch(PROJECTS_BASE)
  if (!response.ok) throw await readError(response, `Failed to fetch projects: ${response.status}`)
  const data = await readJson<{ projects?: Array<ProjectSummary> }>(response)
  return data.projects ?? []
}

export async function fetchProject(projectId: string): Promise<ProjectDetailResponse> {
  const response = await fetch(`${PROJECTS_BASE}/${projectId}`)
  if (!response.ok) throw await readError(response, `Failed to fetch project: ${response.status}`)
  return readJson<ProjectDetailResponse>(response)
}

export async function createProject(input: CreateProjectInput): Promise<ProjectSummary> {
  const response = await fetch(PROJECTS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await readError(response, `Failed to create project: ${response.status}`)
  const data = await readJson<{ project: ProjectSummary }>(response)
  return data.project
}

export async function updateProject(projectId: string, input: UpdateProjectInput): Promise<ProjectDetailResponse> {
  const response = await fetch(`${PROJECTS_BASE}/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await readError(response, `Failed to update project: ${response.status}`)
  return readJson<ProjectDetailResponse>(response)
}

export async function deleteProject(projectId: string): Promise<{ ok: true; deletedWorkItems: number }> {
  const response = await fetch(`${PROJECTS_BASE}/${projectId}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw await readError(response, `Failed to delete project: ${response.status}`)
  return readJson<{ ok: true; deletedWorkItems: number }>(response)
}

export async function fetchWorkItems(params?: {
  projectId?: string
  status?: WorkItemStatus
  phase?: WorkItemPhase
}): Promise<Array<WorkItemRecord>> {
  const search = new URLSearchParams()
  if (params?.projectId) search.set('projectId', params.projectId)
  if (params?.status) search.set('status', params.status)
  if (params?.phase) search.set('phase', params.phase)
  const suffix = search.toString() ? `?${search}` : ''
  const response = await fetch(`${WORK_ITEMS_BASE}${suffix}`)
  if (!response.ok) throw await readError(response, `Failed to fetch work items: ${response.status}`)
  const data = await readJson<{ workItems?: Array<WorkItemRecord> }>(response)
  return data.workItems ?? []
}

export async function fetchWorkItem(workItemId: string): Promise<WorkItemDetailResponse> {
  const response = await fetch(`${WORK_ITEMS_BASE}/${workItemId}`)
  if (!response.ok) throw await readError(response, `Failed to fetch work item: ${response.status}`)
  return readJson<WorkItemDetailResponse>(response)
}

export async function createWorkItem(input: CreateWorkItemInput): Promise<WorkItemRecord> {
  const response = await fetch(WORK_ITEMS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await readError(response, `Failed to create work item: ${response.status}`)
  const data = await readJson<{ workItem: WorkItemRecord }>(response)
  return data.workItem
}

export async function updateWorkItem(workItemId: string, input: UpdateWorkItemInput): Promise<WorkItemDetailResponse> {
  const response = await fetch(`${WORK_ITEMS_BASE}/${workItemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw await readError(response, `Failed to update work item: ${response.status}`)
  return readJson<WorkItemDetailResponse>(response)
}

export async function deleteWorkItem(workItemId: string): Promise<{ ok: true }> {
  const response = await fetch(`${WORK_ITEMS_BASE}/${workItemId}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw await readError(response, `Failed to delete work item: ${response.status}`)
  return readJson<{ ok: true }>(response)
}

export const WORK_ITEM_STATUS_LABELS: Record<WorkItemStatus, string> = {
  inbox: 'Inbox',
  ready: 'Ready',
  active: 'Active',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
}

export const WORK_ITEM_PHASE_LABELS: Record<WorkItemPhase, string> = {
  research: 'Research',
  build: 'Build',
  review: 'Review',
  deploy: 'Deploy',
}

export const WORK_ITEM_PRIORITY_LABELS: Record<WorkItemPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const WORK_ITEM_RISK_LEVEL_LABELS: Record<WorkItemRiskLevel, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
}

export const WORK_ITEM_BLOCKED_REASON_LABELS: Record<WorkItemBlockedReason, string> = {
  mission_failed: 'Mission failed',
  review_feedback: 'Review feedback',
  blocked_by_dependency: 'Blocked by dependency',
  external: 'External',
  other: 'Other',
}
