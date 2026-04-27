#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const defaultBaseUrl = process.env.HERMES_WORKSPACE_URL || process.env.BASE_URL || 'http://localhost:3456'
const targetRepo = '/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS'
const targetBranch = 'test-hermes-workspace'
const projectId = 'production-dogfood-family-command-center-abacus'
const projectName = 'Production Dogfood — Family Command Center ABACUS'
const reportDir = path.join(process.cwd(), 'dogfood-output')
const expectedTransitionContract = [
  { name: 'created-inbox', status: 'inbox', phase: 'research' },
  { name: 'ready-after-auto-approval', status: 'ready', phase: undefined },
  { name: 'active-build', status: 'active', phase: 'build' },
  { name: 'active-review', status: 'active', phase: 'review' },
  { name: 'active-deploy', status: 'active', phase: 'deploy' },
  { name: 'done', status: 'done', phase: undefined },
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function phaseCell(phase) {
  return phase || '—'
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function reportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function normalizeItemsPayload(body) {
  return body.workItems || body.items || []
}

function normalizeWorkItemPayload(body) {
  return body.workItem || body.item || body
}

function createdItemMatchesRun(item, e2eRunId) {
  return item?.id && (item.title?.includes(e2eRunId) || item.labels?.includes(e2eRunId))
}

export function validateWorkItemE2eReport(report) {
  assert(report && typeof report === 'object', 'Report is required')
  assert(/^work-item-e2e-/.test(report.e2eRunId || ''), 'Report e2eRunId must start with work-item-e2e-')
  assert(Array.isArray(report.createdWorkItemIds), 'Report createdWorkItemIds must be an array')
  assert(report.createdWorkItemIds.length === 1, 'E2E must create exactly one work item')
  assert(report.workItemId === report.createdWorkItemIds[0], 'Report workItemId must be the single created work item id')
  assert(Array.isArray(report.transitions), 'Report transitions must be an array')
  assert(report.transitions.length === expectedTransitionContract.length, 'Report must include every required transition')

  expectedTransitionContract.forEach((expected, index) => {
    const actual = report.transitions[index]
    assert(actual?.name === expected.name, `Transition ${index + 1} must be ${expected.name}`)
    assert(actual.workItemId === report.workItemId, 'Every transition must use the same work item id')
    assert(actual.status === expected.status, `${expected.name} status must be ${expected.status}`)
    if (expected.phase === undefined) {
      assert(actual.phase === undefined || actual.phase === null || actual.phase === '', `${expected.name} phase must be absent`)
    } else {
      assert(actual.phase === expected.phase, `${expected.name} phase must be ${expected.phase}`)
    }
  })

  assert(report.finalPersistedStatus === 'done', 'Final persisted status must be done')
  assert(report.transitions.at(-1)?.status === 'done', 'Final transition must be done')
  assert(report.finalInboxCheck?.workItemIdStillInInbox === false, 'Final item must not still be in Inbox')
  assert(Array.isArray(report.finalInboxCheck?.sameRunInboxItemIds), 'Final inbox same-run list is required')
  assert(report.finalInboxCheck.sameRunInboxItemIds.length === 0, 'No same-run E2E item may remain in Inbox')
  assert(Array.isArray(report.extraE2eItemsCreated), 'extraE2eItemsCreated must be an array')
  assert(report.extraE2eItemsCreated.length === 0, 'No extra E2E work items may be created')
  return report
}

export function buildWorkItemE2eMarkdown(report) {
  const transitionRows = report.transitions
    .map((step) => `| ${step.name} | ${step.workItemId} | ${step.status} | ${phaseCell(step.phase)} | ${step.evidenceSource || 'contract'} |`)
    .join('\n')
  const apiRows = (report.apiCalls || []).map((call) => `- ${call}`).join('\n') || '- none recorded'
  const commands = (report.commands || []).map((command) => `- ${command}`).join('\n') || '- node scripts/mission-control-work-item-e2e.mjs'
  const errors = (report.consoleErrors || []).map((error) => `- ${error}`).join('\n') || '- none'
  const blockers = (report.blockers || []).map((blocker) => `- ${blocker}`).join('\n') || '- none'
  const review = report.approvalEvidence?.review || {}
  const deploy = report.approvalEvidence?.deploy || {}

  return `# REAL Work Item E2E Report

Verdict: ${report.verdict || 'PASS'}
E2E run id: ${report.e2eRunId}
Workspace branch: ${report.workspaceBranch || 'unknown'}
Workspace commit: ${report.workspaceCommit || 'unknown'}
Candidate branch: ${report.candidateBranch || 'unknown'}
Candidate commit: ${report.candidateCommit || 'unknown'}
Project id: ${report.projectId || projectId}
Work item id: ${report.workItemId}
Work item title: ${report.workItemTitle || 'unknown'}
Created work item ids for this run: ${JSON.stringify(report.createdWorkItemIds)}
Extra E2E items created: ${JSON.stringify(report.extraE2eItemsCreated)}
Final persisted status: ${report.finalPersistedStatus}
Screenshot: ${report.screenshotPath || 'not captured'}

## Transition table
| Step | Work item id | Status | Phase | Evidence source |
|---|---|---|---|---|
${transitionRows}

## Approval evidence
- Review approval id/status/resolution: ${review.id || 'none'} / ${review.status || 'none'} / ${review.resolvedBy || review.resolution || 'none'}
- Deploy approval id/status/resolution: ${deploy.id || 'none'} / ${deploy.status || 'none'} / ${deploy.resolvedBy || deploy.resolution || 'none'}

## Inbox failure check
- Final item still in Inbox: ${report.finalInboxCheck?.workItemIdStillInInbox}
- Any same-run test item still in Inbox: ${(report.finalInboxCheck?.sameRunInboxItemIds || []).length > 0}

## Console/network errors
${errors}

## API calls
${apiRows}

## Commands run
${commands}

## Blockers
${blockers}
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
        description: 'Deterministic real-project E2E record created by mission-control-work-item-e2e.mjs',
      }),
    })
    project = created.project
  }
  assert(project?.id === projectId, 'Dogfood project was not found or created')
  return project
}

function transitionFromWorkItem(name, workItem, evidenceSource) {
  return {
    name,
    workItemId: workItem.id,
    status: workItem.status,
    phase: workItem.phase,
    evidenceSource,
  }
}

async function openUiProof(baseUrl, workItemId, workItemTitle, screenshotPath, consoleErrors, apiCalls) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes('fonts.googleapis.com') || text.includes('frame-ancestors')) return
    if (text.includes('Failed to load resource')) return
    if (text.includes('The width(-1) and height(-1) of chart should be greater than 0')) return
    if (['error', 'warning'].includes(message.type())) consoleErrors.push(`${message.type()}: ${text}`)
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    if (request.url().includes('fonts.googleapis.com')) return
    if (request.url().includes('/api/chat-events') || request.url().includes('/api/terminal-stream')) return
    if (request.failure()?.errorText === 'net::ERR_ABORTED') return
    consoleErrors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`)
  })
  page.on('response', (response) => {
    const url = response.url()
    if (response.status() >= 400 && /\/api\/(projects|work-items|profiles)/.test(url)) {
      consoleErrors.push(`http${response.status()}: ${response.request().method()} ${url}`)
    }
  })

  if (process.env.HERMES_PASSWORD) {
    const response = await page.request.post(`${baseUrl}/api/auth`, {
      data: { password: process.env.HERMES_PASSWORD },
      headers: { 'Content-Type': 'application/json' },
    })
    apiCalls.push(`POST /api/auth (browser) → ${response.status()}`)
    assert(response.ok(), `Browser auth failed: ${response.status()}`)
  }
  await page.addInitScript(() => {
    window.localStorage.setItem('hermes-onboarding-complete', 'true')
  })

  await page.goto(`${baseUrl}/projects/${projectId}/work-items/${encodeURIComponent(workItemId)}`, { waitUntil: 'domcontentloaded' })
  await page.getByText(workItemTitle).first().waitFor({ timeout: 15_000 })
  await page.getByText(/Done|done/i).first().waitFor({ timeout: 15_000 })
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await browser.close()
}

export async function runWorkItemE2e({ baseUrl = defaultBaseUrl } = {}) {
  assert(fs.existsSync(targetRepo), `Target repo missing: ${targetRepo}`)
  const candidateBranch = git(targetRepo, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const candidateCommit = git(targetRepo, ['rev-parse', '--short', 'HEAD'])
  const workspaceBranch = git(process.cwd(), ['rev-parse', '--abbrev-ref', 'HEAD'])
  const workspaceCommit = git(process.cwd(), ['rev-parse', '--short', 'HEAD'])
  assert(candidateBranch === targetBranch, `Target repo branch mismatch: expected ${targetBranch}, got ${candidateBranch}`)

  fs.mkdirSync(reportDir, { recursive: true })
  const timestamp = reportTimestamp()
  const e2eRunId = `work-item-e2e-${timestamp}`
  const reportPath = path.join(reportDir, `work-item-e2e-${timestamp}.md`)
  const latestReportPath = path.join(reportDir, 'work-item-e2e-latest.md')
  const screenshotPath = path.join(reportDir, `work-item-e2e-${timestamp}.png`)
  const workItemTitle = `REAL E2E Workflow ${e2eRunId}`
  const apiCalls = []
  const consoleErrors = []
  const transitions = []
  const approvalEvidence = {}

  const cookie = await authenticateApi(baseUrl, apiCalls)
  const authHeader = cookie ? { cookie } : {}
  await ensureProject(baseUrl, apiCalls, authHeader)

  const createBody = {
    projectId,
    title: workItemTitle,
    description: 'Production E2E: one item must travel Inbox -> Ready -> Build -> Review -> Deploy -> Done.',
    status: 'inbox',
    phase: 'research',
    priority: 'low',
    riskLevel: 'low',
    labels: ['production-e2e', e2eRunId],
    acceptanceCriteria: [
      'The same work item leaves Inbox and reaches Ready.',
      'The same work item reaches Build, Review, Deploy, and Done.',
      'The final report includes transition evidence for the same work item id.',
    ],
    repoPathSnapshot: targetRepo,
  }
  const created = await requestJson(baseUrl, apiCalls, '/api/work-items', {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify(createBody),
  })
  const createdWorkItem = normalizeWorkItemPayload(created)
  const workItemId = createdWorkItem.id
  const createdWorkItemIds = [workItemId]
  const createdFresh = normalizeWorkItemPayload(await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}`, { headers: authHeader }))
  transitions.push(transitionFromWorkItem('created-inbox', createdFresh, 'POST /api/work-items + GET'))

  await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}/lifecycle`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ action: 'send_to_planning', actor: 'production-e2e', notes: 'E2E planning start' }),
  })
  await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}/lifecycle`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ action: 'mark_ready', actor: 'production-e2e', notes: 'E2E planning accepted; item must leave Inbox' }),
  })
  const ready = normalizeWorkItemPayload(await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}`, { headers: authHeader }))
  transitions.push(transitionFromWorkItem('ready-after-auto-approval', ready, 'send_to_planning + mark_ready + GET'))

  await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}`, {
    method: 'PATCH',
    headers: authHeader,
    body: JSON.stringify({ status: 'active', phase: 'build', missionState: 'succeeded', notes: ['E2E build phase entered'] }),
  })
  const build = normalizeWorkItemPayload(await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}`, { headers: authHeader }))
  transitions.push(transitionFromWorkItem('active-build', build, 'PATCH active/build + GET'))

  const reviewResponse = await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}/lifecycle`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ action: 'request_review', actor: 'production-e2e', notes: 'E2E build complete; request review' }),
  })
  const reviewApproval = reviewResponse.approval || reviewResponse.workItem?.approvals?.find((approval) => approval.phase === 'review')
  approvalEvidence.review = reviewApproval
  transitions.push({ name: 'active-review', workItemId, status: 'active', phase: 'review', evidenceSource: 'request_review lifecycle response/history' })

  let afterReview = normalizeWorkItemPayload(await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}`, { headers: authHeader }))
  const pendingReviewApproval = afterReview.approvals?.find((approval) => approval.phase === 'review' && approval.status === 'pending')
  if (pendingReviewApproval) {
    const resolved = await requestJson(baseUrl, apiCalls, `/api/work-item-approvals/${pendingReviewApproval.id}`, {
      method: 'PATCH',
      headers: authHeader,
      body: JSON.stringify({ decision: 'approved', resolvedBy: 'production-e2e', notes: 'E2E review approved' }),
    })
    approvalEvidence.review = resolved.approval || pendingReviewApproval
    afterReview = normalizeWorkItemPayload(await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}`, { headers: authHeader }))
  }
  transitions.push(transitionFromWorkItem('active-deploy', afterReview, reviewApproval?.status === 'approved' ? 'review auto-approval + GET' : 'review approval + GET'))

  const deployRequest = await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}/lifecycle`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ action: 'request_deploy_approval', actor: 'production-e2e', notes: 'E2E deploy approval requested' }),
  })
  let deployApproval = deployRequest.approval || deployRequest.workItem?.approvals?.find((approval) => approval.phase === 'deploy' && approval.status === 'pending')
  if (!deployApproval) {
    const deployFresh = normalizeWorkItemPayload(await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}`, { headers: authHeader }))
    deployApproval = deployFresh.approvals?.find((approval) => approval.phase === 'deploy' && approval.status === 'pending')
  }
  assert(deployApproval?.id, 'Deploy approval was not created')
  const deployResolved = await requestJson(baseUrl, apiCalls, `/api/work-item-approvals/${deployApproval.id}`, {
    method: 'PATCH',
    headers: authHeader,
    body: JSON.stringify({ decision: 'approved', resolvedBy: 'production-e2e', notes: 'E2E deploy approved; complete item' }),
  })
  approvalEvidence.deploy = deployResolved.approval || deployApproval
  const done = normalizeWorkItemPayload(await requestJson(baseUrl, apiCalls, `/api/work-items/${workItemId}`, { headers: authHeader }))
  transitions.push(transitionFromWorkItem('done', done, 'deploy approval + final GET'))

  const list = await requestJson(baseUrl, apiCalls, `/api/work-items?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
  const sameRunItems = normalizeItemsPayload(list).filter((item) => createdItemMatchesRun(item, e2eRunId))
  const sameRunIds = sameRunItems.map((item) => item.id)
  const sameRunInboxItemIds = sameRunItems.filter((item) => item.status === 'inbox').map((item) => item.id)
  const finalInboxCheck = {
    workItemIdStillInInbox: sameRunItems.some((item) => item.id === workItemId && item.status === 'inbox'),
    sameRunInboxItemIds,
  }
  const extraE2eItemsCreated = sameRunIds.filter((id) => id !== workItemId)

  await openUiProof(baseUrl, workItemId, workItemTitle, screenshotPath, consoleErrors, apiCalls)

  const report = {
    verdict: 'PASS',
    e2eRunId,
    workspaceBranch,
    workspaceCommit,
    candidateBranch,
    candidateCommit,
    projectId,
    workItemId,
    workItemTitle,
    createdWorkItemIds,
    extraE2eItemsCreated,
    transitions,
    finalInboxCheck,
    finalPersistedStatus: done.status,
    screenshotPath,
    approvalEvidence,
    apiCalls,
    consoleErrors,
    commands: [
      'pnpm test src/server/production-e2e-work-item-workflow-script.test.ts -- --runInBand',
      'pnpm vitest run',
      'pnpm build',
      'systemctl --user restart hermes-workspace.service',
      'curl -fsS http://localhost:3456/api/projects >/tmp/hermes-workspace-projects-e2e-smoke.json',
      'node scripts/mission-control-work-item-e2e.mjs',
    ],
    blockers: [],
  }

  validateWorkItemE2eReport(report)
  assert(consoleErrors.length === 0, `Browser console/network errors detected: ${consoleErrors.join('\n')}`)
  const markdown = buildWorkItemE2eMarkdown(report)
  fs.writeFileSync(reportPath, markdown, 'utf8')
  fs.writeFileSync(latestReportPath, markdown, 'utf8')
  return { report, reportPath, latestReportPath, screenshotPath }
}

async function main() {
  try {
    const { reportPath, latestReportPath, screenshotPath, report } = await runWorkItemE2e()
    console.log(`PASS work item E2E. Report: ${reportPath}`)
    console.log(`Latest: ${latestReportPath}`)
    console.log(`Screenshot: ${screenshotPath}`)
    console.log(`Work item: ${report.workItemId}`)
  } catch (error) {
    fs.mkdirSync(reportDir, { recursive: true })
    const timestamp = reportTimestamp()
    const failReportPath = path.join(reportDir, `work-item-e2e-${timestamp}-FAIL.md`)
    const message = error instanceof Error ? error.stack || error.message : String(error)
    const markdown = `# REAL Work Item E2E Report\n\nVerdict: FAIL\n\n## Blockers\n- ${message.replace(/\n/g, '\n  ')}\n`
    fs.writeFileSync(failReportPath, markdown, 'utf8')
    fs.writeFileSync(path.join(reportDir, 'work-item-e2e-latest.md'), markdown, 'utf8')
    console.error(`FAIL work item E2E. Report: ${failReportPath}`)
    console.error(message)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main()
}
