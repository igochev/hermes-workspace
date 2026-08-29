import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { getProject } from './projects-store'
import { listWorkItemApprovals } from './work-item-approvals'
import {
  appendWorkItemHistoryEntry,
  getWorkItem,
  updateWorkItem,
} from './work-items-store'
import type { WorkItemRecord } from './work-items-store'

export type RecoverBranchEvidenceInput = {
  workItemId: string
  branchName: string
  baseBranch?: string
  operatorNote?: string
}

export type RecoverBranchEvidenceResult = {
  workItem: WorkItemRecord
  baseBranch: string
  branchName: string
  mergeBaseCommit: string
  branchHeadCommit: string
  commitsAhead: Array<string>
}

function runGit(repoPath: string, args: Array<string>): string {
  try {
    return execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr?: unknown }).stderr ?? '').trim()
        : ''
    throw new Error(stderr || `git ${args.join(' ')} failed`)
  }
}

function assertRefExists(repoPath: string, refName: string, label: string): string {
  try {
    return runGit(repoPath, ['rev-parse', '--verify', `${refName}^{commit}`])
  } catch {
    throw new Error(`${label} ref not found in candidate repo: ${refName}`)
  }
}

function assertNoInProgressOperation(repoPath: string): void {
  const gitDir = runGit(repoPath, ['rev-parse', '--git-dir'])
  const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.join(repoPath, gitDir)
  const markers = ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD']
  const activeMarker = markers.find((marker) => fs.existsSync(path.join(absoluteGitDir, marker)))
  if (activeMarker) {
    throw new Error(`Candidate repo has an in-progress git operation (${activeMarker}); abort before recovering branch evidence.`)
  }
  if (
    fs.existsSync(path.join(absoluteGitDir, 'rebase-merge')) ||
    fs.existsSync(path.join(absoluteGitDir, 'rebase-apply'))
  ) {
    throw new Error('Candidate repo has an in-progress rebase; abort before recovering branch evidence.')
  }
}

function assertCleanRepo(repoPath: string): void {
  const status = runGit(repoPath, ['status', '--porcelain=v1'])
  if (status.length > 0) {
    throw new Error('Candidate repo must be clean before attaching branch evidence.')
  }
}

function findLinkedWorktreeForBranch(repoPath: string, branchName: string): string | undefined {
  const worktrees = runGit(repoPath, ['worktree', 'list', '--porcelain'])
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)

  for (const block of worktrees) {
    const lines = block.split('\n')
    const worktreeLine = lines.find((line) => line.startsWith('worktree '))
    const branchLine = lines.find((line) => line === `branch refs/heads/${branchName}`)
    if (worktreeLine && branchLine) return worktreeLine.slice('worktree '.length).trim()
  }

  return undefined
}

function hasApprovedReviewEvidence(workItem: WorkItemRecord): boolean {
  if (workItem.reviewDecision === 'approved') return true
  return listWorkItemApprovals(workItem.id).some(
    (approval) => approval.phase === 'review' && approval.status === 'approved',
  )
}

function assertSafeRecoveryShape(workItem: WorkItemRecord): void {
  if (workItem.status !== 'blocked' || workItem.phase !== 'deploy' || workItem.mergeState !== 'failed') {
    throw new Error('Branch evidence recovery requires a blocked deploy work item with failed merge state.')
  }
  if (!workItem.laneBlockedReason?.includes('no feature branch evidence')) {
    throw new Error('Branch evidence recovery only supports the no feature branch evidence blocker.')
  }
  if (!hasApprovedReviewEvidence(workItem)) {
    throw new Error('Branch evidence recovery requires approved review evidence.')
  }
}

export async function recoverMissingBranchEvidence(
  input: RecoverBranchEvidenceInput,
): Promise<RecoverBranchEvidenceResult> {
  await Promise.resolve()
  const workItem = getWorkItem(input.workItemId)
  if (!workItem) throw new Error('Work item not found')

  const project = getProject(workItem.projectId)
  if (!project) throw new Error('Project not found')
  if (!project.repoPath.trim()) throw new Error('Project repo path is required')

  assertSafeRecoveryShape(workItem)

  const branchName = input.branchName.trim()
  const baseBranch = (input.baseBranch ?? project.defaultBranch ?? 'main').trim()
  if (!branchName || !baseBranch) throw new Error('branchName and baseBranch are required')
  if (branchName === baseBranch) throw new Error('branchName must differ from baseBranch')

  const repoPath = project.repoPath.trim()
  const validationRepoPath = findLinkedWorktreeForBranch(repoPath, branchName) ?? repoPath
  assertNoInProgressOperation(validationRepoPath)
  assertCleanRepo(validationRepoPath)
  const baseCommit = assertRefExists(repoPath, baseBranch, 'base')
  const branchHeadCommit = assertRefExists(repoPath, branchName, 'branch')
  const mergeBaseCommit = runGit(repoPath, ['merge-base', baseBranch, branchName])
  if (!mergeBaseCommit) throw new Error('Unable to resolve merge-base for recovery branch')

  const commitsAhead = runGit(repoPath, ['log', `${baseBranch}..${branchName}`, '--oneline'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (commitsAhead.length === 0 || baseCommit === branchHeadCommit) {
    throw new Error('Recovery branch must contain at least one commit ahead of baseBranch')
  }

  const updated = updateWorkItem(workItem.id, {
    status: 'active',
    phase: 'deploy',
    blockedReason: undefined,
    laneState: 'merge_healing',
    laneBlockedReason:
      input.operatorNote?.trim() ||
      'Operator attached validated recovery branch evidence for Merge-Healer retry.',
    branchName,
    baseBranch,
    mergeTargetBranch: baseBranch,
    mergeBaseCommit,
    mergeState: 'not_started',
    mergeTestPassed: false,
  })
  if (!updated) throw new Error('Failed to attach branch evidence')

  const withHistory = appendWorkItemHistoryEntry(updated.id, {
    action: 'note',
    status: 'active',
    phase: 'deploy',
    note: `Operator attached validated recovery branch evidence: branch ${branchName} at ${branchHeadCommit}, base ${baseBranch} at ${mergeBaseCommit}. Merge-Healer still owns final merge evidence.`,
    missionId: updated.missionId,
    sessionKey: updated.sessionKeys.at(-1),
    profile: updated.assignedProfile,
  })
  if (!withHistory) throw new Error('Failed to append branch evidence recovery history')

  return {
    workItem: withHistory,
    baseBranch,
    branchName,
    mergeBaseCommit,
    branchHeadCommit,
    commitsAhead,
  }
}
