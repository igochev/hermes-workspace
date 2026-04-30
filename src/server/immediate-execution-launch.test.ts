import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getExecutionRun, listExecutionRuns } from './execution-runs-store'
import { launchImmediateExecution } from './immediate-execution-launch'

const {
  createSession,
  sendChat,
  sendImmediateChatCompletion,
  launchConductorMission,
} = vi.hoisted(() => ({
  createSession: vi.fn(),
  sendChat: vi.fn(),
  sendImmediateChatCompletion: vi.fn(),
  launchConductorMission: vi.fn(),
}))

vi.mock('./hermes-api', () => ({
  createSession,
  sendChat,
  sendImmediateChatCompletion,
}))

vi.mock('./conductor-launch', () => ({
  launchConductorMission,
}))

describe('immediate execution launch', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'hermes-workspace-immediate-execution-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = join(tempHome, '.hermes')
    createSession.mockReset()
    sendChat.mockReset()
    sendImmediateChatCompletion.mockReset()
    launchConductorMission.mockReset()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('creates a durable execution run before starting a Hermes session and never creates a scheduled job', async () => {
    createSession.mockResolvedValue({ id: 'session-immediate-1' })
    sendChat.mockReturnValue(new Promise(() => {}))

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'research',
      role: 'planner',
      profile: 'planner',
      goal: 'Prepare this idea for build.',
      repoPath: '/repos/demo',
    })

    expect(result).toMatchObject({
      sessionKey: 'session-immediate-1',
      state: 'running',
      link: `/executions/${result.executionRunId}`,
    })
    expect(launchConductorMission).not.toHaveBeenCalled()
    expect(createSession).toHaveBeenCalledWith({
      id: result.executionRunId,
      title: 'Planner research execution for work-item-1',
      model: undefined,
    })
    expect(sendChat).toHaveBeenCalledWith('session-immediate-1', {
      message: expect.stringContaining('Prepare this idea for build.'),
    })

    const runs = listExecutionRuns({ workItemId: 'work-item-1' })
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      id: result.executionRunId,
      workItemId: 'work-item-1',
      projectId: 'project-1',
      role: 'planner',
      phase: 'research',
      engine: 'hermes-session',
      state: 'running',
      profile: 'planner',
      sessionKey: 'session-immediate-1',
      artifactPaths: [],
    })
    expect(runs[0].jobId).toBeUndefined()
  })

  it('falls back to immediate chat completions when the Hermes gateway lacks session creation', async () => {
    createSession.mockRejectedValue(new Error('Hermes API POST /api/sessions: 404 404: Not Found'))
    sendImmediateChatCompletion.mockResolvedValue({ finalResponse: 'Planner completed via direct chat.' })

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'research',
      role: 'planner',
      goal: 'Prepare the family command center idea.',
      repoPath: '/repos/demo',
    })

    expect(result).toMatchObject({
      state: 'running',
      link: `/executions/${result.executionRunId}`,
    })
    expect(result.sessionKey).toBeUndefined()
    expect(sendImmediateChatCompletion).toHaveBeenCalledWith({
      message: expect.stringContaining('Prepare the family command center idea.'),
      model: undefined,
    })
    expect(launchConductorMission).not.toHaveBeenCalled()

    await vi.waitFor(() => {
      expect(getExecutionRun(result.executionRunId)).toMatchObject({
        engine: 'hermes-session',
        state: 'succeeded',
        summary: 'Planner execution completed via immediate chat completion.',
        finalResponse: 'Planner completed via direct chat.',
      })
    })
  })

  it('records a failed execution run when the immediate Hermes session cannot start and no direct chat fallback applies', async () => {
    createSession.mockRejectedValue(new Error('sessions API unavailable'))

    await expect(
      launchImmediateExecution({
        projectId: 'project-1',
        workItemId: 'work-item-1',
        phase: 'build',
        role: 'builder',
        goal: 'Build the feature.',
        repoPath: '/repos/demo',
      }),
    ).rejects.toThrow('sessions API unavailable')

    const [run] = listExecutionRuns({ workItemId: 'work-item-1' })
    expect(run).toMatchObject({
      role: 'builder',
      phase: 'build',
      engine: 'hermes-session',
      state: 'failed',
      error: 'sessions API unavailable',
    })
    expect(run.jobId).toBeUndefined()
  })

  it('records background send failures on the same execution run', async () => {
    createSession.mockResolvedValue({ id: 'session-immediate-2' })
    sendChat.mockRejectedValue(new Error('model provider rejected request'))

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'review',
      role: 'reviewer',
      goal: 'Review the output.',
      repoPath: '/repos/demo',
    })

    await vi.waitFor(() => {
      expect(getExecutionRun(result.executionRunId)).toMatchObject({
        state: 'failed',
        error: 'model provider rejected request',
      })
    })
  })
})
