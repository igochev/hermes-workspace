import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type AutopilotSuggestionStatus = 'new' | 'accepted' | 'rejected' | 'converted' | 'archived'
export type AutopilotSuggestionImpact = 'low' | 'medium' | 'high'
export type AutopilotSuggestionRisk = 'low' | 'medium' | 'high'
export type AutopilotSuggestionEffort = 'small' | 'medium' | 'large'
export type AutopilotSuggestionSource =
  | 'manual'
  | 'autopilot'
  | 'repo-health-scout'
  | 'failing-tests-scout'
  | 'stale-docs-scout'
  | 'ux-friction-scout'
  | 'dependency-api-scout'
  | 'architecture-debt-scout'

export type AutopilotSuggestionRecord = {
  id: string
  projectId: string
  title: string
  rationale: string
  evidence: Array<string>
  suggestedAcceptanceCriteria: Array<string>
  impact: AutopilotSuggestionImpact
  risk: AutopilotSuggestionRisk
  effort: AutopilotSuggestionEffort
  labels: Array<string>
  source: AutopilotSuggestionSource
  status: AutopilotSuggestionStatus
  rejectionReason?: string
  convertedWorkItemId?: string
  createdAt: string
  updatedAt: string
}

type AutopilotSuggestionsFile = {
  suggestions: Array<AutopilotSuggestionRecord>
}

type CreateAutopilotSuggestionInput = {
  id?: string
  projectId: string
  title: string
  rationale: string
  evidence?: Array<string>
  suggestedAcceptanceCriteria?: Array<string>
  impact?: AutopilotSuggestionImpact
  risk?: AutopilotSuggestionRisk
  effort?: AutopilotSuggestionEffort
  labels?: Array<string>
  source?: AutopilotSuggestionSource
  status?: AutopilotSuggestionStatus
  rejectionReason?: string
  convertedWorkItemId?: string
}

type UpdateAutopilotSuggestionInput = Partial<
  Omit<AutopilotSuggestionRecord, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>
>

type ListAutopilotSuggestionsFilters = {
  projectId?: string
  status?: AutopilotSuggestionStatus
  source?: AutopilotSuggestionSource
}

const VALID_STATUSES: Array<AutopilotSuggestionStatus> = [
  'new',
  'accepted',
  'rejected',
  'converted',
  'archived',
]
const VALID_LEVELS: Array<AutopilotSuggestionImpact> = ['low', 'medium', 'high']
const VALID_EFFORTS: Array<AutopilotSuggestionEffort> = ['small', 'medium', 'large']
const VALID_SOURCES: Array<AutopilotSuggestionSource> = [
  'manual',
  'autopilot',
  'repo-health-scout',
  'failing-tests-scout',
  'stale-docs-scout',
  'ux-friction-scout',
  'dependency-api-scout',
  'architecture-debt-scout',
]

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getAutopilotSuggestionsFilePath(): string {
  return path.join(getHermesHome(), 'autopilot-suggestions.json')
}

function ensureAutopilotSuggestionsFile(): void {
  const hermesHome = getHermesHome()
  const filePath = getAutopilotSuggestionsFilePath()
  fs.mkdirSync(hermesHome, { recursive: true })
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ suggestions: [] }, null, 2) + '\n', 'utf-8')
  }
}

function readAutopilotSuggestionsFile(): AutopilotSuggestionsFile {
  const filePath = getAutopilotSuggestionsFilePath()
  ensureAutopilotSuggestionsFile()
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim()
    if (!raw) return { suggestions: [] }
    const parsed = JSON.parse(raw) as Partial<AutopilotSuggestionsFile>
    return { suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [] }
  } catch {
    return { suggestions: [] }
  }
}

function writeAutopilotSuggestionsFile(data: AutopilotSuggestionsFile): void {
  const filePath = getAutopilotSuggestionsFilePath()
  ensureAutopilotSuggestionsFile()
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

function normalizeStatus(value: unknown): AutopilotSuggestionStatus {
  return VALID_STATUSES.includes(value as AutopilotSuggestionStatus)
    ? (value as AutopilotSuggestionStatus)
    : 'new'
}

function normalizeImpact(value: unknown): AutopilotSuggestionImpact {
  return VALID_LEVELS.includes(value as AutopilotSuggestionImpact)
    ? (value as AutopilotSuggestionImpact)
    : 'medium'
}

function normalizeRisk(value: unknown): AutopilotSuggestionRisk {
  return VALID_LEVELS.includes(value as AutopilotSuggestionRisk)
    ? (value as AutopilotSuggestionRisk)
    : 'medium'
}

function normalizeEffort(value: unknown): AutopilotSuggestionEffort {
  return VALID_EFFORTS.includes(value as AutopilotSuggestionEffort)
    ? (value as AutopilotSuggestionEffort)
    : 'medium'
}

function normalizeSource(value: unknown): AutopilotSuggestionSource {
  return VALID_SOURCES.includes(value as AutopilotSuggestionSource)
    ? (value as AutopilotSuggestionSource)
    : 'autopilot'
}

function normalizeAutopilotSuggestion(
  suggestion: Partial<AutopilotSuggestionRecord> &
    Pick<AutopilotSuggestionRecord, 'id' | 'projectId' | 'title' | 'rationale' | 'createdAt' | 'updatedAt'>,
): AutopilotSuggestionRecord {
  return {
    id: suggestion.id,
    projectId: suggestion.projectId.trim(),
    title: suggestion.title.trim(),
    rationale: suggestion.rationale.trim(),
    evidence: uniqueStrings(suggestion.evidence),
    suggestedAcceptanceCriteria: uniqueStrings(suggestion.suggestedAcceptanceCriteria),
    impact: normalizeImpact(suggestion.impact),
    risk: normalizeRisk(suggestion.risk),
    effort: normalizeEffort(suggestion.effort),
    labels: uniqueStrings(suggestion.labels),
    source: normalizeSource(suggestion.source),
    status: normalizeStatus(suggestion.status),
    rejectionReason: asOptionalString(suggestion.rejectionReason),
    convertedWorkItemId: asOptionalString(suggestion.convertedWorkItemId),
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  }
}

export function listAutopilotSuggestions(
  filters: ListAutopilotSuggestionsFilters = {},
): Array<AutopilotSuggestionRecord> {
  let suggestions = readAutopilotSuggestionsFile().suggestions.map((suggestion) =>
    normalizeAutopilotSuggestion(suggestion),
  )

  if (filters.projectId) {
    suggestions = suggestions.filter((suggestion) => suggestion.projectId === filters.projectId)
  }
  if (filters.status) {
    suggestions = suggestions.filter((suggestion) => suggestion.status === filters.status)
  }
  if (filters.source) {
    suggestions = suggestions.filter((suggestion) => suggestion.source === filters.source)
  }

  return suggestions.slice().reverse()
}

export function getAutopilotSuggestion(suggestionId: string): AutopilotSuggestionRecord | null {
  return listAutopilotSuggestions().find((suggestion) => suggestion.id === suggestionId) ?? null
}

export function createAutopilotSuggestion(
  input: CreateAutopilotSuggestionInput,
): AutopilotSuggestionRecord {
  const file = readAutopilotSuggestionsFile()
  const now = new Date().toISOString()

  const suggestion = normalizeAutopilotSuggestion({
    id: typeof input.id === 'string' && input.id.trim() ? input.id : randomUUID(),
    projectId: input.projectId,
    title: input.title,
    rationale: input.rationale,
    evidence: input.evidence,
    suggestedAcceptanceCriteria: input.suggestedAcceptanceCriteria,
    impact: input.impact,
    risk: input.risk,
    effort: input.effort,
    labels: input.labels,
    source: input.source,
    status: input.status,
    rejectionReason: input.rejectionReason,
    convertedWorkItemId: input.convertedWorkItemId,
    createdAt: now,
    updatedAt: now,
  })

  file.suggestions.push(suggestion)
  writeAutopilotSuggestionsFile({
    suggestions: file.suggestions.map((item) => normalizeAutopilotSuggestion(item)),
  })

  return suggestion
}

export function updateAutopilotSuggestion(
  suggestionId: string,
  updates: UpdateAutopilotSuggestionInput,
): AutopilotSuggestionRecord | null {
  const file = readAutopilotSuggestionsFile()
  const currentIndex = file.suggestions.findIndex((suggestion) => suggestion.id === suggestionId)
  if (currentIndex === -1) return null

  const current = normalizeAutopilotSuggestion(file.suggestions[currentIndex])
  const next = normalizeAutopilotSuggestion({
    ...current,
    ...updates,
    id: current.id,
    projectId: current.projectId,
    title: asOptionalString(updates.title) ?? current.title,
    rationale: asOptionalString(updates.rationale) ?? current.rationale,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })

  file.suggestions[currentIndex] = next
  writeAutopilotSuggestionsFile({
    suggestions: file.suggestions.map((item) => normalizeAutopilotSuggestion(item)),
  })
  return next
}

export function acceptAutopilotSuggestion(suggestionId: string): AutopilotSuggestionRecord | null {
  return updateAutopilotSuggestion(suggestionId, {
    status: 'accepted',
    rejectionReason: undefined,
  })
}

export function rejectAutopilotSuggestion(
  suggestionId: string,
  reason?: string,
): AutopilotSuggestionRecord | null {
  return updateAutopilotSuggestion(suggestionId, {
    status: 'rejected',
    rejectionReason: reason,
  })
}

export function archiveAutopilotSuggestion(suggestionId: string): AutopilotSuggestionRecord | null {
  return updateAutopilotSuggestion(suggestionId, {
    status: 'archived',
  })
}

export function markAutopilotSuggestionConverted(
  suggestionId: string,
  workItemId: string,
): AutopilotSuggestionRecord | null {
  return updateAutopilotSuggestion(suggestionId, {
    status: 'converted',
    convertedWorkItemId: workItemId,
    rejectionReason: undefined,
  })
}

export function deleteAutopilotSuggestionsForProject(projectId: string): number {
  const file = readAutopilotSuggestionsFile()
  const nextSuggestions = file.suggestions.filter((suggestion) => suggestion.projectId !== projectId)
  const deletedCount = file.suggestions.length - nextSuggestions.length
  if (deletedCount === 0) return 0

  writeAutopilotSuggestionsFile({
    suggestions: nextSuggestions.map((item) => normalizeAutopilotSuggestion(item)),
  })

  return deletedCount
}
