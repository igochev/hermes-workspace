import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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
export type WorkItemReviewState = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'unknown'
export type WorkItemReviewDecision = 'approved' | 'changes_requested' | 'manual_review'
export type WorkItemAutopilotBuildIntent = 'build-after-accepted-plan'
export type WorkItemLaneState =
  | 'queued'
  | 'preparing'
  | 'building'
  | 'reviewing'
  | 'merge_healing'
  | 'blocked'
  | 'done'
export type WorkItemMergeState = 'not_started' | 'running' | 'merged' | 'conflict' | 'failed'

export type WorkItemStructuredReviewDecision = 'approved' | 'changes_requested' | 'manual_review'
export type WorkItemReviewQualityGateStatus = 'pass' | 'fail' | 'manual_review'

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
  blockedReason?: WorkItemBlockedReason
  assignedProfile?: string
  labels: Array<string>
  repoPathSnapshot: string
  planFilePath?: string
  sourceSuggestionId?: string
  sourceSuggestionTitle?: string
  sourceSuggestionEvidence: Array<string>
  autopilotBuildIntent?: WorkItemAutopilotBuildIntent
  missionId?: string
  missionJobId?: string
  missionJobName?: string
  missionSessionKeyPrefix?: string
  missionLink?: string
  missionState?: WorkItemMissionState
  missionLastRunAt?: string
  missionLastError?: string
  reviewJobId?: string
  reviewState?: WorkItemReviewState
  reviewDecision?: WorkItemReviewDecision
  reviewDecisionSummary?: string
  reviewDecisionConfidence?: 'low' | 'medium' | 'high'
  reviewDecisionSource?: 'json' | 'decision-line-fallback'
  reviewParserError?: string
  reviewQualityGateStatus?: WorkItemReviewQualityGateStatus
  reviewQualityGateReasons: Array<string>
  reviewMissingEvidence: Array<string>
  sessionKeys: Array<string>
  laneState?: WorkItemLaneState
  laneEnteredAt?: string
  laneParkedAt?: string
  laneBlockedReason?: string
  laneRetryCount?: number
  laneLastRetryAt?: string
  laneRetryExhaustedAt?: string
  laneRecoveryDecision?: string
  baseBranch?: string
  branchName?: string
  branchCreatedAt?: string
  mergeState?: WorkItemMergeState
  mergeCommit?: string
  mergeBaseCommit?: string
  mergeTargetBranch?: string
  mergeConflictFiles?: Array<string>
  mergeTestCommand?: string
  mergeTestPassed?: boolean
  mergeArtifactPaths?: Array<string>
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
  blockedReason?: WorkItemBlockedReason
  assignedProfile?: string
  labels?: Array<string>
  repoPathSnapshot: string
  planFilePath?: string
  sourceSuggestionId?: string
  sourceSuggestionTitle?: string
  sourceSuggestionEvidence?: Array<string>
  autopilotBuildIntent?: WorkItemAutopilotBuildIntent
  reviewJobId?: string
  reviewState?: WorkItemReviewState
  reviewDecision?: WorkItemReviewDecision
  reviewDecisionSummary?: string
  reviewDecisionConfidence?: 'low' | 'medium' | 'high'
  reviewDecisionSource?: 'json' | 'decision-line-fallback'
  reviewParserError?: string
  reviewQualityGateStatus?: WorkItemReviewQualityGateStatus
  reviewQualityGateReasons?: Array<string>
  reviewMissingEvidence?: Array<string>
  missionId?: string
  missionJobId?: string
  missionJobName?: string
  missionSessionKeyPrefix?: string
  missionLink?: string
  missionState?: WorkItemMissionState
  missionLastRunAt?: string
  missionLastError?: string
  sessionKeys?: Array<string>
  laneState?: WorkItemLaneState
  laneEnteredAt?: string
  laneParkedAt?: string
  laneBlockedReason?: string
  laneRetryCount?: number
  laneLastRetryAt?: string
  laneRetryExhaustedAt?: string
  laneRecoveryDecision?: string
  baseBranch?: string
  branchName?: string
  branchCreatedAt?: string
  mergeState?: WorkItemMergeState
  mergeCommit?: string
  mergeBaseCommit?: string
  mergeTargetBranch?: string
  mergeConflictFiles?: Array<string>
  mergeTestCommand?: string
  mergeTestPassed?: boolean
  mergeArtifactPaths?: Array<string>
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

function normalizeBlockedReason(value: unknown): WorkItemBlockedReason | undefined {
  if (
    value === 'mission_failed' ||
    value === 'review_feedback' ||
    value === 'blocked_by_dependency' ||
    value === 'external' ||
    value === 'other'
  ) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return 'other'
  }

  return undefined
}

function normalizeLaneState(value: unknown): WorkItemLaneState | undefined {
  return value === 'queued' ||
    value === 'preparing' ||
    value === 'building' ||
    value === 'reviewing' ||
    value === 'merge_healing' ||
    value === 'blocked' ||
    value === 'done'
    ? value
    : undefined
}

function normalizeMergeState(value: unknown): WorkItemMergeState | undefined {
  return value === 'not_started' ||
    value === 'running' ||
    value === 'merged' ||
    value === 'conflict' ||
    value === 'failed'
    ? value
    : undefined
}

function normalizeRetryCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.floor(value))
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
    blockedReason: normalizeBlockedReason((workItem as Partial<WorkItemRecord>).blockedReason),
    assignedProfile: asOptionalString(workItem.assignedProfile),
    labels: asStringArray(workItem.labels),
    repoPathSnapshot: workItem.repoPathSnapshot.trim(),
    planFilePath: asOptionalString((workItem as Partial<WorkItemRecord>).planFilePath),
    sourceSuggestionId: asOptionalString((workItem as Partial<WorkItemRecord>).sourceSuggestionId),
    sourceSuggestionTitle: asOptionalString(
      (workItem as Partial<WorkItemRecord>).sourceSuggestionTitle,
    ),
    sourceSuggestionEvidence: asStringArray(
      (workItem as Partial<WorkItemRecord>).sourceSuggestionEvidence,
    ),
    autopilotBuildIntent:
      (workItem as Partial<WorkItemRecord>).autopilotBuildIntent === 'build-after-accepted-plan'
        ? (workItem as Partial<WorkItemRecord>).autopilotBuildIntent
        : undefined,
    reviewJobId: asOptionalString((workItem as Partial<WorkItemRecord>).reviewJobId),
    reviewState:
      (workItem as Partial<WorkItemRecord>).reviewState === 'scheduled' ||
      (workItem as Partial<WorkItemRecord>).reviewState === 'running' ||
      (workItem as Partial<WorkItemRecord>).reviewState === 'succeeded' ||
      (workItem as Partial<WorkItemRecord>).reviewState === 'failed' ||
      (workItem as Partial<WorkItemRecord>).reviewState === 'unknown'
        ? (workItem as Partial<WorkItemRecord>).reviewState
        : undefined,
    reviewDecision: (workItem as Partial<WorkItemRecord>).reviewDecision === 'approved' ||
      (workItem as Partial<WorkItemRecord>).reviewDecision === 'changes_requested' ||
      (workItem as Partial<WorkItemRecord>).reviewDecision === 'manual_review'
      ? (workItem as Partial<WorkItemRecord>).reviewDecision
      : undefined,
    reviewDecisionSummary: asOptionalString((workItem as Partial<WorkItemRecord>).reviewDecisionSummary),
    reviewDecisionConfidence:
      (workItem as Partial<WorkItemRecord>).reviewDecisionConfidence === 'low' ||
      (workItem as Partial<WorkItemRecord>).reviewDecisionConfidence === 'medium' ||
      (workItem as Partial<WorkItemRecord>).reviewDecisionConfidence === 'high'
        ? (workItem as Partial<WorkItemRecord>).reviewDecisionConfidence
        : undefined,
    reviewDecisionSource:
      (workItem as Partial<WorkItemRecord>).reviewDecisionSource === 'json' ||
      (workItem as Partial<WorkItemRecord>).reviewDecisionSource === 'decision-line-fallback'
        ? (workItem as Partial<WorkItemRecord>).reviewDecisionSource
        : undefined,
    reviewParserError: asOptionalString((workItem as Partial<WorkItemRecord>).reviewParserError),
    reviewQualityGateStatus:
      (workItem as Partial<WorkItemRecord>).reviewQualityGateStatus === 'pass' ||
      (workItem as Partial<WorkItemRecord>).reviewQualityGateStatus === 'fail' ||
      (workItem as Partial<WorkItemRecord>).reviewQualityGateStatus === 'manual_review'
        ? (workItem as Partial<WorkItemRecord>).reviewQualityGateStatus
        : undefined,
    reviewQualityGateReasons: asStringArray((workItem as Partial<WorkItemRecord>).reviewQualityGateReasons),
    reviewMissingEvidence: asStringArray((workItem as Partial<WorkItemRecord>).reviewMissingEvidence),
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
    laneState: normalizeLaneState((workItem as Partial<WorkItemRecord>).laneState),
    laneEnteredAt: asOptionalString((workItem as Partial<WorkItemRecord>).laneEnteredAt),
    laneParkedAt: asOptionalString((workItem as Partial<WorkItemRecord>).laneParkedAt),
    laneBlockedReason: asOptionalString((workItem as Partial<WorkItemRecord>).laneBlockedReason),
    laneRetryCount: normalizeRetryCount((workItem as Partial<WorkItemRecord>).laneRetryCount),
    laneLastRetryAt: asOptionalString((workItem as Partial<WorkItemRecord>).laneLastRetryAt),
    laneRetryExhaustedAt: asOptionalString((workItem as Partial<WorkItemRecord>).laneRetryExhaustedAt),
    laneRecoveryDecision: asOptionalString((workItem as Partial<WorkItemRecord>).laneRecoveryDecision),
    baseBranch: asOptionalString((workItem as Partial<WorkItemRecord>).baseBranch),
    branchName: asOptionalString(workItem.branchName),
    branchCreatedAt: asOptionalString((workItem as Partial<WorkItemRecord>).branchCreatedAt),
    mergeState: normalizeMergeState((workItem as Partial<WorkItemRecord>).mergeState),
    mergeCommit: asOptionalString((workItem as Partial<WorkItemRecord>).mergeCommit),
    mergeBaseCommit: asOptionalString((workItem as Partial<WorkItemRecord>).mergeBaseCommit),
    mergeTargetBranch: asOptionalString((workItem as Partial<WorkItemRecord>).mergeTargetBranch),
    mergeConflictFiles: asStringArray((workItem as Partial<WorkItemRecord>).mergeConflictFiles),
    mergeTestCommand: asOptionalString((workItem as Partial<WorkItemRecord>).mergeTestCommand),
    mergeTestPassed:
      typeof (workItem as Partial<WorkItemRecord>).mergeTestPassed === 'boolean'
        ? (workItem as Partial<WorkItemRecord>).mergeTestPassed
        : undefined,
    mergeArtifactPaths: asStringArray((workItem as Partial<WorkItemRecord>).mergeArtifactPaths),
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
    blockedReason: input.blockedReason,
    assignedProfile: input.assignedProfile,
    labels: input.labels,
    repoPathSnapshot: input.repoPathSnapshot,
    planFilePath: input.planFilePath,
    sourceSuggestionId: input.sourceSuggestionId,
    sourceSuggestionTitle: input.sourceSuggestionTitle,
    sourceSuggestionEvidence: input.sourceSuggestionEvidence,
    autopilotBuildIntent: input.autopilotBuildIntent,
    reviewJobId: input.reviewJobId,
    reviewState: input.reviewState,
    reviewDecision: input.reviewDecision,
    reviewDecisionSummary: input.reviewDecisionSummary,
    reviewDecisionConfidence: input.reviewDecisionConfidence,
    reviewDecisionSource: input.reviewDecisionSource,
    reviewParserError: input.reviewParserError,
    reviewQualityGateStatus: input.reviewQualityGateStatus,
    reviewQualityGateReasons: input.reviewQualityGateReasons,
    reviewMissingEvidence: input.reviewMissingEvidence,
    missionId: input.missionId,
    missionJobId: input.missionJobId,
    missionJobName: input.missionJobName,
    missionSessionKeyPrefix: input.missionSessionKeyPrefix,
    missionLink: input.missionLink,
    missionState: input.missionState,
    missionLastRunAt: input.missionLastRunAt,
    missionLastError: input.missionLastError,
    sessionKeys: input.sessionKeys,
    laneState: input.laneState,
    laneEnteredAt: input.laneEnteredAt,
    laneParkedAt: input.laneParkedAt,
    laneBlockedReason: input.laneBlockedReason,
    laneRetryCount: input.laneRetryCount,
    laneLastRetryAt: input.laneLastRetryAt,
    laneRetryExhaustedAt: input.laneRetryExhaustedAt,
    laneRecoveryDecision: input.laneRecoveryDecision,
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    branchCreatedAt: input.branchCreatedAt,
    mergeState: input.mergeState,
    mergeCommit: input.mergeCommit,
    mergeBaseCommit: input.mergeBaseCommit,
    mergeTargetBranch: input.mergeTargetBranch,
    mergeConflictFiles: input.mergeConflictFiles,
    mergeTestCommand: input.mergeTestCommand,
    mergeTestPassed: input.mergeTestPassed,
    mergeArtifactPaths: input.mergeArtifactPaths,
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
