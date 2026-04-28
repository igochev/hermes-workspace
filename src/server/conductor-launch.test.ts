import { describe, expect, it } from 'vitest'

import { buildOrchestratorPrompt, extractCreatedJobRef } from './conductor-launch'

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

  it('renders ACP subprocess routing instructions for mapped research and build profiles', () => {
    const prompt = buildOrchestratorPrompt('Ship the next slice', 'dispatch-skill', {
      orchestratorModel: '',
      workerModel: '',
      projectsDir: '/tmp',
      maxParallel: 1,
      supervised: false,
      phaseProfiles: {
        research: 'planner',
        build: 'builder',
        review: '',
        deploy: '',
      },
    })

    expect(prompt).toContain('research tasks → Hermes profile "planner"')
    expect(prompt).toContain('build tasks → Hermes profile "builder"')
    expect(prompt).toContain('delegate_task using ACP subprocess transport')
    expect(prompt).toContain('acp_command: "<profile>"')
    expect(prompt).toContain('acp_args: ["--acp", "--stdio"]')
  })
})
