import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem } from './work-items-store'
import {
  DEFAULT_ROLE_CAPACITY_RULES,
  evaluateLaunchCapacity,
  listRoleCapacityRules,
  upsertRoleCapacityRule,
} from './role-capacity-policy'
import { Route as RoleCapacityPolicyRoute } from '../routes/api/role-capacity-policy'

describe('role capacity policy', () => {
  let tempHome: string
  let previousHermesHome: string | undefined
  let previousHermesPassword: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-role-capacity-'))
    previousHermesHome = process.env.HERMES_HOME
    previousHermesPassword = process.env.HERMES_PASSWORD
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    delete process.env.HERMES_PASSWORD
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

  it('returns default role capacity rules before the backing file exists', () => {
    expect(listRoleCapacityRules()).toEqual(DEFAULT_ROLE_CAPACITY_RULES)
  })

  it('normalizes invalid maxActive values to the role default', () => {
    upsertRoleCapacityRule({ role: 'build', maxActive: 0, enabled: true })

    expect(listRoleCapacityRules()).toContainEqual({ role: 'build', maxActive: 2, enabled: true })
  })

  it('counts active build work for the evaluated role', () => {
    const project = createProject({ name: 'Mission Control', repoPath: '/repos/mission-control' })
    createWorkItem({
      projectId: project.id,
      title: 'Active build',
      status: 'active',
      phase: 'build',
      priority: 'high',
      assignedProfile: 'builder',
      repoPathSnapshot: project.repoPath,
    })
    createWorkItem({
      projectId: project.id,
      title: 'Ready build not active',
      status: 'ready',
      phase: 'build',
      priority: 'medium',
      assignedProfile: 'builder',
      repoPathSnapshot: project.repoPath,
    })
    createWorkItem({
      projectId: project.id,
      title: 'Active review not build',
      status: 'active',
      phase: 'review',
      priority: 'medium',
      assignedProfile: 'planner',
      repoPathSnapshot: project.repoPath,
    })

    expect(evaluateLaunchCapacity({ role: 'build' })).toEqual(
      expect.objectContaining({ role: 'build', activeCount: 1, maxActive: 2, allowed: true, advisoryOnly: true }),
    )
  })

  it('allows launches below role capacity', () => {
    upsertRoleCapacityRule({ role: 'build', maxActive: 2, enabled: true })

    expect(evaluateLaunchCapacity({ role: 'build' })).toEqual(
      expect.objectContaining({ allowed: true, message: undefined }),
    )
  })

  it('returns an advisory over-capacity decision without blocking launch', () => {
    const project = createProject({ name: 'Mission Control', repoPath: '/repos/mission-control' })
    upsertRoleCapacityRule({ role: 'build', maxActive: 1, enabled: true })
    createWorkItem({
      projectId: project.id,
      title: 'Existing active build',
      status: 'active',
      phase: 'build',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })

    expect(evaluateLaunchCapacity({ role: 'build' })).toEqual(
      expect.objectContaining({
        role: 'build',
        activeCount: 1,
        maxActive: 1,
        allowed: false,
        advisoryOnly: true,
        message: 'build capacity is at 1/1 active work items; launch may proceed with operator awareness.',
      }),
    )
  })

  it('returns policy from the API route', async () => {
    upsertRoleCapacityRule({ role: 'review', maxActive: 3, enabled: true })

    const response = await RoleCapacityPolicyRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/role-capacity-policy'),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { rules: Array<unknown> }
    expect(body.rules).toContainEqual({ role: 'review', maxActive: 3, enabled: true })
  })
})
