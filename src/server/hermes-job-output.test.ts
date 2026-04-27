import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getHermesJobRuns } = vi.hoisted(() => ({
  getHermesJobRuns: vi.fn(),
}))

vi.mock('./hermes-jobs', () => ({
  getHermesJobRuns,
}))

import {
  getLatestHermesJobOutput,
  getLatestLocalCronOutput,
  parseBuilderEvidenceOutput,
} from './hermes-job-output'

describe('hermes-job-output', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'hermes-workspace-job-output-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = join(tempHome, '.hermes')
    getHermesJobRuns.mockReset()
    getHermesJobRuns.mockResolvedValue([])
  })

  afterEach(() => {
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  function writeCronOutput(jobId: string, fileName: string, content: string): string {
    const outputDir = join(process.env.HERMES_HOME!, 'cron', 'output', jobId)
    mkdirSync(outputDir, { recursive: true })
    const outputPath = join(outputDir, fileName)
    writeFileSync(outputPath, content)
    return outputPath
  }

  it('reads structured output text from the local cron output directory when runs have no output', async () => {
    const outputPath = writeCronOutput(
      'job-123',
      '2026-04-27_17-29-03.md',
      'Planner complete\n```json\n{"suggestedPhase":"build"}\n```',
    )

    const output = await getLatestHermesJobOutput('job-123')

    expect(output).toMatchObject({
      jobId: 'job-123',
      latestOutputPath: outputPath,
    })
    expect(output?.latestOutputText).toContain('"suggestedPhase":"build"')
    expect(output?.lastObservedAt).toBeTruthy()
  })

  it('chooses the newest local cron output file by timestamp-like filename', async () => {
    writeCronOutput('job-123', '2026-04-27_17-29-03.md', 'old output')
    const newestPath = writeCronOutput('job-123', '2026-04-27_17-31-03.md', 'newest output')

    const output = await getLatestLocalCronOutput('job-123')

    expect(output).toMatchObject({
      jobId: 'job-123',
      latestOutputPath: newestPath,
      latestOutputText: 'newest output',
    })
  })

  it('prefers latest run payload output before falling back to local cron files', async () => {
    writeCronOutput('job-123', '2026-04-27_17-31-03.md', 'local fallback output')
    getHermesJobRuns.mockResolvedValue([
      {
        id: 'run-old',
        status: 'success',
        startedAt: '2026-04-27T17:20:00.000Z',
        finishedAt: '2026-04-27T17:21:00.000Z',
        output: { finalResponse: 'old run output' },
      },
      {
        id: 'run-new',
        status: 'success',
        startedAt: '2026-04-27T17:30:00.000Z',
        finishedAt: '2026-04-27T17:31:00.000Z',
        chatSessionKey: 'session-abc123',
        output: { finalResponse: 'latest run structured output' },
      },
    ])

    const output = await getLatestHermesJobOutput('job-123')

    expect(output).toMatchObject({
      jobId: 'job-123',
      latestRunId: 'run-new',
      latestStatus: 'success',
      latestOutputText: 'latest run structured output',
      latestSessionKey: 'session-abc123',
    })
  })

  it('parses structured Builder evidence from fenced JSON output', () => {
    const parsed = parseBuilderEvidenceOutput(`Builder complete\n\`\`\`json
{"workItemId":"wi-123","phase":"build","status":"succeeded","repoPath":"/repo","branchName":"mission/wi-123-demo","baseBranch":"main","headCommit":"abc123","changedFiles":["src/product.ts","src/product.test.ts"],"testCommand":"pnpm test src/product.test.ts","testPassed":true,"testSummary":"1 passed","artifactPaths":["/tmp/build.log"]}
\`\`\``)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.evidence).toMatchObject({
      workItemId: 'wi-123',
      phase: 'build',
      status: 'succeeded',
      branchName: 'mission/wi-123-demo',
      changedFiles: ['src/product.ts', 'src/product.test.ts'],
      testPassed: true,
    })
  })

  it('rejects Builder evidence without a matching work item id', () => {
    const parsed = parseBuilderEvidenceOutput(
      JSON.stringify({ phase: 'build', status: 'succeeded', changedFiles: ['src/app.ts'], testPassed: true }),
    )

    expect(parsed).toMatchObject({ ok: false })
    if (!parsed.ok) expect(parsed.error).toContain('workItemId')
  })

  it('rejects docs-only Builder success evidence for non-docs work', () => {
    const parsed = parseBuilderEvidenceOutput(
      JSON.stringify({
        workItemId: 'wi-123',
        phase: 'build',
        status: 'succeeded',
        changedFiles: ['docs/plan.md', 'README.md'],
        testPassed: true,
      }),
    )

    expect(parsed).toMatchObject({ ok: false })
    if (!parsed.ok) expect(parsed.error).toContain('product or test')
  })
})
