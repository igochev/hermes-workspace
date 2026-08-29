import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './projects-store'

describe('projects-store', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-projects-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('creates projects with stable slugs and persists them to the file-backed store', () => {
    const project = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
      description: 'Primary Hermes Mission Control repo',
      defaultBranch: 'main',
      phaseProfiles: {
          research: 'planner',
        build: 'builder',
      },
    })

    expect(project.name).toBe('Mission Control')
    expect(project.slug).toBe('mission-control')
    expect(project.repoPath).toBe('/repos/mission-control')
    expect(project.description).toBe('Primary Hermes Mission Control repo')
    expect(project.defaultBranch).toBe('main')
    expect(project.phaseProfiles).toEqual({
          research: 'planner',
      build: 'builder',
      review: '',
      deploy: '',
    })
    expect(project.reviewAutoApproval).toEqual({
      enabled: false,
      maxPriority: 'low',
    })
    expect(project.createdAt).toMatch(/T/)
    expect(project.updatedAt).toBe(project.createdAt)

    expect(listProjects()).toEqual([project])
    expect(getProject(project.id)).toEqual(project)
  })

  it('keeps slugs unique and supports project updates and deletion', () => {
    const first = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
    })
    const second = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control-next',
    })

    expect(first.slug).toBe('mission-control')
    expect(second.slug).toBe('mission-control-2')

    const updated = updateProject(second.id, {
      name: 'Mission Control Next',
      description: 'Project detail copy',
      repoUrl: 'https://github.com/igochev/hermes-workspace',
      defaultBranch: 'develop',
      phaseProfiles: {
        research: 'planner',
        build: 'project-builder',
        review: 'reviewer',
      },
      reviewAutoApproval: {
        enabled: true,
        maxPriority: 'medium',
      },
    })

    expect(updated).not.toBeNull()
    if (!updated) throw new Error('Expected project update to succeed')
    expect(updated.name).toBe('Mission Control Next')
    expect(updated.slug).toBe('mission-control-next')
    expect(updated.description).toBe('Project detail copy')
    expect(updated.repoUrl).toBe('https://github.com/igochev/hermes-workspace')
    expect(updated.defaultBranch).toBe('develop')
    expect(updated.phaseProfiles).toEqual({
      research: 'planner',
      build: 'project-builder',
      review: 'reviewer',
      deploy: '',
    })
    expect(updated.reviewAutoApproval).toEqual({
      enabled: true,
      maxPriority: 'medium',
    })
    expect(updated.updatedAt >= updated.createdAt).toBe(true)

    expect(deleteProject(first.id)).toBe(true)
    expect(getProject(first.id)).toBeNull()
    expect(listProjects().map((project) => project.id)).toEqual([second.id])
  })

  it('applies default autopilot and disabled single-lane autonomy policy for new projects', () => {
    const project = createProject({
      name: 'Autopilot defaults',
      repoPath: '/repos/autopilot-defaults',
      defaultBranch: 'develop',
    })

    expect(project.autopilotPolicy).toEqual({
      enabled: false,
      schedulePreset: 'manual',
      suggestionLimit: 5,
      scoutSources: ['repo-health-scout', 'stale-docs-scout', 'architecture-debt-scout'],
    })
    expect(project.autonomyLanePolicy).toMatchObject({
      enabled: false,
      mode: 'single_lane',
      isolation: 'branch',
      maxActiveWorkItems: 1,
      baseBranch: 'develop',
      branchPrefix: 'mission',
      plannerTiming: 'on_lane_entry',
      blockedBehavior: 'park_and_continue_when_repo_clean',
      mergeHealerEnabled: true,
      allowParallelWorktrees: false,
    })
  })

  it('normalizes autopilot policy updates', () => {
    const project = createProject({
      name: 'Autopilot normalize',
      repoPath: '/repos/autopilot-normalize',
    })

    const updated = updateProject(project.id, {
      autopilotPolicy: {
        enabled: true,
        schedulePreset: 'yearly' as unknown as 'daily',
        suggestionLimit: 0,
        scoutSources: ['failing-tests-scout', 'failing-tests-scout', 'unknown-source' as unknown as 'manual'],
      },
    })

    expect(updated?.autopilotPolicy).toEqual({
      enabled: true,
      schedulePreset: 'manual',
      suggestionLimit: 1,
      scoutSources: ['failing-tests-scout'],
    })
  })

  it('preserves autonomy lane policy during unrelated partial project updates', () => {
    const project = createProject({
      name: 'Lane partial update',
      repoPath: '/repos/lane-partial',
      defaultBranch: 'main',
      autonomyLanePolicy: {
        enabled: true,
        baseBranch: 'release',
        branchPrefix: 'feature',
      },
    })

    const updated = updateProject(project.id, { description: 'Only copy changed' })

    expect(updated?.description).toBe('Only copy changed')
    expect(updated?.autonomyLanePolicy).toMatchObject({
      enabled: true,
      mode: 'single_lane',
      isolation: 'branch',
      maxActiveWorkItems: 1,
      baseBranch: 'release',
      branchPrefix: 'feature',
      plannerTiming: 'on_lane_entry',
      blockedBehavior: 'park_and_continue_when_repo_clean',
      mergeHealerEnabled: true,
      allowParallelWorktrees: false,
    })
  })

  it('normalizes enabled autonomy lane policy to max one active branch lane and rejects parallel worktrees', () => {
    const project = createProject({
      name: 'Lane normalize',
      repoPath: '/repos/lane-normalize',
      defaultBranch: 'trunk',
    })

    const updated = updateProject(project.id, {
      autonomyLanePolicy: {
        enabled: true,
        mode: 'parallel' as unknown as 'single_lane',
        isolation: 'worktree' as unknown as 'branch',
        maxActiveWorkItems: 5,
        baseBranch: 'develop',
        branchPrefix: '',
        plannerTiming: 'batch' as unknown as 'on_lane_entry',
        blockedBehavior: 'freeze' as unknown as 'park_and_continue_when_repo_clean',
        mergeHealerEnabled: false,
        allowParallelWorktrees: true,
      },
    })

    expect(updated?.autonomyLanePolicy).toMatchObject({
      enabled: true,
      mode: 'single_lane',
      isolation: 'branch',
      maxActiveWorkItems: 1,
      baseBranch: 'develop',
      branchPrefix: 'mission',
      plannerTiming: 'on_lane_entry',
      blockedBehavior: 'park_and_continue_when_repo_clean',
      mergeHealerEnabled: false,
      allowParallelWorktrees: false,
    })
  })

  it('creates projects with conservative always-on policy defaults', () => {
    const project = createProject({
      name: 'Always On Defaults',
      repoPath: '/repos/always-on-defaults',
    })

    expect(project.autonomyLanePolicy.alwaysOn).toEqual({
      enabled: false,
      retry: {
        enabled: false,
        maxAttemptsPerPhase: 1,
        cooldownMinutes: 30,
        staleScheduledMinutes: 30,
        staleRunningMinutes: 240,
      },
      notifications: {
        enabled: true,
        digestOnly: true,
        notifyOn: ['blocked', 'retry_exhausted', 'unsafe_repo', 'pr_ready', 'cleanup_recommended'],
        minRepeatMinutes: 60,
      },
      prPublishing: {
        enabled: false,
        mode: 'manual',
        titlePrefix: '[Hermes Workspace]',
        requireCleanRepo: true,
        requirePassingMergeTests: true,
      },
      cleanup: {
        enabled: false,
        deleteMergedBranches: false,
        retainMergedBranchDays: 30,
        retainLaneStashes: true,
        retainLaneStashDays: 30,
        dryRun: true,
      },
    })
  })

  it('preserves and deep-merges always-on policy during partial project updates', () => {
    const project = createProject({
      name: 'Always On Partial',
      repoPath: '/repos/always-on-partial',
      autonomyLanePolicy: {
        enabled: true,
        alwaysOn: {
          enabled: true,
          retry: { enabled: true, maxAttemptsPerPhase: 2, cooldownMinutes: 45 },
          notifications: { enabled: true, digestOnly: false, notifyOn: ['blocked'], minRepeatMinutes: 15 },
          prPublishing: { enabled: true, mode: 'draft', baseBranch: 'release', titlePrefix: '[Lane]' },
          cleanup: { enabled: true, retainMergedBranchDays: 14, dryRun: true },
        },
      },
    })

    const renamed = updateProject(project.id, { description: 'copy only' })
    expect(renamed?.autonomyLanePolicy.alwaysOn.retry).toEqual({
      enabled: true,
      maxAttemptsPerPhase: 2,
      cooldownMinutes: 45,
      staleScheduledMinutes: 30,
      staleRunningMinutes: 240,
    })

    const updated = updateProject(project.id, {
      autonomyLanePolicy: {
        alwaysOn: {
          retry: { cooldownMinutes: 10 },
          cleanup: { retainLaneStashDays: 90 },
        },
      },
    })

    expect(updated?.autonomyLanePolicy.alwaysOn).toEqual({
      enabled: true,
      retry: {
        enabled: true,
        maxAttemptsPerPhase: 2,
        cooldownMinutes: 10,
        staleScheduledMinutes: 30,
        staleRunningMinutes: 240,
      },
      notifications: {
        enabled: true,
        digestOnly: false,
        notifyOn: ['blocked'],
        minRepeatMinutes: 15,
      },
      prPublishing: {
        enabled: true,
        mode: 'draft',
        baseBranch: 'release',
        titlePrefix: '[Lane]',
        requireCleanRepo: true,
        requirePassingMergeTests: true,
      },
      cleanup: {
        enabled: true,
        deleteMergedBranches: false,
        retainMergedBranchDays: 14,
        retainLaneStashes: true,
        retainLaneStashDays: 90,
        dryRun: true,
      },
    })
  })

  it('normalizes invalid always-on policy values back to safe defaults', () => {
    const project = createProject({
      name: 'Always On Invalid',
      repoPath: '/repos/always-on-invalid',
      autonomyLanePolicy: {
        alwaysOn: {
          enabled: true,
          retry: {
            enabled: true,
            maxAttemptsPerPhase: -1,
            cooldownMinutes: Number.NaN,
            staleScheduledMinutes: 'soon',
            staleRunningMinutes: 0,
          },
          notifications: {
            enabled: true,
            digestOnly: false,
            notifyOn: ['blocked', 'unknown-event'],
            minRepeatMinutes: -5,
          },
          prPublishing: {
            enabled: true,
            mode: 'auto',
            titlePrefix: '',
            requireCleanRepo: false,
            requirePassingMergeTests: false,
          },
          cleanup: {
            enabled: true,
            deleteMergedBranches: true,
            retainMergedBranchDays: -30,
            retainLaneStashes: false,
            retainLaneStashDays: Number.POSITIVE_INFINITY,
            dryRun: false,
          },
        },
      },
    })

    expect(project.autonomyLanePolicy.alwaysOn).toEqual({
      enabled: true,
      retry: {
        enabled: true,
        maxAttemptsPerPhase: 1,
        cooldownMinutes: 30,
        staleScheduledMinutes: 30,
        staleRunningMinutes: 240,
      },
      notifications: {
        enabled: true,
        digestOnly: false,
        notifyOn: ['blocked'],
        minRepeatMinutes: 60,
      },
      prPublishing: {
        enabled: true,
        mode: 'manual',
        titlePrefix: '[Hermes Workspace]',
        requireCleanRepo: false,
        requirePassingMergeTests: false,
      },
      cleanup: {
        enabled: true,
        deleteMergedBranches: true,
        retainMergedBranchDays: 30,
        retainLaneStashes: false,
        retainLaneStashDays: 30,
        dryRun: false,
      },
    })
  })

  it('hydrates existing project records without autopilotPolicy using defaults', () => {
    const hermesHome = process.env.HERMES_HOME!
    fs.mkdirSync(hermesHome, { recursive: true })
    const projectsFile = path.join(hermesHome, 'projects.json')
    fs.writeFileSync(
      projectsFile,
      JSON.stringify(
        {
          projects: [
            {
              id: 'project-legacy',
              name: 'Legacy Project',
              slug: 'legacy-project',
              repoPath: '/repos/legacy',
              phaseProfiles: { research: '', build: '', review: '', deploy: '' },
              reviewAutoApproval: { enabled: false, maxPriority: 'low' },
              createdAt: '2026-04-25T00:00:00.000Z',
              updatedAt: '2026-04-25T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    )

    const legacy = listProjects()[0]
    expect(legacy.autopilotPolicy).toEqual({
      enabled: false,
      schedulePreset: 'manual',
      suggestionLimit: 5,
      scoutSources: ['repo-health-scout', 'stale-docs-scout', 'architecture-debt-scout'],
    })
    expect(legacy.autonomyLanePolicy).toMatchObject({
      enabled: false,
      mode: 'single_lane',
      isolation: 'branch',
      maxActiveWorkItems: 1,
      baseBranch: 'main',
      branchPrefix: 'mission',
      plannerTiming: 'on_lane_entry',
      blockedBehavior: 'park_and_continue_when_repo_clean',
      mergeHealerEnabled: true,
      allowParallelWorktrees: false,
    })
  })
})
