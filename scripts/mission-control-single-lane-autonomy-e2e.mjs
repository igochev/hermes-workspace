#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const defaultBaseUrl = process.env.HERMES_WORKSPACE_URL || process.env.BASE_URL || 'http://localhost:3456'
const targetRepo = process.env.HERMES_SINGLE_LANE_E2E_TARGET_REPO || '/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS'
const targetBranch = process.env.HERMES_SINGLE_LANE_E2E_TARGET_BRANCH || 'test-hermes-workspace'
const projectId = process.env.HERMES_SINGLE_LANE_E2E_PROJECT_ID || 'production-dogfood-family-command-center-abacus'
const projectName = 'Production Dogfood — Family Command Center ABACUS'
const reportDir = path.join(process.cwd(), 'dogfood-output')
const pollTimeoutMs = Number(process.env.HERMES_SINGLE_LANE_E2E_TIMEOUT_MS || 30 * 60 * 1000)
const pollIntervalMs = Number(process.env.HERMES_SINGLE_LANE_E2E_POLL_MS || 10_000)
const resumeWorkItemId = process.env.HERMES_SINGLE_LANE_E2E_WORK_ITEM_ID || ''
const allowNonE2eResume = process.env.HERMES_SINGLE_LANE_E2E_ALLOW_NON_E2E_RESUME === 'true'
const cleanupBranchDeletionEnabled = process.env.HERMES_SINGLE_LANE_E2E_CLEANUP_BRANCHES === 'true'

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

function gitStatusShort(cwd) {
  return git(cwd, ['status', '--short'])
}

function gitBranch(cwd) {
  return git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
}

function collectRepoHygieneFindings(repoHygiene) {
  const findings = [...(repoHygiene.findings || [])]
  if (repoHygiene.beforeDirtyStatus) findings.push(`Repo started dirty: ${repoHygiene.beforeDirtyStatus}`)
  if (repoHygiene.afterDirtyStatus) findings.push(`Repo ended dirty: ${repoHygiene.afterDirtyStatus}`)
  if (repoHygiene.afterBranch !== targetBranch) findings.push(`Repo ended on ${repoHygiene.afterBranch}, expected ${targetBranch}`)
  if (repoHygiene.checkoutError) findings.push(`Checkout cleanup failed: ${repoHygiene.checkoutError}`)
  if (repoHygiene.stashCreated) findings.push(`Created safety stash before checkout: ${repoHygiene.stashCreated}`)
  if (/ahead [1-9]/i.test(repoHygiene.aheadBehind || '')) findings.push(`Base branch ${repoHygiene.baseBranch || targetBranch} is ahead of origin (${repoHygiene.aheadBehind}).`)
  return Array.from(new Set(findings))
}

function gitLines(cwd, args) {
  return git(cwd, args)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function gitLinesAllowEmpty(cwd, args) {
  try {
    return gitLines(cwd, args)
  } catch {
    return []
  }
}

function gitAheadBehind(cwd, baseBranch) {
  try {
    const upstream = git(cwd, ['rev-parse', '--abbrev-ref', `${baseBranch}@{upstream}`])
    const [behind = '0', ahead = '0'] = git(cwd, ['rev-list', '--left-right', '--count', `${upstream}...${baseBranch}`]).split(/\s+/)
    return `ahead ${Number(ahead)}, behind ${Number(behind)}`
  } catch {
    return 'no upstream'
  }
}

function collectLaneRepoHygiene(repoHygiene, { baseBranch = targetBranch, featureBranch = '', prUrl = '' } = {}) {
  const currentBranch = gitBranch(targetRepo)
  const dirtyStatus = gitStatusShort(targetRepo)
  const untrackedFiles = gitLinesAllowEmpty(targetRepo, ['ls-files', '--others', '--exclude-standard'])
  const localBranchesCreatedByLane = gitLinesAllowEmpty(targetRepo, ['branch', '--format=%(refname:short)']).filter((branch) => branch.startsWith('mission/'))
  const stashIdsCreatedByLane = gitLinesAllowEmpty(targetRepo, ['stash', 'list']).filter((line) => /single-lane|mission|gauntlet/i.test(line))
  return {
    ...repoHygiene,
    currentBranch,
    baseBranch,
    featureBranch,
    dirtyStatus,
    untrackedFiles,
    localBranchesCreatedByLane,
    stashIdsCreatedByLane,
    aheadBehind: gitAheadBehind(targetRepo, baseBranch),
    prUrl,
    cleanupBranchDeletionEnabled,
  }
}

function checkoutTargetBranchWhenSafe(repoHygiene) {
  repoHygiene.checkoutAttempted = true
  const currentBranch = gitBranch(targetRepo)
  const dirtyStatus = gitStatusShort(targetRepo)
  if (currentBranch === targetBranch) {
    repoHygiene.checkoutResult = `Already on target base branch ${targetBranch}.`
    return
  }
  if (dirtyStatus) {
    const stashMessage = `single-lane-e2e-safety-${reportTimestamp()}`
    git(targetRepo, ['stash', 'push', '-u', '-m', stashMessage])
    repoHygiene.stashCreated = stashMessage
  }
  try {
    git(targetRepo, ['checkout', targetBranch])
    repoHygiene.checkoutResult = `Checked out ${targetBranch} from ${currentBranch}.`
  } catch (error) {
    repoHygiene.checkoutError = error instanceof Error ? error.message : String(error)
    repoHygiene.checkoutResult = `Failed to checkout ${targetBranch} from ${currentBranch}.`
  }
}

function gitChangedFilesSince(cwd, baseCommit) {
  const committed = baseCommit ? git(cwd, ['diff', '--name-only', `${baseCommit}..HEAD`]) : ''
  const unstaged = git(cwd, ['diff', '--name-only'])
  const staged = git(cwd, ['diff', '--cached', '--name-only'])
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard'])
  return Array.from(
    new Set(
      [committed, unstaged, staged, untracked]
        .join('\n')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  )
}

function gitChangedFilesForCommit(cwd, commit) {
  if (!commit) return []
  const output = git(cwd, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-m', commit])
  return Array.from(new Set(output.split('\n').map((line) => line.trim()).filter(Boolean)))
}

function normalizeItemsPayload(body) {
  return body.workItems || body.items || []
}

function normalizeWorkItemPayload(body) {
  return body.workItem || body.item || body
}

function historyEventsForReport(workItem) {
  const workItemId = workItem?.id
  return (workItem?.history || []).flatMap((entry) => {
    const note = entry?.note || ''
    const phase = entry?.phase
    const action = (() => {
      if (/Planner enrichment requested|Planner .*launched/i.test(note)) return 'launch_planner'
      if (/Launched .*builder|Phase 2: build|Builder/i.test(note) && phase === 'build') return 'launch_builder'
      if (/Recovered valid Builder evidence|advanced work item into review/i.test(note)) return 'sync_execution'
      if (/Merge-Healer merged/i.test(note)) return 'run_merge_healer'
      return ''
    })()
    return action ? [{ action, workItemId, observedAt: entry.createdAt, message: note }] : []
  })
}

function eventActions(report) {
  return (report.orchestratorEvents || []).map((event) => event.action)
}

function hasProductAndTestDiff(changedFiles) {
  const meaningful = (changedFiles || []).filter((file) => {
    if (file.startsWith('node_modules/') || file.startsWith('.next/') || file.startsWith('dist/') || file.startsWith('build/') || file.startsWith('coverage/')) return false
    if (file.startsWith('docs/') || file.startsWith('.hermes/plans/') || ['README.md', 'CHANGELOG.md', 'LICENSE'].includes(file)) return false
    return true
  })
  const hasProduct = meaningful.some((file) => /(^|\/)(lib|src|app|components|server)\//.test(file) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file))
  const hasTest = meaningful.some((file) => /(^|\/)(tests|test|spec|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file))
  return hasProduct && hasTest
}

function expectedBranchName(workItemId, title) {
  const slug = String(title || 'work-item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'work-item'
  return `mission/${String(workItemId).slice(0, 8)}-${slug}`
}

export function validateSingleLaneAutonomyE2eReport(report) {
  assert(report && typeof report === 'object', 'Report is required')
  assert(/^single-lane-autonomy-e2e-/.test(report.e2eRunId || ''), 'Report e2eRunId must start with single-lane-autonomy-e2e-')
  assert(report.mode === 'fresh' || report.mode === 'resume', 'Report mode must be fresh or resume')
  assert(Array.isArray(report.createdWorkItemIds), 'Report createdWorkItemIds must be an array')
  assert(report.createdWorkItemIds.length === 1, 'Single-lane E2E must create exactly one work item')
  assert(report.workItemId === report.createdWorkItemIds[0], 'Report workItemId must be the single created work item id')
  assert(Array.isArray(report.manualPhaseMutationCalls), 'Report manualPhaseMutationCalls must be an array')
  assert(report.manualPhaseMutationCalls.length === 0, `Single-lane E2E used manual phase mutation: ${report.manualPhaseMutationCalls.join(', ')}`)

  const actions = eventActions(report)
  assert(actions.includes('launch_planner'), 'Planner launch evidence is required')
  assert(actions.includes('launch_builder'), 'Builder launch evidence is required')
  assert(actions.includes('run_merge_healer'), 'Merge-Healer run evidence is required')

  assert(report.lane?.branchCreated === true, 'Feature branch creation evidence is required')
  assert(report.lane?.branchName && report.lane.branchName === report.lane.expectedBranchName, 'Feature branch name must match expected single-lane branch')
  assert(report.lane?.plannerLaunchedAfterLaneEntry === true, 'Planner must launch after lane entry branch preparation')
  assert(report.candidateRepo?.initialBranch === report.lane?.baseBranch, 'Candidate repo must start from lane base branch')
  assert(Array.isArray(report.candidateRepo?.changedFiles), 'Candidate repo changedFiles evidence is required')
  assert(hasProductAndTestDiff(report.candidateRepo.changedFiles), 'Candidate repo diff must include product and test files')
  assert(report.candidateRepo.testsPassed === true, 'Candidate tests passed evidence is required')
  assert(report.mergeHealer?.ran === true && report.mergeHealer.mergeState === 'merged', 'Merge-Healer must merge successfully for PASS')
  assert(report.finalWorkItem?.status === 'done' && report.finalWorkItem?.laneState === 'done', 'Final work item must be done with laneState done')
  return report
}

export function buildSingleLaneAutonomyE2eMarkdown(report) {
  const pass = (() => {
    try {
      validateSingleLaneAutonomyE2eReport(report)
      return true
    } catch {
      return false
    }
  })()
  const eventRows = (report.orchestratorEvents || [])
    .map((event) => `| ${event.observedAt || 'unknown'} | ${event.action} | ${event.workItemId || report.workItemId} | ${event.message || ''} |`)
    .join('\n') || '| — | — | — | — |'
  const timelineRows = (report.timelineRows || [])
    .map((row) => `| ${row.phase || '—'} | ${row.state || '—'} | ${row.summary || ''} |`)
    .join('\n') || '| — | — | — |'
  const changedFiles = (report.candidateRepo?.changedFiles || []).map((file) => `- ${file}`).join('\n') || '- none'
  const blockers = (report.blockers || []).map((blocker) => `- ${blocker}`).join('\n') || '- none'
  const repoHygieneFindings = (report.repoHygiene?.findings || []).length > 0 ? report.repoHygiene.findings.join('; ') : 'none'
  const localLaneBranches = (report.repoHygiene?.localBranchesCreatedByLane || []).join(', ') || 'none'
  const stashBackups = (report.repoHygiene?.stashIdsCreatedByLane || []).join(', ') || 'none'
  const untrackedFiles = (report.repoHygiene?.untrackedFiles || []).join(', ') || 'none'

  return `# Branch-Based Single-Lane Autonomy E2E Report

Verdict: ${pass ? 'PASS' : 'FAIL'}
Mode: ${report.mode || 'unknown'}
E2E run id: ${report.e2eRunId}
Project id: ${report.projectId || projectId}
Work item id: ${report.workItemId}
Work item title: ${report.workItemTitle || 'unknown'}
Created work item ids: ${JSON.stringify(report.createdWorkItemIds || [])}
Manual phase mutation calls: ${JSON.stringify(report.manualPhaseMutationCalls || [])}
Base branch: ${report.lane?.baseBranch || 'unknown'}
Feature branch: ${report.lane?.branchName || 'unknown'}
Expected branch: ${report.lane?.expectedBranchName || 'unknown'}
Planner launched after lane entry: ${report.lane?.plannerLaunchedAfterLaneEntry === true ? 'yes' : 'no'}
Candidate tests passed: ${report.candidateRepo?.testsPassed === true ? 'yes' : 'no'}
Merge-Healer: ${report.mergeHealer?.mergeState || 'not-run'}
Merge commit: ${report.mergeHealer?.mergeCommit || 'unknown'}
Final work item status/phase/lane: ${report.finalWorkItem?.status || 'unknown'} / ${report.finalWorkItem?.phase || '—'} / ${report.finalWorkItem?.laneState || '—'}
Screenshot: ${report.screenshotPath || 'not captured'}

## Orchestrator event timeline
| Observed | Action | Work item id | Message |
|---|---|---|---|
${eventRows}

## Run timeline rows
| Phase | State | Summary |
|---|---|---|
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

## Repo hygiene
Branch before: ${report.repoHygiene?.beforeBranch || 'unknown'}
Branch after: ${report.repoHygiene?.afterBranch || 'unknown'}
Dirty before:
\`\`\`text
${report.repoHygiene?.beforeDirtyStatus || ''}
\`\`\`
Dirty after:
\`\`\`text
${report.repoHygiene?.afterDirtyStatus || ''}
\`\`\`
Checkout attempted: ${report.repoHygiene?.checkoutAttempted === true ? 'yes' : 'no'}
Checkout result: ${report.repoHygiene?.checkoutResult || 'not attempted'}
Current branch: ${report.repoHygiene?.currentBranch || report.repoHygiene?.afterBranch || 'unknown'}
Base branch: ${report.repoHygiene?.baseBranch || report.lane?.baseBranch || 'unknown'}
Feature branch: ${report.repoHygiene?.featureBranch || report.lane?.branchName || 'unknown'}
Untracked files: ${untrackedFiles}
Local lane branches: ${localLaneBranches}
Stash backups: ${stashBackups}
Ahead/behind: ${report.repoHygiene?.aheadBehind || 'unknown'}
PR URL: ${report.repoHygiene?.prUrl || 'none'}
Branch cleanup deletion enabled: ${report.repoHygiene?.cleanupBranchDeletionEnabled === true ? 'yes' : 'no'}
Repo hygiene findings: ${repoHygieneFindings}

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
  const patchBody = {
    repoPath: targetRepo,
    defaultBranch: targetBranch,
    phaseProfiles: { research: 'planner', build: 'builder', review: 'builder', deploy: 'builder' },
    autonomyLanePolicy: {
      enabled: true,
      isolation: 'branch',
      maxActiveWorkItems: 1,
      baseBranch: targetBranch,
      branchPrefix: 'mission',
      plannerTiming: 'on_lane_entry',
      mergeHealerEnabled: true,
      allowParallelWorktrees: false,
    },
  }
  if (!project) {
    const created = await requestJson(baseUrl, apiCalls, '/api/projects', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        id: projectId,
        name: projectName,
        description: 'Branch-based single-lane autonomy E2E project for Mission Control.',
        ...patchBody,
      }),
    })
    project = created.project
  } else {
    const updated = await requestJson(baseUrl, apiCalls, `/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: authHeader,
      body: JSON.stringify(patchBody),
    })
    project = updated.project
  }
  assert(project?.autonomyLanePolicy?.enabled === true, 'Dogfood project lane policy was not enabled')
  return project
}

function collectManualPhaseMutationCalls(apiCalls) {
  return apiCalls.filter((call) => {
    if (/POST \/api\/work-items\/[^ ]+\/lifecycle/.test(call)) return true
    if (/PATCH \/api\/work-items\/[^ ?]+/.test(call) && !call.includes(`/api/projects/${projectId}`)) return true
    return false
  })
}

function isActiveNonTerminalLaneItem(item) {
  if (!item || ['done', 'cancelled'].includes(item.status)) return false
  if (item.status === 'blocked' && item.laneState === 'blocked' && item.laneParkedAt && item.laneBlockedReason) return false
  return item.status === 'active' || ['preparing', 'building', 'reviewing', 'merge_healing'].includes(item.laneState)
}

async function assertNoActiveNonTerminalLaneItem(baseUrl, apiCalls, authHeader) {
  const list = await requestJson(baseUrl, apiCalls, `/api/work-items?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
  const active = normalizeItemsPayload(list).find(isActiveNonTerminalLaneItem)
  assert(!active, `Refusing fresh single-lane E2E: active non-terminal lane item already exists for ${projectId}: ${active?.id}`)
}

function assertResumableE2eItem(workItem) {
  const labels = Array.isArray(workItem?.labels) ? workItem.labels : []
  assert(
    labels.includes('single-lane-autonomy-e2e') || allowNonE2eResume,
    `Resume target ${workItem?.id || 'unknown'} is not labelled single-lane-autonomy-e2e; set HERMES_SINGLE_LANE_E2E_ALLOW_NON_E2E_RESUME=true to override.`,
  )
}

function runCandidateTestsIfConfigured() {
  const command = process.env.HERMES_SINGLE_LANE_E2E_CANDIDATE_TEST_COMMAND
  if (!command) return { output: '', passed: false }
  const output = execFileSync('bash', ['-lc', command], { cwd: targetRepo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return { output, passed: true }
}

export async function runSingleLaneAutonomyE2e({ baseUrl = defaultBaseUrl } = {}) {
  assert(fs.existsSync(targetRepo), `Target repo missing: ${targetRepo}`)
  const repoHygiene = {
    beforeBranch: gitBranch(targetRepo),
    afterBranch: '',
    beforeDirtyStatus: gitStatusShort(targetRepo),
    afterDirtyStatus: '',
    checkoutAttempted: false,
    checkoutResult: 'not attempted',
    findings: [],
  }
  if (repoHygiene.beforeBranch !== targetBranch) checkoutTargetBranchWhenSafe(repoHygiene)
  const initialBranch = gitBranch(targetRepo)
  const baseCommit = git(targetRepo, ['rev-parse', '--short', 'HEAD'])
  const beforeStatus = gitStatusShort(targetRepo)
  assert(initialBranch === targetBranch, `Target repo branch mismatch: expected ${targetBranch}, got ${initialBranch}`)
  assert(beforeStatus === '', `Target repo must start clean before branch-based E2E:\n${beforeStatus}`)

  fs.mkdirSync(reportDir, { recursive: true })
  const timestamp = reportTimestamp()
  const e2eRunId = `single-lane-autonomy-e2e-${timestamp}`
  const mode = resumeWorkItemId ? 'resume' : 'fresh'
  const reportPath = path.join(reportDir, `single-lane-autonomy-e2e-${timestamp}.md`)
  const latestReportPath = path.join(reportDir, 'single-lane-autonomy-e2e-latest.md')
  const workItemTitle = 'Single Lane E2E Code Delivery'
  const apiCalls = []
  const orchestratorEvents = []
  const timelineRows = []
  const blockers = []

  const cookie = await authenticateApi(baseUrl, apiCalls)
  const authHeader = cookie ? { cookie } : {}
  await ensureProject(baseUrl, apiCalls, authHeader)

  let createdWorkItem
  let workItemId
  let createdWorkItemIds
  let expected
  if (resumeWorkItemId) {
    const existing = await requestJson(baseUrl, apiCalls, `/api/work-items/${encodeURIComponent(resumeWorkItemId)}?syncExecution=true`, { headers: authHeader })
    createdWorkItem = normalizeWorkItemPayload(existing)
    assertResumableE2eItem(createdWorkItem)
    workItemId = createdWorkItem.id
    createdWorkItemIds = [workItemId]
    expected = expectedBranchName(workItemId, createdWorkItem.title || workItemTitle)
  } else {
    await assertNoActiveNonTerminalLaneItem(baseUrl, apiCalls, authHeader)
    const created = await requestJson(baseUrl, apiCalls, '/api/work-items', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        projectId,
        title: workItemTitle,
        description: `Branch-based single-lane autonomy ${e2eRunId}: one work item, canonical feature branch, Builder evidence, Merge-Healer integration.`,
        status: 'inbox',
        phase: 'research',
        priority: 'medium',
        riskLevel: 'low',
        labels: ['single-lane-autonomy-e2e', e2eRunId],
        acceptanceCriteria: [
          'Planner launches only after lane entry and canonical branch preparation.',
          'Builder changes product code and tests and emits structured evidence with passing tests.',
          'Merge-Healer integrates the feature branch and the work item reaches done.',
        ],
        repoPathSnapshot: targetRepo,
      }),
    })
    createdWorkItem = normalizeWorkItemPayload(created)
    workItemId = createdWorkItem.id
    createdWorkItemIds = [workItemId]
    expected = expectedBranchName(workItemId, workItemTitle)
  }
  assert(createdWorkItemIds.length === 1, 'Harness must create or resume exactly one work item')

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

    const currentChangedFiles = gitChangedFilesSince(targetRepo, baseCommit)
    if (finalWorkItem.status === 'done' && finalWorkItem.laneState === 'done' && hasProductAndTestDiff(currentChangedFiles) && finalWorkItem.mergeState === 'merged') {
      break
    }
    if (finalWorkItem.status === 'blocked') {
      blockers.push(finalWorkItem.laneBlockedReason || finalWorkItem.blockedReason || 'Work item blocked')
      break
    }
    await sleep(pollIntervalMs)
  }

  const tests = (() => {
    try {
      return runCandidateTestsIfConfigured()
    } catch (error) {
      blockers.push(`Candidate test command failed: ${error instanceof Error ? error.message : String(error)}`)
      return { output: '', passed: false }
    }
  })()
  const changedFiles = (() => {
    const sinceBase = gitChangedFilesSince(targetRepo, baseCommit)
    const mergeCommitFiles = gitChangedFilesForCommit(targetRepo, finalWorkItem.mergeCommit)
    return Array.from(new Set([...sinceBase, ...mergeCommitFiles]))
  })()
  checkoutTargetBranchWhenSafe(repoHygiene)
  Object.assign(
    repoHygiene,
    collectLaneRepoHygiene(repoHygiene, {
      baseBranch: finalWorkItem.baseBranch || targetBranch,
      featureBranch: finalWorkItem.branchName || expected,
      prUrl: finalWorkItem.prUrl || '',
    }),
  )
  repoHygiene.afterBranch = gitBranch(targetRepo)
  repoHygiene.afterDirtyStatus = gitStatusShort(targetRepo)
  repoHygiene.findings = collectRepoHygieneFindings(repoHygiene)
  const afterStatus = repoHygiene.afterDirtyStatus
  const list = await requestJson(baseUrl, apiCalls, `/api/work-items?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
  const sameRunItems = normalizeItemsPayload(list).filter((item) => item?.id && (item.title?.includes(e2eRunId) || item.labels?.includes(e2eRunId)))
  const extraE2eItemsCreated = sameRunItems.map((item) => item.id).filter((id) => id !== workItemId)
  if (extraE2eItemsCreated.length > 0) blockers.push(`Extra work items created: ${extraE2eItemsCreated.join(', ')}`)

  const reportEvents = Array.from(
    new Map(
      [...orchestratorEvents, ...historyEventsForReport(finalWorkItem)].map((event) => [`${event.action}:${event.workItemId}:${event.observedAt || ''}`, event]),
    ).values(),
  )

  const report = {
    e2eRunId,
    mode,
    projectId,
    workItemId,
    workItemTitle: finalWorkItem.title || createdWorkItem.title || workItemTitle,
    createdWorkItemIds,
    extraE2eItemsCreated,
    manualPhaseMutationCalls: collectManualPhaseMutationCalls(apiCalls),
    orchestratorEvents: reportEvents,
    timelineRows,
    lane: {
      branchCreated: Boolean(finalWorkItem.branchName || git(targetRepo, ['branch', '--list', expected])),
      branchName: finalWorkItem.branchName || git(targetRepo, ['rev-parse', '--abbrev-ref', 'HEAD']),
      expectedBranchName: expected,
      baseBranch: finalWorkItem.baseBranch || targetBranch,
      plannerLaunchedAfterLaneEntry: Boolean(finalWorkItem.laneEnteredAt && eventActions({ orchestratorEvents: reportEvents }).includes('launch_planner')),
    },
    candidateRepo: {
      initialBranch,
      beforeStatus,
      afterStatus,
      changedFiles,
      testsPassed: tests.passed || finalWorkItem.mergeTestPassed === true,
      testOutput: tests.output,
    },
    repoHygiene,
    mergeHealer: {
      ran: eventActions({ orchestratorEvents }).includes('run_merge_healer') || Boolean(finalWorkItem.mergeState),
      mergeState: finalWorkItem.mergeState || 'not_started',
      mergeCommit: finalWorkItem.mergeCommit,
    },
    finalWorkItem: { status: finalWorkItem.status, phase: finalWorkItem.phase, laneState: finalWorkItem.laneState },
    apiCalls,
    blockers,
  }

  const markdown = buildSingleLaneAutonomyE2eMarkdown(report)
  fs.writeFileSync(reportPath, markdown, 'utf8')
  fs.writeFileSync(latestReportPath, markdown, 'utf8')
  try {
    validateSingleLaneAutonomyE2eReport(report)
  } catch (error) {
    if (error && typeof error === 'object') {
      error.reportPath = reportPath
      error.latestReportPath = latestReportPath
    }
    throw error
  }
  return { report, reportPath, latestReportPath }
}

async function main() {
  try {
    const { reportPath, latestReportPath, report } = await runSingleLaneAutonomyE2e()
    console.log(`PASS branch-based single-lane autonomy E2E. Report: ${reportPath}`)
    console.log(`Latest: ${latestReportPath}`)
    console.log(`Work item: ${report.workItemId}`)
  } catch (error) {
    if (error?.reportPath) {
      const message = error instanceof Error ? error.stack || error.message : String(error)
      console.error(`FAIL branch-based single-lane autonomy E2E. Report: ${error.reportPath}`)
      if (error.latestReportPath) console.error(`Latest: ${error.latestReportPath}`)
      console.error(message)
      process.exitCode = 1
      return
    }
    fs.mkdirSync(reportDir, { recursive: true })
    const timestamp = reportTimestamp()
    const failReportPath = path.join(reportDir, `single-lane-autonomy-e2e-${timestamp}-FAIL.md`)
    const message = error instanceof Error ? error.stack || error.message : String(error)
    const markdown = `# Branch-Based Single-Lane Autonomy E2E Report\n\nVerdict: FAIL\n\n## Blockers\n- ${message.replace(/\n/g, '\n  ')}\n`
    fs.writeFileSync(failReportPath, markdown, 'utf8')
    fs.writeFileSync(path.join(reportDir, 'single-lane-autonomy-e2e-latest.md'), markdown, 'utf8')
    console.error(`FAIL branch-based single-lane autonomy E2E. Report: ${failReportPath}`)
    console.error(message)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main()
}
