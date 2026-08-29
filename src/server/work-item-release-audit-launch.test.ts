import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem, getWorkItem } from './work-items-store'
import {
  buildReleaseAuditGoal,
  launchReleaseAuditForWorkItem,
  parseSupervisorAuditOutput,
  recordSupervisorAuditOutput,
} from './work-item-release-audit-launch'

const { launchImmediateExecution, listProfiles } = vi.hoisted(() => ({
  launchImmediateExecution: vi.fn(),
  listProfiles: vi.fn(),
}))

vi.mock('./immediate-execution-launch', () => ({
  launchImmediateExecution,
}))

vi.mock('./profiles-browser', () => ({
  listProfiles,
}))

describe('work-item release audit launch', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'hermes-workspace-release-audit-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = join(tempHome, '.hermes')
    launchImmediateExecution.mockReset()
    launchImmediateExecution.mockImplementation((input: { profile?: string; role: string; phase: string; workItemId: string; goal: string }) => ({
      executionRunId: `audit-${input.workItemId.slice(0, 8)}`,
      sessionKey: `session-${input.profile}`,
      state: 'running',
      link: `/executions/audit-${input.workItemId.slice(0, 8)}`,
    }))
    listProfiles.mockReset()
    listProfiles.mockReturnValue([{ name: 'builder' }, { name: 'supervisor' }])
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('builds a read-only structured Supervisor audit prompt', () => {
    const project = createProject({
      name: 'Release Project',
      repoPath: '/repos/release-project',
      defaultBranch: 'main',
      runtimeProfiles: { supervisorProfile: 'supervisor' },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Ship safe release',
      description: 'Release only if evidence is complete.',
      status: 'active',
      phase: 'deploy',
      priority: 'high',
      riskLevel: 'high',
      repoPathSnapshot: '/repos/release-project',
      branchName: 'mission/safe-release',
      mergeTargetBranch: 'main',
      reviewDecision: 'approved',
      acceptanceCriteria: ['Tests pass'],
      artifactPaths: ['dogfood-output/release.md'],
    })

    const goal = buildReleaseAuditGoal(workItem, project)

    expect(goal).toContain('read-only release Supervisor')
    expect(goal).toContain('Do not mutate files, branches, commits, services, profiles, or messaging gateways')
    expect(goal).toContain('SUPERVISOR_AUDIT_DECISION: APPROVED | VETOED | MANUAL_REVIEW')
    expect(goal).toContain('Branch: mission/safe-release')
    expect(goal).toContain('Artifact paths: dogfood-output/release.md')
  })

  it('launches release audit through the mapped Supervisor profile and persists running evidence', async () => {
    const project = createProject({
      name: 'Release Project',
      repoPath: '/repos/release-project',
      defaultBranch: 'main',
      runtimeProfiles: { supervisorProfile: 'supervisor' },
      autonomyLanePolicy: { enabled: true, releaseAudit: { required: true, supervisorRequired: true } } as any,
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Audit before merge',
      status: 'active',
      phase: 'deploy',
      priority: 'high',
      riskLevel: 'medium',
      repoPathSnapshot: '/repos/release-project',
      reviewDecision: 'approved',
    } as any)

    const result = await launchReleaseAuditForWorkItem(workItem, project)
    const updated = getWorkItem(workItem.id) as any

    expect(launchImmediateExecution).toHaveBeenCalledWith(expect.objectContaining({
      role: 'supervisor',
      phase: 'deploy',
      profile: 'supervisor',
      repoPath: '/repos/release-project',
    }))
    expect(result.profile).toBe('supervisor')
    expect(updated).toMatchObject({
      releaseAuditState: 'running',
      releaseAuditExecutionId: `audit-${workItem.id.slice(0, 8)}`,
      releaseAuditMissionId: `audit-${workItem.id.slice(0, 8)}`,
      releaseAuditProfile: 'supervisor',
      releaseAuditSummary: 'Supervisor release audit is running.',
    })
    expect(updated.sessionKeys).toContain('session-supervisor')
    expect(updated.assignedProfile).not.toBe('builder')
  })

  it('fails explicitly when the mapped Supervisor profile is unavailable', async () => {
    listProfiles.mockReturnValue([{ name: 'builder' }])
    const project = createProject({
      name: 'Release Project',
      repoPath: '/repos/release-project',
      runtimeProfiles: { supervisorProfile: 'supervisor' },
      autonomyLanePolicy: { enabled: true, releaseAudit: { required: true, supervisorRequired: true } } as any,
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Audit with missing profile',
      status: 'active',
      phase: 'deploy',
      priority: 'high',
      riskLevel: 'medium',
      repoPathSnapshot: '/repos/release-project',
      reviewDecision: 'approved',
    } as any)

    await expect(launchReleaseAuditForWorkItem(workItem, project)).rejects.toThrow(/Supervisor profile "supervisor" is not available/)
    expect(launchImmediateExecution).not.toHaveBeenCalled()
  })

  it('parses structured Supervisor audit output and persists approved evidence', () => {
    const project = createProject({
      name: 'Release Project',
      repoPath: '/repos/release-project',
      runtimeProfiles: { supervisorProfile: 'supervisor' },
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Record audit output',
      status: 'active',
      phase: 'deploy',
      priority: 'high',
      riskLevel: 'medium',
      repoPathSnapshot: '/repos/release-project',
      releaseAuditState: 'running',
      releaseAuditProfile: 'supervisor',
    } as any)

    const parsed = parseSupervisorAuditOutput(`
SUPERVISOR_AUDIT_DECISION: APPROVED
SUPERVISOR_AUDIT_SUMMARY: Evidence is complete and policy gates passed.
SUPERVISOR_AUDIT_FINDINGS:
- Tests passed
- Review approved
SUPERVISOR_AUDIT_REQUIRED_ACTIONS:
- none
SUPERVISOR_AUDIT_CONFIDENCE: high
`)
    const updated = recordSupervisorAuditOutput(workItem.id, parsed)

    expect(parsed).toMatchObject({ decision: 'approved', confidence: 'high' })
    expect(updated).toMatchObject({
      releaseAuditState: 'approved',
      releaseAuditDecision: 'approved',
      releaseAuditSummary: 'Evidence is complete and policy gates passed.',
      releaseAuditReasons: ['Tests passed', 'Review approved'],
      releaseAuditMissingEvidence: [],
    })
  })
})
