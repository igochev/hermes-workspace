import { launchImmediateExecution } from './immediate-execution-launch'
import { listProfiles } from './profiles-browser'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem,
} from './work-items-store'
import type { ProjectRecord } from './projects-store'
import type {
  WorkItemRecord,
  WorkItemReleaseAuditDecision,
  WorkItemReleaseAuditState,
} from './work-items-store'

export type SupervisorAuditConfidence = 'low' | 'medium' | 'high'

export type ParsedSupervisorAuditOutput = {
  decision: WorkItemReleaseAuditDecision
  summary: string
  findings: Array<string>
  requiredActions: Array<string>
  confidence: SupervisorAuditConfidence
}

export type ReleaseAuditLaunchResult = {
  executionRunId: string
  sessionKey?: string
  state: 'queued' | 'running'
  link: string
  profile: string
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readSupervisorProfile(project: ProjectRecord): string {
  return readOptionalString(project.runtimeProfiles.supervisorProfile)
}

function uniqueStrings(items: Array<string>): Array<string> {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function normalizeAuditDecision(value: string): WorkItemReleaseAuditDecision | null {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'APPROVED') return 'approved'
  if (normalized === 'VETOED') return 'vetoed'
  if (normalized === 'MANUAL_REVIEW') return 'manual_review'
  return null
}

function normalizeConfidence(value: string): SupervisorAuditConfidence {
  const normalized = value.trim().toLowerCase()
  return normalized === 'low' || normalized === 'high' ? normalized : 'medium'
}

function extractLineValue(output: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = output.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'im'))
  return match?.[1]?.trim() ?? ''
}

function extractListSection(output: string, label: string): Array<string> {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = output.match(
    new RegExp(`^${escaped}:\\s*\\n([\\s\\S]*?)(?=^SUPERVISOR_AUDIT_[A-Z_]+:|(?![\\s\\S]))`, 'im'),
  )?.[1]
  if (!section) return []
  return uniqueStrings(
    section
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
      .filter((line) => line && !/^none$/i.test(line)),
  )
}

export function buildReleaseAuditGoal(workItem: WorkItemRecord, project: ProjectRecord): string {
  const repoPath = readOptionalString(workItem.repoPathSnapshot) || project.repoPath
  return [
    `You are acting as the read-only release Supervisor for Hermes Mission Control work item "${workItem.title}" of project "${project.name}".`,
    `Work item ID: ${workItem.id}`,
    `Project ID: ${project.id}`,
    `Repository path: ${repoPath}`,
    ...(project.defaultBranch ? [`Default branch: ${project.defaultBranch}`] : []),
    ...(workItem.branchName ? [`Branch: ${workItem.branchName}`] : []),
    ...(workItem.mergeTargetBranch ? [`Merge target branch: ${workItem.mergeTargetBranch}`] : []),
    `Risk level: ${workItem.riskLevel}`,
    `Review decision: ${workItem.reviewDecision ?? 'not recorded'}`,
    workItem.mergeState ? `Merge state: ${workItem.mergeState}` : 'Merge state: not recorded',
    workItem.mergeBaseCommit ? `Merge base commit: ${workItem.mergeBaseCommit}` : 'Merge base commit: not recorded',
    workItem.mergeCommit ? `Merge commit: ${workItem.mergeCommit}` : 'Merge commit: not recorded',
    `Artifact paths: ${workItem.artifactPaths.length > 0 ? workItem.artifactPaths.join(', ') : 'none recorded'}`,
    '',
    'Description:',
    workItem.description || 'No additional description provided.',
    '',
    'Acceptance criteria:',
    ...(workItem.acceptanceCriteria.length > 0
      ? workItem.acceptanceCriteria.map((item) => `- ${item}`)
      : ['- none recorded']),
    '',
    'Audit boundaries:',
    '- Do not mutate files, branches, commits, services, profiles, or messaging gateways.',
    '- Inspect evidence only. If evidence is missing or unsafe, return VETOED or MANUAL_REVIEW.',
    '- Do not act as Builder, Deploy, or Merge-Healer.',
    '',
    'Required output contract:',
    'SUPERVISOR_AUDIT_DECISION: APPROVED | VETOED | MANUAL_REVIEW',
    'SUPERVISOR_AUDIT_SUMMARY: <one concise paragraph>',
    'SUPERVISOR_AUDIT_FINDINGS:',
    '- <finding 1>',
    'SUPERVISOR_AUDIT_REQUIRED_ACTIONS:',
    '- <action, or "none">',
    'SUPERVISOR_AUDIT_CONFIDENCE: low | medium | high',
  ].join('\n')
}

export function parseSupervisorAuditOutput(output: string): ParsedSupervisorAuditOutput {
  const decision = normalizeAuditDecision(extractLineValue(output, 'SUPERVISOR_AUDIT_DECISION'))
  if (!decision) {
    throw new Error('Supervisor audit output missing valid SUPERVISOR_AUDIT_DECISION')
  }
  const summary = extractLineValue(output, 'SUPERVISOR_AUDIT_SUMMARY')
  if (!summary) {
    throw new Error('Supervisor audit output missing SUPERVISOR_AUDIT_SUMMARY')
  }
  return {
    decision,
    summary,
    findings: extractListSection(output, 'SUPERVISOR_AUDIT_FINDINGS'),
    requiredActions: extractListSection(output, 'SUPERVISOR_AUDIT_REQUIRED_ACTIONS'),
    confidence: normalizeConfidence(extractLineValue(output, 'SUPERVISOR_AUDIT_CONFIDENCE')),
  }
}

export function auditStateFromDecision(decision: WorkItemReleaseAuditDecision): WorkItemReleaseAuditState {
  if (decision === 'approved') return 'approved'
  if (decision === 'vetoed') return 'vetoed'
  return 'manual_review'
}

function assertSupervisorProfileAvailable(profile: string): void {
  const availableProfiles = new Set(listProfiles().map((item) => item.name))
  if (!availableProfiles.has(profile)) {
    throw new Error(`Supervisor profile "${profile}" is not available; refusing release audit fallback to Builder.`)
  }
}

export async function launchReleaseAuditForWorkItem(
  workItem: WorkItemRecord,
  project: ProjectRecord,
): Promise<ReleaseAuditLaunchResult> {
  const profile = readSupervisorProfile(project)
  if (!profile) {
    throw new Error('Release audit requires a mapped Supervisor profile; refusing to fallback to Builder.')
  }
  assertSupervisorProfileAvailable(profile)

  const repoPath = readOptionalString(workItem.repoPathSnapshot) || project.repoPath
  if (!repoPath.trim()) throw new Error('Repository path required before launching release audit')

  const launch = await launchImmediateExecution({
    projectId: project.id,
    workItemId: workItem.id,
    phase: 'deploy',
    role: 'supervisor',
    profile,
    goal: buildReleaseAuditGoal(workItem, project),
    repoPath,
  })
  const sessionKeys = launch.sessionKey
    ? Array.from(new Set([...workItem.sessionKeys, launch.sessionKey]))
    : [...workItem.sessionKeys]
  const updated = updateWorkItem(workItem.id, {
    releaseAuditState: 'running',
    releaseAuditExecutionId: launch.executionRunId,
    releaseAuditMissionId: launch.executionRunId,
    releaseAuditProfile: profile,
    releaseAuditDecision: undefined,
    releaseAuditSummary: 'Supervisor release audit is running.',
    releaseAuditReasons: [],
    releaseAuditMissingEvidence: ['release audit approval'],
    releaseAuditObservedAt: new Date().toISOString(),
    sessionKeys,
  })
  if (!updated) throw new Error('Failed to persist release audit launch state')
  appendWorkItemHistoryEntry(workItem.id, {
    action: 'launch',
    phase: 'deploy',
    status: workItem.status,
    note: `Started read-only release audit using Supervisor profile ${profile}.`,
    missionId: launch.executionRunId,
    sessionKey: launch.sessionKey,
    sessionKeyPrefix: launch.sessionKey,
    profile,
  })

  return { ...launch, profile }
}

export function recordSupervisorAuditOutput(
  workItemId: string,
  parsed: ParsedSupervisorAuditOutput,
): WorkItemRecord {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')
  const state = auditStateFromDecision(parsed.decision)
  const missingEvidence = state === 'approved' ? [] : uniqueStrings(parsed.requiredActions)
  const updated = updateWorkItem(workItemId, {
    releaseAuditState: state,
    releaseAuditDecision: parsed.decision,
    releaseAuditSummary: parsed.summary,
    releaseAuditReasons: parsed.findings,
    releaseAuditMissingEvidence: missingEvidence,
    releaseAuditObservedAt: new Date().toISOString(),
  })
  if (!updated) throw new Error('Failed to persist Supervisor audit output')
  appendWorkItemHistoryEntry(workItemId, {
    action: 'status-change',
    phase: 'deploy',
    status: updated.status,
    note: `Supervisor audit ${parsed.decision}: ${parsed.summary}`,
    profile: updated.releaseAuditProfile,
  })
  return updated
}
