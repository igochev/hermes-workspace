import { describe, expect, it } from 'vitest'

import type { ProjectRecord } from './projects-store'
import type { WorkItemRecord } from './work-items-store'
import { evaluateProfileReadiness } from './profile-readiness'

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

describe('evaluateProfileReadiness', () => {
  it('marks all mapped roles ready when mapped profiles are available', () => {
    const report = evaluateProfileReadiness({
      project: makeProject(),
      availableProfiles: ['researcher', 'builder', 'planner', 'deployer', 'supervisor'],
      defaults: { supervisorProfile: 'supervisor' },
    })

    expect(report.overallStatus).toBe('ready')
    expect(report.roles.map((role) => [role.role, role.status])).toEqual([
      ['research', 'ready'],
      ['build', 'ready'],
      ['review', 'ready'],
      ['deploy', 'ready'],
      ['supervisor', 'ready'],
      ['autopilot-scout', 'ready'],
    ])
  })

  it('reports a warning when the build profile is mapped but unavailable', () => {
    const report = evaluateProfileReadiness({
      project: makeProject(),
      availableProfiles: ['researcher', 'planner', 'deployer'],
    })

    const buildRole = report.roles.find((role) => role.role === 'build')

    expect(report.severity).toBe('warning')
    expect(buildRole).toMatchObject({
      role: 'build',
      mappedProfile: 'builder',
      source: 'project-phase-profile',
      status: 'missing',
      severity: 'warning',
    })
    expect(buildRole?.fixHint).toContain('builder')
  })

  it('uses a work-item assigned profile as the build mapping override', () => {
    const report = evaluateProfileReadiness({
      project: makeProject({
        phaseProfiles: {
          research: 'researcher',
          build: 'builder',
          review: 'planner',
          deploy: 'deployer',
        },
      }),
      workItem: makeWorkItem({ assignedProfile: 'special-builder' }),
      availableProfiles: ['researcher', 'builder', 'planner', 'deployer', 'special-builder'],
    })

    expect(report.roles.find((role) => role.role === 'build')).toMatchObject({
      mappedProfile: 'special-builder',
      source: 'work-item-assigned-profile',
      status: 'ready',
    })
  })

  it('defaults the Autopilot scout role from project policy', () => {
    const report = evaluateProfileReadiness({
      project: makeProject({
        autopilotPolicy: {
          enabled: true,
          schedulePreset: 'weekly',
          scoutProfile: 'scout',
          suggestionLimit: 3,
          scoutSources: ['architecture-debt-scout'],
        },
      }),
      availableProfiles: ['researcher', 'builder', 'planner', 'deployer', 'scout'],
    })

    expect(report.roles.find((role) => role.role === 'autopilot-scout')).toMatchObject({
      mappedProfile: 'scout',
      source: 'project-autopilot-policy',
      status: 'ready',
    })
  })

  it('reports empty optional deploy mapping as unmapped instead of crashing', () => {
    const report = evaluateProfileReadiness({
      project: makeProject({
        phaseProfiles: {
          research: 'researcher',
          build: 'builder',
          review: 'planner',
          deploy: '',
        },
      }),
      availableProfiles: ['researcher', 'builder', 'planner'],
    })

    expect(report.roles.find((role) => role.role === 'deploy')).toMatchObject({
      role: 'deploy',
      mappedProfile: null,
      source: 'project-phase-profile',
      status: 'unmapped',
      severity: 'info',
    })
  })
})
