#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const defaultBaseUrl = process.env.HERMES_WORKSPACE_URL || process.env.BASE_URL || 'http://localhost:3456'
const targetRepo = process.env.HERMES_AUTONOMOUS_E2E_TARGET_REPO || '/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS'
const targetBranch = process.env.HERMES_AUTONOMOUS_E2E_TARGET_BRANCH || 'test-hermes-workspace'
const projectId = 'production-dogfood-family-command-center-abacus'
const projectName = 'Production Dogfood — Family Command Center ABACUS'
const reportDir = path.join(process.cwd(), 'dogfood-output')
const pollTimeoutMs = Number(process.env.HERMES_AUTONOMOUS_E2E_TIMEOUT_MS || 20 * 60 * 1000)
const pollIntervalMs = Number(process.env.HERMES_AUTONOMOUS_E2E_POLL_MS || 10_000)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function reportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function gitDiffNameOnly(cwd) {
  return git(cwd, ['diff', '--name-only'])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeItemsPayload(body) {
  return body.workItems || body.items || []
}

function normalizeWorkItemPayload(body) {
  return body.workItem || body.item || body
}

function eventActions(report) {
  return (report.orchestratorEvents || []).map((event) => event.action)
}

function hasProductOrTestDiff(changedFiles) {
  return (changedFiles || []).some((file) => {
    if (file.startsWith('node_modules/') || file.startsWith('dogfood-output/')) return false
    return /(^|\/)(lib|src|app|components|server|tests|test|spec|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)
  })
}

export function validateAutonomousWorkItemE2eReport(report) {
  assert(report && typeof report === 'object', 'Report is required')
  assert(/^autonomous-work-item-e2e-/.test(report.e2eRunId || ''), 'Report e2eRunId must start with autonomous-work-item-e2e-')
  assert(Array.isArray(report.createdWorkItemIds), 'Report createdWorkItemIds must be an array')
  assert(report.createdWorkItemIds.length === 1, 'Autonomous E2E must create exactly one work item')
  assert(report.workItemId === report.createdWorkItemIds[0], 'Report workItemId must be the single created work item id')
  assert(Array.isArray(report.manualPhaseMutationCalls), 'Report manualPhaseMutationCalls must be an array')
  assert(report.manualPhaseMutationCalls.length === 0, `Autonomous E2E used manual phase mutation: ${report.manualPhaseMutationCalls.join(', ')}`)
  assert(Array.isArray(report.orchestratorEvents), 'Report orchestratorEvents must be an array')
  const actions = eventActions(report)
  assert(actions.includes('launch_planner'), 'Autonomous workflow must include Planner launch evidence')
  assert(actions.includes('ingest_planner_output'), 'Autonomous workflow must include Planner output ingestion evidence')
  assert(actions.includes('launch_builder'), 'Autonomous workflow must include Builder launch evidence')
  assert(report.candidateRepo && Array.isArray(report.candidateRepo.changedFiles), 'Candidate repo diff evidence is required')
  assert(report.candidateRepo.changedFiles.length > 0 && hasProductOrTestDiff(report.candidateRepo.changedFiles), 'Candidate repo diff must include product-code or test files')
  assert(report.finalWorkItem?.status === 'done', 'Final work item status must be done for full autonomous E2E')
  return report
}

export function buildAutonomousWorkItemE2eMarkdown(report) {
  const actions = eventActions(report)
  const workflowPass = ['launch_planner', 'ingest_planner_output', 'launch_builder'].every((action) => actions.includes(action)) && report.manualPhaseMutationCalls?.length === 0
  const codePass = workflowPass && hasProductOrTestDiff(report.candidateRepo?.changedFiles || [])
  const eventRows = (report.orchestratorEvents || [])
    .map((event) => `| ${event.observedAt || 'unknown'} | ${event.action} | ${event.workItemId || report.workItemId} | ${event.message || ''} |`)
    .join('\n') || '| — | — | — | — |'
  const timelineRows = (report.timelineRows || [])
    .map((row) => `| ${row.phase || '—'} | ${row.state || '—'} | ${row.jobId || '—'} | ${row.runId || '—'} | ${row.summary || ''} |`)
    .join('\n') || '| — | — | — | — | — |'
  const changedFiles = (report.candidateRepo?.changedFiles || []).map((file) => `- ${file}`).join('\n') || '- none'
  const apiCalls = (report.apiCalls || []).map((call) => `- ${call}`).join('\n') || '- none recorded'
  const commands = (report.commands || []).map((command) => `- ${command}`).join('\n') || '- node scripts/mission-control-autonomous-work-item-e2e.mjs'
  const testOutput = report.candidateRepo?.testOutput ? `\n\n## Candidate test output\n\n\`\`\`text\n${report.candidateRepo.testOutput}\n\`\`\`\n` : ''

  return `# Autonomous Work Item E2E Report

Workflow verdict: ${workflowPass ? 'AUTONOMOUS WORKFLOW PASS' : 'AUTONOMOUS WORKFLOW FAIL'}
Code delivery verdict: ${codePass ? 'AUTONOMOUS CODE DELIVERY PASS' : 'AUTONOMOUS CODE DELIVERY FAIL'}
E2E run id: ${report.e2eRunId}
Workspace branch: ${report.workspaceBranch || 'unknown'}
Workspace commit: ${report.workspaceCommit || 'unknown'}
Candidate branch: ${report.candidateRepo?.branch || 'unknown'}
Candidate commit before: ${report.candidateRepo?.commitBefore || 'unknown'}
Candidate commit after: ${report.candidateRepo?.commitAfter || 'unknown'}
Project id: ${report.projectId || projectId}
Work item id: ${report.workItemId}
Work item title: ${report.workItemTitle || 'unknown'}
Created work item ids for this run: ${JSON.stringify(report.createdWorkItemIds)}
Manual phase mutation calls: ${JSON.stringify(report.manualPhaseMutationCalls || [])}
Final work item status/phase: ${report.finalWorkItem?.status || 'unknown'} / ${report.finalWorkItem?.phase || '—'}
Screenshot: ${report.screenshotPath || 'not captured'}

## Orchestrator event timeline
| Observed | Action | Work item id | Message |
|---|---|---|---|
${eventRows}

## Run timeline rows
| Phase | State | Job | Run | Summary |
|---|---|---|---|---|
${timelineRows}

## Candidate repo diff
${changedFiles}

## Candidate repo status
Before:
\`\`\`text
${report.candidateRepo?.beforeStatus || ''}
\`\`\`

After:
\`\`\`text
${report.candidateRepo?.afterStatus || ''}
\`\`\`
${testOutput}
## API calls
${apiCalls}

## Commands run
${commands}

## Blockers
${(report.blockers || []).map((blocker) => `- ${blocker}`).join('\n') || '- none'}
`
}

async function authenticateApi(baseUrl, apiCalls) {
  if (!process.env.HERMES_PASSWORD) return ''
  const response = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.HERMES_PASSWORD }),
  })
  apiCalls.push(`POST /api/auth → ${response.status}`)
  assert(response.ok, `API auth failed: ${response.status}`)
  return response.headers.get('set-cookie')?.split(';')[0] || ''
}

async function requestJson(baseUrl, apiCalls, url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  apiCalls.push(`${options.method || 'GET'} ${url} → ${response.status}`)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${JSON.stringify(body)}`)
  return body
}

async function ensureProject(baseUrl, apiCalls, authHeader) {
  const projects = await requestJson(baseUrl, apiCalls, '/api/projects', { headers: authHeader })
  let project = projects.projects?.find((candidate) => candidate.id === projectId)
  if (!project) {
    const created = await requestJson(baseUrl, apiCalls, '/api/projects', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        id: projectId,
        name: projectName,
        repoPath: targetRepo,
        defaultBranch: targetBranch,
        description: 'Real autonomous work-item E2E project for Mission Control.',
        phaseProfiles: { research: 'planner', build: 'builder', review: 'builder', deploy: 'builder' },
      }),
    })
    project = created.project
  } else if (project.repoPath !== targetRepo || project.defaultBranch !== targetBranch) {
    const updated = await requestJson(baseUrl, apiCalls, `/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: authHeader,
      body: JSON.stringify({
        repoPath: targetRepo,
        defaultBranch: targetBranch,
        phaseProfiles: { research: 'planner', build: 'builder', review: 'builder', deploy: 'builder' },
      }),
    })
    project = updated.project
  }
  assert(project?.id === projectId, 'Dogfood project was not found or created')
  return project
}

function collectManualPhaseMutationCalls(apiCalls) {
  return apiCalls.filter((call) => {
    if (/POST \/api\/work-items\/[^ ]+\/lifecycle/.test(call)) return true
    if (/PATCH \/api\/work-items\/[^ ?]+/.test(call)) return true
    return false
  })
}

async function openUiProof(baseUrl, workItemId, workItemTitle, screenshotPath, consoleErrors, apiCalls) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes('fonts.googleapis.com') || text.includes('frame-ancestors')) return
    if (text.includes('Failed to load resource')) return
    if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${text}`)
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    if (request.url().includes('fonts.googleapis.com')) return
    if (request.url().includes('/api/chat-events') || request.url().includes('/api/terminal-stream')) return
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return
    consoleErrors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`)
  })

  if (process.env.HERMES_PASSWORD) {
    const response = await page.request.post(`${baseUrl}/api/auth`, {
      data: { password: process.env.HERMES_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
    })
    apiCalls.push(`POST /api/auth (browser) → ${response.status()}`)
    assert(response.ok(), `Browser auth failed: ${response.status()}`)
  }
  await page.addInitScript(() => window.localStorage.setItem('hermes-onboarding-complete', 'true'))
  await page.goto(`${baseUrl}/projects/${projectId}/work-items/${encodeURIComponent(workItemId)}`, { waitUntil: 'domcontentloaded' })
  await page.getByText(workItemTitle).first().waitFor({ timeout: 15_000 })
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await browser.close()
}

function runCandidateTestsIfConfigured() {
  const command = process.env.HERMES_AUTONOMOUS_E2E_CANDIDATE_TEST_COMMAND
  if (!command) return ''
  return execFileSync('bash', ['-lc', command], { cwd: targetRepo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

export async function runAutonomousWorkItemE2e({ baseUrl = defaultBaseUrl } = {}) {
  assert(fs.existsSync(targetRepo), `Target repo missing: ${targetRepo}`)
  const candidateBranch = git(targetRepo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const candidateCommitBefore = git(targetRepo, ['rev-parse', '--short', 'HEAD'])
  const candidateBeforeStatus = git(targetRepo, ['status', '--short'])
  const candidateBeforeDiff = gitDiffNameOnly(targetRepo)
  const workspaceBranch = git(process.cwd(), ['rev-parse', '--abbrev-ref', 'HEAD'])
  const workspaceCommit = git(process.cwd(), ['rev-parse', '--short', 'HEAD'])
  assert(candidateBranch === targetBranch, `Target repo branch mismatch: expected ${targetBranch}, got ${candidateBranch}`)

  fs.mkdirSync(reportDir, { recursive: true })
  const timestamp = reportTimestamp()
  const e2eRunId = `autonomous-work-item-e2e-${timestamp}`
  const reportPath = path.join(reportDir, `autonomous-work-item-e2e-${timestamp}.md`)
  const latestReportPath = path.join(reportDir, 'autonomous-work-item-e2e-latest.md')
  const screenshotPath = path.join(reportDir, `autonomous-work-item-e2e-${timestamp}.png`)
  const workItemTitle = `Autonomous E2E Code Delivery ${e2eRunId}`
  const apiCalls = []
  const consoleErrors = []
  const orchestratorEvents = []
  const timelineRows = []
  const blockers = []

  const cookie = await authenticateApi(baseUrl, apiCalls)
  const authHeader = cookie ? { cookie } : {}
  await ensureProject(baseUrl, apiCalls, authHeader)

  const created = await requestJson(baseUrl, apiCalls, '/api/work-items', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      projectId,
      title: workItemTitle,
      description: `Autonomous E2E ${e2eRunId}: create one item, then only poll the orchestrator until Builder delivers candidate repo code/test changes.`,
      status: 'inbox',
      phase: 'research',
      priority: 'medium',
      riskLevel: 'low',
      labels: ['autonomous-e2e', e2eRunId],
      acceptanceCriteria: [
        'Planner launches and produces a build-ready plan without tester phase movement.',
        'Builder launches from the orchestrator and changes product code plus tests in the candidate repo.',
        'The work item reaches done through autonomous orchestration and existing sync/review/deploy logic.',
      ],
      repoPathSnapshot: targetRepo,
    }),
  })
  const createdWorkItem = normalizeWorkItemPayload(created)
  const workItemId = createdWorkItem.id
  const createdWorkItemIds = [workItemId]
  assert(createdWorkItemIds.length === 1, 'Harness must create exactly one work item')

  const startedAt = Date.now()
  let finalWorkItem = createdWorkItem
  while (Date.now() - startedAt < pollTimeoutMs) {
    const reconcile = await requestJson(baseUrl, apiCalls, `/api/work-items/orchestrator/reconcile?workItemId=${encodeURIComponent(workItemId)}`, {
      method: 'POST',
      headers: authHeader,
    })
    orchestratorEvents.push(...(reconcile.events || []))

    const detail = await requestJson(baseUrl, apiCalls, `/api/work-items/${encodeURIComponent(workItemId)}?syncExecution=true`, { headers: authHeader })
    finalWorkItem = normalizeWorkItemPayload(detail)
    timelineRows.splice(0, timelineRows.length, ...(finalWorkItem.runTimeline?.rows || finalWorkItem.runTimeline || []))

    const changedFiles = gitDiffNameOnly(targetRepo).filter((file) => !candidateBeforeDiff.includes(file))
    const actions = eventActions({ orchestratorEvents })
    if (finalWorkItem.status === 'done' && actions.includes('launch_planner') && actions.includes('ingest_planner_output') && actions.includes('launch_builder') && hasProductOrTestDiff(changedFiles)) {
      break
    }
    await sleep(pollIntervalMs)
  }

  const candidateAfterStatus = git(targetRepo, ['status', '--short'])
  const candidateCommitAfter = git(targetRepo, ['rev-parse', '--short', 'HEAD'])
  const candidateChangedFiles = gitDiffNameOnly(targetRepo).filter((file) => !candidateBeforeDiff.includes(file))
  let candidateTestOutput = ''
  try {
    candidateTestOutput = runCandidateTestsIfConfigured()
  } catch (error) {
    blockers.push(`Candidate test command failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  const list = await requestJson(baseUrl, apiCalls, `/api/work-items?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
  const sameRunItems = normalizeItemsPayload(list).filter((item) => item?.id && (item.title?.includes(e2eRunId) || item.labels?.includes(e2eRunId)))
  const extraE2eItemsCreated = sameRunItems.map((item) => item.id).filter((id) => id !== workItemId)
  if (extraE2eItemsCreated.length > 0) blockers.push(`Extra work items created: ${extraE2eItemsCreated.join(', ')}`)

  await openUiProof(baseUrl, workItemId, workItemTitle, screenshotPath, consoleErrors, apiCalls).catch((error) => {
    blockers.push(`Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`)
  })

  const report = {
    e2eRunId,
    workspaceBranch,
    workspaceCommit,
    projectId,
    workItemId,
    workItemTitle,
    createdWorkItemIds,
    extraE2eItemsCreated,
    manualPhaseMutationCalls: collectManualPhaseMutationCalls(apiCalls),
    orchestratorEvents,
    timelineRows,
    finalWorkItem: { status: finalWorkItem.status, phase: finalWorkItem.phase },
    candidateRepo: {
      branch: candidateBranch,
      commitBefore: candidateCommitBefore,
      commitAfter: candidateCommitAfter,
      beforeStatus: candidateBeforeStatus,
      afterStatus: candidateAfterStatus,
      changedFiles: candidateChangedFiles,
      testOutput: candidateTestOutput,
    },
    screenshotPath,
    apiCalls,
    consoleErrors,
    blockers,
    commands: [
      'pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand',
      'node scripts/mission-control-autonomous-work-item-e2e.mjs',
    ],
  }

  validateAutonomousWorkItemE2eReport(report)
  assert(consoleErrors.length === 0, `Browser console/network errors detected: ${consoleErrors.join('\n')}`)
  const markdown = buildAutonomousWorkItemE2eMarkdown(report)
  fs.writeFileSync(reportPath, markdown, 'utf8')
  fs.writeFileSync(latestReportPath, markdown, 'utf8')
  return { report, reportPath, latestReportPath, screenshotPath }
}

async function main() {
  try {
    const { reportPath, latestReportPath, screenshotPath, report } = await runAutonomousWorkItemE2e()
    console.log(`PASS autonomous work item E2E. Report: ${reportPath}`)
    console.log(`Latest: ${latestReportPath}`)
    console.log(`Screenshot: ${screenshotPath}`)
    console.log(`Work item: ${report.workItemId}`)
  } catch (error) {
    fs.mkdirSync(reportDir, { recursive: true })
    const timestamp = reportTimestamp()
    const failReportPath = path.join(reportDir, `autonomous-work-item-e2e-${timestamp}-FAIL.md`)
    const message = error instanceof Error ? error.stack || error.message : String(error)
    const markdown = `# Autonomous Work Item E2E Report\n\nWorkflow verdict: AUTONOMOUS WORKFLOW FAIL\nCode delivery verdict: AUTONOMOUS CODE DELIVERY FAIL\n\n## Blockers\n- ${message.replace(/\n/g, '\n  ')}\n`
    fs.writeFileSync(failReportPath, markdown, 'utf8')
    fs.writeFileSync(path.join(reportDir, 'autonomous-work-item-e2e-latest.md'), markdown, 'utf8')
    console.error(`FAIL autonomous work item E2E. Report: ${failReportPath}`)
    console.error(message)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main()
}
