import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as ProjectRoute } from '../routes/api/projects.$projectId'
import { createProject } from './projects-store'

type ProjectPatchHandler = (input: { request: Request; params: { projectId: string } }) => Promise<Response>

function getProjectPatchHandler(): ProjectPatchHandler {
  const route = ProjectRoute as unknown as { options: { server: { handlers: { PATCH: ProjectPatchHandler } } } }
  return route.options.server.handlers.PATCH
}

describe('project detail route PATCH profile mappings', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  const previousHermesPassword = process.env.HERMES_PASSWORD

  beforeEach(() => {
    delete process.env.HERMES_PASSWORD
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-project-route-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    if (previousHermesPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousHermesPassword
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('updates supervisor and autopilot scout mappings without wiping the rest of autopilot policy', async () => {
    const project = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
      autopilotPolicy: {
        enabled: true,
        schedulePreset: 'daily',
        scoutProfile: 'old-scout',
        suggestionLimit: 7,
        scoutSources: ['repo-health-scout', 'stale-docs-scout'],
        jobId: 'job-123',
        jobName: 'Daily scout',
      },
    })

    const response = await getProjectPatchHandler()({
      request: new Request(`http://127.0.0.1:3456/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runtimeProfiles: { supervisorProfile: 'supervisor' },
          autopilotPolicy: { scoutProfile: 'scout' },
        }),
      }),
      params: { projectId: project.id },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, any>
    expect(body.project.runtimeProfiles).toEqual({ supervisorProfile: 'supervisor' })
    expect(body.project.autopilotPolicy).toEqual({
      enabled: true,
      schedulePreset: 'daily',
      scoutProfile: 'scout',
      suggestionLimit: 7,
      scoutSources: ['repo-health-scout', 'stale-docs-scout'],
      jobId: 'job-123',
      jobName: 'Daily scout',
    })
  })

  it('updates autonomy lane policy without enabling parallel worktrees or wiping defaults', async () => {
    const project = createProject({
      name: 'Mission Control Lane',
      repoPath: '/repos/mission-control-lane',
      defaultBranch: 'main',
    })

    const response = await getProjectPatchHandler()({
      request: new Request(`http://127.0.0.1:3456/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autonomyLanePolicy: {
            enabled: true,
            maxActiveWorkItems: 9,
            baseBranch: 'develop',
            allowParallelWorktrees: true,
          },
        }),
      }),
      params: { projectId: project.id },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, any>
    expect(body.project.autonomyLanePolicy).toMatchObject({
      enabled: true,
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

  it('patches nested always-on policy without wiping sibling policy sections', async () => {
    const project = createProject({
      name: 'Mission Control Always On',
      repoPath: '/repos/mission-control-always-on',
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

    const response = await getProjectPatchHandler()({
      request: new Request(`http://127.0.0.1:3456/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autonomyLanePolicy: {
            alwaysOn: {
              retry: { cooldownMinutes: 10 },
              cleanup: { retainLaneStashDays: 90 },
            },
          },
        }),
      }),
      params: { projectId: project.id },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, any>
    expect(body.project.autonomyLanePolicy.alwaysOn).toMatchObject({
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
})
