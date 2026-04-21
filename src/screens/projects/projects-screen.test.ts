import { describe, expect, it } from 'vitest'

import { PROJECTS_QUERY_KEY } from './projects-screen'

describe('projects screen constants', () => {
  it('uses the mission control projects query key namespace', () => {
    expect(PROJECTS_QUERY_KEY).toEqual(['mission-control', 'projects'])
  })
})
