import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { getProject } from './projects-store'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem,
  type WorkItemPhase,
  type WorkItemPriority,
  type WorkItemRiskLevel,
} from './work-items-store'

export type WorkItemApprovalPhase = 'review' | 'deploy'
export type WorkItemApprovalStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected'

export type WorkItemApprovalRecord = {
  id: string
  workItemId: string
  projectId: string
  phase: WorkItemApprovalPhase
  status: WorkItemApprovalStatus
  requestedBy: string
  requestedAt: string
  resolvedBy?: string
  resolvedAt?: string
  notes?: string
  resolutionNotes?: string
  createdAt: string
  updatedAt: string
}

export type ApprovalInboxEntry = {
  approvalId: string
  workItemId: string
  workItemTitle: string
  projectId: string
  projectName: string
  phase: WorkItemApprovalPhase
  status: WorkItemApprovalStatus
  requestedBy: string
  requestedAt: string
  resolvedBy?: string
  resolvedAt?: string
  notes?: string
  resolutionNotes?: string
}

type WorkItemApprovalsFile = {
  approvals: Array<WorkItemApprovalRecord>
}

type RequestWorkItemApprovalInput = {
  requestedBy?: string
  notes?: string
  phase?: WorkItemApprovalPhase
}

type ResolveWorkItemApprovalInput = {
  decision: 'approved' | 'changes_requested' | 'rejected'
  resolvedBy?: string
  notes?: string
}

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getWorkItemApprovalsFile(): string {
  return path.join(getHermesHome(), 'work-item-approvals.json')
}

function ensureWorkItemApprovalsFile(): void {
  const hermesHome = getHermesHome()
  const approvalsFile = getWorkItemApprovalsFile()
  fs.mkdirSync(hermesHome, { recursive: true })
  if (!fs.existsSync(approvalsFile)) {
    fs.writeFileSync(approvalsFile, JSON.stringify({ approvals: [] }, null, 2) + '\n', 'utf-8')
  }
}

function readApprovalsFile(): WorkItemApprovalsFile {
  ensureWorkItemApprovalsFile()
  const approvalsFile = getWorkItemApprovalsFile()
  try {
    const raw = fs.readFileSync(approvalsFile, 'utf-8').trim()
    if (!raw) return { approvals: [] }
    const parsed = JSON.parse(raw) as Partial<WorkItemApprovalsFile>
    return { approvals: Array.isArray(parsed.approvals) ? parsed.approvals : [] }
  } catch {
    return { approvals: [] }
  }
}

function writeApprovalsFile(data: WorkItemApprovalsFile): void {
  ensureWorkItemApprovalsFile()
  fs.writeFileSync(getWorkItemApprovalsFile(), JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizePhase(value: unknown): WorkItemApprovalPhase {
  return value === 'deploy' ? 'deploy' : 'review'
}

function normalizeStatus(value: unknown): WorkItemApprovalStatus {
  return value === 'approved' || value === 'changes_requested' || value === 'rejected'
    ? value
    : 'pending'
}

function normalizeApproval(
  approval: Partial<WorkItemApprovalRecord> &
    Pick<
      WorkItemApprovalRecord,
      'id' | 'workItemId' | 'projectId' | 'phase' | 'status' | 'requestedBy' | 'requestedAt' | 'createdAt' | 'updatedAt'
    >,
): WorkItemApprovalRecord {
  return {
    id: approval.id,
    workItemId: approval.workItemId,
    projectId: approval.projectId,
    phase: normalizePhase(approval.phase),
    status: normalizeStatus(approval.status),
    requestedBy: approval.requestedBy.trim(),
    requestedAt: approval.requestedAt,
    resolvedBy: asOptionalString(approval.resolvedBy),
    resolvedAt: asOptionalString(approval.resolvedAt),
    notes: asOptionalString(approval.notes),
    resolutionNotes: asOptionalString(approval.resolutionNotes),
    createdAt: approval.createdAt,
    updatedAt: approval.updatedAt,
  }
}

export function listWorkItemApprovals(workItemId?: string): Array<WorkItemApprovalRecord> {
  const approvals = readApprovalsFile().approvals.map((approval) => normalizeApproval(approval))
  const filtered = workItemId ? approvals.filter((approval) => approval.workItemId === workItemId) : approvals
  return filtered.sort((a, b) => a.requestedAt.localeCompare(b.requestedAt))
}

export function getWorkItemApproval(approvalId: string): WorkItemApprovalRecord | null {
  return listWorkItemApprovals().find((approval) => approval.id === approvalId) ?? null
}

function priorityRank(priority: WorkItemPriority): number {
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  return 1
}

function shouldAutoApproveReview(workItemId: string): boolean {
  const workItem = getWorkItem(workItemId)
  if (!workItem) return false

  // Low-risk items auto-approve through review regardless of project policy
  if (workItem.riskLevel === 'low') return true

  const project = getProject(workItem.projectId)
  if (!project?.reviewAutoApproval.enabled) return false
  return priorityRank(workItem.priority) <= priorityRank(project.reviewAutoApproval.maxPriority)
}

export function listApprovalInboxEntries(): Array<ApprovalInboxEntry> {
  return listWorkItemApprovals()
    .map((approval) => {
      const workItem = getWorkItem(approval.workItemId)
      const project = getProject(approval.projectId)
      if (!workItem || !project) return null
      return {
        approvalId: approval.id,
        workItemId: workItem.id,
        workItemTitle: workItem.title,
        projectId: project.id,
        projectName: project.name,
        phase: approval.phase,
        status: approval.status,
        requestedBy: approval.requestedBy,
        requestedAt: approval.requestedAt,
        resolvedBy: approval.resolvedBy,
        resolvedAt: approval.resolvedAt,
        notes: approval.notes,
        resolutionNotes: approval.resolutionNotes,
      } satisfies ApprovalInboxEntry
    })
    .filter((entry): entry is ApprovalInboxEntry => Boolean(entry))
    .sort((a, b) => {
      const aPending = a.status === 'pending' ? 1 : 0
      const bPending = b.status === 'pending' ? 1 : 0
      if (aPending !== bPending) return bPending - aPending
      return b.requestedAt.localeCompare(a.requestedAt)
    })
}

function updateWorkItemApproval(
  approvalId: string,
  updates: Partial<Omit<WorkItemApprovalRecord, 'id' | 'workItemId' | 'projectId' | 'createdAt' | 'requestedAt'>>,
): WorkItemApprovalRecord | null {
  const file = readApprovalsFile()
  const currentIndex = file.approvals.findIndex((approval) => approval.id === approvalId)
  if (currentIndex === -1) return null

  const current = normalizeApproval(file.approvals[currentIndex])
  const next = normalizeApproval({
    ...current,
    ...updates,
    id: current.id,
    workItemId: current.workItemId,
    projectId: current.projectId,
    requestedAt: current.requestedAt,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })

  file.approvals[currentIndex] = next
  writeApprovalsFile({ approvals: file.approvals.map((approval) => normalizeApproval(approval)) })
  return next
}

export function requestWorkItemApproval(
  workItemId: string,
  input: RequestWorkItemApprovalInput = {},
): WorkItemApprovalRecord {
  const workItem = getWorkItem(workItemId)
  if (!workItem) throw new Error('Work item not found')
  const phase = input.phase ?? 'review'
  if (workItem.phase !== phase) throw new Error(`Work item must be in ${phase} phase`)
  const project = getProject(workItem.projectId)
  if (!project) throw new Error('Project not found')

  const existing = listWorkItemApprovals(workItemId).find(
    (approval) => approval.phase === phase && approval.status === 'pending',
  )
  if (existing) return existing

  const now = new Date().toISOString()
  const autoApproved = phase === 'review' && shouldAutoApproveReview(workItem.id)
  const approval = normalizeApproval({
    id: randomUUID(),
    workItemId: workItem.id,
    projectId: workItem.projectId,
    phase,
    status: autoApproved ? 'approved' : 'pending',
    requestedBy: input.requestedBy?.trim() || 'system',
    requestedAt: now,
    resolvedBy: autoApproved ? 'policy' : undefined,
    resolvedAt: autoApproved ? now : undefined,
    notes: input.notes,
    resolutionNotes: autoApproved ? 'Auto-approved by project review policy.' : undefined,
    createdAt: now,
    updatedAt: now,
  })

  const file = readApprovalsFile()
  file.approvals.push(approval)
  writeApprovalsFile({ approvals: file.approvals.map((entry) => normalizeApproval(entry)) })

  if (autoApproved) {
    const updatedWorkItem = updateWorkItem(workItem.id, {
      status: 'active',
      phase: 'deploy',
    })
    if (!updatedWorkItem) throw new Error('Failed to update work item after auto-approval')
    appendWorkItemHistoryEntry(updatedWorkItem.id, {
      action: 'status-change',
      status: 'active',
      phase: 'deploy',
      note: 'Review auto-approved by policy; advanced work item to deploy.',
      missionId: updatedWorkItem.missionId,
      sessionKey: updatedWorkItem.sessionKeys.at(-1),
      profile: updatedWorkItem.assignedProfile,
    })
    return approval
  }

  appendWorkItemHistoryEntry(workItem.id, {
    action: 'note',
    status: workItem.status,
    phase: workItem.phase,
    note: input.notes?.trim()
      ? `${phase === 'deploy' ? 'Deploy' : 'Review'} approval requested: ${input.notes.trim()}`
      : `${phase === 'deploy' ? 'Deploy' : 'Review'} approval requested.`,
    missionId: workItem.missionId,
    sessionKey: workItem.sessionKeys.at(-1),
    profile: workItem.assignedProfile,
  })

  return approval
}

export function requestWorkItemReviewApproval(
  workItemId: string,
  input: Omit<RequestWorkItemApprovalInput, 'phase'> = {},
): WorkItemApprovalRecord {
  return requestWorkItemApproval(workItemId, { ...input, phase: 'review' })
}

function approvalResolutionTransition(
  approval: WorkItemApprovalRecord,
  decision: ResolveWorkItemApprovalInput['decision'],
): {
  status: 'done' | 'active'
  phase?: WorkItemPhase
  note: string
} {
  if (approval.phase === 'review') {
    if (decision === 'approved') {
      return {
        status: 'active',
        phase: 'deploy',
        note: 'Review approved; advanced work item to deploy.',
      }
    }

    return {
      status: 'active',
      phase: 'build',
      note:
        decision === 'rejected'
          ? 'Review rejected; returned work item to build for relaunch.'
          : 'Review requested changes; returned work item to build for relaunch.',
    }
  }

  if (decision === 'approved') {
    return {
      status: 'done',
      phase: undefined,
      note: 'Deploy approved; work item completed.',
    }
  }

  return {
    status: 'active',
    phase: 'deploy',
    note:
      decision === 'rejected'
        ? 'Deploy rejected; kept work item in deploy for follow-up and relaunch.'
        : 'Deploy requested changes; kept work item in deploy for follow-up and relaunch.',
  }
}

export function resolveWorkItemApprovalDecision(
  approvalId: string,
  input: ResolveWorkItemApprovalInput,
): { approval: WorkItemApprovalRecord; workItem: NonNullable<ReturnType<typeof getWorkItem>> } {
  const approval = getWorkItemApproval(approvalId)
  if (!approval) throw new Error('Approval not found')
  if (approval.status !== 'pending') throw new Error('Approval already resolved')

  const workItem = getWorkItem(approval.workItemId)
  if (!workItem) throw new Error('Work item not found')

  const updatedApproval = updateWorkItemApproval(approval.id, {
    status: input.decision,
    resolvedBy: input.resolvedBy?.trim() || 'operator',
    resolvedAt: new Date().toISOString(),
    resolutionNotes: input.notes,
  })
  if (!updatedApproval) throw new Error('Failed to update approval')

  const transition = approvalResolutionTransition(updatedApproval, input.decision)
  const updatedWorkItem = updateWorkItem(workItem.id, {
    status: transition.status,
    phase: transition.phase,
  })
  if (!updatedWorkItem) throw new Error('Failed to update work item after approval decision')

  const historyWorkItem = appendWorkItemHistoryEntry(updatedWorkItem.id, {
    action: 'status-change',
    status: transition.status,
    phase: transition.phase,
    note: transition.note,
    missionId: updatedWorkItem.missionId,
    sessionKey: updatedWorkItem.sessionKeys.at(-1),
    profile: updatedWorkItem.assignedProfile,
  })
  if (!historyWorkItem) throw new Error('Failed to append approval history entry')

  return {
    approval: updatedApproval,
    workItem: historyWorkItem,
  }
}
