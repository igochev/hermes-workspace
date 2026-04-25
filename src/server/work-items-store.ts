import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type WorkItemStatus = 'inbox' | 'ready' | 'active' | 'blocked' | 'done' | 'cancelled'
export type WorkItemPhase = 'research' | 'build' | 'review' | 'deploy'
export type WorkItemPriority = 'high' | 'medium' | 'low'
export type WorkItemRiskLevel = 'low' | 'medium' | 'high'

export type WorkItemHistoryEntry = {
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
}

export type WorkItemMissionState = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'

export type WorkItemCriterionStatus = {
  text: string
  met: boolean
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
  assignedProfile?: string
  repoPathSnapshot: string
  planFilePath?: string
  missionId?: string
  missionJobId?: string
  missionJobName?: string
  missionSessionKeyPrefix?: string
  missionLink?: string
  missionState?: WorkItemMissionState
  missionLastRunAt?: string
  missionLastError?: string
  sessionKeys: Array<string>
  branchName?: string
  prUrl?: string
  artifactPaths: Array<string>
  acceptanceCriteria: Array<string>
  criteriaStatus: Array<WorkItemCriterionStatus>
  notes: Array<string>
  history: Array<WorkItemHistoryEntry>
  createdAt: string
  updatedAt: string
}

type WorkItemsFile = {
  workItems: Array<WorkItemRecord>
}

type CreateWorkItemInput = {
  id?: string
  projectId: string
  title: string
  description?: string
  status?: WorkItemStatus
  phase?: WorkItemPhase
  priority?: WorkItemPriority
  riskLevel?: WorkItemRiskLevel
  assignedProfile?: string
  repoPathSnapshot: string
  planFilePath?: string
  missionId?: string
  missionJobId?: string
  missionJobName?: string
  missionSessionKeyPrefix?: string
  missionLink?: string
  missionState?: WorkItemMissionState
  missionLastRunAt?: string
  missionLastError?: string
  sessionKeys?: Array<string>
  branchName?: string
  prUrl?: string
  artifactPaths?: Array<string>
  acceptanceCriteria?: Array<string>
  criteriaStatus?: Array<WorkItemCriterionStatus>
  notes?: Array<string>
  history?: Array<WorkItemHistoryEntry>
}

type UpdateWorkItemInput = Partial<Omit<WorkItemRecord, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>>

type AppendWorkItemHistoryInput = Omit<WorkItemHistoryEntry, 'id' | 'createdAt'>

type ListWorkItemsFilters = {
  projectId?: string
  status?: WorkItemStatus
  phase?: WorkItemPhase
}

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getWorkItemsFile(): string {
  return path.join(getHermesHome(), 'work-items.json')
}

function ensureWorkItemsFile(): void {
  const hermesHome = getHermesHome()
  const workItemsFile = getWorkItemsFile()
  fs.mkdirSync(hermesHome, { recursive: true })
  if (!fs.existsSync(workItemsFile)) {
    fs.writeFileSync(
      workItemsFile,
      JSON.stringify({ workItems: [] }, null, 2) + '\n',
      'utf-8',
    )
  }
}

function readWorkItemsFile(): WorkItemsFile {
  const workItemsFile = getWorkItemsFile()
  ensureWorkItemsFile()
  try {
    const raw = fs.readFileSync(workItemsFile, 'utf-8').trim()
    if (!raw) return { workItems: [] }
    const parsed = JSON.parse(raw) as Partial<WorkItemsFile>
    return { workItems: Array.isArray(parsed.workItems) ? parsed.workItems : [] }
  } catch {
    return { workItems: [] }
  }
}

function writeWorkItemsFile(data: WorkItemsFile): void {
  const workItemsFile = getWorkItemsFile()
  ensureWorkItemsFile()
  fs.writeFileSync(workItemsFile, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asStringArray(value: unknown): Array<string> {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
}

function asCriteriaStatusArray(value: unknown): Array<WorkItemCriterionStatus> {
  return Array.isArray(value)
    ? value
        .filter((item): item is { text?: unknown; met?: unknown } => Boolean(item) && typeof item === 'object')
        .map((item) => ({
          text: typeof item.text === 'string' ? item.text.trim() : '',
          met: item.met === true,
        }))
        .filter((item) => item.text.length > 0)
    : []
}

function buildCriteriaStatus(
  acceptanceCriteria: Array<string>,
  criteriaStatus: Array<WorkItemCriterionStatus>,
): Array<WorkItemCriterionStatus> {
  if (acceptanceCriteria.length === 0) return []

  return acceptanceCriteria.map((criterion, index) => {
    const indexed = criteriaStatus[index]
    if (indexed && indexed.text === criterion) {
      return { text: criterion, met: indexed.met }
    }

    const byText = criteriaStatus.find((item) => item.text === criterion)
    return { text: criterion, met: byText?.met === true }
  })
}

function normalizeStatus(value: unknown): WorkItemStatus {
  return value === 'ready' ||
    value === 'active' ||
    value === 'blocked' ||
    value === 'done' ||
    value === 'cancelled'
    ? value
    : 'inbox'
}

function normalizePhase(value: unknown): WorkItemPhase | undefined {
  return value === 'research' ||
    value === 'build' ||
    value === 'review' ||
    value === 'deploy'
    ? value
    : undefined
}

function normalizePriority(value: unknown): WorkItemPriority {
  return value === 'high' || value === 'low' ? value : 'medium'
}

function normalizeRiskLevel(value: unknown): WorkItemRiskLevel {
  return value === 'low' || value === 'high' ? value : 'medium'
}

function asHistoryArray(value: unknown): Array<WorkItemHistoryEntry> {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is Partial<WorkItemHistoryEntry> => Boolean(entry) && typeof entry === 'object')
        .map((entry, index) => ({
          id:
            typeof entry.id === 'string' && entry.id.trim().length > 0
              ? entry.id.trim()
              : `history-${index}`,
          action:
            entry.action === 'launch' || entry.action === 'status-change' || entry.action === 'note'
              ? entry.action
              : 'note',
          status: normalizeStatus(entry.status),
          phase: normalizePhase(entry.phase),
          note: typeof entry.note === 'string' ? entry.note.trim() : '',
          missionId: asOptionalString(entry.missionId),
          sessionKey: asOptionalString(entry.sessionKey),
          sessionKeyPrefix: asOptionalString(entry.sessionKeyPrefix),
          profile: asOptionalString(entry.profile),
          createdAt:
            typeof entry.createdAt === 'string' && entry.createdAt.trim().length > 0
              ? entry.createdAt
              : new Date(0).toISOString(),
        }))
        .filter((entry) => entry.note.length > 0)
    : []
}

function normalizeWorkItem(
  workItem: Partial<WorkItemRecord> &
    Pick<WorkItemRecord, 'id' | 'projectId' | 'title' | 'repoPathSnapshot' | 'createdAt' | 'updatedAt'>,
): WorkItemRecord {
  const acceptanceCriteria = asStringArray(workItem.acceptanceCriteria)
  const criteriaStatus = buildCriteriaStatus(acceptanceCriteria, asCriteriaStatusArray(workItem.criteriaStatus))

  return {
    id: workItem.id,
    projectId: workItem.projectId.trim(),
    title: workItem.title.trim(),
    description: typeof workItem.description === 'string' ? workItem.description : '',
    status: normalizeStatus(workItem.status),
    phase: normalizePhase(workItem.phase),
    priority: normalizePriority(workItem.priority),
    riskLevel: normalizeRiskLevel(workItem.riskLevel),
    assignedProfile: asOptionalString(workItem.assignedProfile),
    repoPathSnapshot: workItem.repoPathSnapshot.trim(),
    planFilePath: asOptionalString((workItem as Partial<WorkItemRecord>).planFilePath),
    missionId: asOptionalString(workItem.missionId),
    missionJobId: asOptionalString((workItem as Partial<WorkItemRecord>).missionJobId),
    missionJobName: asOptionalString((workItem as Partial<WorkItemRecord>).missionJobName),
    missionSessionKeyPrefix: asOptionalString((workItem as Partial<WorkItemRecord>).missionSessionKeyPrefix),
    missionLink: asOptionalString(workItem.missionLink),
    missionState:
      workItem.missionState === 'scheduled' ||
      workItem.missionState === 'running' ||
      workItem.missionState === 'succeeded' ||
      workItem.missionState === 'failed' ||
      workItem.missionState === 'unknown'
        ? workItem.missionState
        : undefined,
    missionLastRunAt: asOptionalString(workItem.missionLastRunAt),
    missionLastError: asOptionalString(workItem.missionLastError),
    sessionKeys: asStringArray(workItem.sessionKeys),
    branchName: asOptionalString(workItem.branchName),
    prUrl: asOptionalString(workItem.prUrl),
    artifactPaths: asStringArray(workItem.artifactPaths),
    acceptanceCriteria,
    criteriaStatus,
    notes: asStringArray(workItem.notes),
    history: asHistoryArray(workItem.history),
    createdAt: workItem.createdAt,
    updatedAt: workItem.updatedAt,
  }
}

export function listWorkItems(filters: ListWorkItemsFilters = {}): Array<WorkItemRecord> {
  let workItems = readWorkItemsFile().workItems.map((workItem) => normalizeWorkItem(workItem))
  if (filters.projectId) {
    workItems = workItems.filter((workItem) => workItem.projectId === filters.projectId)
  }
  if (filters.status) {
    workItems = workItems.filter((workItem) => workItem.status === filters.status)
  }
  if (filters.phase) {
    workItems = workItems.filter((workItem) => workItem.phase === filters.phase)
  }
  return workItems.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getWorkItem(workItemId: string): WorkItemRecord | null {
  return listWorkItems().find((workItem) => workItem.id === workItemId) ?? null
}

export function createWorkItem(input: CreateWorkItemInput): WorkItemRecord {
  const file = readWorkItemsFile()
  const now = new Date().toISOString()
  const workItem = normalizeWorkItem({
    id: typeof input.id === 'string' && input.id.trim() ? input.id : randomUUID(),
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    status: input.status,
    phase: input.phase,
    priority: input.priority,
    riskLevel: input.riskLevel,
    assignedProfile: input.assignedProfile,
    repoPathSnapshot: input.repoPathSnapshot,
    missionId: input.missionId,
    missionJobId: input.missionJobId,
    missionJobName: input.missionJobName,
    missionSessionKeyPrefix: input.missionSessionKeyPrefix,
    missionLink: input.missionLink,
    missionState: input.missionState,
    missionLastRunAt: input.missionLastRunAt,
    missionLastError: input.missionLastError,
    sessionKeys: input.sessionKeys,
    branchName: input.branchName,
    prUrl: input.prUrl,
    artifactPaths: input.artifactPaths,
    acceptanceCriteria: input.acceptanceCriteria,
    criteriaStatus: input.criteriaStatus,
    notes: input.notes,
    history: input.history,
    createdAt: now,
    updatedAt: now,
  })
  file.workItems.push(workItem)
  writeWorkItemsFile({ workItems: file.workItems.map((item) => normalizeWorkItem(item)) })
  return workItem
}

export function updateWorkItem(workItemId: string, updates: UpdateWorkItemInput): WorkItemRecord | null {
  const file = readWorkItemsFile()
  const currentIndex = file.workItems.findIndex((workItem) => workItem.id === workItemId)
  if (currentIndex === -1) return null

  const current = normalizeWorkItem(file.workItems[currentIndex])
  const next = normalizeWorkItem({
    ...current,
    ...updates,
    id: current.id,
    projectId: current.projectId,
    title: typeof updates.title === 'string' && updates.title.trim() ? updates.title : current.title,
    repoPathSnapshot:
      typeof updates.repoPathSnapshot === 'string' && updates.repoPathSnapshot.trim()
        ? updates.repoPathSnapshot
        : current.repoPathSnapshot,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })

  file.workItems[currentIndex] = next
  writeWorkItemsFile({ workItems: file.workItems.map((item) => normalizeWorkItem(item)) })
  return next
}

export function deleteWorkItem(workItemId: string): boolean {
  const file = readWorkItemsFile()
  const nextWorkItems = file.workItems.filter((workItem) => workItem.id !== workItemId)
  if (nextWorkItems.length === file.workItems.length) return false
  writeWorkItemsFile({ workItems: nextWorkItems.map((item) => normalizeWorkItem(item)) })
  return true
}

export function deleteWorkItemsForProject(projectId: string): number {
  const file = readWorkItemsFile()
  const nextWorkItems = file.workItems.filter((workItem) => workItem.projectId !== projectId)
  const deletedCount = file.workItems.length - nextWorkItems.length
  if (deletedCount === 0) return 0
  writeWorkItemsFile({ workItems: nextWorkItems.map((item) => normalizeWorkItem(item)) })
  return deletedCount
}

export function appendWorkItemHistoryEntry(
  workItemId: string,
  entry: AppendWorkItemHistoryInput,
): WorkItemRecord | null {
  const workItem = getWorkItem(workItemId)
  if (!workItem) return null
  return updateWorkItem(workItemId, {
    history: [
      ...workItem.history,
      {
        id: randomUUID(),
        action: entry.action,
        status: entry.status,
        phase: entry.phase,
        note: entry.note,
        missionId: entry.missionId,
        sessionKey: entry.sessionKey,
        sessionKeyPrefix: entry.sessionKeyPrefix,
        profile: entry.profile,
        createdAt: new Date().toISOString(),
      },
    ],
  })
}
