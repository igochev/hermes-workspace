import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type { WorkItemPhase } from './work-items-store'

export type ExecutionEngine = 'conductor' | 'hermes-cron'
export type ExecutionRunRole = 'mission' | 'review' | 'supervisor'
export type ExecutionRunState = 'scheduled' | 'running' | 'succeeded' | 'failed' | 'stale' | 'unknown'

export type ExecutionRunRecord = {
  id: string
  workItemId: string
  projectId: string
  role: ExecutionRunRole
  phase?: WorkItemPhase
  engine: ExecutionEngine
  jobId: string
  jobName?: string
  runId?: string
  state: ExecutionRunState
  sessionKey?: string
  sessionKeyPrefix?: string
  startedAt?: string
  finishedAt?: string
  lastObservedAt: string
  lastRunAt?: string
  error?: string
  branchName?: string
  prUrl?: string
  artifactPaths: Array<string>
  createdAt: string
  updatedAt: string
}

type ExecutionRunsFile = {
  runs: Array<ExecutionRunRecord>
}

type UpsertExecutionRunInput = {
  id?: string
  workItemId: string
  projectId: string
  role: ExecutionRunRole
  phase?: WorkItemPhase
  engine: ExecutionEngine
  jobId: string
  jobName?: string
  runId?: string
  state: ExecutionRunState
  sessionKey?: string
  sessionKeyPrefix?: string
  startedAt?: string
  finishedAt?: string
  lastObservedAt?: string
  lastRunAt?: string
  error?: string
  branchName?: string
  prUrl?: string
  artifactPaths?: Array<string>
}

type ListExecutionRunsFilters = {
  workItemId?: string
  projectId?: string
  role?: ExecutionRunRole
}

const VALID_ROLES: Array<ExecutionRunRole> = ['mission', 'review', 'supervisor']
const VALID_ENGINES: Array<ExecutionEngine> = ['conductor', 'hermes-cron']
const VALID_STATES: Array<ExecutionRunState> = [
  'scheduled',
  'running',
  'succeeded',
  'failed',
  'stale',
  'unknown',
]
const VALID_PHASES: Array<WorkItemPhase> = ['research', 'build', 'review', 'deploy']

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getExecutionRunsFilePath(): string {
  return path.join(getHermesHome(), 'work-item-execution-runs.json')
}

function ensureExecutionRunsFile(): void {
  const hermesHome = getHermesHome()
  const filePath = getExecutionRunsFilePath()
  fs.mkdirSync(hermesHome, { recursive: true })
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ runs: [] }, null, 2) + '\n', 'utf-8')
  }
}

function readExecutionRunsFile(): ExecutionRunsFile {
  const filePath = getExecutionRunsFilePath()
  ensureExecutionRunsFile()
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim()
    if (!raw) return { runs: [] }
    const parsed = JSON.parse(raw) as Partial<ExecutionRunsFile>
    return { runs: Array.isArray(parsed.runs) ? parsed.runs : [] }
  } catch {
    return { runs: [] }
  }
}

function writeExecutionRunsFile(data: ExecutionRunsFile): void {
  const filePath = getExecutionRunsFilePath()
  ensureExecutionRunsFile()
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function uniqueStrings(values: unknown): Array<string> {
  if (!Array.isArray(values)) return []
  const output: Array<string> = []
  const seen = new Set<string>()
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }
  return output
}

function normalizeRole(value: unknown): ExecutionRunRole {
  return VALID_ROLES.includes(value as ExecutionRunRole) ? (value as ExecutionRunRole) : 'mission'
}

function normalizeEngine(value: unknown): ExecutionEngine {
  return VALID_ENGINES.includes(value as ExecutionEngine) ? (value as ExecutionEngine) : 'conductor'
}

function normalizeState(value: unknown): ExecutionRunState {
  return VALID_STATES.includes(value as ExecutionRunState) ? (value as ExecutionRunState) : 'unknown'
}

function normalizePhase(value: unknown): WorkItemPhase | undefined {
  return VALID_PHASES.includes(value as WorkItemPhase) ? (value as WorkItemPhase) : undefined
}

function normalizeExecutionRun(
  run: Partial<ExecutionRunRecord> &
    Pick<ExecutionRunRecord, 'id' | 'workItemId' | 'projectId' | 'jobId' | 'createdAt' | 'updatedAt'>,
): ExecutionRunRecord {
  return {
    id: run.id,
    workItemId: run.workItemId.trim(),
    projectId: run.projectId.trim(),
    role: normalizeRole(run.role),
    phase: normalizePhase(run.phase),
    engine: normalizeEngine(run.engine),
    jobId: run.jobId.trim(),
    jobName: asOptionalString(run.jobName),
    runId: asOptionalString(run.runId),
    state: normalizeState(run.state),
    sessionKey: asOptionalString(run.sessionKey),
    sessionKeyPrefix: asOptionalString(run.sessionKeyPrefix),
    startedAt: asOptionalString(run.startedAt),
    finishedAt: asOptionalString(run.finishedAt),
    lastObservedAt: asOptionalString(run.lastObservedAt) ?? run.updatedAt,
    lastRunAt: asOptionalString(run.lastRunAt),
    error: asOptionalString(run.error),
    branchName: asOptionalString(run.branchName),
    prUrl: asOptionalString(run.prUrl),
    artifactPaths: uniqueStrings(run.artifactPaths),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  }
}

function dedupeMatches(run: ExecutionRunRecord, input: UpsertExecutionRunInput): boolean {
  const inputRunId = asOptionalString(input.runId)
  if (run.workItemId !== input.workItemId.trim()) return false
  if (run.role !== input.role) return false
  if (run.jobId !== input.jobId.trim()) return false
  if (inputRunId) return run.runId === inputRunId
  return run.runId === undefined
}

export function listExecutionRuns(filters: ListExecutionRunsFilters = {}): Array<ExecutionRunRecord> {
  let runs = readExecutionRunsFile().runs.map((run) => normalizeExecutionRun(run))

  if (filters.workItemId) {
    runs = runs.filter((run) => run.workItemId === filters.workItemId)
  }
  if (filters.projectId) {
    runs = runs.filter((run) => run.projectId === filters.projectId)
  }
  if (filters.role) {
    runs = runs.filter((run) => run.role === filters.role)
  }

  return runs.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getExecutionRun(id: string): ExecutionRunRecord | null {
  return listExecutionRuns().find((run) => run.id === id) ?? null
}

export function upsertExecutionRun(input: UpsertExecutionRunInput): ExecutionRunRecord {
  const file = readExecutionRunsFile()
  const normalizedRuns = file.runs.map((run) => normalizeExecutionRun(run))
  const now = new Date().toISOString()
  const existingIndex = normalizedRuns.findIndex((run) => dedupeMatches(run, input))
  const existing = existingIndex === -1 ? null : normalizedRuns[existingIndex]

  const run = normalizeExecutionRun({
    id: existing?.id ?? (typeof input.id === 'string' && input.id.trim() ? input.id : randomUUID()),
    workItemId: input.workItemId,
    projectId: input.projectId,
    role: input.role,
    phase: input.phase,
    engine: input.engine,
    jobId: input.jobId,
    jobName: input.jobName,
    runId: input.runId,
    state: input.state,
    sessionKey: input.sessionKey,
    sessionKeyPrefix: input.sessionKeyPrefix,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    lastObservedAt: input.lastObservedAt ?? now,
    lastRunAt: input.lastRunAt,
    error: input.error,
    branchName: input.branchName,
    prUrl: input.prUrl,
    artifactPaths: input.artifactPaths,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  })

  if (existingIndex === -1) {
    normalizedRuns.push(run)
  } else {
    normalizedRuns[existingIndex] = run
  }

  writeExecutionRunsFile({ runs: normalizedRuns })
  return run
}

export function deleteExecutionRunsForWorkItem(workItemId: string): number {
  const file = readExecutionRunsFile()
  const runs = file.runs.map((run) => normalizeExecutionRun(run))
  const remaining = runs.filter((run) => run.workItemId !== workItemId)
  writeExecutionRunsFile({ runs: remaining })
  return runs.length - remaining.length
}

export function deleteExecutionRunsForProject(projectId: string): number {
  const file = readExecutionRunsFile()
  const runs = file.runs.map((run) => normalizeExecutionRun(run))
  const remaining = runs.filter((run) => run.projectId !== projectId)
  writeExecutionRunsFile({ runs: remaining })
  return runs.length - remaining.length
}
