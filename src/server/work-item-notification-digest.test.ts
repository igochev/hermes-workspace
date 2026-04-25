import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createProject } from './projects-store'
import { createWorkItem } from './work-items-store'
import { requestWorkItemApproval } from './work-item-approvals'
import {
  buildStatusDigest,
  digestStateHasChanged,
  formatDigestForDiscord,
  persistDigestHash,
  formatDigestAge,
} from './work-item-notification-digest'

describe('work-item-notification-digest', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(async () => {
    const fs = await import('node:fs')
    const os = await import('node:os')
    const path = await import('node:path')
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-digest-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
  })

  afterEach(async () => {
    const fs = await import('node:fs')
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('returns empty digest when no approvals or blocked items exist', () => {
    const digest = buildStatusDigest()
    expect(digest.pendingApprovals).toEqual([])
    expect(digest.blockedItems).toEqual([])
    expect(digest.failedMissions).toEqual([])
    expect(digest.summary.pendingApprovalCount).toBe(0)
    expect(digest.summary.blockedCount).toBe(0)
    expect(digest.summary.failedMissionCount).toBe(0)
    expect(digest.stateHash).toBeTruthy()
  })

  it('includes pending approvals in the digest', () => {
    const project = createProject({
      name: 'Test Project',
      repoPath: '/repos/test',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Feature X',
      status: 'active',
      phase: 'review',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    requestWorkItemApproval(workItem.id, {
      requestedBy: 'operator',
      phase: 'review',
    })

    const digest = buildStatusDigest()

    expect(digest.pendingApprovals).toHaveLength(1)
    expect(digest.pendingApprovals[0].workItemTitle).toBe('Feature X')
    expect(digest.pendingApprovals[0].projectName).toBe('Test Project')
    expect(digest.pendingApprovals[0].phase).toBe('review')
    expect(digest.summary.pendingApprovalCount).toBe(1)
  })

  it('includes blocked items and failed missions in the digest', () => {
    const project = createProject({
      name: 'Blocked Project',
      repoPath: '/repos/blocked',
    })
    createWorkItem({
      projectId: project.id,
      title: 'Blocked Item',
      status: 'blocked',
      phase: 'build',
      priority: 'medium',
      repoPathSnapshot: project.repoPath,
      blockedReason: 'mission_failed',
      missionState: 'failed',
      missionLastError: 'Test failure error',
    })
    createWorkItem({
      projectId: project.id,
      title: 'Running Fine',
      status: 'active',
      phase: 'build',
      priority: 'low',
      repoPathSnapshot: project.repoPath,
      missionState: 'running',
    })

    const digest = buildStatusDigest()

    expect(digest.blockedItems).toHaveLength(1)
    expect(digest.blockedItems[0].workItemTitle).toBe('Blocked Item')
    expect(digest.blockedItems[0].blockedReason).toBe('mission_failed')
    expect(digest.summary.blockedCount).toBe(1)

    // Blocked item with missionState=failed also appears in failedMissions
    expect(digest.failedMissions).toHaveLength(1)
    expect(digest.failedMissions[0].workItemTitle).toBe('Blocked Item')
    expect(digest.summary.failedMissionCount).toBe(1)
  })

  it('de-dup detects changed vs unchanged state', () => {
    const digest1 = buildStatusDigest()
    expect(digestStateHasChanged(digest1.stateHash)).toBe(true)
    persistDigestHash(digest1.stateHash)
    expect(digestStateHasChanged(digest1.stateHash)).toBe(false)

    // Different hash should be detected as changed
    expect(digestStateHasChanged('different-hash-12345')).toBe(true)
  })

  it('formats a full digest for Discord output', () => {
    const project = createProject({
      name: 'Discord Test',
      repoPath: '/repos/discord',
    })
    const workItem = createWorkItem({
      projectId: project.id,
      title: 'Discord Approval Item',
      status: 'active',
      phase: 'review',
      priority: 'high',
      repoPathSnapshot: project.repoPath,
    })
    requestWorkItemApproval(workItem.id, {
      requestedBy: 'operator',
      phase: 'review',
    })

    const digest = buildStatusDigest()
    const message = formatDigestForDiscord(digest)

    expect(message).toContain('Mission Control Status Digest')
    expect(message).toContain('pending approval')
    expect(message).toContain('Discord Approval Item')
    expect(message).toContain('Pending Approvals')
  })

  it('formats an all-clear digest when nothing needs attention', () => {
    const digest = buildStatusDigest()
    const message = formatDigestForDiscord(digest)
    expect(message).toContain('No pending approvals')
    expect(message).toContain('All clear')
  })

  it('formatDigestAge returns human-readable duration', () => {
    expect(formatDigestAge(null)).toBe('—')
    expect(formatDigestAge(5)).toBe('~5m')
    expect(formatDigestAge(65)).toBe('~1h 5m')
    expect(formatDigestAge(120)).toBe('~2h')
    expect(formatDigestAge(0)).toBe('~0m')
  })
})
