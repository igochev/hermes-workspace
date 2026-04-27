import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as ProjectRoute } from '../routes/api/projects.$projectId'
import { createProject } from './projects-store'

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

    const response = await ProjectRoute.options.server.handlers.PATCH({
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

    const response = await ProjectRoute.options.server.handlers.PATCH({
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
    expect(body.project.autonomyLanePolicy).toEqual({
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
})
