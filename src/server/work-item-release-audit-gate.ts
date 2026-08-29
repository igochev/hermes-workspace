import type { ProjectRecord } from './projects-store'
import type { WorkItemRecord } from './work-items-store'

export type ReleaseAuditGateDecision =
  | { status: 'not_required'; reason: string }
  | { status: 'approved'; reason: string }
  | { status: 'waiting'; reason: string; missingEvidence: Array<string> }
  | { status: 'blocked'; reason: string; missingEvidence: Array<string> }

function uniqueStrings(items: Array<string>): Array<string> {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function releaseAuditPolicy(project: ProjectRecord) {
  return project.autonomyLanePolicy.releaseAudit ?? {
    required: false,
    requiredRiskLevels: ['medium', 'high'] as Array<'medium' | 'high'>,
    supervisorRequired: false,
  }
}

function releaseAuditIsRequired(
  workItem: WorkItemRecord,
  project: ProjectRecord,
): boolean {
  const policy = releaseAuditPolicy(project)
  if (policy.required) return true
  return workItem.riskLevel !== 'low' && policy.requiredRiskLevels.includes(workItem.riskLevel)
}

export function evaluateReleaseAuditGate(
  workItem: WorkItemRecord,
  project: ProjectRecord,
): ReleaseAuditGateDecision {
  const policy = releaseAuditPolicy(project)
  const state = workItem.releaseAuditState

  if (state === 'approved' || workItem.releaseAuditDecision === 'approved') {
    return {
      status: 'approved',
      reason: workItem.releaseAuditSummary || 'Release audit approved deploy evidence.',
    }
  }

  if (state === 'vetoed' || workItem.releaseAuditDecision === 'vetoed') {
    return {
      status: 'blocked',
      reason: `Release audit vetoed deploy: ${(workItem.releaseAuditReasons ?? []).join('; ') || workItem.releaseAuditSummary || 'Supervisor veto recorded.'}`,
      missingEvidence: uniqueStrings([
        ...(workItem.releaseAuditMissingEvidence ?? []),
        'release audit approval',
      ]),
    }
  }

  if (state === 'failed') {
    return {
      status: 'blocked',
      reason: `Release audit failed: ${workItem.releaseAuditSummary || 'Audit execution failed before approval.'}`,
      missingEvidence: uniqueStrings([
        ...(workItem.releaseAuditMissingEvidence ?? []),
        'successful release audit',
      ]),
    }
  }

  if (!releaseAuditIsRequired(workItem, project)) {
    return {
      status: 'not_required',
      reason:
        workItem.releaseAuditSummary ||
        'Release audit is not required by current conservative lane policy.',
    }
  }

  const missingEvidence = uniqueStrings([
    ...(workItem.releaseAuditMissingEvidence ?? []),
    policy.supervisorRequired && !project.runtimeProfiles.supervisorProfile
      ? 'mapped Supervisor profile'
      : '',
    'release audit approval',
  ])

  if (policy.supervisorRequired && !project.runtimeProfiles.supervisorProfile) {
    return {
      status: 'waiting',
      reason:
        'Release audit is waiting for a mapped Supervisor profile; refusing to fallback to Builder.',
      missingEvidence,
    }
  }

  if (state === 'running') {
    return {
      status: 'waiting',
      reason: 'Release audit is running; Merge-Healer is waiting for approval evidence.',
      missingEvidence,
    }
  }

  if (state === 'manual_review') {
    return {
      status: 'waiting',
      reason: 'Release audit requires manual review before Merge-Healer can run.',
      missingEvidence,
    }
  }

  return {
    status: 'waiting',
    reason: 'Release audit approval is required before Merge-Healer can run.',
    missingEvidence,
  }
}
