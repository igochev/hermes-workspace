import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProject } from './projects-store'
import { recoverMissingBranchEvidence } from './work-item-branch-evidence-recovery'
import { createWorkItem, getWorkItem } from './work-items-store'
import type { WorkItemRecord } from './work-items-store'

function git(repoPath: string, args: Array<string>): string {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim()
}

function initRepo(repoPath: string): void {
  fs.mkdirSync(repoPath, { recursive: true })
  execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
  git(repoPath, ['config', 'user.email', 'hermes@example.test'])
  git(repoPath, ['config', 'user.name', 'Hermes Test'])
  fs.writeFileSync(path.join(repoPath, 'README.md'), '# Demo\n', 'utf8')
  git(repoPath, ['add', 'README.md'])
  git(repoPath, ['commit', '-m', 'initial'])
}

function addFeatureBranch(repoPath: string, branchName = 'mission/recovery'): string {
  git(repoPath, ['checkout', '-b', branchName])
  fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'feature\n', 'utf8')
  git(repoPath, ['add', 'feature.txt'])
  git(repoPath, ['commit', '-m', 'feature'])
  return git(repoPath, ['rev-parse', 'HEAD'])
}

type WorkItemInput = Partial<Parameters<typeof createWorkItem>[0]> & Partial<WorkItemRecord>

function createBlockedWorkItem(input: WorkItemInput = {}) {
  return createWorkItem({
    projectId: input.projectId ?? 'project-1',
    title: input.title ?? 'Recover branch evidence',
    status: input.status ?? 'blocked',
    phase: input.phase ?? 'deploy',
    priority: input.priority ?? 'high',
    riskLevel: input.riskLevel ?? 'medium',
    repoPathSnapshot: input.repoPathSnapshot ?? '/repo',
    reviewDecision: input.reviewDecision ?? 'approved',
    reviewQualityGateReasons: input.reviewQualityGateReasons ?? [],
    reviewMissingEvidence: input.reviewMissingEvidence ?? [],
    laneState: input.laneState ?? 'blocked',
    laneBlockedReason:
      input.laneBlockedReason ?? 'Merge-Healer blocked: work item has no feature branch evidence.',
    mergeState: input.mergeState ?? 'failed',
    mergeTargetBranch: input.mergeTargetBranch ?? 'main',
    mergeTestPassed: input.mergeTestPassed ?? false,
    artifactPaths: input.artifactPaths ?? ['src/feature.ts'],
    acceptanceCriteria: input.acceptanceCriteria ?? ['Ships feature'],
    notes: input.notes ?? ['keep me'],
    history: input.history ?? [],
  })
}

describe('recoverMissingBranchEvidence', () => {
  let tempDir: string
  let tempHome: string
  let repoPath: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-branch-evidence-'))
    tempHome = path.join(tempDir, '.hermes')
    repoPath = path.join(tempDir, 'repo')
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = tempHome
    initRepo(repoPath)
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('rejects non-blocked work items', async () => {
    const project = createProject({ name: 'Demo', repoPath })
    const workItem = createBlockedWorkItem({ projectId: project.id, status: 'active' })
    addFeatureBranch(repoPath)

    await expect(
      recoverMissingBranchEvidence({ workItemId: workItem.id, branchName: 'mission/recovery' }),
    ).rejects.toThrow(/blocked deploy work item/i)
  })

  it('rejects missing project repo path', async () => {
    const workItem = createBlockedWorkItem({ projectId: 'missing-project' })

    await expect(
      recoverMissingBranchEvidence({ workItemId: workItem.id, branchName: 'mission/recovery' }),
    ).rejects.toThrow(/Project not found/i)
  })

  it('rejects wrong blocker reason', async () => {
    const project = createProject({ name: 'Demo', repoPath })
    const workItem = createBlockedWorkItem({
      projectId: project.id,
      laneBlockedReason: 'Merge-Healer blocked: tests failed.',
    })
    addFeatureBranch(repoPath)

    await expect(
      recoverMissingBranchEvidence({ workItemId: workItem.id, branchName: 'mission/recovery' }),
    ).rejects.toThrow(/no feature branch evidence/i)
  })

  it('rejects branch equal to base', async () => {
    const project = createProject({ name: 'Demo', repoPath })
    const workItem = createBlockedWorkItem({ projectId: project.id })

    await expect(
      recoverMissingBranchEvidence({ workItemId: workItem.id, branchName: 'main', baseBranch: 'main' }),
    ).rejects.toThrow(/must differ/i)
  })

  it('rejects missing branch ref', async () => {
    const project = createProject({ name: 'Demo', repoPath })
    const workItem = createBlockedWorkItem({ projectId: project.id })

    await expect(
      recoverMissingBranchEvidence({ workItemId: workItem.id, branchName: 'mission/missing' }),
    ).rejects.toThrow(/branch ref.*mission\/missing/i)
  })

  it('rejects branch with no commits ahead of base', async () => {
    const project = createProject({ name: 'Demo', repoPath })
    const workItem = createBlockedWorkItem({ projectId: project.id })
    git(repoPath, ['branch', 'mission/no-ahead', 'main'])

    await expect(
      recoverMissingBranchEvidence({ workItemId: workItem.id, branchName: 'mission/no-ahead' }),
    ).rejects.toThrow(/at least one commit ahead/i)
  })

  it('rejects dirty repo state before attaching evidence', async () => {
    const project = createProject({ name: 'Demo', repoPath })
    const workItem = createBlockedWorkItem({ projectId: project.id })
    addFeatureBranch(repoPath)
    fs.writeFileSync(path.join(repoPath, 'dirty.txt'), 'dirty\n', 'utf8')

    await expect(
      recoverMissingBranchEvidence({ workItemId: workItem.id, branchName: 'mission/recovery' }),
    ).rejects.toThrow(/repo must be clean/i)
    expect(getWorkItem(workItem.id)?.branchName).toBeUndefined()
  })

  it('accepts a valid branch and preserves non-recovery fields', async () => {
    const project = createProject({ name: 'Demo', repoPath })
    const workItem = createBlockedWorkItem({
      projectId: project.id,
      acceptanceCriteria: ['keep acceptance'],
      artifactPaths: ['keep-artifact.txt'],
      reviewQualityGateReasons: ['review reason'],
      reviewMissingEvidence: ['missing evidence'],
    })
    const branchHead = addFeatureBranch(repoPath)
    git(repoPath, ['checkout', 'main'])

    const result = await recoverMissingBranchEvidence({
      workItemId: workItem.id,
      branchName: 'mission/recovery',
      baseBranch: 'main',
      operatorNote: 'Recovered with validated branch evidence.',
    })

    expect(result.branchName).toBe('mission/recovery')
    expect(result.baseBranch).toBe('main')
    expect(result.branchHeadCommit).toBe(branchHead)
    expect(result.mergeBaseCommit).toMatch(/^[a-f0-9]{40}$/)
    expect(result.commitsAhead).toHaveLength(1)
    expect(result.workItem).toMatchObject({
      status: 'active',
      phase: 'deploy',
      laneState: 'merge_healing',
      branchName: 'mission/recovery',
      baseBranch: 'main',
      mergeTargetBranch: 'main',
      mergeBaseCommit: result.mergeBaseCommit,
      mergeState: 'not_started',
      mergeTestPassed: false,
      artifactPaths: ['keep-artifact.txt'],
      acceptanceCriteria: ['keep acceptance'],
      reviewDecision: 'approved',
      reviewQualityGateReasons: ['review reason'],
      reviewMissingEvidence: ['missing evidence'],
    })
    expect(result.workItem.history.at(-1)?.note).toContain('Merge-Healer still owns final merge evidence')
  })
})
