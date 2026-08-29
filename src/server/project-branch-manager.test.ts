import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  assertCleanOrStashedLaneEntry,
  buildLaneCleanupPlan,
  buildPrPublishingPreflight,
  buildWorkItemBranchName,
  collectProjectLaneCleanupInventory,
  collectProjectRepoHygiene,
  ensureWorkItemBranch,
  inspectProjectRepoState,
} from './project-branch-manager'
import type { ProjectAutonomyAlwaysOnPolicy } from './projects-store'
import type { WorkItemRecord } from './work-items-store'

function git(repoPath: string, args: Array<string>): string {
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
    laneState: input.laneState,
    baseBranch: input.baseBranch,
    branchName: input.branchName,
    mergeState: input.mergeState,
    mergeCommit: input.mergeCommit,
    mergeBaseCommit: input.mergeBaseCommit,
    mergeTargetBranch: input.mergeTargetBranch,
    mergeTestPassed: input.mergeTestPassed,
    prUrl: input.prUrl,
    artifactPaths: input.artifactPaths ?? [],
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    criteriaStatus: input.criteriaStatus ?? [],
    notes: input.notes ?? [],
    history: input.history ?? [],
    createdAt: input.createdAt ?? '2026-04-27T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-27T00:00:00.000Z',
  }
}

function prPolicy(
  input: Partial<ProjectAutonomyAlwaysOnPolicy['prPublishing']> = {},
): ProjectAutonomyAlwaysOnPolicy['prPublishing'] {
  return {
    enabled: input.enabled ?? false,
    mode: input.mode ?? 'manual',
    baseBranch: input.baseBranch,
    titlePrefix: input.titlePrefix ?? '[Hermes Workspace]',
    requireCleanRepo: input.requireCleanRepo ?? true,
    requirePassingMergeTests: input.requirePassingMergeTests ?? true,
  }
}

function cleanupPolicy(
  input: Partial<ProjectAutonomyAlwaysOnPolicy['cleanup']> = {},
): ProjectAutonomyAlwaysOnPolicy['cleanup'] {
  return {
    enabled: input.enabled ?? false,
    deleteMergedBranches: input.deleteMergedBranches ?? false,
    retainMergedBranchDays: input.retainMergedBranchDays ?? 30,
    retainLaneStashes: input.retainLaneStashes ?? true,
    retainLaneStashDays: input.retainLaneStashDays ?? 30,
    dryRun: input.dryRun ?? true,
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

  it('reports manual PR publishing required when policy is disabled', () => {
    const preflight = buildPrPublishingPreflight({
      policy: prPolicy({ enabled: false }),
      hygiene: {
        repoPath,
        currentBranch: 'main',
        baseBranch: 'main',
        featureBranch: 'mission/84bfe2c2-demo',
        dirtyStatus: '',
        untrackedFiles: [],
        localBranchesCreatedByLane: ['mission/84bfe2c2-demo'],
        stashIdsCreatedByLane: [],
        aheadBehind: 'ahead 2, behind 0',
        upstreamBranch: 'origin/main',
        remoteUrl: 'git@github.com:owner/repo.git',
        warnings: [],
      },
      workItem: workItem({
        title: 'Ship safe PR gate',
        branchName: 'mission/84bfe2c2-demo',
        mergeState: 'merged',
        mergeCommit: 'abc123',
        mergeTestPassed: true,
      }),
      ghAvailable: true,
    })

    expect(preflight.status).toBe('manual_required')
    expect(preflight.ready).toBe(false)
    expect(preflight.publishCommand).toBeUndefined()
    expect(preflight.evidence).toContain('policy=disabled')
  })

  it('blocks PR publishing when repo hygiene is dirty or behind upstream', () => {
    const dirty = buildPrPublishingPreflight({
      policy: prPolicy({ enabled: true, mode: 'draft' }),
      hygiene: {
        repoPath,
        currentBranch: 'main',
        baseBranch: 'main',
        featureBranch: 'mission/84bfe2c2-demo',
        dirtyStatus: '?? scratch.txt',
        untrackedFiles: ['scratch.txt'],
        localBranchesCreatedByLane: ['mission/84bfe2c2-demo'],
        stashIdsCreatedByLane: [],
        aheadBehind: 'ahead 2, behind 0',
        upstreamBranch: 'origin/main',
        remoteUrl: 'git@github.com:owner/repo.git',
        warnings: ['Repo has dirty status: ?? scratch.txt'],
      },
      workItem: workItem({ branchName: 'mission/84bfe2c2-demo' }),
      ghAvailable: true,
    })
    const behind = buildPrPublishingPreflight({
      policy: prPolicy({ enabled: true, mode: 'draft' }),
      hygiene: {
        repoPath,
        currentBranch: 'main',
        baseBranch: 'main',
        featureBranch: 'mission/84bfe2c2-demo',
        dirtyStatus: '',
        untrackedFiles: [],
        localBranchesCreatedByLane: ['mission/84bfe2c2-demo'],
        stashIdsCreatedByLane: [],
        aheadBehind: 'ahead 1, behind 2',
        upstreamBranch: 'origin/main',
        remoteUrl: 'git@github.com:owner/repo.git',
        warnings: [],
      },
      workItem: workItem({ branchName: 'mission/84bfe2c2-demo' }),
      ghAvailable: true,
    })

    expect(dirty.status).toBe('blocked')
    expect(dirty.blockers).toContain('Repo must be clean before draft PR publishing.')
    expect(behind.status).toBe('blocked')
    expect(behind.blockers).toContain('Base branch is behind upstream (ahead 1, behind 2).')
  })

  it('blocks PR publishing without upstream remote metadata', () => {
    const preflight = buildPrPublishingPreflight({
      policy: prPolicy({ enabled: true, mode: 'draft' }),
      hygiene: {
        repoPath,
        currentBranch: 'main',
        baseBranch: 'main',
        featureBranch: 'mission/84bfe2c2-demo',
        dirtyStatus: '',
        untrackedFiles: [],
        localBranchesCreatedByLane: ['mission/84bfe2c2-demo'],
        stashIdsCreatedByLane: [],
        aheadBehind: 'no upstream',
        warnings: [],
      },
      workItem: workItem({ branchName: 'mission/84bfe2c2-demo' }),
      ghAvailable: true,
    })

    expect(preflight.status).toBe('blocked')
    expect(preflight.blockers).toContain('Missing upstream branch for main.')
    expect(preflight.blockers).toContain('Missing git remote URL for PR publishing.')
  })

  it('reports gh unavailable for enabled draft PR publishing without executing commands', () => {
    const preflight = buildPrPublishingPreflight({
      policy: prPolicy({ enabled: true, mode: 'draft' }),
      hygiene: {
        repoPath,
        currentBranch: 'main',
        baseBranch: 'main',
        featureBranch: 'mission/84bfe2c2-demo',
        dirtyStatus: '',
        untrackedFiles: [],
        localBranchesCreatedByLane: ['mission/84bfe2c2-demo'],
        stashIdsCreatedByLane: [],
        aheadBehind: 'ahead 2, behind 0',
        upstreamBranch: 'origin/main',
        remoteUrl: 'git@github.com:owner/repo.git',
        warnings: [],
      },
      workItem: workItem({
        title: 'Publish draft PR safely',
        branchName: 'mission/84bfe2c2-demo',
        mergeState: 'merged',
        mergeTestPassed: true,
      }),
      ghAvailable: false,
    })

    expect(preflight.status).toBe('unavailable')
    expect(preflight.ready).toBe(false)
    expect(preflight.blockers).toContain('GitHub CLI gh is unavailable; install/auth gh before publishing.')
    expect(preflight.publishCommand).toBeUndefined()
  })

  it('builds a dry-run draft PR command when policy, merge tests, repo, and gh are ready', () => {
    const preflight = buildPrPublishingPreflight({
      policy: prPolicy({ enabled: true, mode: 'draft', baseBranch: 'release' }),
      hygiene: {
        repoPath,
        currentBranch: 'release',
        baseBranch: 'main',
        featureBranch: 'mission/84bfe2c2-demo',
        dirtyStatus: '',
        untrackedFiles: [],
        localBranchesCreatedByLane: ['mission/84bfe2c2-demo'],
        stashIdsCreatedByLane: [],
        aheadBehind: 'ahead 2, behind 0',
        upstreamBranch: 'origin/main',
        remoteUrl: 'git@github.com:owner/repo.git',
        warnings: [],
      },
      workItem: workItem({
        title: 'Publish draft PR safely',
        branchName: 'mission/84bfe2c2-demo',
        mergeState: 'merged',
        mergeCommit: 'abcdef1234567890',
        mergeTestPassed: true,
      }),
      ghAvailable: true,
    })

    expect(preflight).toMatchObject({
      status: 'ready',
      ready: true,
      baseBranch: 'release',
      headBranch: 'mission/84bfe2c2-demo',
      aheadBehind: 'ahead 2, behind 0',
      mergeCommit: 'abcdef1234567890',
    })
    expect(preflight.publishCommand).toEqual([
      'gh',
      'pr',
      'create',
      '--draft',
      '--base',
      'release',
      '--head',
      'mission/84bfe2c2-demo',
      '--title',
      '[Hermes Workspace] Publish draft PR safely',
      '--body',
      expect.stringContaining('mergeCommit=abcdef1234567890'),
    ])
  })

  it('collects lane cleanup inventory with local mission branches and matching safety stashes', async () => {
    git(repoPath, ['checkout', '-b', 'mission/84bfe2c2-old-merged'])
    writeFileSync(join(repoPath, 'merged.txt'), 'merged\n', 'utf8')
    git(repoPath, ['add', 'merged.txt'])
    git(repoPath, ['commit', '-m', 'merged lane branch'])
    git(repoPath, ['checkout', 'main'])
    git(repoPath, ['merge', '--no-ff', 'mission/84bfe2c2-old-merged', '-m', 'merge lane branch'])
    git(repoPath, ['checkout', '-b', 'mission/11111111-unmerged'])
    writeFileSync(join(repoPath, 'unmerged.txt'), 'unmerged\n', 'utf8')
    git(repoPath, ['add', 'unmerged.txt'])
    git(repoPath, ['commit', '-m', 'unmerged lane branch'])
    git(repoPath, ['checkout', 'main'])
    writeFileSync(join(repoPath, 'scratch.txt'), 'scratch\n', 'utf8')
    git(repoPath, ['stash', 'push', '-u', '-m', 'single-lane-cleanup-safety'])

    const inventory = await collectProjectLaneCleanupInventory({
      repoPath,
      baseBranch: 'main',
      now: '2026-04-28T00:00:00.000Z',
    })

    expect(inventory.branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mission/84bfe2c2-old-merged', merged: true }),
        expect.objectContaining({ name: 'mission/11111111-unmerged', merged: false }),
      ]),
    )
    expect(inventory.stashes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'stash@{0}', message: expect.stringContaining('single-lane-cleanup-safety') }),
      ]),
    )
  })

  it('keeps cleanup as retention-only when policy is disabled', () => {
    const plan = buildLaneCleanupPlan({
      policy: cleanupPolicy({ enabled: false }),
      hygiene: {
        repoPath,
        currentBranch: 'main',
        baseBranch: 'main',
        dirtyStatus: '',
        untrackedFiles: [],
        localBranchesCreatedByLane: ['mission/old-merged'],
        stashIdsCreatedByLane: ['stash@{0}: On main: single-lane-old'],
        aheadBehind: 'ahead 0, behind 0',
        warnings: [],
      },
      inventory: {
        branches: [{ name: 'mission/old-merged', merged: true, ageDays: 99, lastCommitAt: '2026-01-01T00:00:00.000Z' }],
        stashes: [{ id: 'stash@{0}', message: 'single-lane-old', ageDays: 99, createdAt: '2026-01-01T00:00:00.000Z' }],
      },
    })

    expect(plan.status).toBe('retained')
    expect(plan.dryRun).toBe(true)
    expect(plan.actions).toEqual([])
    expect(plan.evidence).toContain('cleanupPolicy=disabled')
  })

  it('plans dry-run deletion only for retained merged branches and old lane stashes', () => {
    const plan = buildLaneCleanupPlan({
      policy: cleanupPolicy({
        enabled: true,
        deleteMergedBranches: true,
        retainMergedBranchDays: 30,
        retainLaneStashes: false,
        retainLaneStashDays: 14,
        dryRun: true,
      }),
      hygiene: {
        repoPath,
        currentBranch: 'main',
        baseBranch: 'main',
        dirtyStatus: '',
        untrackedFiles: [],
        localBranchesCreatedByLane: ['mission/old-merged', 'mission/new-merged', 'mission/unmerged'],
        stashIdsCreatedByLane: ['stash@{0}: On main: single-lane-old', 'stash@{1}: On main: single-lane-new'],
        aheadBehind: 'ahead 0, behind 0',
        warnings: [],
      },
      inventory: {
        branches: [
          { name: 'mission/old-merged', merged: true, ageDays: 45, lastCommitAt: '2026-03-01T00:00:00.000Z' },
          { name: 'mission/new-merged', merged: true, ageDays: 3, lastCommitAt: '2026-04-25T00:00:00.000Z' },
          { name: 'mission/unmerged', merged: false, ageDays: 60, lastCommitAt: '2026-02-01T00:00:00.000Z' },
        ],
        stashes: [
          { id: 'stash@{0}', message: 'single-lane-old', ageDays: 20, createdAt: '2026-04-01T00:00:00.000Z' },
          { id: 'stash@{1}', message: 'single-lane-new', ageDays: 2, createdAt: '2026-04-26T00:00:00.000Z' },
        ],
      },
    })

    expect(plan.status).toBe('planned')
    expect(plan.dryRun).toBe(true)
    expect(plan.actions).toEqual([
      expect.objectContaining({ type: 'delete_branch', target: 'mission/old-merged', destructive: false }),
      expect.objectContaining({ type: 'drop_stash', target: 'stash@{0}', destructive: false }),
    ])
    expect(plan.evidence.join('\n')).toContain('retained branch mission/new-merged: age 3d < retention 30d')
    expect(plan.evidence.join('\n')).toContain('retained branch mission/unmerged: branch is not merged')
    expect(plan.evidence.join('\n')).toContain('retained stash stash@{1}: age 2d < retention 14d')
  })

  it('blocks destructive cleanup when repo is dirty, behind, or branch is unmerged', () => {
    const plan = buildLaneCleanupPlan({
      policy: cleanupPolicy({ enabled: true, deleteMergedBranches: true, dryRun: false }),
      hygiene: {
        repoPath,
        currentBranch: 'main',
        baseBranch: 'main',
        dirtyStatus: '?? scratch.txt',
        untrackedFiles: ['scratch.txt'],
        localBranchesCreatedByLane: ['mission/unmerged'],
        stashIdsCreatedByLane: [],
        aheadBehind: 'ahead 0, behind 1',
        warnings: ['Repo has dirty status: ?? scratch.txt'],
      },
      inventory: {
        branches: [{ name: 'mission/unmerged', merged: false, ageDays: 99, lastCommitAt: '2026-01-01T00:00:00.000Z' }],
        stashes: [],
      },
    })

    expect(plan.status).toBe('blocked')
    expect(plan.actions).toEqual([])
    expect(plan.blockers).toContain('Repo must be clean before destructive cleanup.')
    expect(plan.blockers).toContain('Base branch is behind upstream (ahead 0, behind 1).')
    expect(plan.blockers).toContain('Unmerged lane branch mission/unmerged cannot be deleted.')
  })
})
