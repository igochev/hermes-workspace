import { randomUUID } from 'node:crypto'

import { createSession, sendChat, sendImmediateChatCompletion } from './hermes-api'
import { upsertExecutionRun } from './execution-runs-store'
import type { WorkItemPhase } from './work-items-store'

export type ImmediateExecutionRole = 'planner' | 'builder' | 'reviewer' | 'deployer'

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

    void sendChat(sessionKey, {
      message: immediatePrompt,
    })
      .then((result) => {
        const finishedAt = new Date().toISOString()
        const finalResponse =
          typeof result.finalResponse === 'string'
            ? result.finalResponse
            : typeof result.response === 'string'
              ? result.response
              : undefined
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
          runId: typeof result.run_id === 'string' ? result.run_id : undefined,
          startedAt,
          finishedAt,
          lastObservedAt: finishedAt,
          finalResponse,
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
      upsertExecutionRun({
        id: executionRunId,
        workItemId,
        projectId,
        role: input.role,
        phase: input.phase,
        engine: 'hermes-session',
        state: 'running',
        profile: input.profile,
        startedAt: failedAt,
        lastObservedAt: failedAt,
        summary: `${roleTitle(input.role)} execution running via immediate chat completion.`,
        artifactPaths: [],
      })

      void sendImmediateChatCompletion({
        message: buildImmediateExecutionPrompt({
          goal,
          projectId,
          workItemId,
          phase: input.phase,
          role: input.role,
          profile: input.profile,
          repoPath,
        }),
        model: input.model?.trim() || undefined,
      })
        .then((result) => {
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
            startedAt: failedAt,
            finishedAt,
            lastObservedAt: finishedAt,
            finalResponse: extractFinalResponse(result),
            summary: `${roleTitle(input.role)} execution completed via immediate chat completion.`,
            artifactPaths: [],
          })
        })
        .catch((fallbackError: unknown) => {
          const fallbackFailedAt = new Date().toISOString()
          upsertExecutionRun({
            id: executionRunId,
            workItemId,
            projectId,
            role: input.role,
            phase: input.phase,
            engine: 'hermes-session',
            state: 'failed',
            profile: input.profile,
            startedAt: failedAt,
            finishedAt: fallbackFailedAt,
            lastObservedAt: fallbackFailedAt,
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            summary: `${roleTitle(input.role)} execution failed to complete via immediate chat completion.`,
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
