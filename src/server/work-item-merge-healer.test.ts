import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runWorkItemMergeHealer } from './work-item-merge-healer'
import type { WorkItemRecord } from './work-items-store'

function git(repoPath: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim()
}

function initRepo(repoPath: string): void {
  execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
  git(repoPath, ['config', 'user.email', 'hermes@example.test'])
  git(repoPath, ['config', 'user.name', 'Hermes Test'])
  writeFileSync(join(repoPath, 'README.md'), '# Demo\n', 'utf8')
  git(repoPath, ['add', 'README.md'])
  git(repoPath, ['commit', '-m', 'initial'])
}

function workItem(input: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: input.id ?? '84bfe2c2-e899-437a-8a6c-a6fa9884886d',
    projectId: input.projectId ?? 'project-1',
    title: input.title ?? 'Autonomous merge healing',
    description: input.description ?? '',
    status: input.status ?? 'active',
    phase: input.phase ?? 'deploy',
    priority: input.priority ?? 'medium',
    riskLevel: input.riskLevel ?? 'low',
    labels: input.labels ?? [],
    repoPathSnapshot: input.repoPathSnapshot ?? '/tmp/repo',
    sourceSuggestionEvidence: input.sourceSuggestionEvidence ?? [],
    reviewQualityGateReasons: input.reviewQualityGateReasons ?? [],
    reviewMissingEvidence: input.reviewMissingEvidence ?? [],
    sessionKeys: input.sessionKeys ?? [],
    laneState: input.laneState,
    baseBranch: input.baseBranch ?? 'main',
    branchName: input.branchName ?? 'mission/84bfe2c2-autonomous-merge-healing',
    mergeState: input.mergeState,
    mergeCommit: input.mergeCommit,
    mergeBaseCommit: input.mergeBaseCommit,
    mergeTargetBranch: input.mergeTargetBranch ?? 'main',
    artifactPaths: input.artifactPaths ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    criteriaStatus: input.criteriaStatus ?? [],
    notes: input.notes ?? [],
    history: input.history ?? [],
    createdAt: input.createdAt ?? '2026-04-27T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-27T00:00:00.000Z',
  }
}

describe('work-item-merge-healer', () => {
  let tempDir: string
  let repoPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hermes-workspace-merge-healer-'))
    repoPath = join(tempDir, 'repo')
    execFileSync('mkdir', ['-p', repoPath])
    initRepo(repoPath)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('cleanly merges a feature branch into the target branch and records commit evidence', async () => {
    const baseCommit = git(repoPath, ['rev-parse', 'HEAD'])
    git(repoPath, ['checkout', '-b', 'mission/84bfe2c2-autonomous-merge-healing'])
    writeFileSync(join(repoPath, 'src.ts'), 'export const value = 1\n', 'utf8')
    git(repoPath, ['add', 'src.ts'])
    git(repoPath, ['commit', '-m', 'feature'])

    const result = await runWorkItemMergeHealer({
      repoPath,
      workItem: workItem({ mergeBaseCommit: baseCommit }),
      testCommand: 'node -e "process.exit(0)"',
    })

    expect(result).toMatchObject({
      mergeState: 'merged',
      mergeTargetBranch: 'main',
      mergeBaseCommit: baseCommit,
      mergeTestCommand: 'node -e "process.exit(0)"',
      mergeTestPassed: true,
      mergeConflictFiles: [],
    })
    expect(result.mergeCommit).toMatch(/^[a-f0-9]{40}$/)
    expect(git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main')
    expect(readFileSync(join(repoPath, 'src.ts'), 'utf8')).toContain('value = 1')
  })

  it('blocks with conflict file evidence when the feature branch cannot merge', async () => {
    writeFileSync(join(repoPath, 'shared.txt'), 'base\n', 'utf8')
    git(repoPath, ['add', 'shared.txt'])
    git(repoPath, ['commit', '-m', 'add shared'])
    git(repoPath, ['checkout', '-b', 'mission/84bfe2c2-autonomous-merge-healing'])
    writeFileSync(join(repoPath, 'shared.txt'), 'feature\n', 'utf8')
    git(repoPath, ['commit', '-am', 'feature shared'])
    git(repoPath, ['checkout', 'main'])
    writeFileSync(join(repoPath, 'shared.txt'), 'main\n', 'utf8')
    git(repoPath, ['commit', '-am', 'main shared'])

    const result = await runWorkItemMergeHealer({
      repoPath,
      workItem: workItem(),
      testCommand: 'node -e "process.exit(0)"',
    })

    expect(result).toMatchObject({
      mergeState: 'conflict',
      mergeTargetBranch: 'main',
      mergeConflictFiles: ['shared.txt'],
      mergeTestPassed: false,
    })
    expect(result.mergeBlockedReason).toMatch(/conflict/i)
    expect(git(repoPath, ['status', '--porcelain=v1'])).toBe('')
  })

  it('blocks with test artifact evidence when post-merge tests fail', async () => {
    git(repoPath, ['checkout', '-b', 'mission/84bfe2c2-autonomous-merge-healing'])
    writeFileSync(join(repoPath, 'feature.txt'), 'feature\n', 'utf8')
    git(repoPath, ['add', 'feature.txt'])
    git(repoPath, ['commit', '-m', 'feature'])

    const result = await runWorkItemMergeHealer({
      repoPath,
      workItem: workItem(),
      testCommand: 'node -e "console.error(\'boom\'); process.exit(1)"',
    })

    expect(result).toMatchObject({
      mergeState: 'failed',
      mergeTargetBranch: 'main',
      mergeTestPassed: false,
      mergeArtifactPaths: [expect.stringContaining('merge-healer')],
    })
    expect(result.mergeBlockedReason).toMatch(/test/i)
    expect(existsSync(result.mergeArtifactPaths[0]!)).toBe(true)
    expect(readFileSync(result.mergeArtifactPaths[0]!, 'utf8')).toContain('boom')
  })

  it('is idempotent when merge evidence already marks the work item merged', async () => {
    const result = await runWorkItemMergeHealer({
      repoPath,
      workItem: workItem({ mergeState: 'merged', mergeCommit: 'abc123' }),
      testCommand: 'node -e "process.exit(1)"',
    })

    expect(result).toMatchObject({
      mergeState: 'merged',
      mergeCommit: 'abc123',
      mergeTestPassed: true,
      mergeArtifactPaths: [],
    })
  })
})
