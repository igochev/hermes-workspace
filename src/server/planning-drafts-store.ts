import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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
  priority: 'high' | 'medium' | 'low'
  riskLevel: 'low' | 'medium' | 'high'
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

type PlanningDraftsFile = {
  drafts: Array<PlanningDraftRecord>
}

type CreatePlanningDraftInput = {
  id?: string
  workItemId: string
  projectId: string
  status?: PlanningDraftStatus
  plannerJobId?: string
  plannerJobName?: string
  plannerSessionKey?: string
  plannerSessionKeyPrefix?: string
  plannerProfile?: string
  plannerLink?: string
  rawOutput?: string
  structuredOutput?: PlannerStructuredOutput
  parseWarnings?: Array<string>
  parseError?: string
  planFilePath?: string
  acceptedAt?: string
  revisionRequestedAt?: string
}

type UpdatePlanningDraftInput = Partial<Omit<PlanningDraftRecord, 'id' | 'workItemId' | 'projectId' | 'createdAt' | 'updatedAt'>>

type ListPlanningDraftsFilters = {
  workItemId?: string
  projectId?: string
  status?: PlanningDraftStatus
}

const VALID_STATUSES: Array<PlanningDraftStatus> = [
  'requested',
  'running',
  'structured_ready',
  'parse_failed',
  'accepted',
  'revision_requested',
  'cancelled',
]

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getPlanningDraftsFilePath(): string {
  return path.join(getHermesHome(), 'planning-drafts.json')
}

function ensurePlanningDraftsFile(): void {
  const hermesHome = getHermesHome()
  const filePath = getPlanningDraftsFilePath()
  fs.mkdirSync(hermesHome, { recursive: true })
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ drafts: [] }, null, 2) + '\n', 'utf-8')
  }
}

function readPlanningDraftsFile(): PlanningDraftsFile {
  const filePath = getPlanningDraftsFilePath()
  ensurePlanningDraftsFile()
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim()
    if (!raw) return { drafts: [] }
    const parsed = JSON.parse(raw) as Partial<PlanningDraftsFile>
    return { drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [] }
  } catch {
    return { drafts: [] }
  }
}

function writePlanningDraftsFile(data: PlanningDraftsFile): void {
  const filePath = getPlanningDraftsFilePath()
  ensurePlanningDraftsFile()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function uniqueStrings(values: unknown): Array<string> {
  if (!Array.isArray(values)) return []
  const output: Array<string> = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }
  return output
}

function normalizeStatus(value: unknown): PlanningDraftStatus {
  return VALID_STATUSES.includes(value as PlanningDraftStatus) ? (value as PlanningDraftStatus) : 'requested'
}

function normalizeStructuredOutput(
  value: unknown,
): PlannerStructuredOutput | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<PlannerStructuredOutput>

  const priority = candidate.priority === 'high' || candidate.priority === 'low' ? candidate.priority : 'medium'
  const riskLevel = candidate.riskLevel === 'low' || candidate.riskLevel === 'high' ? candidate.riskLevel : 'medium'
  const suggestedPhase = candidate.suggestedPhase === 'research' ? 'research' : 'build'

  return {
    title: asOptionalString(candidate.title) ?? '',
    description: asOptionalString(candidate.description) ?? '',
    priority,
    riskLevel,
    labels: uniqueStrings(candidate.labels),
    acceptanceCriteria: uniqueStrings(candidate.acceptanceCriteria),
    notes: uniqueStrings(candidate.notes),
    planFilePath: asOptionalString(candidate.planFilePath) ?? '',
    openQuestions: uniqueStrings(candidate.openQuestions),
    suggestedPhase,
  }
}

function normalizePlanningDraft(
  draft: Partial<PlanningDraftRecord> & Pick<PlanningDraftRecord, 'id' | 'workItemId' | 'projectId' | 'createdAt' | 'updatedAt'>,
): PlanningDraftRecord {
  return {
    id: draft.id,
    workItemId: draft.workItemId.trim(),
    projectId: draft.projectId.trim(),
    status: normalizeStatus(draft.status),
    plannerJobId: asOptionalString(draft.plannerJobId),
    plannerJobName: asOptionalString(draft.plannerJobName),
    plannerSessionKey: asOptionalString(draft.plannerSessionKey),
    plannerSessionKeyPrefix: asOptionalString(draft.plannerSessionKeyPrefix),
    plannerProfile: asOptionalString(draft.plannerProfile),
    plannerLink: asOptionalString(draft.plannerLink),
    rawOutput: asOptionalString(draft.rawOutput),
    structuredOutput: normalizeStructuredOutput(draft.structuredOutput),
    parseWarnings: uniqueStrings(draft.parseWarnings),
    parseError: asOptionalString(draft.parseError),
    planFilePath: asOptionalString(draft.planFilePath),
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    acceptedAt: asOptionalString(draft.acceptedAt),
    revisionRequestedAt: asOptionalString(draft.revisionRequestedAt),
  }
}

export function listPlanningDrafts(filters: ListPlanningDraftsFilters = {}): Array<PlanningDraftRecord> {
  let drafts = readPlanningDraftsFile().drafts.map((draft) => normalizePlanningDraft(draft))

  if (filters.workItemId) {
    drafts = drafts.filter((draft) => draft.workItemId === filters.workItemId)
  }
  if (filters.projectId) {
    drafts = drafts.filter((draft) => draft.projectId === filters.projectId)
  }
  if (filters.status) {
    drafts = drafts.filter((draft) => draft.status === filters.status)
  }

  return drafts.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getPlanningDraft(draftId: string): PlanningDraftRecord | null {
  return listPlanningDrafts().find((draft) => draft.id === draftId) ?? null
}

export function getLatestPlanningDraftForWorkItem(workItemId: string): PlanningDraftRecord | null {
  const drafts = listPlanningDrafts({ workItemId }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return drafts[0] ?? null
}

export function createPlanningDraft(input: CreatePlanningDraftInput): PlanningDraftRecord {
  const file = readPlanningDraftsFile()
  const now = new Date().toISOString()
  const draft = normalizePlanningDraft({
    id: typeof input.id === 'string' && input.id.trim() ? input.id : randomUUID(),
    workItemId: input.workItemId,
    projectId: input.projectId,
    status: input.status,
    plannerJobId: input.plannerJobId,
    plannerJobName: input.plannerJobName,
    plannerSessionKey: input.plannerSessionKey,
    plannerSessionKeyPrefix: input.plannerSessionKeyPrefix,
    plannerProfile: input.plannerProfile,
    plannerLink: input.plannerLink,
    rawOutput: input.rawOutput,
    structuredOutput: input.structuredOutput,
    parseWarnings: input.parseWarnings,
    parseError: input.parseError,
    planFilePath: input.planFilePath,
    acceptedAt: input.acceptedAt,
    revisionRequestedAt: input.revisionRequestedAt,
    createdAt: now,
    updatedAt: now,
  })

  file.drafts.push(draft)
  writePlanningDraftsFile({ drafts: file.drafts.map((item) => normalizePlanningDraft(item)) })
  return draft
}

export function updatePlanningDraft(
  draftId: string,
  updates: UpdatePlanningDraftInput,
): PlanningDraftRecord | null {
  const file = readPlanningDraftsFile()
  const currentIndex = file.drafts.findIndex((draft) => draft.id === draftId)
  if (currentIndex === -1) return null

  const current = normalizePlanningDraft(file.drafts[currentIndex])
  const next = normalizePlanningDraft({
    ...current,
    ...updates,
    id: current.id,
    workItemId: current.workItemId,
    projectId: current.projectId,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })

  file.drafts[currentIndex] = next
  writePlanningDraftsFile({ drafts: file.drafts.map((item) => normalizePlanningDraft(item)) })
  return next
}

export function acceptPlanningDraft(draftId: string): PlanningDraftRecord | null {
  return updatePlanningDraft(draftId, {
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
  })
}

export function deletePlanningDraft(draftId: string): boolean {
  const file = readPlanningDraftsFile()
  const nextDrafts = file.drafts.filter((draft) => draft.id !== draftId)
  if (nextDrafts.length === file.drafts.length) return false
  writePlanningDraftsFile({ drafts: nextDrafts.map((item) => normalizePlanningDraft(item)) })
  return true
}

export function deletePlanningDraftsForWorkItem(workItemId: string): number {
  const file = readPlanningDraftsFile()
  const nextDrafts = file.drafts.filter((draft) => draft.workItemId !== workItemId)
  const deletedCount = file.drafts.length - nextDrafts.length
  if (deletedCount === 0) return 0
  writePlanningDraftsFile({ drafts: nextDrafts.map((item) => normalizePlanningDraft(item)) })
  return deletedCount
}

export function deletePlanningDraftsForProject(projectId: string): number {
  const file = readPlanningDraftsFile()
  const nextDrafts = file.drafts.filter((draft) => draft.projectId !== projectId)
  const deletedCount = file.drafts.length - nextDrafts.length
  if (deletedCount === 0) return 0
  writePlanningDraftsFile({ drafts: nextDrafts.map((item) => normalizePlanningDraft(item)) })
  return deletedCount
}
