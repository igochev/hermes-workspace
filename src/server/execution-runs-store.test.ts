import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteExecutionRunsForProject,
  deleteExecutionRunsForWorkItem,
  getExecutionRun,
  listExecutionRuns,
  upsertExecutionRun,
} from './execution-runs-store'

describe('execution-runs-store', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-execution-runs-'))
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

  it('returns an empty list when the backing file does not exist yet', () => {
    expect(listExecutionRuns()).toEqual([])
  })

  it('creates execution run records with defaults and trimmed evidence', () => {
    const run = upsertExecutionRun({
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'mission',
      phase: 'build',
      engine: 'conductor',
      jobId: 'job-1',
      jobName: ' Build mission ',
      state: 'scheduled',
      sessionKeyPrefix: 'abc123',
      artifactPaths: [' artifact.log ', 'artifact.log', '', ' dist/report.json '],
    })

    expect(run.id).toBeTruthy()
    expect(run.jobName).toBe('Build mission')
    expect(run.artifactPaths).toEqual(['artifact.log', 'dist/report.json'])
    expect(run.lastObservedAt).toBeTruthy()
    expect(run.createdAt).toBeTruthy()
    expect(run.updatedAt).toBeTruthy()
    expect(getExecutionRun(run.id)?.jobId).toBe('job-1')
  })

  it('deduplicates by work item, role, job id, and run id while preserving createdAt', () => {
    const first = upsertExecutionRun({
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-1',
      runId: 'run-1',
      state: 'scheduled',
    })

    const second = upsertExecutionRun({
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-1',
      runId: 'run-1',
      state: 'running',
      error: 'should clear because running',
      lastRunAt: '2026-04-26T00:00:00.000Z',
    })

    expect(second.id).toBe(first.id)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt >= first.updatedAt).toBe(true)
    expect(second.state).toBe('running')
    expect(listExecutionRuns()).toHaveLength(1)
  })

  it('deduplicates without run id by work item, role, and job id', () => {
    const first = upsertExecutionRun({
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'review',
      engine: 'conductor',
      jobId: 'review-job',
      state: 'scheduled',
    })

    const second = upsertExecutionRun({
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'review',
      engine: 'conductor',
      jobId: 'review-job',
      state: 'failed',
      error: 'review failed',
    })

    expect(second.id).toBe(first.id)
    expect(second.error).toBe('review failed')
    expect(listExecutionRuns()).toHaveLength(1)
  })

  it('filters execution runs by workItemId, projectId, and role', () => {
    const build = upsertExecutionRun({
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-1',
      state: 'running',
    })
    const review = upsertExecutionRun({
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'review',
      engine: 'conductor',
      jobId: 'job-2',
      state: 'running',
    })
    upsertExecutionRun({
      workItemId: 'work-2',
      projectId: 'project-2',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-3',
      state: 'running',
    })

    expect(listExecutionRuns({ workItemId: 'work-1' }).map((item) => item.id)).toEqual([
      build.id,
      review.id,
    ])
    expect(listExecutionRuns({ projectId: 'project-1' }).map((item) => item.id)).toEqual([
      build.id,
      review.id,
    ])
    expect(listExecutionRuns({ role: 'review' }).map((item) => item.id)).toEqual([review.id])
  })

  it('deletes execution runs by work item and project', () => {
    const keep = upsertExecutionRun({
      workItemId: 'work-keep',
      projectId: 'project-keep',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-keep',
      state: 'running',
    })
    upsertExecutionRun({
      workItemId: 'work-delete',
      projectId: 'project-keep',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-delete-1',
      state: 'running',
    })
    upsertExecutionRun({
      workItemId: 'work-delete',
      projectId: 'project-keep',
      role: 'review',
      engine: 'conductor',
      jobId: 'job-delete-2',
      state: 'running',
    })
    upsertExecutionRun({
      workItemId: 'work-other',
      projectId: 'project-delete',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-delete-3',
      state: 'running',
    })

    expect(deleteExecutionRunsForWorkItem('work-delete')).toBe(2)
    expect(deleteExecutionRunsForProject('project-delete')).toBe(1)
    expect(listExecutionRuns().map((item) => item.id)).toEqual([keep.id])
  })

  it('returns an empty list if backing file is invalid json', () => {
    upsertExecutionRun({
      workItemId: 'work-1',
      projectId: 'project-1',
      role: 'mission',
      engine: 'conductor',
      jobId: 'job-1',
      state: 'running',
    })

    const backingFile = path.join(process.env.HERMES_HOME!, 'work-item-execution-runs.json')
    fs.writeFileSync(backingFile, '{not valid json', 'utf-8')

    expect(listExecutionRuns()).toEqual([])
  })
})
