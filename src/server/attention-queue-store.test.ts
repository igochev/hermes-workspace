import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  listAttentionQueueItems,
  markAttentionQueueItemResolved,
  upsertAttentionQueueItem,
} from './attention-queue-store'

describe('attention-queue-store', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-attention-queue-'))
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

  it('returns an empty queue before the backing file exists', () => {
    expect(listAttentionQueueItems()).toEqual([])
  })

  it('upserts by dedupe key while preserving firstSeenAt and updating details', () => {
    const first = upsertAttentionQueueItem({
      dedupeKey: 'work-1:mission_failed',
      kind: 'mission_failed',
      severity: 'critical',
      projectId: 'project-1',
      workItemId: 'work-1',
      title: 'Mission failed',
      detail: 'Original failure',
      href: '/projects/project-1/work-items/work-1',
      source: 'derived',
    })

    const second = upsertAttentionQueueItem({
      dedupeKey: 'work-1:mission_failed',
      kind: 'mission_failed',
      severity: 'critical',
      projectId: 'project-1',
      workItemId: 'work-1',
      title: 'Mission still failed',
      detail: 'Updated failure',
      href: '/projects/project-1/work-items/work-1',
      source: 'supervisor',
    })

    expect(second.id).toBe(first.id)
    expect(second.firstSeenAt).toBe(first.firstSeenAt)
    expect(second.title).toBe('Mission still failed')
    expect(second.detail).toBe('Updated failure')
    expect(second.source).toBe('supervisor')
    expect(listAttentionQueueItems()).toHaveLength(1)
  })

  it('reopens a resolved item when the same condition is seen again', () => {
    const item = upsertAttentionQueueItem({
      dedupeKey: 'work-1:blocked',
      kind: 'blocked_work',
      severity: 'warning',
      projectId: 'project-1',
      workItemId: 'work-1',
      title: 'Blocked work',
      detail: 'Dependency needed',
      href: '/projects/project-1/work-items/work-1',
      source: 'derived',
    })

    expect(markAttentionQueueItemResolved(item.id)?.status).toBe('resolved')

    const reopened = upsertAttentionQueueItem({
      dedupeKey: 'work-1:blocked',
      kind: 'blocked_work',
      severity: 'warning',
      projectId: 'project-1',
      workItemId: 'work-1',
      title: 'Blocked work',
      detail: 'Still blocked',
      href: '/projects/project-1/work-items/work-1',
      source: 'derived',
    })

    expect(reopened.id).toBe(item.id)
    expect(reopened.status).toBe('open')
    expect(reopened.detail).toBe('Still blocked')
  })

  it('sorts open critical items before warnings and resolved items', () => {
    const warning = upsertAttentionQueueItem({
      dedupeKey: 'warning',
      kind: 'blocked_work',
      severity: 'warning',
      projectId: 'project-1',
      title: 'Warning',
      detail: 'warning',
      href: '/projects/project-1',
      source: 'derived',
    })
    const resolvedCritical = upsertAttentionQueueItem({
      dedupeKey: 'resolved-critical',
      kind: 'mission_failed',
      severity: 'critical',
      projectId: 'project-1',
      title: 'Resolved critical',
      detail: 'resolved',
      href: '/projects/project-1',
      source: 'derived',
    })
    markAttentionQueueItemResolved(resolvedCritical.id)
    const critical = upsertAttentionQueueItem({
      dedupeKey: 'critical',
      kind: 'mission_failed',
      severity: 'critical',
      projectId: 'project-1',
      title: 'Critical',
      detail: 'critical',
      href: '/projects/project-1',
      source: 'derived',
    })

    expect(listAttentionQueueItems().map((item) => item.id)).toEqual([
      critical.id,
      warning.id,
      resolvedCritical.id,
    ])
  })

  it('returns an empty list if the backing file is invalid json', () => {
    upsertAttentionQueueItem({
      dedupeKey: 'invalid-json-setup',
      kind: 'blocked_work',
      severity: 'warning',
      projectId: 'project-1',
      title: 'Setup',
      detail: 'Setup',
      href: '/projects/project-1',
      source: 'derived',
    })
    fs.writeFileSync(path.join(process.env.HERMES_HOME!, 'attention-queue.json'), '{not valid json', 'utf-8')

    expect(listAttentionQueueItems()).toEqual([])
  })
})
