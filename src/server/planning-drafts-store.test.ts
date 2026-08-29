import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  acceptPlanningDraft,
  createPlanningDraft,
  deletePlanningDraft,
  deletePlanningDraftsForProject,
  deletePlanningDraftsForWorkItem,
  getLatestPlanningDraftForWorkItem,
  listPlanningDrafts,
  updatePlanningDraft,
} from './planning-drafts-store'

describe('planning-drafts-store', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-planning-drafts-'))
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

  it('creates planning drafts with defaults', () => {
    const draft = createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-1',
      plannerProfile: 'planner',
    })

    expect(draft.status).toBe('requested')
    expect(draft.parseWarnings).toEqual([])
    expect(draft.workItemId).toBe('work-1')
    expect(draft.projectId).toBe('project-1')
    expect(draft.rawOutput).toBeUndefined()
    expect(draft.structuredOutput).toBeUndefined()
    expect(draft.createdAt).toBeTruthy()
    expect(draft.updatedAt).toBeTruthy()
  })

  it('lists planning drafts by workItemId, projectId, and status', () => {
    const requested = createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-1',
      status: 'requested',
    })
    createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-2',
      status: 'running',
    })
    const accepted = createPlanningDraft({
      workItemId: 'work-2',
      projectId: 'project-1',
      status: 'structured_ready',
    })
    acceptPlanningDraft(accepted.id)

    expect(listPlanningDrafts({ workItemId: 'work-1' }).map((item) => item.id)).toContain(requested.id)
    expect(listPlanningDrafts({ projectId: 'project-1' }).every((item) => item.projectId === 'project-1')).toBe(true)
    expect(listPlanningDrafts({ status: 'accepted' }).map((item) => item.id)).toEqual([accepted.id])
  })

  it('returns the latest planning draft by updatedAt for a work item', () => {
    const older = createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-1',
    })
    const newer = createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-1',
    })

    updatePlanningDraft(older.id, { parseWarnings: ['older touched'] })

    expect(getLatestPlanningDraftForWorkItem('work-1')?.id).toBe(older.id)
    expect(getLatestPlanningDraftForWorkItem('missing')).toBeNull()
    expect(newer.id).not.toBe(older.id)
  })

  it('updates draft raw output, structured output, and parse fields', () => {
    const draft = createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-1',
    })

    const updated = updatePlanningDraft(draft.id, {
      status: 'parse_failed',
      rawOutput: 'raw planner output',
      parseWarnings: ['wrapped in prose'],
      parseError: 'invalid json',
      structuredOutput: {
        title: 'Polished title',
        description: 'Polished description',
        priority: 'high',
        riskLevel: 'medium',
        labels: ['mission-control', 'mission-control', ' planning '],
        acceptanceCriteria: ['Criterion A', 'Criterion A', ' Criterion B '],
        notes: ['Note 1', 'Note 1'],
        planFilePath: 'docs/plans/test.md',
        openQuestions: ['Question 1', 'Question 1'],
        suggestedPhase: 'build',
      },
      planFilePath: ' docs/plans/test.md ',
    })

    expect(updated).not.toBeNull()
    expect(updated?.status).toBe('parse_failed')
    expect(updated?.rawOutput).toBe('raw planner output')
    expect(updated?.parseWarnings).toEqual(['wrapped in prose'])
    expect(updated?.parseError).toBe('invalid json')
    expect(updated?.planFilePath).toBe('docs/plans/test.md')
    expect(updated?.structuredOutput?.labels).toEqual(['mission-control', 'planning'])
    expect(updated?.structuredOutput?.acceptanceCriteria).toEqual(['Criterion A', 'Criterion B'])
    expect(updated?.structuredOutput?.notes).toEqual(['Note 1'])
    expect(updated?.structuredOutput?.openQuestions).toEqual(['Question 1'])
  })

  it('accepts a draft and sets acceptedAt timestamp', () => {
    const draft = createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-1',
      status: 'structured_ready',
    })

    const accepted = acceptPlanningDraft(draft.id)

    expect(accepted).not.toBeNull()
    expect(accepted?.status).toBe('accepted')
    expect(accepted?.acceptedAt).toBeTruthy()
  })

  it('deletes drafts by id, work item, and project', () => {
    const keep = createPlanningDraft({
      workItemId: 'work-keep',
      projectId: 'project-keep',
    })
    const byWorkOne = createPlanningDraft({
      workItemId: 'work-delete',
      projectId: 'project-keep',
    })
    createPlanningDraft({
      workItemId: 'work-delete',
      projectId: 'project-keep',
    })
    createPlanningDraft({
      workItemId: 'work-other',
      projectId: 'project-delete',
    })

    expect(deletePlanningDraft(byWorkOne.id)).toBe(true)
    expect(deletePlanningDraftsForWorkItem('work-delete')).toBe(1)
    expect(deletePlanningDraftsForProject('project-delete')).toBe(1)
    expect(listPlanningDrafts().map((item) => item.id)).toEqual([keep.id])
  })

  it('returns an empty list if backing file is invalid json', () => {
    createPlanningDraft({
      workItemId: 'work-1',
      projectId: 'project-1',
    })

    const backingFile = path.join(process.env.HERMES_HOME!, 'planning-drafts.json')
    fs.writeFileSync(backingFile, '{not valid json', 'utf-8')

    expect(listPlanningDrafts()).toEqual([])
  })
})
