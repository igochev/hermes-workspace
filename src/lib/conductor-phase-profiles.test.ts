import { describe, expect, it } from 'vitest'

import {
  buildPhaseProfileRoutingInstructions,
  EMPTY_PHASE_PROFILES,
  normalizePhaseProfiles,
} from './conductor-phase-profiles'

describe('normalizePhaseProfiles', () => {
  it('returns empty mappings for invalid input', () => {
    expect(normalizePhaseProfiles(null)).toEqual(EMPTY_PHASE_PROFILES)
    expect(normalizePhaseProfiles('oops')).toEqual(EMPTY_PHASE_PROFILES)
  })

  it('keeps only trimmed string phase mappings', () => {
    expect(
      normalizePhaseProfiles({
        research: ' researcher ',
        build: 'builder',
        review: 42,
        deploy: '',
      }),
    ).toEqual({
      research: 'researcher',
      build: 'builder',
      review: '',
      deploy: '',
    })
  })
})

describe('buildPhaseProfileRoutingInstructions', () => {
  it('returns no instructions when no mappings exist', () => {
    expect(buildPhaseProfileRoutingInstructions(EMPTY_PHASE_PROFILES)).toEqual([])
  })

  it('renders concrete routing instructions when mappings exist', () => {
    const lines = buildPhaseProfileRoutingInstructions({
      research: 'planner',
      build: 'builder',
      review: '',
      deploy: '',
    })

    expect(lines.join('\n')).toContain('research tasks → Hermes profile "planner"')
    expect(lines.join('\n')).toContain('build tasks → Hermes profile "builder"')
    expect(lines.join('\n')).toContain('acp_command: "<profile>"')
    expect(lines.join('\n')).toContain('acp_args: ["--acp", "--stdio"]')
    expect(lines.join('\n')).not.toContain('"-p"')
  })
})
