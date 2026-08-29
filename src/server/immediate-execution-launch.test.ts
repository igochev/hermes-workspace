import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getExecutionRun, listExecutionRuns } from './execution-runs-store'
import { launchImmediateExecution } from './immediate-execution-launch'

const {
  createSession,
  sendChat,
  streamChat,
  sendImmediateChatCompletion,
  launchConductorMission,
  isLocalHermesCliAvailable,
  launchLocalHermesCliExecution,
} = vi.hoisted(() => ({
  createSession: vi.fn(),
  sendChat: vi.fn(),
  streamChat: vi.fn(),
  sendImmediateChatCompletion: vi.fn(),
  launchConductorMission: vi.fn(),
  isLocalHermesCliAvailable: vi.fn(),
  launchLocalHermesCliExecution: vi.fn(),
}))

vi.mock('./hermes-api', () => ({
  createSession,
  sendChat,
  streamChat,
  sendImmediateChatCompletion,
}))

vi.mock('./conductor-launch', () => ({
  launchConductorMission,
}))

vi.mock('./local-hermes-execution', () => ({
  isLocalHermesCliAvailable,
  launchLocalHermesCliExecution,
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
    streamChat.mockReset()
    sendImmediateChatCompletion.mockReset()
    launchConductorMission.mockReset()
    isLocalHermesCliAvailable.mockReset()
    isLocalHermesCliAvailable.mockReturnValue(false)
    launchLocalHermesCliExecution.mockReset()
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('creates a durable execution run before starting a Hermes session and never creates a scheduled job', async () => {
    createSession.mockResolvedValue({ id: 'session-immediate-1' })
    streamChat.mockReturnValue(new Promise(() => {}))

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
    expect(sendChat).not.toHaveBeenCalled()
    expect(streamChat).toHaveBeenCalledWith(
      'session-immediate-1',
      {
        message: expect.stringContaining('Prepare this idea for build.'),
        model: undefined,
      },
      { onEvent: expect.any(Function) },
    )

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

  it('falls back to explicit portable chat completions when the Hermes gateway lacks session creation', async () => {
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
        engine: 'portable-chat-completions',
        state: 'succeeded',
        summary: 'Planner execution completed via portable chat completions after session API was unavailable.',
        latestOutputText: expect.stringContaining('Transport: portable-chat-completions'),
        finalResponse: 'Planner completed via direct chat.',
      })
    })
  })

  it('uses a local Hermes CLI worker instead of slow portable chat completions when sessions are missing and a profile CLI is available', async () => {
    createSession.mockRejectedValue(new Error('Hermes API POST /api/sessions: 404 404: Not Found'))
    isLocalHermesCliAvailable.mockReturnValue(true)
    launchLocalHermesCliExecution.mockReturnValue({
      processId: 4242,
      commandLine: 'builder chat -q <prompt> --source hermes-workspace',
    })

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'build',
      role: 'builder',
      profile: 'builder',
      goal: 'Build the Daily Brief.',
      repoPath: '/repos/demo',
    })

    expect(result).toMatchObject({
      state: 'running',
      link: `/executions/${result.executionRunId}`,
    })
    expect(sendImmediateChatCompletion).not.toHaveBeenCalled()
    expect(launchLocalHermesCliExecution).toHaveBeenCalledWith({
      executionRunId: result.executionRunId,
      prompt: expect.stringContaining('Build the Daily Brief.'),
      repoPath: '/repos/demo',
      role: 'builder',
      profile: 'builder',
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'build',
    })
    expect(getExecutionRun(result.executionRunId)).toMatchObject({
      engine: 'local-hermes-cli',
      state: 'running',
      summary: 'Builder execution running in local Hermes CLI worker.',
      latestOutputText: expect.stringContaining('builder chat -q <prompt>'),
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

  it('streams session events into latest output and final response on the execution run', async () => {
    createSession.mockResolvedValue({ id: 'session-stream-1' })
    streamChat.mockImplementation((_sessionKey, _body, opts) => {
      opts.onEvent({
        event: 'message',
        data: { role: 'assistant', content: 'Researcher found the first signal.' },
      })
      opts.onEvent({
        event: 'tool',
        data: { tool_name: 'web_search', content: 'Searched docs for API support.' },
      })
      opts.onEvent({
        event: 'message',
        data: { role: 'assistant', finalResponse: 'Planner final response from stream.' },
      })
      return Promise.resolve()
    })

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'research',
      role: 'planner',
      profile: 'planner',
      goal: 'Prepare this idea for build.',
      repoPath: '/repos/demo',
    })

    expect(sendChat).not.toHaveBeenCalled()
    expect(streamChat).toHaveBeenCalledWith(
      'session-stream-1',
      {
        message: expect.stringContaining('Prepare this idea for build.'),
        model: undefined,
      },
      { onEvent: expect.any(Function) },
    )

    await vi.waitFor(() => {
      expect(getExecutionRun(result.executionRunId)).toMatchObject({
        state: 'succeeded',
        sessionKey: 'session-stream-1',
        latestOutputText: expect.stringContaining('Searched docs for API support.'),
        finalResponse: 'Planner final response from stream.',
        summary: 'Planner execution completed.',
      })
    })
  })

  it('preserves streamed latest output when a session stream fails', async () => {
    createSession.mockResolvedValue({ id: 'session-stream-failed' })
    streamChat.mockImplementation((_sessionKey, _body, opts) => {
      opts.onEvent({
        event: 'message',
        data: { role: 'assistant', content: 'Partial progress before provider outage.' },
      })
      return Promise.reject(new Error('stream transport failed'))
    })

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'build',
      role: 'builder',
      goal: 'Build the feature.',
      repoPath: '/repos/demo',
    })

    await vi.waitFor(() => {
      expect(getExecutionRun(result.executionRunId)).toMatchObject({
        state: 'failed',
        error: 'stream transport failed',
        latestOutputText: expect.stringContaining('Partial progress before provider outage.'),
      })
    })
  })

  it('records running fallback observability while waiting on portable chat completions', async () => {
    createSession.mockRejectedValue(new Error('Hermes API POST /api/sessions: 404 404: Not Found'))
    sendImmediateChatCompletion.mockReturnValue(new Promise(() => {}))

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'research',
      role: 'planner',
      goal: 'Prepare the family command center idea.',
      repoPath: '/repos/demo',
    })

    expect(getExecutionRun(result.executionRunId)).toMatchObject({
      engine: 'portable-chat-completions',
      state: 'running',
      latestOutputText: expect.stringContaining('Transport: portable-chat-completions'),
      summary: 'Planner execution running via portable chat completions after session API was unavailable.',
    })
  })

  it('fails portable chat completions with structured empty-response evidence', async () => {
    createSession.mockRejectedValue(new Error('Hermes API POST /api/sessions: 404 404: Not Found'))
    sendImmediateChatCompletion.mockResolvedValue({ raw: { choices: [] } })

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'build',
      role: 'builder',
      goal: 'Build the Daily Brief.',
      repoPath: '/repos/demo',
    })

    await vi.waitFor(() => {
      expect(getExecutionRun(result.executionRunId)).toMatchObject({
        engine: 'portable-chat-completions',
        state: 'failed',
        error: 'fallback_empty_response: portable chat completions returned no final response',
        latestOutputText: expect.stringContaining('session_api_missing'),
        summary: 'Builder execution failed via portable chat completions: fallback_empty_response.',
      })
    })
  })

  it('fails portable chat completions with structured fetch-failed evidence', async () => {
    createSession.mockRejectedValue(new Error('Hermes API POST /api/sessions: 404 404: Not Found'))
    sendImmediateChatCompletion.mockRejectedValue(new TypeError('fetch failed'))

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'build',
      role: 'builder',
      goal: 'Build the Daily Brief.',
      repoPath: '/repos/demo',
    })

    await vi.waitFor(() => {
      expect(getExecutionRun(result.executionRunId)).toMatchObject({
        engine: 'portable-chat-completions',
        state: 'failed',
        error: 'fallback_fetch_failed: fetch failed',
        latestOutputText: expect.stringContaining('Recovery: session API is unavailable'),
        summary: 'Builder execution failed via portable chat completions: fallback_fetch_failed.',
      })
    })
  })

  it('bounds portable chat completions fallback with structured timeout evidence', async () => {
    process.env.HERMES_IMMEDIATE_CHAT_FALLBACK_TIMEOUT_MS = '5'
    createSession.mockRejectedValue(new Error('Hermes API POST /api/sessions: 404 404: Not Found'))
    sendImmediateChatCompletion.mockReturnValue(new Promise(() => {}))

    const result = await launchImmediateExecution({
      projectId: 'project-1',
      workItemId: 'work-item-1',
      phase: 'build',
      role: 'builder',
      goal: 'Build the Daily Brief.',
      repoPath: '/repos/demo',
    })

    await vi.waitFor(() => {
      expect(getExecutionRun(result.executionRunId)).toMatchObject({
        engine: 'portable-chat-completions',
        state: 'failed',
        error: 'fallback_timeout: portable chat completions timed out after 5ms',
        summary: 'Builder execution failed via portable chat completions: fallback_timeout.',
      })
    })
    delete process.env.HERMES_IMMEDIATE_CHAT_FALLBACK_TIMEOUT_MS
  })
})
