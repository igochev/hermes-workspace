#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const baseUrl = process.env.HERMES_WORKSPACE_URL || process.argv[2] || 'http://localhost:3456'
const targetRepo = '/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS'
const targetBranch = 'test-hermes-workspace'
const dogfoodProjectId = 'production-dogfood-family-command-center-abacus'
const dogfoodProjectName = 'Production Dogfood — Family Command Center ABACUS'
const reportDir = path.join(process.cwd(), 'dogfood-output')
const reportPath = path.join(reportDir, `production-dogfood-${new Date().toISOString().replace(/[:.]/g, '-')}.md`)
const screenshotPath = path.join(reportDir, 'production-dogfood-project-detail.png')

const evidence = {
  baseUrl,
  targetRepo,
  targetBranch,
  apiCalls: [],
  uiClicks: [],
  consoleErrors: [],
  screenshots: [],
}

function recordApi(method, url, status) {
  evidence.apiCalls.push(`${method} ${url} → ${status}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function git(args) {
  return execFileSync('git', ['-C', targetRepo, ...args], { encoding: 'utf8' }).trim()
}

function chooseProfile(profiles, fallback) {
  return profiles.includes(fallback) ? fallback : (profiles[0] || fallback)
}

async function requestJson(url, options = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  recordApi(options.method || 'GET', url, response.status)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${JSON.stringify(body)}`)
  return { response, body }
}

async function authenticateBrowser(page) {
  if (!process.env.HERMES_PASSWORD) return
  const response = await page.request.post(`${baseUrl}/api/auth`, {
    data: { password: process.env.HERMES_PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  })
  recordApi('POST', '/api/auth', response.status())
  assert(response.ok(), `Browser auth failed: ${response.status()}`)
}

async function authenticateApi() {
  if (!process.env.HERMES_PASSWORD) return ''
  const response = await fetch(`${baseUrl}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: process.env.HERMES_PASSWORD }),
  })
  recordApi('POST', '/api/auth', response.status)
  assert(response.ok, `API auth failed: ${response.status}`)
  return response.headers.get('set-cookie')?.split(';')[0] || ''
}

async function main() {
  assert(fs.existsSync(targetRepo), `Target repo missing: ${targetRepo}`)
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const commit = git(['rev-parse', '--short', 'HEAD'])
  assert(branch === targetBranch, `Target repo branch mismatch: expected ${targetBranch}, got ${branch}`)

  fs.mkdirSync(reportDir, { recursive: true })
  const cookie = await authenticateApi()
  const authHeader = cookie ? { cookie } : {}

  const projectsResult = await requestJson('/api/projects', { headers: authHeader })
  let project = projectsResult.body.projects?.find((item) => item.id === dogfoodProjectId)
  if (!project) {
    const created = await requestJson('/api/projects', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        id: dogfoodProjectId,
        name: dogfoodProjectName,
        repoPath: targetRepo,
        defaultBranch: targetBranch,
        description: 'Deterministic real-project dogfood record created by mission-control-production-dogfood.mjs',
      }),
    })
    project = created.body.project
  }
  assert(project?.id === dogfoodProjectId, 'Dogfood project was not created or found')

  const profilesResult = await requestJson('/api/profiles/list', { headers: authHeader })
  const profiles = (profilesResult.body.profiles || [])
    .map((profile) => profile.name)
    .filter((name) => name && name !== 'default')
  const planner = chooseProfile(profiles, 'planner')
  const builder = chooseProfile(profiles, 'builder')
  const reviewer = chooseProfile(profiles, 'reviewer')
  const supervisor = chooseProfile(profiles, builder)
  const scout = chooseProfile(profiles, planner)

  const patched = await requestJson(`/api/projects/${dogfoodProjectId}`, {
    method: 'PATCH',
    headers: authHeader,
    body: JSON.stringify({
      phaseProfiles: { research: planner, build: builder, review: reviewer, deploy: '' },
      runtimeProfiles: { supervisorProfile: supervisor },
      autopilotPolicy: { scoutProfile: scout },
    }),
  })
  project = patched.body.project

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
  const page = await context.newPage()
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes('fonts.googleapis.com') || text.includes('frame-ancestors')) return
    if (text.includes('Failed to load resource')) return
    if (['error', 'warning'].includes(message.type())) evidence.consoleErrors.push(`${message.type()}: ${text}`)
  })
  page.on('pageerror', (error) => evidence.consoleErrors.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    if (request.url().includes('fonts.googleapis.com')) return
    if (request.url().includes('/api/chat-events') || request.url().includes('/api/terminal-stream')) return
    evidence.consoleErrors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText}`)
  })
  page.on('response', (response) => {
    const url = response.url()
    if (response.status() >= 400 && /\/api\/(projects|work-items|profiles)/.test(url)) {
      evidence.consoleErrors.push(`http${response.status()}: ${response.request().method()} ${url}`)
    }
  })
  await authenticateBrowser(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('hermes-onboarding-complete', 'true')
  })

  await page.goto(`${baseUrl}/projects/${dogfoodProjectId}`, { waitUntil: 'domcontentloaded' })
  await page.getByText(dogfoodProjectName).waitFor({ timeout: 15_000 })
  await page.screenshot({ path: screenshotPath, fullPage: true })
  evidence.screenshots.push(screenshotPath)

  await page.getByRole('button', { name: /Refresh/i }).click()
  evidence.uiClicks.push('Refresh')
  await page.getByRole('button', { name: /Configure profile mappings/i }).click()
  evidence.uiClicks.push('Profile Readiness → Configure profile mappings')
  await page.getByText('Project Profile & Workflow Policy').waitFor({ timeout: 10_000 })

  await page.getByLabel('Supervisor Profile').selectOption(supervisor)
  evidence.uiClicks.push(`Supervisor Profile → ${supervisor}`)
  await page.getByLabel('Autopilot Scout Profile').selectOption(scout)
  evidence.uiClicks.push(`Autopilot Scout Profile → ${scout}`)
  await page.getByRole('button', { name: /Save Profile & Workflow Policy/i }).click()
  evidence.uiClicks.push('Save Profile & Workflow Policy')
  await page.waitForTimeout(500)

  await page.getByRole('button', { name: /Capture rough idea/i }).click()
  evidence.uiClicks.push('Capture rough idea')
  await page.getByRole('button', { name: /Create rough idea/i }).click()
  evidence.uiClicks.push('Create rough idea empty-title validation')
  await page.getByPlaceholder('Implement /projects detail route').fill(`Dogfood rough idea ${new Date().toISOString()}`)
  await page.getByPlaceholder('Describe the implementation goal and operator outcome').fill('Safe dogfood rough idea created by Mission Control production readiness smoke.')
  await page.getByRole('button', { name: /Create rough idea/i }).click()
  evidence.uiClicks.push('Create rough idea with title')
  await page.waitForTimeout(1000)

  const detail = await requestJson(`/api/projects/${dogfoodProjectId}`, { headers: authHeader })
  const createdWorkItem = detail.body.workItems?.find((item) => item.title?.startsWith('Dogfood rough idea'))
  assert(createdWorkItem, 'Dogfood work item was not created')
  await page.getByText(createdWorkItem.title).click()
  evidence.uiClicks.push('Open created work item detail')
  await page.waitForURL(/work-items/, { timeout: 10_000 })
  await page.getByText(createdWorkItem.title).waitFor({ timeout: 10_000 })

  await page.goto(`${baseUrl}/projects/${dogfoodProjectId}/autopilot`, { waitUntil: 'domcontentloaded' })
  await page.getByText(/Autopilot/i).first().waitFor({ timeout: 10_000 })
  evidence.uiClicks.push('Open Project Autopilot')
  await page.getByRole('button', { name: /Save Autopilot Schedule/i }).click()
  evidence.uiClicks.push('Project Autopilot → Save Autopilot Schedule')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: /Disable schedule/i }).click()
  evidence.uiClicks.push('Project Autopilot → Disable schedule')
  await page.waitForTimeout(500)

  await page.goto(`${baseUrl}/projects`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Projects' }).waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: /Refresh/i }).click()
  evidence.uiClicks.push('Projects list → Refresh')
  await page.getByRole('link', { name: /Approvals Inbox/i }).click()
  evidence.uiClicks.push('Projects list → Approvals Inbox')
  await page.getByRole('heading', { name: /Approvals Inbox/i }).waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: /Refresh/i }).click()
  evidence.uiClicks.push('Approvals Inbox → Refresh')
  await page.goto(`${baseUrl}/projects`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: /Autopilot Inbox/i }).click()
  evidence.uiClicks.push('Projects list → Autopilot Inbox')
  await page.getByRole('heading', { name: /Autopilot Suggestions/i }).waitFor({ timeout: 10_000 })
  await page.getByRole('button', { name: /Refresh/i }).click()
  evidence.uiClicks.push('Autopilot Suggestions → Refresh')
  await page.getByLabel('Status').selectOption('new')
  evidence.uiClicks.push('Autopilot Suggestions → Status filter New')
  await page.getByLabel('Risk').selectOption('low')
  evidence.uiClicks.push('Autopilot Suggestions → Risk filter Low')

  await browser.close()

  const readiness = await requestJson(`/api/projects/${dogfoodProjectId}/profile-readiness`, { headers: authHeader })
  const blockedRoles = readiness.body.report?.roles?.filter((role) =>
    ['missing'].includes(role.status) || (role.status === 'unmapped' && role.role !== 'deploy'),
  ) || []
  assert(blockedRoles.length === 0, `Readiness still has blocked roles: ${blockedRoles.map((role) => `${role.role}:${role.status}`).join(', ')}`)
  assert(evidence.consoleErrors.length === 0, `Browser console/network errors detected: ${evidence.consoleErrors.join('\n')}`)

  const report = `# Hermes Workspace Production Dogfood Report\n\n- Verdict: PASS\n- Workspace base URL: ${baseUrl}\n- Workspace cwd: ${process.cwd()}\n- Target repo: ${targetRepo}\n- Target branch: ${branch}\n- Target commit: ${commit}\n- Dogfood project id: ${dogfoodProjectId}\n- Screenshot: ${screenshotPath}\n\n## API calls\n${evidence.apiCalls.map((line) => `- ${line}`).join('\n')}\n\n## UI clicks\n${evidence.uiClicks.map((line) => `- ${line}`).join('\n')}\n\n## Console / network errors\nNone\n`
  fs.writeFileSync(reportPath, report, 'utf8')
  console.log(`PASS production dogfood. Report: ${reportPath}`)
}

main().catch((error) => {
  fs.mkdirSync(reportDir, { recursive: true })
  const report = `# Hermes Workspace Production Dogfood Report\n\n- Verdict: FAIL\n- Workspace base URL: ${baseUrl}\n- Error: ${error.message}\n\n## API calls\n${evidence.apiCalls.map((line) => `- ${line}`).join('\n') || '- none'}\n\n## UI clicks\n${evidence.uiClicks.map((line) => `- ${line}`).join('\n') || '- none'}\n\n## Console / network errors\n${evidence.consoleErrors.map((line) => `- ${line}`).join('\n') || '- none'}\n\n## Screenshots\n${evidence.screenshots.map((line) => `- ${line}`).join('\n') || '- none'}\n`
  fs.writeFileSync(reportPath, report, 'utf8')
  console.error(`FAIL production dogfood. Report: ${reportPath}`)
  console.error(error)
  process.exit(1)
})
