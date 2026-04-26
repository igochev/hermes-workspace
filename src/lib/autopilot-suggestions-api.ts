export type AutopilotSuggestionStatus = 'new' | 'accepted' | 'rejected' | 'converted' | 'archived'
export type AutopilotSuggestionImpact = 'low' | 'medium' | 'high'
export type AutopilotSuggestionRisk = 'low' | 'medium' | 'high'
export type AutopilotSuggestionEffort = 'small' | 'medium' | 'large'
export type AutopilotSuggestionConvertMode =
  | 'work-item'
  | 'work-item-and-plan'
  | 'work-item-plan-build-queued'

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

export type CreateAutopilotSuggestionInput = {
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
}

export type UpdateAutopilotSuggestionInput = Partial<
  Omit<CreateAutopilotSuggestionInput, 'projectId'> & {
    status: AutopilotSuggestionStatus
    rejectionReason?: string | null
  }
>

export const AUTOPILOT_SUGGESTION_STATUS_LABELS: Record<AutopilotSuggestionStatus, string> = {
  new: 'New',
  accepted: 'Accepted',
  rejected: 'Rejected',
  converted: 'Converted',
  archived: 'Archived',
}

export const AUTOPILOT_SUGGESTION_IMPACT_LABELS: Record<AutopilotSuggestionImpact, string> = {
  low: 'Low impact',
  medium: 'Medium impact',
  high: 'High impact',
}

export const AUTOPILOT_SUGGESTION_RISK_LABELS: Record<AutopilotSuggestionRisk, string> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
}

export const AUTOPILOT_SUGGESTION_EFFORT_LABELS: Record<AutopilotSuggestionEffort, string> = {
  small: 'Small effort',
  medium: 'Medium effort',
  large: 'Large effort',
}

export const AUTOPILOT_SUGGESTION_SOURCE_LABELS: Record<AutopilotSuggestionSource, string> = {
  manual: 'Manual',
  autopilot: 'Autopilot',
  'repo-health-scout': 'Repo health scout',
  'failing-tests-scout': 'Failing tests scout',
  'stale-docs-scout': 'Stale docs scout',
  'ux-friction-scout': 'UX friction scout',
  'dependency-api-scout': 'Dependency/API scout',
  'architecture-debt-scout': 'Architecture debt scout',
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}))
  const message = typeof body?.error === 'string' ? body.error : fallback
  return new Error(message)
}

export async function fetchAutopilotSuggestions(filters?: {
  projectId?: string
  status?: AutopilotSuggestionStatus
  source?: AutopilotSuggestionSource
}): Promise<Array<AutopilotSuggestionRecord>> {
  const search = new URLSearchParams()
  if (filters?.projectId) search.set('projectId', filters.projectId)
  if (filters?.status) search.set('status', filters.status)
  if (filters?.source) search.set('source', filters.source)

  const suffix = search.toString() ? `?${search}` : ''
  const response = await fetch(`/api/autopilot-suggestions${suffix}`)
  if (!response.ok) {
    throw await readError(response, `Failed to fetch autopilot suggestions: ${response.status}`)
  }

  const data = await readJson<{ suggestions?: Array<AutopilotSuggestionRecord> }>(response)
  return data.suggestions ?? []
}

export async function createAutopilotSuggestion(
  input: CreateAutopilotSuggestionInput,
): Promise<AutopilotSuggestionRecord> {
  const response = await fetch('/api/autopilot-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw await readError(response, `Failed to create autopilot suggestion: ${response.status}`)
  }

  const data = await readJson<{ suggestion: AutopilotSuggestionRecord }>(response)
  return data.suggestion
}

export async function updateAutopilotSuggestion(
  suggestionId: string,
  input: UpdateAutopilotSuggestionInput,
): Promise<AutopilotSuggestionRecord> {
  const response = await fetch(`/api/autopilot-suggestions/${encodeURIComponent(suggestionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    throw await readError(response, `Failed to update autopilot suggestion: ${response.status}`)
  }

  const data = await readJson<{ suggestion: AutopilotSuggestionRecord }>(response)
  return data.suggestion
}

export async function acceptAutopilotSuggestion(
  suggestionId: string,
): Promise<AutopilotSuggestionRecord> {
  return updateAutopilotSuggestion(suggestionId, { status: 'accepted' })
}

export async function rejectAutopilotSuggestion(
  suggestionId: string,
  rejectionReason?: string,
): Promise<AutopilotSuggestionRecord> {
  return updateAutopilotSuggestion(suggestionId, {
    status: 'rejected',
    rejectionReason,
  })
}

export async function archiveAutopilotSuggestion(
  suggestionId: string,
): Promise<AutopilotSuggestionRecord> {
  return updateAutopilotSuggestion(suggestionId, { status: 'archived' })
}

export async function convertAutopilotSuggestion(
  suggestionId: string,
  mode: AutopilotSuggestionConvertMode = 'work-item',
): Promise<{ suggestion: AutopilotSuggestionRecord; workItem: { id: string }; planningDraft?: { id: string } }> {
  const response = await fetch(`/api/autopilot-suggestions/${encodeURIComponent(suggestionId)}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })

  if (!response.ok) {
    throw await readError(response, `Failed to convert autopilot suggestion: ${response.status}`)
  }

  return readJson(response)
}
