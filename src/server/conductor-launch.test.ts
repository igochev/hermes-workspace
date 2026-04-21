import { describe, expect, it } from 'vitest'

import { extractCreatedJobRef } from './conductor-launch'

describe('conductor-launch', () => {
  it('extracts job id and name from dashboard-style direct job payloads', () => {
    expect(
      extractCreatedJobRef({
        id: 'job-123',
        name: 'work-item-build-demo',
      }),
    ).toEqual({ id: 'job-123', name: 'work-item-build-demo' })
  })

  it('extracts job id and name from nested fastapi payloads', () => {
    expect(
      extractCreatedJobRef({
        job: {
          id: 'job-456',
          name: 'work-item-review-demo',
        },
      }),
    ).toEqual({ id: 'job-456', name: 'work-item-review-demo' })
  })
})
