import { describe, expect, it } from 'vitest'

import { buildProjectAutopilotScoutPrompt } from './autopilot-scout-prompts'

describe('autopilot-scout-prompts', () => {
  it('includes project metadata, endpoint, schema fields, and suggestion limit', () => {
    const prompt = buildProjectAutopilotScoutPrompt({
      project: {
        id: 'project-1',
        name: 'Mission Control',
        repoPath: '/repos/mission-control',
        defaultBranch: 'main',
      },
      policy: {
        suggestionLimit: 3,
        scoutSources: ['repo-health-scout', 'failing-tests-scout'],
      },
      suggestionsEndpoint: '/api/autopilot-suggestions',
    })

    expect(prompt).toContain('project-1')
    expect(prompt).toContain('Mission Control')
    expect(prompt).toContain('/repos/mission-control')
    expect(prompt).toContain('main')
    expect(prompt).toContain('/api/autopilot-suggestions')
    expect(prompt).toContain('suggestionLimit: 3')
    expect(prompt).toContain('suggestedAcceptanceCriteria')
    expect(prompt).toContain('impact')
    expect(prompt).toContain('risk')
    expect(prompt).toContain('effort')
  })

  it('enforces suggest-only safety constraints and mutation prohibitions', () => {
    const prompt = buildProjectAutopilotScoutPrompt({
      project: {
        id: 'project-2',
        name: 'Workspace',
        repoPath: '/repos/workspace',
      },
      policy: {
        suggestionLimit: 5,
        scoutSources: ['architecture-debt-scout'],
      },
      suggestionsEndpoint: '/api/autopilot-suggestions',
    })

    expect(prompt).toContain('suggestions only')
    expect(prompt).toContain('Do not modify files')
    expect(prompt).toContain(
      'Do not create branches, commits, PRs, work items, or code changes',
    )
    expect(prompt).toContain('dedupe')
    expect(prompt).toContain('evidence')
  })
})
