import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  assertCleanOrStashedLaneEntry,
  buildWorkItemBranchName,
  collectProjectRepoHygiene,
  ensureWorkItemBranch,
  inspectProjectRepoState,
} from './project-branch-manager'
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
    title: input.title ?? 'Autonomous E2E code delivery!',
    description: input.description ?? '',
    status: input.status ?? 'ready',
    phase: input.phase ?? 'build',
    priority: input.priority ?? 'medium',
    riskLevel: input.riskLevel ?? 'low',
    labels: input.labels ?? [],
    repoPathSnapshot: input.repoPathSnapshot ?? '/tmp/repo',
    sourceSuggestionEvidence: input.sourceSuggestionEvidence ?? [],
    reviewQualityGateReasons: input.reviewQualityGateReasons ?? [],
    reviewMissingEvidence: input.reviewMissingEvidence ?? [],
    sessionKeys: input.sessionKeys ?? [],
    artifactPaths: input.artifactPaths ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    criteriaStatus: input.criteriaStatus ?? [],
    notes: input.notes ?? [],
    history: input.history ?? [],
    createdAt: input.createdAt ?? '2026-04-27T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-27T00:00:00.000Z',
  }
}

describe('project-branch-manager', () => {
  let tempDir: string
  let repoPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'hermes-workspace-branch-manager-'))
    repoPath = join(tempDir, 'repo')
    execFileSync('mkdir', ['-p', repoPath])
    initRepo(repoPath)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('builds deterministic work item branch names with short id and slug', () => {
    expect(buildWorkItemBranchName(workItem())).toBe(
      'mission/84bfe2c2-autonomous-e2e-code-delivery',
    )
    expect(buildWorkItemBranchName(workItem({ title: '!!!' }), 'lane')).toBe(
      'lane/84bfe2c2-work-item',
    )
  })

  it('creates a feature branch from the requested base branch in the canonical repo path', async () => {
    const baseCommit = git(repoPath, ['rev-parse', 'HEAD'])

    const state = await ensureWorkItemBranch({
      repoPath,
      baseBranch: 'main',
      branchName: 'mission/84bfe2c2-autonomous-e2e-code-delivery',
    })

    expect(state).toMatchObject({
      repoPath,
      baseBranch: 'main',
      currentBranch: 'mission/84bfe2c2-autonomous-e2e-code-delivery',
      isClean: true,
      changedFiles: [],
      headCommit: baseCommit,
    })
    expect(git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe(
      'mission/84bfe2c2-autonomous-e2e-code-delivery',
    )
  })

  it('reuses an existing work item branch idempotently', async () => {
    await ensureWorkItemBranch({
      repoPath,
      baseBranch: 'main',
      branchName: 'mission/84bfe2c2-demo',
    })
    writeFileSync(join(repoPath, 'feature.txt'), 'feature\n', 'utf8')
    git(repoPath, ['add', 'feature.txt'])
    git(repoPath, ['commit', '-m', 'feature'])
    const branchCommit = git(repoPath, ['rev-parse', 'HEAD'])
    git(repoPath, ['checkout', 'main'])

    const state = await ensureWorkItemBranch({
      repoPath,
      baseBranch: 'main',
      branchName: 'mission/84bfe2c2-demo',
    })

    expect(state.currentBranch).toBe('mission/84bfe2c2-demo')
    expect(state.headCommit).toBe(branchCommit)
  })

  it('refuses to switch branches when the canonical repo path is dirty', async () => {
    writeFileSync(join(repoPath, 'uncommitted.txt'), 'dirty\n', 'utf8')

    await expect(
      ensureWorkItemBranch({
        repoPath,
        baseBranch: 'main',
        branchName: 'mission/84bfe2c2-dirty',
      }),
    ).rejects.toThrow(/dirty/i)
    expect(git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'])).toBe('main')
  })

  it('inspects branch state with changed file evidence', async () => {
    writeFileSync(join(repoPath, 'README.md'), '# Demo\nchanged\n', 'utf8')
    writeFileSync(join(repoPath, 'new.txt'), 'new\n', 'utf8')

    const state = await inspectProjectRepoState(repoPath)

    expect(state.currentBranch).toBe('main')
    expect(state.isClean).toBe(false)
    expect(state.changedFiles).toEqual(['README.md', 'new.txt'])
  })

  it('requires clean or explicitly checkpointed repo state before lane entry', async () => {
    writeFileSync(join(repoPath, 'scratch.txt'), 'operator work\n', 'utf8')

    await expect(assertCleanOrStashedLaneEntry({ repoPath })).rejects.toThrow(
      /clean or checkpointed/i,
    )

    const checkpointed = await assertCleanOrStashedLaneEntry({
      repoPath,
      checkpointStashId: 'stash@{0}',
    })

    expect(checkpointed.isClean).toBe(false)
    expect(checkpointed.checkpointStashId).toBe('stash@{0}')
    expect(checkpointed.hygiene.dirtyStatus).toContain('scratch.txt')
  })

  it('reports repo hygiene with untracked files, lane branches, stash ids, and ahead-of-origin warnings', async () => {
    const remotePath = join(tempDir, 'origin.git')
    execFileSync('git', ['init', '--bare', remotePath])
    git(repoPath, ['remote', 'add', 'origin', remotePath])
    git(repoPath, ['push', '-u', 'origin', 'main'])
    writeFileSync(join(repoPath, 'local-only.txt'), 'local\n', 'utf8')
    git(repoPath, ['add', 'local-only.txt'])
    git(repoPath, ['commit', '-m', 'local only'])
    git(repoPath, ['checkout', '-b', 'mission/84bfe2c2-hygiene'])
    git(repoPath, ['checkout', 'main'])
    writeFileSync(join(repoPath, 'untracked.txt'), 'untracked\n', 'utf8')
    git(repoPath, ['stash', 'push', '-u', '-m', 'single-lane-test-stash'])

    const hygiene = await collectProjectRepoHygiene({
      repoPath,
      baseBranch: 'main',
      featureBranch: 'mission/84bfe2c2-hygiene',
    })

    expect(hygiene.currentBranch).toBe('main')
    expect(hygiene.baseBranch).toBe('main')
    expect(hygiene.featureBranch).toBe('mission/84bfe2c2-hygiene')
    expect(hygiene.localBranchesCreatedByLane).toContain('mission/84bfe2c2-hygiene')
    expect(hygiene.stashIdsCreatedByLane.join('\n')).toContain('single-lane-test-stash')
    expect(hygiene.aheadBehind).toMatch(/ahead 1/i)
    expect(hygiene.warnings.join('\n')).toMatch(/ahead of origin/i)
  })

  it('does not use git worktree commands in the default branch path', () => {
    const source = readFileSync(
      new URL('./project-branch-manager.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toMatch(/execFile\([^\n]+git[^\n]+worktree/)
    expect(source).not.toMatch(/\['worktree'/)
  })
})
