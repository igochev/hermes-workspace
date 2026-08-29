import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getHermesJobRuns } from './hermes-jobs'
import type {CronRun} from '../components/cron-manager/cron-types';

export type HermesJobOutputSnapshot = {
  jobId: string
  latestRunId?: string
  latestStatus?: string
  latestOutputText?: string
  latestOutputJson?: unknown
  latestOutputPath?: string
  latestSessionKey?: string
  lastObservedAt: string
}

type OutputCandidate = {
  text?: string
  json?: unknown
}

export type BuilderEvidenceStatus = 'succeeded' | 'failed'

export type BuilderStructuredEvidence = {
  workItemId: string
  phase: 'build'
  status: BuilderEvidenceStatus
  repoPath?: string
  branchName?: string
  baseBranch?: string
  headCommit?: string
  changedFiles: Array<string>
  testCommand?: string
  testPassed?: boolean
  testSummary?: string
  artifactPaths: Array<string>
}

export type BuilderEvidenceParseResult =
  | { ok: true; evidence: BuilderStructuredEvidence }
  | { ok: false; error: string }

const IGNORED_CHANGE_PREFIXES = ['node_modules/', '.next/', 'dist/', 'build/', 'coverage/']
const DOCS_ONLY_PREFIXES = ['docs/', '.hermes/plans/']
const DOCS_ONLY_FILES = new Set(['README.md', 'CHANGELOG.md', 'LICENSE'])

function getHermesHome(): string {
  return process.env.HERMES_HOME || join(homedir(), '.hermes')
}

function normalizeOutputValue(value: unknown): OutputCandidate | null {
  if (typeof value === 'string') {
    return { text: value }
  }

  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['finalResponse', 'summary', 'content', 'markdown', 'rawOutput', 'text']) {
      const candidate = record[key]
      if (typeof candidate === 'string' && candidate.trim()) {
        return { text: candidate, json: value }
      }
    }

    const stringValues = Object.values(record).filter(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0,
    )
    if (stringValues.length > 0) {
      return { text: stringValues.join('\n'), json: value }
    }

    return { text: JSON.stringify(value), json: value }
  }

  return { text: String(value) }
}

function extractRunOutput(run: CronRun): OutputCandidate | null {
  const runRecord = run as CronRun & Record<string, unknown>
  for (const key of ['output', 'summary', 'finalResponse', 'content', 'markdown', 'rawOutput']) {
    const normalized = normalizeOutputValue(runRecord[key])
    if (normalized?.text?.trim()) return normalized
  }
  return null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function stringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  )
}

function extractReferencedEvidenceJson(text: string): unknown | null {
  const evidencePath = text.match(/(?:^|[\s`'"])(\/[^\s`'")]+evidence\.json)(?:\s|$|[`'")])/m)?.[1]
  if (!evidencePath || !existsSync(evidencePath)) return null
  try {
    return JSON.parse(readFileSync(evidencePath, 'utf8'))
  } catch {
    return null
  }
}

function extractJsonCandidate(text: string): unknown | null {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidates = [fenced?.[1], trimmed]
  for (const candidate of candidates) {
    if (!candidate?.trim()) continue
    try {
      return JSON.parse(candidate.trim())
    } catch {
      continue
    }
  }
  return extractReferencedEvidenceJson(text)
}

function isIgnoredChange(filePath: string): boolean {
  return IGNORED_CHANGE_PREFIXES.some((prefix) => filePath.startsWith(prefix))
}

function isDocsOnlyChange(filePath: string): boolean {
  return DOCS_ONLY_PREFIXES.some((prefix) => filePath.startsWith(prefix)) || DOCS_ONLY_FILES.has(filePath)
}

export function hasProductOrTestChange(changedFiles: Array<string>): boolean {
  return changedFiles.some((filePath) => !isIgnoredChange(filePath) && !isDocsOnlyChange(filePath))
}

export function parseBuilderEvidenceOutput(text: string): BuilderEvidenceParseResult {
  const parsed = extractJsonCandidate(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Builder output did not contain parseable structured JSON.' }
  }

  const record = parsed as Record<string, unknown>
  const workItemId = optionalString(record.workItemId)
  if (!workItemId) return { ok: false, error: 'Builder evidence is missing workItemId.' }
  if (record.phase !== 'build') return { ok: false, error: 'Builder evidence phase must be build.' }
  const status = record.status === 'failed' ? 'failed' : 'succeeded'

  const artifactPath = extractReferencedEvidenceJson(text) ? text.match(/(?:^|[\s`'"])(\/[^\s`'")]+evidence\.json)(?:\s|$|[`'")])/m)?.[1] : undefined
  const commandRecords = Array.isArray(record.commands) ? record.commands.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))) : []
  const passedCommand = commandRecords.find((entry) => entry.exitCode === 0) ?? commandRecords[0]
  const changedFiles = stringArray(record.changedFiles).filter((filePath) => !isIgnoredChange(filePath))
  const alternateChangedFiles = [
    ...stringArray(record.productFilesChanged),
    ...stringArray(record.testFilesChanged),
    ...stringArray(record.docFilesChanged),
  ].filter((filePath) => !isIgnoredChange(filePath))
  const normalizedChangedFiles = changedFiles.length > 0 ? changedFiles : Array.from(new Set(alternateChangedFiles))
  const testPassed = typeof record.testPassed === 'boolean'
    ? record.testPassed
    : typeof record.testsPassed === 'boolean'
      ? record.testsPassed
      : undefined

  if (status === 'succeeded') {
    if (!hasProductOrTestChange(normalizedChangedFiles)) {
      return { ok: false, error: 'Builder success evidence must include at least one product or test changed file.' }
    }
    if (testPassed !== true) {
      return { ok: false, error: 'Builder success evidence must include testPassed=true.' }
    }
  }

  return {
    ok: true,
    evidence: {
      workItemId,
      phase: 'build',
      status,
      repoPath: optionalString(record.repoPath) ?? optionalString(record.repository),
      branchName: optionalString(record.branchName) ?? optionalString(record.branch),
      baseBranch: optionalString(record.baseBranch),
      headCommit: optionalString(record.headCommit) ?? optionalString(record.commit),
      changedFiles: normalizedChangedFiles,
      testCommand: optionalString(record.testCommand) ?? optionalString(passedCommand.command),
      testPassed,
      testSummary: optionalString(record.testSummary) ?? optionalString(passedCommand.summary),
      artifactPaths: Array.from(new Set([
        ...stringArray(record.artifactPaths),
        optionalString(record.testLog),
        artifactPath,
      ].filter((entry): entry is string => Boolean(entry)))),
    },
  }
}

function runObservedAt(run: CronRun): string {
  return run.finishedAt || run.startedAt || new Date().toISOString()
}

function sortRunsNewestFirst(a: CronRun, b: CronRun): number {
  const aTime = Date.parse(runObservedAt(a)) || 0
  const bTime = Date.parse(runObservedAt(b)) || 0
  return bTime - aTime
}

export function getLatestLocalCronOutput(
  jobId: string,
): Promise<HermesJobOutputSnapshot | null> {
  const outputDir = join(getHermesHome(), 'cron', 'output', jobId)
  if (!existsSync(outputDir)) return Promise.resolve(null)

  const files = readdirSync(outputDir)
    .map((fileName) => {
      const filePath = join(outputDir, fileName)
      const stat = statSync(filePath)
      return { fileName, filePath, stat }
    })
    .filter((entry) => entry.stat.isFile())
    .sort((a, b) => b.fileName.localeCompare(a.fileName) || b.stat.mtimeMs - a.stat.mtimeMs)

  if (files.length === 0) return Promise.resolve(null)
  const latest = files[0]

  return Promise.resolve({
    jobId,
    latestOutputText: readFileSync(latest.filePath, 'utf8'),
    latestOutputPath: latest.filePath,
    lastObservedAt: latest.stat.mtime.toISOString(),
  })
}

export async function getLatestHermesJobOutput(
  jobId: string,
): Promise<HermesJobOutputSnapshot | null> {
  const runs = await getHermesJobRuns(jobId).catch(() => [])
  const latestRunWithOutput = [...runs].sort(sortRunsNewestFirst).find((run) => extractRunOutput(run))

  if (latestRunWithOutput) {
    const output = extractRunOutput(latestRunWithOutput)
    return {
      jobId,
      latestRunId: latestRunWithOutput.id,
      latestStatus: latestRunWithOutput.status,
      latestOutputText: output?.text,
      latestOutputJson: output?.json,
      latestSessionKey: latestRunWithOutput.chatSessionKey,
      lastObservedAt: runObservedAt(latestRunWithOutput),
    }
  }

  return getLatestLocalCronOutput(jobId)
}
