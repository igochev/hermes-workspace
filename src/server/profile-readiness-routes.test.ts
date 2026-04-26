import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getProject, getWorkItem, listProfiles } = vi.hoisted(() => ({
  getProject: vi.fn(),
  getWorkItem: vi.fn(),
  listProfiles: vi.fn(),
}))

vi.mock('./projects-store', () => ({
  getProject,
}))

vi.mock('./work-items-store', () => ({
  getWorkItem,
}))

vi.mock('./profiles-browser', () => ({
  listProfiles,
}))

import { Route as ProfileReadinessRoute } from '../routes/api/projects.$projectId.profile-readiness'
import type { ProjectRecord } from './projects-store'
import type { WorkItemRecord } from './work-items-store'

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    name: 'Mission Control',
    slug: 'mission-control',
    repoPath: '/repos/mission-control',
    phaseProfiles: {
      research: 'researcher',
      build: 'builder',
      review: 'planner',
      deploy: 'deployer',
    },
    reviewAutoApproval: { enabled: false, maxPriority: 'low' },
    autopilotPolicy: {
      enabled: true,
      schedulePreset: 'daily',
      scoutProfile: 'researcher',
      suggestionLimit: 5,
      scoutSources: ['repo-health-scout'],
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeWorkItem(overrides: Partial<WorkItemRecord> = {}): WorkItemRecord {
  return {
    id: 'work-item-1',
    projectId: 'project-1',
    title: 'Build readiness panel',
    description: 'Expose profile readiness before launch.',
    status: 'ready',
    phase: 'build',
    priority: 'high',
    riskLevel: 'medium',
    labels: [],
    repoPathSnapshot: '/repos/mission-control',
    reviewQualityGateReasons: [],
    reviewMissingEvidence: [],
    sessionKeys: [],
    artifactPaths: [],
    acceptanceCriteria: [],
    criteriaStatus: [],
    notes: [],
    history: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('profile readiness route', () => {
  const previousHermesPassword = process.env.HERMES_PASSWORD

  beforeEach(() => {
    delete process.env.HERMES_PASSWORD
    getProject.mockReset()
    getWorkItem.mockReset()
    listProfiles.mockReset()
  })

  afterEach(() => {
    if (previousHermesPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousHermesPassword
  })

  it('returns 401 without checking profiles when authentication fails', async () => {
    process.env.HERMES_PASSWORD = 'secret'

    const response = await ProfileReadinessRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/projects/project-1/profile-readiness'),
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(401)
    expect(getProject).not.toHaveBeenCalled()
    expect(listProfiles).not.toHaveBeenCalled()
  })

  it('returns project profile readiness from available Hermes profiles', async () => {
    getProject.mockReturnValue(makeProject())
    listProfiles.mockReturnValue([
      { name: 'researcher', path: '/profiles/researcher', active: false, exists: true, skillCount: 0, sessionCount: 0, hasEnv: false },
      { name: 'builder', path: '/profiles/builder', active: true, exists: true, skillCount: 0, sessionCount: 0, hasEnv: true },
      { name: 'planner', path: '/profiles/planner', active: false, exists: true, skillCount: 0, sessionCount: 0, hasEnv: true },
      { name: 'deployer', path: '/profiles/deployer', active: false, exists: true, skillCount: 0, sessionCount: 0, hasEnv: false },
    ])

    const response = await ProfileReadinessRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/projects/project-1/profile-readiness'),
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, any>
    expect(body.ok).toBe(true)
    expect(body.projectId).toBe('project-1')
    expect(body.report.roles.find((role: any) => role.role === 'build')).toMatchObject({
      mappedProfile: 'builder',
      source: 'project-phase-profile',
      status: 'ready',
    })
  })

  it('uses the optional work item when a workItemId query param is present', async () => {
    getProject.mockReturnValue(makeProject())
    getWorkItem.mockReturnValue(makeWorkItem({ assignedProfile: 'special-builder' }))
    listProfiles.mockReturnValue([
      { name: 'researcher', path: '/profiles/researcher', active: false, exists: true, skillCount: 0, sessionCount: 0, hasEnv: false },
      { name: 'builder', path: '/profiles/builder', active: true, exists: true, skillCount: 0, sessionCount: 0, hasEnv: true },
      { name: 'planner', path: '/profiles/planner', active: false, exists: true, skillCount: 0, sessionCount: 0, hasEnv: true },
      { name: 'deployer', path: '/profiles/deployer', active: false, exists: true, skillCount: 0, sessionCount: 0, hasEnv: false },
      { name: 'special-builder', path: '/profiles/special-builder', active: false, exists: true, skillCount: 0, sessionCount: 0, hasEnv: true },
    ])

    const response = await ProfileReadinessRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/projects/project-1/profile-readiness?workItemId=work-item-1'),
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(200)
    expect(getWorkItem).toHaveBeenCalledWith('work-item-1')
    const body = (await response.json()) as Record<string, any>
    expect(body.report.roles.find((role: any) => role.role === 'build')).toMatchObject({
      mappedProfile: 'special-builder',
      source: 'work-item-assigned-profile',
      status: 'ready',
    })
  })

  it('returns unknown statuses with a non-500 response when profile discovery fails', async () => {
    getProject.mockReturnValue(makeProject())
    listProfiles.mockImplementation(() => {
      throw new Error('profile directory unavailable')
    })

    const response = await ProfileReadinessRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/projects/project-1/profile-readiness'),
      params: { projectId: 'project-1' },
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, any>
    expect(body.ok).toBe(true)
    expect(body.profileDiscoveryAvailable).toBe(false)
    expect(body.report.overallStatus).toBe('unknown')
    expect(body.report.roles.find((role: any) => role.role === 'build')).toMatchObject({
      mappedProfile: 'builder',
      status: 'unknown',
      severity: 'unknown',
    })
  })

  it('returns 404 when the project does not exist', async () => {
    getProject.mockReturnValue(null)

    const response = await ProfileReadinessRoute.options.server.handlers.GET({
      request: new Request('http://127.0.0.1:3456/api/projects/missing/profile-readiness'),
      params: { projectId: 'missing' },
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ ok: false, error: 'Project not found' })
  })
})
