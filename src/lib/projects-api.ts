const PROJECTS_BASE = '/api/projects'
const WORK_ITEMS_BASE = '/api/work-items'

export type ProjectRecord = {
  id: string
  name: string
  slug: string
  repoPath: string
  repoUrl?: string
  defaultBranch?: string
  description?: string
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

export type WorkItemRecord = {
  id: string
  projectId: string
  title: string
  description: string
  status: WorkItemStatus
  phase?: WorkItemPhase
  priority: WorkItemPriority
  assignedProfile?: string
  repoPathSnapshot: string
  missionId?: string
  missionLink?: string
  missionState?: 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'
  missionLastRunAt?: string
  missionLastError?: string
  sessionKeys: Array<string>
  branchName?: string
  prUrl?: string
  artifactPaths: Array<string>
  acceptanceCriteria: Array<string>
  notes: Array<string>
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
}

export type UpdateProjectInput = Partial<CreateProjectInput>

export type CreateWorkItemInput = {
  projectId: string
  title: string
  description?: string
  status?: WorkItemStatus
  phase?: WorkItemPhase
  priority?: WorkItemPriority
  assignedProfile?: string
  repoPathSnapshot?: string
  missionId?: string
  missionLink?: string
  sessionKeys?: Array<string>
  branchName?: string
  prUrl?: string
  artifactPaths?: Array<string>
  acceptanceCriteria?: Array<string>
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
