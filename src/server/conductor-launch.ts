import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  dashboardFetch,
  ensureGatewayProbed,
  HERMES_API,
  BEARER_TOKEN,
} from './gateway-capabilities'
import {
  buildPhaseProfileRoutingInstructions,
  normalizePhaseProfiles,
  type ConductorPhaseProfiles,
} from '../lib/conductor-phase-profiles'

let cachedSkill: string | null = null

export type ConductorLaunchOptions = {
  goal: string
  orchestratorModel?: string
  workerModel?: string
  projectsDir?: string
  maxParallel?: number
  supervised?: boolean
  phaseProfiles?: unknown
  name?: string
  deliver?: string
}

export type ConductorLaunchResult = {
  ok: true
  sessionKey: string
  sessionKeyPrefix: string
  jobId: string
  jobName: string
  runId: null
}

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

function repoRoot(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    return resolve(here, '..', '..')
  } catch {
    return process.cwd()
  }
}

function loadDispatchSkill(): string {
  if (cachedSkill !== null) return cachedSkill
  const candidates = [
    resolve(repoRoot(), 'skills/workspace-dispatch/SKILL.md'),
    resolve(process.cwd(), 'skills/workspace-dispatch/SKILL.md'),
    resolve(process.env.HOME ?? '~', '.hermes/skills/workspace-dispatch/SKILL.md'),
    resolve(process.env.HOME ?? '~', '.ocplatform/workspace/skills/workspace-dispatch/SKILL.md'),
  ]
  for (const candidate of candidates) {
    try {
      cachedSkill = readFileSync(candidate, 'utf-8')
      return cachedSkill
    } catch {
      continue
    }
  }
  cachedSkill = ''
  return cachedSkill
}

function nowPlusSecondsIso(seconds: number): string {
  const t = new Date(Date.now() + seconds * 1000)
  return t.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function buildMissionLink(jobId: string): string {
  return `/jobs?jobId=${encodeURIComponent(jobId)}`
}

function readOptionalString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asOptionalString(value: string): string | undefined {
  return value.length > 0 ? value : undefined
}

function readMaxParallel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1
  return Math.min(5, Math.max(1, Math.round(value)))
}

export function buildOrchestratorPrompt(
  goal: string,
  skill: string,
  options: {
    orchestratorModel: string
    workerModel: string
    projectsDir: string
    maxParallel: number
    supervised: boolean
    phaseProfiles: ConductorPhaseProfiles
  },
): string {
  const outputBase = options.projectsDir || '/tmp'
  const outputPrefix = outputBase === '/tmp' ? '/tmp/dispatch-<slug>' : `${outputBase}/dispatch-<slug>`
  const phaseRoutingInstructions = buildPhaseProfileRoutingInstructions(options.phaseProfiles)

  return [
    'You are a mission orchestrator. Execute this mission autonomously.',
    '',
    '## Dispatch Skill Instructions',
    '',
    skill || '(workspace-dispatch skill not found locally; proceed using create_task to spawn workers)',
    '',
    '## Mission',
    '',
    `Goal: ${goal}`,
    ...(options.orchestratorModel ? ['', `Use model: ${options.orchestratorModel} for the orchestrator`] : []),
    ...(options.workerModel ? ['', `Use model: ${options.workerModel} for all workers`] : []),
    ...(options.maxParallel > 1
      ? ['', `Run up to ${options.maxParallel} workers in parallel when tasks are independent`]
      : ['', 'Spawn workers one at a time. Do NOT wait for workers to finish — the UI handles tracking.']),
    ...(options.supervised ? ['', 'Supervised mode is enabled. Require approval before each task.'] : []),
    ...(phaseRoutingInstructions.length > 0 ? ['', ...phaseRoutingInstructions] : []),
    '',
    '## Critical Rules',
    '- Use create_task / delegate_task to create worker agents for each task',
    '- Do NOT do the work yourself — spawn workers',
    '- For simple tasks (single file, quick mockup), use ONLY 1 task with 1 worker — do not over-decompose',
    '- Do NOT ask for confirmation — start immediately',
    '- Label workers as "worker-<task-slug>" so the UI can track them',
    '- Each worker gets a self-contained prompt with the task + exit criteria',
    `- Workers should write output to ${outputPrefix} directories`,
    '- After spawning all workers, report your plan summary and finish. The UI tracks worker completion automatically.',
    '- Report a summary when all tasks are done',
  ].join('\n')
}

export function extractCreatedJobRef(payload: unknown): { id?: string; name?: string } {
  if (!payload || typeof payload !== 'object') return {}
  const direct = payload as { id?: unknown; name?: unknown; job?: { id?: unknown; name?: unknown } }
  if (typeof direct.id === 'string' || typeof direct.name === 'string') {
    return {
      id: asOptionalString(typeof direct.id === 'string' ? direct.id.trim() : ''),
      name: asOptionalString(typeof direct.name === 'string' ? direct.name.trim() : ''),
    }
  }
  if (direct.job && typeof direct.job === 'object') {
    return {
      id: asOptionalString(typeof direct.job.id === 'string' ? direct.job.id.trim() : ''),
      name: asOptionalString(typeof direct.job.name === 'string' ? direct.job.name.trim() : ''),
    }
  }
  return {}
}

async function createHermesJob(payload: {
  name: string
  schedule: string
  prompt: string
  deliver?: string
}): Promise<{ id?: string; name?: string; error?: string }> {
  const body = JSON.stringify({
    name: payload.name,
    schedule: payload.schedule,
    prompt: payload.prompt,
    deliver: payload.deliver ?? 'local',
  })
  const capabilities = await ensureGatewayProbed()
  const response = capabilities.dashboard.available
    ? await dashboardFetch('/api/cron/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    : await fetch(`${HERMES_API}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body,
      })

  const text = await response.text()
  let data: { error?: string } & Record<string, unknown> = {}
  try {
    data = JSON.parse(text) as { error?: string } & Record<string, unknown>
  } catch {
    return { error: text || `HTTP ${response.status}` }
  }
  if (!response.ok || data.error) {
    return { error: data.error || `HTTP ${response.status}` }
  }
  return extractCreatedJobRef(data)
}

export async function launchConductorMission(options: ConductorLaunchOptions): Promise<ConductorLaunchResult> {
  const goal = readOptionalString(options.goal)
  if (!goal) throw new Error('goal required')

  const skill = loadDispatchSkill()
  const prompt = buildOrchestratorPrompt(goal, skill, {
    orchestratorModel: readOptionalString(options.orchestratorModel),
    workerModel: readOptionalString(options.workerModel),
    projectsDir: readOptionalString(options.projectsDir),
    maxParallel: readMaxParallel(options.maxParallel),
    supervised: options.supervised === true,
    phaseProfiles: normalizePhaseProfiles(options.phaseProfiles),
  })

  const jobName = readOptionalString(options.name) || `conductor-${Date.now()}`
  const result = await createHermesJob({
    name: jobName,
    schedule: nowPlusSecondsIso(5),
    prompt,
    deliver: readOptionalString(options.deliver) || 'local',
  })

  if (result.error) throw new Error(result.error)

  const jobId = result.id ?? jobName
  return {
    ok: true,
    sessionKey: `cron_${jobId}_pending`,
    sessionKeyPrefix: `cron_${jobId}_`,
    jobId,
    jobName: result.name ?? jobName,
    runId: null,
  }
}
