import { describe, expect, it } from 'vitest'

import {
  JOBS_SCREEN_HELP_COPY,
  JOBS_SCREEN_NEW_JOB_LABEL,
  JOBS_SCREEN_SEARCH_PLACEHOLDER,
  JOBS_SCREEN_TITLE,
  buildScheduledJobsViewModel,
  getJobsScreenDeepLinkJobId,
} from './jobs-screen'
import type { HermesJob } from '@/lib/jobs-api'

describe('jobs screen scheduled-job copy and deep links', () => {
  it('exports operator-facing scheduled-job copy', () => {
    expect(JOBS_SCREEN_TITLE).toBe('Scheduled Jobs')
    expect(JOBS_SCREEN_HELP_COPY).toBe(
      'Scheduled/repeating job definitions. Work-item execution attempts live in Executions.',
    )
    expect(JOBS_SCREEN_NEW_JOB_LABEL).toBe('New Scheduled Job')
    expect(JOBS_SCREEN_SEARCH_PLACEHOLDER).toBe('Search scheduled jobs...')
  })

  it('parses jobId from search params', () => {
    expect(getJobsScreenDeepLinkJobId('?jobId=job-123')).toBe('job-123')
    expect(getJobsScreenDeepLinkJobId('?q=builder&jobId=job-456')).toBe('job-456')
    expect(getJobsScreenDeepLinkJobId('?jobId=')).toBeNull()
    expect(getJobsScreenDeepLinkJobId('')).toBeNull()
  })

  it('keeps normal free-text search over name, prompt, and id', () => {
    const viewModel = buildScheduledJobsViewModel(makeJobs(), { search: 'nightly', jobId: null })

    expect(viewModel.filteredJobs.map((job) => job.id)).toEqual(['job-nightly'])
    expect(viewModel.matchedJobId).toBeNull()
    expect(viewModel.missingJobId).toBeNull()
  })

  it('lets jobId deep links win over incompatible free-text search', () => {
    const viewModel = buildScheduledJobsViewModel(makeJobs(), { search: 'unrelated', jobId: 'job-weekly' })

    expect(viewModel.filteredJobs.map((job) => job.id)).toEqual(['job-weekly'])
    expect(viewModel.matchedJobId).toBe('job-weekly')
    expect(viewModel.missingJobId).toBeNull()
  })

  it('returns a precise missing jobId state for legacy scheduled-job traces and points to Executions', () => {
    const viewModel = buildScheduledJobsViewModel(makeJobs(), { search: '', jobId: 'missing-p0-smoke' })

    expect(viewModel.filteredJobs).toEqual([])
    expect(viewModel.matchedJobId).toBeNull()
    expect(viewModel.missingJobId).toBe('missing-p0-smoke')
    expect(viewModel.executionFallbackHref).toBe('/executions?jobId=missing-p0-smoke')
  })
})

function makeJobs(): Array<HermesJob> {
  return [
    {
      id: 'job-nightly',
      name: 'Nightly review',
      prompt: 'Review active work items',
      schedule: {},
      enabled: true,
      state: 'active',
    },
    {
      id: 'job-weekly',
      name: 'Weekly summary',
      prompt: 'Prepare digest',
      schedule: {},
      enabled: true,
      state: 'active',
    },
  ]
}
