import { randomUUID } from 'node:crypto'

import { createSession, sendImmediateChatCompletion, streamChat } from './hermes-api'
import { upsertExecutionRun } from './execution-runs-store'
import { isLocalHermesCliAvailable, launchLocalHermesCliExecution } from './local-hermes-execution'
import type { ExecutionEngine } from './execution-runs-store'
import type { WorkItemPhase } from './work-items-store'

export type ImmediateExecutionRole = 'planner' | 'builder' | 'reviewer' | 'deployer' | 'supervisor' | 'merge-healer'

export type ImmediateExecutionLaunchInput = {
  projectId: string
  workItemId: string
  phase: WorkItemPhase
  role: ImmediateExecutionRole
  profile?: string
  goal: string
  repoPath: string
  model?: string
}

export type ImmediateExecutionLaunchResult = {
  executionRunId: string
  sessionKey?: string
  state: 'queued' | 'running'
  link: string
}

function readRequiredString(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} required`)
  return normalized
}

function roleTitle(role: ImmediateExecutionRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function buildImmediateExecutionPrompt(input: {
  goal: string
  projectId: string
  workItemId: string
  phase: WorkItemPhase
  role: ImmediateExecutionRole
  profile?: string
  repoPath: string
}): string {
  return [
    `Execute Hermes Workspace work item ${input.workItemId} as ${input.role}.`,
    `Project ID: ${input.projectId}`,
    `Work item ID: ${input.workItemId}`,
    `Phase: ${input.phase}`,
    `Role: ${input.role}`,
    `Repository path: ${input.repoPath}`,
    ...(input.profile ? [`Hermes profile: ${input.profile}`] : []),
    '',
    'Operator goal:',
    input.goal,
    '',
    'Report progress and final output in this session. Do not create a Scheduled Job definition for this immediate work-item execution.',
  ].join('\n')
}

function isMissingSessionCreationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('/api/sessions') && message.includes('404')
}

function extractFinalResponse(result: Record<string, unknown>): string | undefined {
  return typeof result.finalResponse === 'string'
    ? result.finalResponse
    : typeof result.response === 'string'
      ? result.response
      : undefined
}

const MAX_EXECUTION_OUTPUT_CHARS = 12_000
const PORTABLE_CHAT_COMPLETIONS_ENGINE: ExecutionEngine = 'portable-chat-completions'

type PortableFallbackFailureReason =
  | 'fallback_timeout'
  | 'fallback_empty_response'
  | 'fallback_fetch_failed'
  | 'fallback_provider_error'

function buildPortableFallbackOutput(params: {
  state: 'running' | 'succeeded' | 'failed'
  sessionError: unknown
  response?: string
  failureReason?: PortableFallbackFailureReason
  error?: string
}): string {
  return [
    'Transport: portable-chat-completions',
    'Session capability: session_api_missing (/api/sessions returned 404).',
    params.state === 'running'
      ? 'Status: waiting on portable chat completions fallback.'
      : params.state === 'succeeded'
        ? 'Status: portable chat completions fallback completed.'
        : `Status: portable chat completions fallback failed (${params.failureReason}).`,
    params.response ? `Final response:\n${params.response}` : undefined,
    params.error ? `Error: ${params.error}` : undefined,
    params.state === 'failed'
      ? 'Recovery: session API is unavailable; use Resume Build after fixing portable chat completions transport/provider behavior.'
      : undefined,
    `Session API error: ${params.sessionError instanceof Error ? params.sessionError.message : String(params.sessionError)}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n')
}

function classifyPortableFallbackError(error: unknown): {
  reason: PortableFallbackFailureReason
  message: string
} {
  const message = error instanceof Error ? error.message : String(error)
  const lower = message.toLowerCase()
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { reason: 'fallback_timeout', message }
  }
  if (lower.includes('fetch failed')) {
    return { reason: 'fallback_fetch_failed', message }
  }
  return { reason: 'fallback_provider_error', message }
}

function emptyPortableFallbackError(): Error {
  return new Error('portable chat completions returned no final response')
}

function getPortableFallbackTimeoutMs(): number {
  const raw = Number(process.env.HERMES_IMMEDIATE_CHAT_FALLBACK_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 300_000
}

function withPortableFallbackTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`portable chat completions timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

function appendOutputExcerpt(current: string | undefined, next: string | undefined): string | undefined {
  const normalized = next?.trim()
  if (!normalized) return current
  const combined = current?.trim() ? `${current.trim()}\n${normalized}` : normalized
  return combined.length > MAX_EXECUTION_OUTPUT_CHARS
    ? combined.slice(combined.length - MAX_EXECUTION_OUTPUT_CHARS)
    : combined
}

function readStringField(data: Record<string, unknown>, keys: Array<string>): string | undefined {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function extractStreamEventText(event: string, data: Record<string, unknown>): string | undefined {
  const direct = readStringField(data, [
    'content',
    'text',
    'delta',
    'message',
    'output',
    'summary',
    'finalResponse',
    'response',
    'error',
  ])
  if (direct) return direct

  const nestedMessage = data.message
  if (nestedMessage && typeof nestedMessage === 'object' && !Array.isArray(nestedMessage)) {
    const nested = readStringField(nestedMessage as Record<string, unknown>, ['content', 'text'])
    if (nested) return nested
  }

  if (event && event !== 'message') return `[${event}] ${JSON.stringify(data)}`
  return undefined
}

function extractStreamFinalResponse(data: Record<string, unknown>): string | undefined {
  return readStringField(data, ['finalResponse', 'response', 'final_response'])
}

function isLikelyTerminalStreamEvent(event: string, data: Record<string, unknown>): boolean {
  const normalizedEvent = event.toLowerCase()
  if (['final', 'complete', 'completed', 'done', 'end'].includes(normalizedEvent)) return true
  const status = readStringField(data, ['status', 'state', 'finish_reason'])?.toLowerCase()
  return status === 'completed' || status === 'succeeded' || status === 'stop'
}

export async function launchImmediateExecution(
  input: ImmediateExecutionLaunchInput,
): Promise<ImmediateExecutionLaunchResult> {
  const projectId = readRequiredString(input.projectId, 'projectId')
  const workItemId = readRequiredString(input.workItemId, 'workItemId')
  const goal = readRequiredString(input.goal, 'goal')
  const repoPath = readRequiredString(input.repoPath, 'repoPath')
  const executionRunId = randomUUID()
  const now = new Date().toISOString()

  upsertExecutionRun({
    id: executionRunId,
    workItemId,
    projectId,
    role: input.role,
    phase: input.phase,
    engine: 'hermes-session',
    state: 'queued',
    profile: input.profile,
    summary: `${roleTitle(input.role)} execution queued.`,
    lastObservedAt: now,
    artifactPaths: [],
  })

  try {
    const title = `${roleTitle(input.role)} ${input.phase} execution for ${workItemId}`
    const immediatePrompt = buildImmediateExecutionPrompt({
      goal,
      projectId,
      workItemId,
      phase: input.phase,
      role: input.role,
      profile: input.profile,
      repoPath,
    })
    const session = await createSession({
      id: executionRunId,
      title,
      model: input.model?.trim() || undefined,
    })
    const sessionKey = session.id
    const startedAt = new Date().toISOString()

    upsertExecutionRun({
      id: executionRunId,
      workItemId,
      projectId,
      role: input.role,
      phase: input.phase,
      engine: 'hermes-session',
      state: 'running',
      profile: input.profile,
      sessionKey,
      startedAt,
      lastObservedAt: startedAt,
      summary: `${roleTitle(input.role)} execution running in Hermes session ${sessionKey}.`,
      artifactPaths: [],
    })

    let latestOutputText: string | undefined
    let finalResponseFromStream: string | undefined

    void streamChat(
      sessionKey,
      {
        message: immediatePrompt,
        model: input.model?.trim() || undefined,
      },
      {
        onEvent: ({ event, data }) => {
          const observedAt = new Date().toISOString()
          const eventText = extractStreamEventText(event, data)
          latestOutputText = appendOutputExcerpt(latestOutputText, eventText)
          finalResponseFromStream = extractStreamFinalResponse(data) ?? finalResponseFromStream

          upsertExecutionRun({
            id: executionRunId,
            workItemId,
            projectId,
            role: input.role,
            phase: input.phase,
            engine: 'hermes-session',
            state: 'running',
            profile: input.profile,
            sessionKey,
            startedAt,
            lastObservedAt: observedAt,
            latestOutputText,
            summary: `${roleTitle(input.role)} execution running in Hermes session ${sessionKey}.`,
            artifactPaths: [],
          })

          if (!finalResponseFromStream && isLikelyTerminalStreamEvent(event, data)) {
            finalResponseFromStream = latestOutputText
          }
        },
      },
    )
      .then(() => {
        const finishedAt = new Date().toISOString()
        upsertExecutionRun({
          id: executionRunId,
          workItemId,
          projectId,
          role: input.role,
          phase: input.phase,
          engine: 'hermes-session',
          state: 'succeeded',
          profile: input.profile,
          sessionKey,
          startedAt,
          finishedAt,
          lastObservedAt: finishedAt,
          latestOutputText,
          finalResponse: finalResponseFromStream ?? latestOutputText,
          summary: `${roleTitle(input.role)} execution completed.`,
          artifactPaths: [],
        })
      })
      .catch((error: unknown) => {
        const failedAt = new Date().toISOString()
        upsertExecutionRun({
          id: executionRunId,
          workItemId,
          projectId,
          role: input.role,
          phase: input.phase,
          engine: 'hermes-session',
          state: 'failed',
          profile: input.profile,
          sessionKey,
          startedAt,
          finishedAt: failedAt,
          lastObservedAt: failedAt,
          latestOutputText,
          error: error instanceof Error ? error.message : String(error),
          summary: `${roleTitle(input.role)} execution failed to complete.`,
          artifactPaths: [],
        })
      })

    return {
      executionRunId,
      sessionKey,
      state: 'running',
      link: `/executions/${encodeURIComponent(executionRunId)}`,
    }
  } catch (error) {
    const failedAt = new Date().toISOString()
    if (isMissingSessionCreationError(error)) {
      const fallbackPrompt = buildImmediateExecutionPrompt({
        goal,
        projectId,
        workItemId,
        phase: input.phase,
        role: input.role,
        profile: input.profile,
        repoPath,
      })

      if (isLocalHermesCliAvailable(input.profile)) {
        const localLaunch = launchLocalHermesCliExecution({
          executionRunId,
          prompt: fallbackPrompt,
          repoPath,
          role: input.role,
          profile: input.profile,
          projectId,
          workItemId,
          phase: input.phase,
        })
        upsertExecutionRun({
          id: executionRunId,
          workItemId,
          projectId,
          role: input.role,
          phase: input.phase,
          engine: 'local-hermes-cli',
          state: 'running',
          profile: input.profile,
          startedAt: failedAt,
          lastObservedAt: failedAt,
          latestOutputText: [
            'Transport: local-hermes-cli',
            'Session capability: session_api_missing (/api/sessions returned 404).',
            `Command: ${localLaunch.commandLine}`,
            localLaunch.processId ? `PID: ${localLaunch.processId}` : undefined,
          ]
            .filter((line): line is string => Boolean(line))
            .join('\n'),
          summary: `${roleTitle(input.role)} execution running in local Hermes CLI worker.`,
          artifactPaths: [],
        })
        return {
          executionRunId,
          state: 'running',
          link: `/executions/${encodeURIComponent(executionRunId)}`,
        }
      }

      upsertExecutionRun({
        id: executionRunId,
        workItemId,
        projectId,
        role: input.role,
        phase: input.phase,
        engine: PORTABLE_CHAT_COMPLETIONS_ENGINE,
        state: 'running',
        profile: input.profile,
        startedAt: failedAt,
        lastObservedAt: failedAt,
        latestOutputText: buildPortableFallbackOutput({
          state: 'running',
          sessionError: error,
        }),
        summary: `${roleTitle(input.role)} execution running via portable chat completions after session API was unavailable.`,
        artifactPaths: [],
      })

      void withPortableFallbackTimeout(
        sendImmediateChatCompletion({
          message: fallbackPrompt,
          model: input.model?.trim() || undefined,
        }),
        getPortableFallbackTimeoutMs(),
      )
        .then((result) => {
          const finalResponse = extractFinalResponse(result)
          if (!finalResponse) throw emptyPortableFallbackError()
          const finishedAt = new Date().toISOString()
          upsertExecutionRun({
            id: executionRunId,
            workItemId,
            projectId,
            role: input.role,
            phase: input.phase,
            engine: PORTABLE_CHAT_COMPLETIONS_ENGINE,
            state: 'succeeded',
            profile: input.profile,
            startedAt: failedAt,
            finishedAt,
            lastObservedAt: finishedAt,
            latestOutputText: buildPortableFallbackOutput({
              state: 'succeeded',
              sessionError: error,
              response: finalResponse,
            }),
            finalResponse,
            summary: `${roleTitle(input.role)} execution completed via portable chat completions after session API was unavailable.`,
            artifactPaths: [],
          })
        })
        .catch((fallbackError: unknown) => {
          const fallbackFailedAt = new Date().toISOString()
          const failure =
            fallbackError instanceof Error &&
            fallbackError.message === 'portable chat completions returned no final response'
              ? {
                  reason: 'fallback_empty_response' as const,
                  message: fallbackError.message,
                }
              : classifyPortableFallbackError(fallbackError)
          upsertExecutionRun({
            id: executionRunId,
            workItemId,
            projectId,
            role: input.role,
            phase: input.phase,
            engine: PORTABLE_CHAT_COMPLETIONS_ENGINE,
            state: 'failed',
            profile: input.profile,
            startedAt: failedAt,
            finishedAt: fallbackFailedAt,
            lastObservedAt: fallbackFailedAt,
            latestOutputText: buildPortableFallbackOutput({
              state: 'failed',
              sessionError: error,
              failureReason: failure.reason,
              error: failure.message,
            }),
            error: `${failure.reason}: ${failure.message}`,
            summary: `${roleTitle(input.role)} execution failed via portable chat completions: ${failure.reason}.`,
            artifactPaths: [],
          })
        })

      return {
        executionRunId,
        state: 'running',
        link: `/executions/${encodeURIComponent(executionRunId)}`,
      }
    }

    upsertExecutionRun({
      id: executionRunId,
      workItemId,
      projectId,
      role: input.role,
      phase: input.phase,
      engine: 'hermes-session',
      state: 'failed',
      profile: input.profile,
      finishedAt: failedAt,
      lastObservedAt: failedAt,
      error: error instanceof Error ? error.message : String(error),
      summary: `${roleTitle(input.role)} execution failed to start.`,
      artifactPaths: [],
    })
    throw error
  }
}
