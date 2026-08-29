import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

import { upsertExecutionRun } from './execution-runs-store'
import type { ExecutionRunRole } from './execution-runs-store'
import type { WorkItemPhase } from './work-items-store'

const MAX_LOCAL_OUTPUT_CHARS = 12_000
const SAFE_PROFILE_NAME = /^[a-zA-Z0-9_-]+$/

export type LocalHermesCliExecutionInput = {
  executionRunId: string
  prompt: string
  repoPath: string
  role: ExecutionRunRole
  profile?: string
  projectId: string
  workItemId: string
  phase: WorkItemPhase
}

export type LocalHermesCliExecutionLaunch = {
  processId?: number
  commandLine: string
}

function appendOutput(current: string | undefined, next: string): string | undefined {
  const normalized = next.trim()
  if (!normalized) return current
  const combined = current?.trim() ? `${current.trim()}\n${normalized}` : normalized
  return combined.length > MAX_LOCAL_OUTPUT_CHARS
    ? combined.slice(combined.length - MAX_LOCAL_OUTPUT_CHARS)
    : combined
}

function localBinCommand(name: string): string | null {
  const candidate = join(process.env.HOME || '', '.local', 'bin', name)
  return existsSync(candidate) ? candidate : null
}

function resolveHermesCommand(profile?: string): { command: string; argsPrefix: Array<string>; displayCommand: string } | null {
  const explicitCommand = process.env.HERMES_WORKSPACE_LOCAL_HERMES_COMMAND?.trim()
  if (explicitCommand) return { command: explicitCommand, argsPrefix: [], displayCommand: explicitCommand }

  const normalizedProfile = profile?.trim()
  if (normalizedProfile && SAFE_PROFILE_NAME.test(normalizedProfile)) {
    const profileCommand = localBinCommand(normalizedProfile)
    if (profileCommand) return { command: profileCommand, argsPrefix: [], displayCommand: normalizedProfile }
  }

  const hermesCommand = localBinCommand('hermes') ?? 'hermes'
  if (normalizedProfile && SAFE_PROFILE_NAME.test(normalizedProfile)) {
    return { command: hermesCommand, argsPrefix: ['-p', normalizedProfile], displayCommand: 'hermes' }
  }
  return { command: hermesCommand, argsPrefix: [], displayCommand: 'hermes' }
}

export function isLocalHermesCliAvailable(profile?: string): boolean {
  const explicitCommand = process.env.HERMES_WORKSPACE_LOCAL_HERMES_COMMAND?.trim()
  if (explicitCommand) return true
  const normalizedProfile = profile?.trim()
  if (normalizedProfile && SAFE_PROFILE_NAME.test(normalizedProfile) && localBinCommand(normalizedProfile)) {
    return true
  }
  return Boolean(localBinCommand('hermes'))
}

export function launchLocalHermesCliExecution(
  input: LocalHermesCliExecutionInput,
): LocalHermesCliExecutionLaunch {
  const commandSpec = resolveHermesCommand(input.profile)
  if (!commandSpec) throw new Error('local Hermes CLI command unavailable')

  const args = [
    ...commandSpec.argsPrefix,
    'chat',
    '-q',
    input.prompt,
    '--source',
    'hermes-workspace',
    '--toolsets',
    'terminal,file,skills,session_search',
    '--max-turns',
    process.env.HERMES_WORKSPACE_LOCAL_HERMES_MAX_TURNS?.trim() || '90',
    '--quiet',
    '--accept-hooks',
  ]
  if (process.env.HERMES_WORKSPACE_LOCAL_HERMES_YOLO !== '0') {
    args.push('--yolo')
  }

  const displayArgs = args.map((arg) => (arg === input.prompt ? '<prompt>' : arg))
  const commandLine = [commandSpec.displayCommand, ...displayArgs].join(' ')
  let latestOutputText = `Transport: local-hermes-cli\nCommand: ${commandLine}`
  const startedAt = new Date().toISOString()

  const child = spawn(commandSpec.command, args, {
    cwd: input.repoPath,
    env: {
      ...process.env,
      HERMES_WORKSPACE_EXECUTION_ID: input.executionRunId,
      HERMES_WORKSPACE_PROJECT_ID: input.projectId,
      HERMES_WORKSPACE_WORK_ITEM_ID: input.workItemId,
      HERMES_WORKSPACE_WORK_ITEM_PHASE: input.phase,
      HERMES_WORKSPACE_ROLE: input.role,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk: Buffer) => {
    latestOutputText = appendOutput(latestOutputText, chunk.toString('utf-8')) ?? latestOutputText
    const observedAt = new Date().toISOString()
    upsertExecutionRun({
      id: input.executionRunId,
      workItemId: input.workItemId,
      projectId: input.projectId,
      role: input.role,
      phase: input.phase,
      engine: 'local-hermes-cli',
      state: 'running',
      profile: input.profile,
      startedAt,
      lastObservedAt: observedAt,
      latestOutputText,
      summary: `${input.role.charAt(0).toUpperCase() + input.role.slice(1)} execution running in local Hermes CLI worker.`,
      artifactPaths: [],
    })
  })

  child.stderr.on('data', (chunk: Buffer) => {
    latestOutputText = appendOutput(latestOutputText, chunk.toString('utf-8')) ?? latestOutputText
  })

  child.on('error', (error) => {
    const failedAt = new Date().toISOString()
    upsertExecutionRun({
      id: input.executionRunId,
      workItemId: input.workItemId,
      projectId: input.projectId,
      role: input.role,
      phase: input.phase,
      engine: 'local-hermes-cli',
      state: 'failed',
      profile: input.profile,
      startedAt,
      finishedAt: failedAt,
      lastObservedAt: failedAt,
      latestOutputText,
      error: error.message,
      summary: `${input.role.charAt(0).toUpperCase() + input.role.slice(1)} execution failed to start local Hermes CLI worker.`,
      artifactPaths: [],
    })
  })

  child.on('close', (code, signal) => {
    const finishedAt = new Date().toISOString()
    const succeeded = code === 0
    const error = succeeded ? undefined : `local Hermes CLI exited with code ${code ?? 'unknown'}${signal ? ` signal ${signal}` : ''}`
    upsertExecutionRun({
      id: input.executionRunId,
      workItemId: input.workItemId,
      projectId: input.projectId,
      role: input.role,
      phase: input.phase,
      engine: 'local-hermes-cli',
      state: succeeded ? 'succeeded' : 'failed',
      profile: input.profile,
      startedAt,
      finishedAt,
      lastObservedAt: finishedAt,
      latestOutputText,
      finalResponse: succeeded ? latestOutputText : undefined,
      error,
      summary: succeeded
        ? `${input.role.charAt(0).toUpperCase() + input.role.slice(1)} execution completed in local Hermes CLI worker.`
        : `${input.role.charAt(0).toUpperCase() + input.role.slice(1)} execution failed in local Hermes CLI worker.`,
      artifactPaths: [],
    })
  })

  return { processId: child.pid, commandLine }
}
