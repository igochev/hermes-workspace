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
const pollTimeoutMs = Number(process.env.HERMES_SINGLE_LANE_GAUNTLET_TIMEOUT_MS || 45 * 60 * 1000)
const pollIntervalMs = Number(process.env.HERMES_SINGLE_LANE_GAUNTLET_POLL_MS || 10_000)
const resumeGauntletRunId = process.env.HERMES_SINGLE_LANE_GAUNTLET_RUN_ID?.trim() || ''
const cleanupBranchDeletionEnabled = process.env.HERMES_SINGLE_LANE_GAUNTLET_CLEANUP_BRANCHES === 'true'

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

function gitLinesAllowEmpty(cwd, args) {
  try {
    return git(cwd, args)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
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

function enrichRepoHygiene(repoHygiene, itemProofs = []) {
  repoHygiene.currentBranch = gitBranch(targetRepo)
  repoHygiene.baseBranch = targetBranch
  repoHygiene.untrackedFiles = gitLinesAllowEmpty(targetRepo, ['ls-files', '--others', '--exclude-standard'])
  repoHygiene.localBranchesCreatedByLane = gitLinesAllowEmpty(targetRepo, ['branch', '--format=%(refname:short)']).filter((branch) => branch.startsWith('mission/'))
  if (repoHygiene.localBranchesCreatedByLane.length === 0 && itemProofs.length > 0) {
    repoHygiene.localBranchesCreatedByLane = itemProofs.map((item) => item.branchName).filter(Boolean)
  }
  repoHygiene.stashIdsCreatedByLane = gitLinesAllowEmpty(targetRepo, ['stash', 'list']).filter((line) => /single-lane|mission|gauntlet/i.test(line))
  repoHygiene.aheadBehind = gitAheadBehind(targetRepo, targetBranch)
  repoHygiene.prUrl = repoHygiene.prUrl || ''
  repoHygiene.cleanupBranchDeletionEnabled = cleanupBranchDeletionEnabled
  if (/ahead [1-9]/i.test(repoHygiene.aheadBehind || '')) {
    repoHygiene.findings.push(`Base branch ${targetBranch} is ahead of origin (${repoHygiene.aheadBehind}).`)
  }
  return repoHygiene
}

function checkpointCandidateRepoDirt({ stashAndCheckout = true } = {}) {
  const beforeBranch = gitBranch(targetRepo)
  const beforeDirtyStatus = gitStatusShort(targetRepo)
  const result = {
    beforeBranch,
    afterBranch: beforeBranch,
    beforeDirtyStatus,
    afterDirtyStatus: beforeDirtyStatus,
    stashCreated: '',
    checkoutAttempted: false,
    checkoutResult: stashAndCheckout ? 'not attempted' : 'resume mode: start-state observed without branch switching',
    findings: [],
  }
  if (!stashAndCheckout) {
    if (beforeBranch !== targetBranch) result.findings.push(`Resume started on ${beforeBranch}; cleanup will return to ${targetBranch} after polling.`)
    if (beforeDirtyStatus) result.findings.push(`Resume started with candidate repo dirt preserved for the in-flight lane: ${beforeDirtyStatus}`)
    return result
  }
  if (beforeDirtyStatus) {
    const stashMessage = `single-lane-sequential-gauntlet-safety-${reportTimestamp()}`
    git(targetRepo, ['stash', 'push', '-u', '-m', stashMessage])
    result.stashCreated = stashMessage
    result.findings.push(`Created safety stash before branch switching: ${stashMessage}`)
  }
  if (gitBranch(targetRepo) !== targetBranch) {
    result.checkoutAttempted = true
    const fromBranch = gitBranch(targetRepo)
    git(targetRepo, ['checkout', targetBranch])
    result.checkoutResult = `Checked out ${targetBranch} from ${fromBranch}.`
  } else {
    result.checkoutAttempted = true
    result.checkoutResult = `Already on target base branch ${targetBranch}.`
  }
  result.afterBranch = gitBranch(targetRepo)
  result.afterDirtyStatus = gitStatusShort(targetRepo)
  if (result.afterBranch !== targetBranch) result.findings.push(`Repo ended on ${result.afterBranch}, expected ${targetBranch}`)
  if (result.afterDirtyStatus) result.findings.push(`Repo dirty after checkpoint: ${result.afterDirtyStatus}`)
  return result
}

function updateRepoHygieneAfterRun(repoHygiene) {
  if (gitBranch(targetRepo) !== targetBranch) {
    repoHygiene.checkoutAttempted = true
    const dirty = gitStatusShort(targetRepo)
    if (dirty) {
      const stashMessage = `single-lane-sequential-gauntlet-cleanup-${reportTimestamp()}`
      git(targetRepo, ['stash', 'push', '-u', '-m', stashMessage])
      repoHygiene.stashCreated = repoHygiene.stashCreated ? `${repoHygiene.stashCreated}, ${stashMessage}` : stashMessage
      repoHygiene.findings.push(`Created cleanup safety stash before returning to base branch: ${stashMessage}`)
    }
    const fromBranch = gitBranch(targetRepo)
    git(targetRepo, ['checkout', targetBranch])
    repoHygiene.checkoutResult = `Checked out ${targetBranch} from ${fromBranch}.`
  }
  repoHygiene.afterBranch = gitBranch(targetRepo)
  repoHygiene.afterDirtyStatus = gitStatusShort(targetRepo)
  if (repoHygiene.afterBranch !== targetBranch) repoHygiene.findings.push(`Repo ended on ${repoHygiene.afterBranch}, expected ${targetBranch}`)
  if (repoHygiene.afterDirtyStatus) repoHygiene.findings.push(`Repo ended dirty: ${repoHygiene.afterDirtyStatus}`)
  return repoHygiene
}

function normalizeItemsPayload(body) {
  return body.workItems || body.items || []
}

function normalizeWorkItemPayload(body) {
  return body.workItem || body.item || body
}

function isNonBlockedActiveLaneItem(item) {
  if (!item || ['done', 'cancelled'].includes(item.status)) return false
  if (item.status === 'blocked' && item.laneState === 'blocked' && item.laneParkedAt && item.laneBlockedReason) return false
  return item.status === 'active' || ['preparing', 'building', 'reviewing', 'merge_healing'].includes(item.laneState)
}

function createdAtForHistory(workItem, matcher) {
  const found = (workItem.history || []).find((entry) => matcher(entry?.note || '', entry))
  return found?.createdAt || ''
}

function itemProofFromWorkItem(workItem) {
  const plannerLaunchedAt = createdAtForHistory(workItem, (note) => /Planner enrichment requested|Planner .*launched/i.test(note))
  const builderLaunchedAt = createdAtForHistory(workItem, (note, entry) => /Launched .*builder|Phase 2: build|Builder/i.test(note) && entry?.phase === 'build')
  const mergeCompletedAt = createdAtForHistory(workItem, (note) => /Merge-Healer merged/i.test(note)) || workItem.updatedAt || ''
  return {
    workItemId: workItem.id,
    branchName: workItem.branchName || '',
    laneEnteredAt: workItem.laneEnteredAt || '',
    plannerLaunchedAt,
    builderLaunchedAt,
    mergeCompletedAt,
    finalStatus: workItem.status,
    finalLaneState: workItem.laneState || '',
    mergeState: workItem.mergeState || '',
    mergeCommit: workItem.mergeCommit || '',
  }
}

function collectManualPhaseMutationCalls(apiCalls) {
  return apiCalls.filter((call) => /PATCH \/api\/work-items\/[^ ?]+/.test(call))
}

function assertNoUnsafeActiveLaneItems(items, runIds) {
  const active = items.filter((item) => item.projectId === projectId && isNonBlockedActiveLaneItem(item))
  const foreign = active.filter((item) => !runIds.includes(item.id))
  assert(
    foreign.length === 0,
    `Refusing gauntlet: active non-terminal lane item already exists: ${foreign
      .map((item) => `${item.id} (${item.status}/${item.phase || '—'}/${item.laneState || 'no-lane-state'})`)
      .join(', ')}`,
  )
}

function gauntletOrdinal(item) {
  const label = (item.labels || []).find((candidate) => /^gauntlet-[123]$/.test(candidate))
  return Number(label?.replace('gauntlet-', '') || 99)
}

function itemsForGauntletRun(items, gauntletRunId) {
  return items
    .filter(
      (item) =>
        item.projectId === projectId &&
        (item.labels || []).includes('single-lane-sequential-gauntlet') &&
        (item.labels || []).includes(gauntletRunId),
    )
    .sort((a, b) => gauntletOrdinal(a) - gauntletOrdinal(b) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || a.id.localeCompare(b.id))
}

async function resumeGauntletItems(baseUrl, apiCalls, authHeader, gauntletRunId) {
  assert(gauntletRunId, 'HERMES_SINGLE_LANE_GAUNTLET_RUN_ID is required for gauntlet resume mode')
  const list = await requestJson(baseUrl, apiCalls, `/api/work-items?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
  const items = itemsForGauntletRun(normalizeItemsPayload(list), gauntletRunId)
  assert(items.length === 3, `Resume gauntlet ${gauntletRunId} expected exactly three work items, found ${items.length}`)
  assert(new Set(items.map((item) => item.id)).size === 3, `Resume gauntlet ${gauntletRunId} has duplicate work item ids`)
  return items
}

function eventAction(event) {
  const raw = event?.action || ''
  if (raw) return raw
  const message = event?.message || ''
  if (/Planner/i.test(message)) return 'launch_planner'
  if (/Builder/i.test(message)) return 'launch_builder'
  if (/Merge-Healer/i.test(message)) return 'run_merge_healer'
  return ''
}

function buildSequencingProof(itemProofs) {
  return [
    {
      previousWorkItemId: itemProofs[0]?.workItemId || '',
      nextWorkItemId: itemProofs[1]?.workItemId || '',
      previousDoneOrParkedAt: itemProofs[0]?.mergeCompletedAt || '',
      nextBuildStartedAt: itemProofs[1]?.builderLaunchedAt || '',
    },
    {
      previousWorkItemId: itemProofs[1]?.workItemId || '',
      nextWorkItemId: itemProofs[2]?.workItemId || '',
      previousDoneOrParkedAt: itemProofs[1]?.mergeCompletedAt || '',
      nextBuildStartedAt: itemProofs[2]?.builderLaunchedAt || '',
    },
  ]
}

function eventRows(events) {
  return (events || []).map((event) => `| ${event.observedAt || 'unknown'} | ${eventAction(event) || 'unknown'} | ${event.workItemId || 'unknown'} | ${event.message || ''} |`).join('\n') || '| — | — | — | — |'
}

export function validateSingleLaneSequentialGauntletReport(report) {
  assert(report && typeof report === 'object', 'Report is required')
  assert(/^single-lane-sequential-gauntlet-/.test(report.gauntletRunId || ''), 'Gauntlet run id must start with single-lane-sequential-gauntlet-')
  assert(Array.isArray(report.createdWorkItemIds), 'createdWorkItemIds is required')
  assert(report.createdWorkItemIds.length === 3, 'Sequential gauntlet must create exactly three work items')
  assert(new Set(report.createdWorkItemIds).size === 3, 'Sequential gauntlet requires three distinct work items')
  assert(Array.isArray(report.manualPhaseMutationCalls), 'manualPhaseMutationCalls is required')
  assert(report.manualPhaseMutationCalls.length === 0, `Gauntlet used manual phase mutation: ${report.manualPhaseMutationCalls.join(', ')}`)
  assert(!Array.isArray(report.blockers) || report.blockers.length === 0, `Gauntlet has blockers: ${(report.blockers || []).join('; ')}`)
  assert(!report.repoHygiene || report.repoHygiene.afterBranch === targetBranch, `Repo ended on ${report.repoHygiene?.afterBranch || 'unknown'}, expected ${targetBranch}`)
  assert(!report.repoHygiene || !report.repoHygiene.afterDirtyStatus, `Repo ended dirty: ${report.repoHygiene?.afterDirtyStatus}`)
  assert(Number(report.maxConcurrentActiveLaneItems || 0) <= 1, 'Hidden parallel lane execution detected: max parallel active lane items exceeded one')
  assert(Array.isArray(report.itemProofs) && report.itemProofs.length === 3, 'Three item proofs are required')
  assert(Array.isArray(report.sequencingProof) && report.sequencingProof.length === 2, 'Sequential ordering proof is required')
  const proofIds = new Set(report.itemProofs.map((item) => item.workItemId))
  const finalIds = new Set((report.finalWorkItems || []).map((item) => item.id))
  assert(report.createdWorkItemIds.every((id) => proofIds.has(id)), 'Item proofs must match created work item ids')
  assert(report.createdWorkItemIds.every((id) => finalIds.has(id)), 'Final work items must match created work item ids')
  for (const id of report.createdWorkItemIds) {
    const proof = report.itemProofs.find((item) => item.workItemId === id)
    assert(proof, `Missing item proof for ${id}`)
    assert(proof.branchName, `Missing branch proof for ${id}`)
    assert(proof.laneEnteredAt, `Missing laneEnteredAt proof for ${id}`)
    assert(proof.plannerLaunchedAt, `Missing planner launch proof for ${id}`)
    assert(proof.builderLaunchedAt, `Missing builder launch proof for ${id}`)
    assert(proof.mergeCompletedAt, `Missing merge completion proof for ${id}`)
    assert(new Date(proof.plannerLaunchedAt).getTime() >= new Date(proof.laneEnteredAt).getTime(), `Planner launched before lane entry for ${id}`)
    assert(new Date(proof.builderLaunchedAt).getTime() >= new Date(proof.plannerLaunchedAt).getTime(), `Builder launched before Planner for ${id}`)
    assert(new Date(proof.mergeCompletedAt).getTime() >= new Date(proof.builderLaunchedAt).getTime(), `Merge completed before Builder for ${id}`)
    assert(proof.finalStatus === 'done' && proof.finalLaneState === 'done', `Work item ${id} did not finish done/laneState=done`)
    assert(proof.mergeState === 'merged' && proof.mergeCommit, `Work item ${id} lacks Merge-Healer merged evidence`)
  }
  const expectedPairs = [
    [report.createdWorkItemIds[0], report.createdWorkItemIds[1]],
    [report.createdWorkItemIds[1], report.createdWorkItemIds[2]],
  ]
  report.sequencingProof.forEach((ordering, index) => {
    const [previousId, nextId] = expectedPairs[index]
    const previousProof = report.itemProofs.find((item) => item.workItemId === previousId)
    const nextProof = report.itemProofs.find((item) => item.workItemId === nextId)
    assert(ordering.previousWorkItemId === previousId && ordering.nextWorkItemId === nextId, `Sequential proof must be ordered ${previousId} -> ${nextId}`)
    assert(ordering.previousDoneOrParkedAt === previousProof?.mergeCompletedAt, `Sequential proof previous completion must match ${previousId}`)
    assert(ordering.nextBuildStartedAt === nextProof?.builderLaunchedAt, `Sequential proof next build start must match ${nextId}`)
    assert(new Date(ordering.nextBuildStartedAt).getTime() >= new Date(ordering.previousDoneOrParkedAt).getTime(), `Sequential proof failed for ${ordering.previousWorkItemId} -> ${ordering.nextWorkItemId}`)
    assert(new Date(nextProof?.laneEnteredAt || '').getTime() >= new Date(ordering.previousDoneOrParkedAt).getTime(), `Next item entered lane before previous item completed for ${nextId}`)
    assert(new Date(nextProof?.plannerLaunchedAt || '').getTime() >= new Date(ordering.previousDoneOrParkedAt).getTime(), `Next Planner launched before previous item completed for ${nextId}`)
  })
  assert(Array.isArray(report.finalWorkItems), 'finalWorkItems is required')
  assert(report.finalWorkItems.length === 3, 'Final work item summary must contain three items')
  for (const item of report.finalWorkItems) {
    assert(item.status === 'done' && item.laneState === 'done' && item.mergeState === 'merged', `Final work item ${item.id} is not done/laneState=done/merged`)
  }
  return report
}

export function buildSingleLaneSequentialGauntletMarkdown(report) {
  const pass = (() => {
    try {
      validateSingleLaneSequentialGauntletReport(report)
      return true
    } catch {
      return false
    }
  })()
  const itemRows = (report.itemProofs || [])
    .map((item) => `| ${item.workItemId} | ${item.branchName || '—'} | ${item.laneEnteredAt || '—'} | ${item.plannerLaunchedAt || '—'} | ${item.builderLaunchedAt || '—'} | ${item.mergeCompletedAt || '—'} | ${item.finalStatus || '—'} / ${item.finalLaneState || '—'} | ${item.mergeState || '—'} | ${item.mergeCommit || '—'} |`)
    .join('\n') || '| — | — | — | — | — | — | — | — | — |'
  const sequenceRows = (report.sequencingProof || [])
    .map((proof) => `| ${proof.previousWorkItemId} | ${proof.nextWorkItemId} | ${proof.previousDoneOrParkedAt} | ${proof.nextBuildStartedAt} |`)
    .join('\n') || '| — | — | — | — |'
  const finalRows = (report.finalWorkItems || [])
    .map((item) => `| ${item.id} | ${item.status || '—'} | ${item.laneState || '—'} | ${item.mergeState || '—'} |`)
    .join('\n') || '| — | — | — | — |'
  const blockers = (report.blockers || []).map((blocker) => `- ${blocker}`).join('\n') || '- none'
  const hygieneFindings = (report.repoHygiene?.findings || []).length ? report.repoHygiene.findings.map((finding) => `- ${finding}`).join('\n') : '- none'
  const localLaneBranches = (report.repoHygiene?.localBranchesCreatedByLane || []).join(', ') || 'none'
  const stashBackups = (report.repoHygiene?.stashIdsCreatedByLane || []).join(', ') || 'none'
  const untrackedFiles = (report.repoHygiene?.untrackedFiles || []).join(', ') || 'none'

  return `# Single-Lane Sequential Gauntlet Report

Verdict: ${pass ? 'PASS' : 'FAIL'}
Mode: ${report.mode || 'fresh'}
Gauntlet run id: ${report.gauntletRunId}
Project id: ${report.projectId || projectId}
Created work item ids: ${JSON.stringify(report.createdWorkItemIds || [])}
Manual phase mutation calls: ${JSON.stringify(report.manualPhaseMutationCalls || [])}
Max concurrent active lane items: ${report.maxConcurrentActiveLaneItems ?? 'unknown'}

## Item proof
| Work item | Branch | Lane entered | Planner launched | Builder launched | Merge completed | Final status/lane | Merge state | Merge commit |
|---|---|---|---|---|---|---|---|---|
${itemRows}

## Sequential ordering proof
| Previous item | Next item | Previous done/parked at | Next build started at |
|---|---|---|---|
${sequenceRows}

## Final work items
| Work item | Status | Lane state | Merge state |
|---|---|---|---|
${finalRows}

## Orchestrator events
| Observed | Action | Work item id | Message |
|---|---|---|---|
${eventRows(report.orchestratorEvents)}

## Repo hygiene
Branch before: ${report.repoHygiene?.beforeBranch || 'unknown'}
Branch after: ${report.repoHygiene?.afterBranch || 'unknown'}
Checkout result: ${report.repoHygiene?.checkoutResult || 'not attempted'}
Dirty before:
\`\`\`text
${report.repoHygiene?.beforeDirtyStatus || ''}
\`\`\`
Dirty after:
\`\`\`text
${report.repoHygiene?.afterDirtyStatus || ''}
\`\`\`
Current branch: ${report.repoHygiene?.currentBranch || report.repoHygiene?.afterBranch || 'unknown'}
Base branch: ${report.repoHygiene?.baseBranch || targetBranch}
Untracked files: ${untrackedFiles}
Local lane branches: ${localLaneBranches}
Stash backups: ${stashBackups}
Ahead/behind: ${report.repoHygiene?.aheadBehind || 'unknown'}
PR URL: ${report.repoHygiene?.prUrl || 'none'}
Branch cleanup deletion enabled: ${report.repoHygiene?.cleanupBranchDeletionEnabled === true ? 'yes' : 'no'}
Findings:
${hygieneFindings}

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
        description: 'Sequential single-lane gauntlet project for Mission Control.',
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

async function createGauntletItems(baseUrl, apiCalls, authHeader, gauntletRunId) {
  const created = []
  for (const ordinal of [1, 2, 3]) {
    const response = await requestJson(baseUrl, apiCalls, '/api/work-items', {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({
        projectId,
        title: `Sequential Lane Gauntlet ${ordinal}`,
        description: `single-lane-sequential-gauntlet ${gauntletRunId}: item ${ordinal} of 3 must run only after prior item is done or explicitly parked.`,
        status: 'inbox',
        phase: 'research',
        priority: ordinal === 1 ? 'high' : ordinal === 2 ? 'medium' : 'low',
        riskLevel: 'low',
        labels: ['single-lane-sequential-gauntlet', gauntletRunId, `gauntlet-${ordinal}`],
        acceptanceCriteria: [
          'Planner runs after lane entry on the current branch.',
          'Builder changes product code and tests with structured evidence.',
          'Merge-Healer integrates the branch and records merge evidence.',
        ],
        repoPathSnapshot: targetRepo,
      }),
    })
    created.push(normalizeWorkItemPayload(response))
  }
  return created
}

export async function runSingleLaneSequentialGauntlet({ baseUrl = defaultBaseUrl } = {}) {
  assert(fs.existsSync(targetRepo), `Target repo missing: ${targetRepo}`)
  fs.mkdirSync(reportDir, { recursive: true })
  const timestamp = reportTimestamp()
  const mode = resumeGauntletRunId ? 'resume' : 'fresh'
  const gauntletRunId = resumeGauntletRunId || `single-lane-sequential-gauntlet-${timestamp}`
  const reportPath = path.join(reportDir, `single-lane-sequential-gauntlet-${timestamp}.md`)
  const latestReportPath = path.join(reportDir, 'single-lane-sequential-gauntlet-latest.md')
  const apiCalls = []
  const blockers = []
  const orchestratorEvents = []
  const activeSamples = []
  let createdWorkItemIds = []
  const repoHygiene = checkpointCandidateRepoDirt({ stashAndCheckout: mode === 'fresh' })

  try {
    const cookie = await authenticateApi(baseUrl, apiCalls)
    const authHeader = cookie ? { cookie } : {}
    await ensureProject(baseUrl, apiCalls, authHeader)

    const beforeList = await requestJson(baseUrl, apiCalls, `/api/work-items?projectId=${encodeURIComponent(projectId)}`, { headers: authHeader })
    let created = []
    if (mode === 'resume') {
      created = await resumeGauntletItems(baseUrl, apiCalls, authHeader, gauntletRunId)
      createdWorkItemIds = created.map((item) => item.id)
      assertNoUnsafeActiveLaneItems(normalizeItemsPayload(beforeList), createdWorkItemIds)
    } else {
      assertNoUnsafeActiveLaneItems(normalizeItemsPayload(beforeList), [])
      created = await createGauntletItems(baseUrl, apiCalls, authHeader, gauntletRunId)
      createdWorkItemIds = created.map((item) => item.id)
    }
    assert(createdWorkItemIds.length === 3, 'Sequential gauntlet must create exactly three work items')

  const startedAt = Date.now()
  let finalWorkItems = created
  while (Date.now() - startedAt < pollTimeoutMs) {
    const reconcile = await requestJson(baseUrl, apiCalls, '/api/work-items/orchestrator/reconcile', {
      method: 'POST',
      headers: authHeader,
    })
    orchestratorEvents.push(...(reconcile.events || []))

    finalWorkItems = []
    for (const id of createdWorkItemIds) {
      const detail = await requestJson(baseUrl, apiCalls, `/api/work-items/${encodeURIComponent(id)}?syncExecution=true`, { headers: authHeader })
      finalWorkItems.push(normalizeWorkItemPayload(detail))
    }
    const activeRunItems = finalWorkItems.filter(isNonBlockedActiveLaneItem)
    activeSamples.push({ observedAt: new Date().toISOString(), activeIds: activeRunItems.map((item) => item.id) })
    if (activeRunItems.length > 1) {
      blockers.push(`More than one non-blocked active lane item observed: ${activeRunItems.map((item) => item.id).join(', ')}`)
      break
    }

    if (finalWorkItems.every((item) => item.status === 'done' && item.laneState === 'done' && item.mergeState === 'merged')) break
    const blocked = finalWorkItems.find((item) => item.status === 'blocked')
    if (blocked) {
      blockers.push(`Work item ${blocked.id} blocked: ${blocked.laneBlockedReason || blocked.blockedReason || 'unknown blocker'}`)
      break
    }
    await sleep(pollIntervalMs)
  }

  if (!finalWorkItems.every((item) => item.status === 'done' && item.laneState === 'done' && item.mergeState === 'merged') && blockers.length === 0) {
    blockers.push(`Timed out after ${pollTimeoutMs}ms before all three gauntlet work items reached done/laneState=done/merged.`)
  }

  const itemProofs = finalWorkItems.map(itemProofFromWorkItem)
  const sequencingProof = buildSequencingProof(itemProofs)
  updateRepoHygieneAfterRun(repoHygiene)
  enrichRepoHygiene(repoHygiene, itemProofs)
  const maxConcurrentActiveLaneItems = activeSamples.reduce((max, sample) => Math.max(max, sample.activeIds.length), 0)
  const report = {
    mode,
    gauntletRunId,
    projectId,
    createdWorkItemIds,
    manualPhaseMutationCalls: collectManualPhaseMutationCalls(apiCalls),
    maxConcurrentActiveLaneItems,
    itemProofs,
    sequencingProof,
    finalWorkItems: finalWorkItems.map((item) => ({ id: item.id, status: item.status, phase: item.phase, laneState: item.laneState, mergeState: item.mergeState })),
    orchestratorEvents,
    activeSamples,
    repoHygiene,
    apiCalls,
    blockers,
  }

  const markdown = buildSingleLaneSequentialGauntletMarkdown(report)
  fs.writeFileSync(reportPath, markdown, 'utf8')
  fs.writeFileSync(latestReportPath, markdown, 'utf8')
  try {
    validateSingleLaneSequentialGauntletReport(report)
  } catch (error) {
    if (error && typeof error === 'object') {
      error.reportPath = reportPath
      error.latestReportPath = latestReportPath
    }
    throw error
  }
  return { report, reportPath, latestReportPath }
  } catch (error) {
    if (error?.reportPath) throw error
    try {
      updateRepoHygieneAfterRun(repoHygiene)
      enrichRepoHygiene(repoHygiene)
    } catch (cleanupError) {
      repoHygiene.findings.push(`Cleanup failed after runtime error: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`)
    }
    const message = error instanceof Error ? error.stack || error.message : String(error)
    const failReport = {
      mode,
      gauntletRunId,
      projectId,
      createdWorkItemIds,
      manualPhaseMutationCalls: collectManualPhaseMutationCalls(apiCalls),
      maxConcurrentActiveLaneItems: activeSamples.reduce((max, sample) => Math.max(max, sample.activeIds.length), 0),
      itemProofs: [],
      sequencingProof: [],
      finalWorkItems: [],
      orchestratorEvents,
      activeSamples,
      repoHygiene,
      apiCalls,
      blockers: [...blockers, message],
    }
    const markdown = buildSingleLaneSequentialGauntletMarkdown(failReport)
    fs.writeFileSync(reportPath, markdown, 'utf8')
    fs.writeFileSync(latestReportPath, markdown, 'utf8')
    if (error && typeof error === 'object') {
      error.reportPath = reportPath
      error.latestReportPath = latestReportPath
    }
    throw error
  }
}

async function main() {
  try {
    const { reportPath, latestReportPath, report } = await runSingleLaneSequentialGauntlet()
    console.log(`PASS single-lane sequential gauntlet. Report: ${reportPath}`)
    console.log(`Latest: ${latestReportPath}`)
    console.log(`Work items: ${report.createdWorkItemIds.join(', ')}`)
  } catch (error) {
    if (error?.reportPath) {
      const message = error instanceof Error ? error.stack || error.message : String(error)
      console.error(`FAIL single-lane sequential gauntlet. Report: ${error.reportPath}`)
      if (error.latestReportPath) console.error(`Latest: ${error.latestReportPath}`)
      console.error(message)
      process.exitCode = 1
      return
    }
    fs.mkdirSync(reportDir, { recursive: true })
    const timestamp = reportTimestamp()
    const failReportPath = path.join(reportDir, `single-lane-sequential-gauntlet-${timestamp}-FAIL.md`)
    const message = error instanceof Error ? error.stack || error.message : String(error)
    const markdown = `# Single-Lane Sequential Gauntlet Report\n\nVerdict: FAIL\n\n## Blockers\n- ${message.replace(/\n/g, '\n  ')}\n`
    fs.writeFileSync(failReportPath, markdown, 'utf8')
    fs.writeFileSync(path.join(reportDir, 'single-lane-sequential-gauntlet-latest.md'), markdown, 'utf8')
    console.error(`FAIL single-lane sequential gauntlet. Report: ${failReportPath}`)
    console.error(message)
    process.exitCode = 1
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  await main()
}
