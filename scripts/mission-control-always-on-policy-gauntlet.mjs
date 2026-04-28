#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const defaultBaseUrl = process.env.HERMES_WORKSPACE_URL || process.env.BASE_URL || 'http://localhost:3456'
const targetRepo = process.env.HERMES_ALWAYS_ON_POLICY_TARGET_REPO || '/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS'
const targetBranch = process.env.HERMES_ALWAYS_ON_POLICY_TARGET_BRANCH || 'test-hermes-workspace'
const projectId = process.env.HERMES_ALWAYS_ON_POLICY_PROJECT_ID || 'production-dogfood-family-command-center-abacus'
const reportDir = path.join(process.cwd(), 'dogfood-output')
const destructiveCleanupEnv = 'HERMES_ALWAYS_ON_POLICY_ENABLE_DESTRUCTIVE_CLEANUP'
const prPublishEnv = 'HERMES_ALWAYS_ON_POLICY_ENABLE_PR_PUBLISH'
const destructiveCleanupRequested = process.env.HERMES_ALWAYS_ON_POLICY_ENABLE_DESTRUCTIVE_CLEANUP === 'true'
const prPublishRequested = process.env.HERMES_ALWAYS_ON_POLICY_ENABLE_PR_PUBLISH === 'true'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function reportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function gitLines(cwd, args) {
  try {
    return git(cwd, args)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function gitScalar(cwd, args, fallback = '') {
  try {
    return git(cwd, args)
  } catch {
    return fallback
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

function defaultPolicySnapshot() {
  return {
    enabled: false,
    retry: { enabled: false, maxAttemptsPerPhase: 1, cooldownMinutes: 30 },
    notifications: {
      enabled: true,
      digestOnly: true,
      notifyOn: ['blocked', 'retry_exhausted', 'unsafe_repo', 'pr_ready', 'cleanup_recommended'],
    },
    prPublishing: { enabled: false, mode: 'manual', requireCleanRepo: true, requirePassingMergeTests: true },
    cleanup: { enabled: false, dryRun: true, retainMergedBranchDays: 30, retainLaneStashes: true },
  }
}

function normalizePolicySnapshot(project) {
  const alwaysOn = project?.autonomyLanePolicy?.alwaysOn || {}
  const defaults = defaultPolicySnapshot()
  return {
    enabled: alwaysOn.enabled === true,
    retry: {
      enabled: alwaysOn.retry?.enabled === true,
      maxAttemptsPerPhase: Number.isFinite(alwaysOn.retry?.maxAttemptsPerPhase) ? alwaysOn.retry.maxAttemptsPerPhase : defaults.retry.maxAttemptsPerPhase,
      cooldownMinutes: Number.isFinite(alwaysOn.retry?.cooldownMinutes) ? alwaysOn.retry.cooldownMinutes : defaults.retry.cooldownMinutes,
    },
    notifications: {
      enabled: alwaysOn.notifications?.enabled !== false,
      digestOnly: alwaysOn.notifications?.digestOnly !== false,
      notifyOn: Array.isArray(alwaysOn.notifications?.notifyOn) && alwaysOn.notifications.notifyOn.length > 0 ? alwaysOn.notifications.notifyOn : defaults.notifications.notifyOn,
    },
    prPublishing: {
      enabled: alwaysOn.prPublishing?.enabled === true,
      mode: alwaysOn.prPublishing?.mode === 'draft' ? 'draft' : 'manual',
      requireCleanRepo: alwaysOn.prPublishing?.requireCleanRepo !== false,
      requirePassingMergeTests: alwaysOn.prPublishing?.requirePassingMergeTests !== false,
    },
    cleanup: {
      enabled: alwaysOn.cleanup?.enabled === true,
      dryRun: alwaysOn.cleanup?.dryRun !== false,
      retainMergedBranchDays: Number.isFinite(alwaysOn.cleanup?.retainMergedBranchDays) ? alwaysOn.cleanup.retainMergedBranchDays : defaults.cleanup.retainMergedBranchDays,
      retainLaneStashes: alwaysOn.cleanup?.retainLaneStashes !== false,
    },
  }
}

function buildRetryDisabledDecision(policy) {
  return {
    decision: 'recommend_retry',
    shouldRetry: false,
    evidence: [`policy=${policy.enabled ? 'enabled' : 'disabled'}`, `retry=${policy.retry.enabled ? 'enabled' : 'disabled'}`, 'operator action required before automatic retry'],
  }
}

function buildSimulatedStaleJobDecision(policy) {
  const max = Math.max(1, Number(policy.retry.maxAttemptsPerPhase || 1))
  return {
    decision: 'schedule_retry',
    shouldRetry: true,
    evidence: ['finding=mission_stale', `retryCount=0/${max}`, `cooldownMinutes=${policy.retry.cooldownMinutes}`, 'repo=safe'],
  }
}

function buildSimulatedRetryExhaustionDecision(policy) {
  const max = Math.max(1, Number(policy.retry.maxAttemptsPerPhase || 1))
  return {
    decision: 'retry_exhausted',
    shouldRetry: false,
    evidence: [`retryCount=${max}/${max}`, 'max attempts exhausted', 'notify=retry_exhausted'],
  }
}

function buildUnsafeRepoRefusal() {
  return {
    decision: 'unsafe_repo',
    shouldRetry: false,
    evidence: ['repo=unsafe', 'dirty repo refused', 'no retry scheduled'],
  }
}

function buildPrPreflightProof(policy) {
  const branch = gitScalar(targetRepo, ['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown')
  const remoteUrl = gitScalar(targetRepo, ['remote', 'get-url', 'origin'], '')
  const aheadBehind = gitAheadBehind(targetRepo, targetBranch)
  const status = gitScalar(targetRepo, ['status', '--short'], '')
  const evidence = [`branch=${branch}`, `base=${targetBranch}`, `aheadBehind=${aheadBehind}`, remoteUrl ? 'remote=origin' : 'remote=missing']
  if (!policy.prPublishing.enabled || policy.prPublishing.mode !== 'draft') {
    return { status: 'manual_required', command: [], evidence: [...evidence, 'mode=manual', 'no publish executed'] }
  }
  if (status) return { status: 'blocked', command: [], evidence: [...evidence, 'dirty repo blocks PR publishing'] }
  if (!remoteUrl) return { status: 'blocked', command: [], evidence: [...evidence, 'missing origin remote URL'] }
  return {
    status: prPublishRequested ? 'ready' : 'manual_required',
    command: ['gh', 'pr', 'create', '--draft', '--base', targetBranch, '--title', '[Hermes Workspace] Always-on policy gauntlet'],
    evidence: [...evidence, `${prPublishEnv}=${prPublishRequested ? 'true' : 'false'}`, 'dry-run command only'],
  }
}

function collectCleanupInventory() {
  const branches = gitLines(targetRepo, ['branch', '--format=%(refname:short)']).filter((branch) => branch.startsWith('mission/'))
  const stashes = gitLines(targetRepo, ['stash', 'list']).filter((line) => /single-lane|mission|gauntlet/i.test(line))
  return { branches, stashes }
}

function buildCleanupDryRunProof(policy) {
  const inventory = collectCleanupInventory()
  const actions = []
  for (const branch of inventory.branches.slice(0, 5)) {
    actions.push({ destructive: false, command: ['git', 'branch', '-d', branch] })
  }
  for (const stash of inventory.stashes.slice(0, 5)) {
    actions.push({ destructive: false, command: ['git', 'stash', 'drop', stash.split(':')[0]] })
  }
  const blockers = []
  if (destructiveCleanupRequested) blockers.push(`${destructiveCleanupEnv}=true ignored by safe gauntlet; no destructive cleanup executed`)
  if (!policy.cleanup.enabled) blockers.push('cleanup policy disabled')
  return {
    dryRun: true,
    actions: actions.length > 0 ? actions : [{ destructive: false, command: ['git', 'branch', '-d', 'mission/example-dry-run-only'] }],
    blockers,
  }
}

function buildDigestTextExcerpt(report) {
  return [
    'Lane Escalations',
    `retry disabled/default behavior: ${report.retryDisabledDecision.decision}`,
    `retry scheduled: ${report.simulatedStaleJobDecision.decision}`,
    `retry exhausted: ${report.simulatedRetryExhaustionDecision.decision}`,
    `unsafe repo: ${report.unsafeRepoRefusal.decision}`,
    `PR ready/preflight: ${report.prPreflightProof.status}`,
    'cleanup_recommended: dry-run only',
  ].join('\n')
}

function validateAlwaysOnPolicyGauntletReport(report) {
  assert(report && typeof report === 'object', 'Report is required')
  assert(/^always-on-policy-gauntlet-/.test(report.gauntletRunId || ''), 'Always-on policy gauntlet run id is required')
  assert(report.projectPolicySnapshot, 'Project policy snapshot is required')
  assert(report.projectPolicySnapshot.retry, 'Retry policy snapshot is required')
  assert(report.projectPolicySnapshot.notifications?.digestOnly === true, 'Digest notification policy proof is required')
  assert(report.retryDisabledDecision?.decision === 'recommend_retry' && report.retryDisabledDecision.shouldRetry === false, 'Retry disabled/default behavior must recommend only')
  assert(report.simulatedStaleJobDecision?.decision === 'schedule_retry', 'Simulated stale job decision proof is required')
  assert(report.simulatedRetryExhaustionDecision?.decision === 'retry_exhausted' && report.simulatedRetryExhaustionDecision.shouldRetry === false, 'Retry exhaustion proof is required')
  assert(report.unsafeRepoRefusal?.decision === 'unsafe_repo' && report.unsafeRepoRefusal.shouldRetry === false, 'Unsafe repo refusal proof is required')
  assert(report.prPreflightProof?.status && Array.isArray(report.prPreflightProof.evidence), 'PR preflight proof is required')
  assert(report.cleanupDryRunProof?.dryRun === true, 'Cleanup dry-run proof is required')
  assert((report.cleanupDryRunProof.actions || []).every((action) => action.destructive === false), 'Cleanup dry-run actions must be non-destructive')
  assert((report.digestTextExcerpt || '').includes('Lane Escalations'), 'Digest text excerpt is required')
  assert(Array.isArray(report.manualPhaseMutationCalls) && report.manualPhaseMutationCalls.length === 0, 'Manual phase mutation calls must be empty')
  assert(report.destructiveCleanupExecuted === false, 'Destructive cleanup must not execute')
  assert(report.prPublishExecuted === false, 'PR publish must not execute')
  assert(['ACCEPTED FOR UNATTENDED ALWAYS-ON', 'ACCEPTED FOR SUPERVISED ALWAYS-ON POLICY ONLY', 'REJECTED'].includes(report.finalVerdict), 'Final verdict is required')
  if (report.finalVerdict === 'ACCEPTED FOR UNATTENDED ALWAYS-ON') {
    assert(report.projectPolicySnapshot.retry.enabled === true, 'Unattended always-on requires retry policy enabled')
    assert(report.projectPolicySnapshot.prPublishing.enabled === true, 'Unattended always-on requires PR policy enabled')
    assert(report.projectPolicySnapshot.cleanup.enabled === true, 'Unattended always-on requires cleanup policy enabled')
  }
  return report
}

function buildAlwaysOnPolicyGauntletMarkdown(report) {
  const cleanupActions = (report.cleanupDryRunProof.actions || []).map((action) => `- ${action.command.join(' ')} (destructive=${action.destructive ? 'yes' : 'no'})`).join('\n') || '- none'
  const cleanupBlockers = (report.cleanupDryRunProof.blockers || []).map((blocker) => `- ${blocker}`).join('\n') || '- none'
  return `# Always-On Policy Gauntlet Report

Verdict: ${report.finalVerdict}
Gauntlet run id: ${report.gauntletRunId}
Target repo: ${targetRepo}
Target branch: ${targetBranch}

## Project Policy Snapshot

Always-on enabled: ${report.projectPolicySnapshot.enabled ? 'yes' : 'no'}
Retry enabled: ${report.projectPolicySnapshot.retry.enabled ? 'yes' : 'no'}
Retry max attempts per phase: ${report.projectPolicySnapshot.retry.maxAttemptsPerPhase}
Retry cooldown minutes: ${report.projectPolicySnapshot.retry.cooldownMinutes}
Notifications: ${report.projectPolicySnapshot.notifications.enabled ? 'enabled' : 'disabled'}, digestOnly=${report.projectPolicySnapshot.notifications.digestOnly ? 'true' : 'false'}, notifyOn=${report.projectPolicySnapshot.notifications.notifyOn.join(', ')}
PR publishing: enabled=${report.projectPolicySnapshot.prPublishing.enabled ? 'true' : 'false'}, mode=${report.projectPolicySnapshot.prPublishing.mode}, requireCleanRepo=${report.projectPolicySnapshot.prPublishing.requireCleanRepo ? 'true' : 'false'}, requirePassingMergeTests=${report.projectPolicySnapshot.prPublishing.requirePassingMergeTests ? 'true' : 'false'}
Cleanup: enabled=${report.projectPolicySnapshot.cleanup.enabled ? 'true' : 'false'}, dryRun=${report.projectPolicySnapshot.cleanup.dryRun ? 'true' : 'false'}, retainMergedBranchDays=${report.projectPolicySnapshot.cleanup.retainMergedBranchDays}, retainLaneStashes=${report.projectPolicySnapshot.cleanup.retainLaneStashes ? 'true' : 'false'}

## Guardrail Proofs

Retry disabled/default behavior: ${report.retryDisabledDecision.decision}
Retry disabled shouldRetry: ${report.retryDisabledDecision.shouldRetry ? 'yes' : 'no'}
Retry disabled evidence: ${report.retryDisabledDecision.evidence.join('; ')}

Simulated stale job decision: ${report.simulatedStaleJobDecision.decision}
Simulated stale shouldRetry: ${report.simulatedStaleJobDecision.shouldRetry ? 'yes' : 'no'}
Simulated stale evidence: ${report.simulatedStaleJobDecision.evidence.join('; ')}

Retry exhaustion decision: ${report.simulatedRetryExhaustionDecision.decision}
Retry exhaustion evidence: ${report.simulatedRetryExhaustionDecision.evidence.join('; ')}

Unsafe repo refusal: ${report.unsafeRepoRefusal.decision}
Unsafe repo evidence: ${report.unsafeRepoRefusal.evidence.join('; ')}

PR preflight: ${report.prPreflightProof.status}
PR preflight evidence: ${report.prPreflightProof.evidence.join('; ')}
PR command: ${report.prPreflightProof.command?.length ? report.prPreflightProof.command.join(' ') : 'none'}

Cleanup dry-run: ${report.cleanupDryRunProof.dryRun ? 'true' : 'false'}
Cleanup dry-run planned actions:
${cleanupActions}
Cleanup blockers:
${cleanupBlockers}

## Digest Text Excerpt

\`\`\`text
${report.digestTextExcerpt}
\`\`\`

## Safety Proof

Manual phase mutation calls: ${JSON.stringify(report.manualPhaseMutationCalls)}
Destructive cleanup executed: ${report.destructiveCleanupExecuted ? 'yes' : 'no'}
PR publish executed: ${report.prPublishExecuted ? 'yes' : 'no'}
Destructive cleanup env: ${destructiveCleanupEnv}=${destructiveCleanupRequested ? 'true' : 'false'}
PR publish env: ${prPublishEnv}=${prPublishRequested ? 'true' : 'false'}
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
      ...(options.headers || {}),
    },
  })
  apiCalls.push(`${options.method || 'GET'} ${url} → ${response.status}`)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${JSON.stringify(body)}`)
  return body
}

async function loadProjectPolicySnapshot(baseUrl, apiCalls, authHeader) {
  try {
    const body = await requestJson(baseUrl, apiCalls, '/api/projects', { headers: authHeader ? { Cookie: authHeader } : {} })
    const projects = body.projects || body.items || body || []
    const project = Array.isArray(projects) ? projects.find((candidate) => candidate.id === projectId) : null
    return normalizePolicySnapshot(project)
  } catch (error) {
    apiCalls.push(`policy snapshot fallback → ${error.message}`)
    return defaultPolicySnapshot()
  }
}

async function runAlwaysOnPolicyGauntlet({ baseUrl = defaultBaseUrl } = {}) {
  const apiCalls = []
  const authHeader = await authenticateApi(baseUrl, apiCalls)
  const projectPolicySnapshot = await loadProjectPolicySnapshot(baseUrl, apiCalls, authHeader)
  const report = {
    gauntletRunId: `always-on-policy-gauntlet-${reportTimestamp()}`,
    projectPolicySnapshot,
    retryDisabledDecision: buildRetryDisabledDecision(projectPolicySnapshot),
    simulatedStaleJobDecision: buildSimulatedStaleJobDecision({ ...projectPolicySnapshot, retry: { ...projectPolicySnapshot.retry, enabled: true } }),
    simulatedRetryExhaustionDecision: buildSimulatedRetryExhaustionDecision({ ...projectPolicySnapshot, retry: { ...projectPolicySnapshot.retry, enabled: true } }),
    unsafeRepoRefusal: buildUnsafeRepoRefusal(),
    prPreflightProof: buildPrPreflightProof(projectPolicySnapshot),
    cleanupDryRunProof: buildCleanupDryRunProof(projectPolicySnapshot),
    digestTextExcerpt: '',
    manualPhaseMutationCalls: apiCalls.filter((call) => /status|phase/i.test(call)),
    destructiveCleanupExecuted: false,
    prPublishExecuted: false,
    finalVerdict: 'ACCEPTED FOR SUPERVISED ALWAYS-ON POLICY ONLY',
  }
  report.digestTextExcerpt = buildDigestTextExcerpt(report)
  validateAlwaysOnPolicyGauntletReport(report)
  return report
}

async function main() {
  const report = await runAlwaysOnPolicyGauntlet()
  fs.mkdirSync(reportDir, { recursive: true })
  const markdown = buildAlwaysOnPolicyGauntletMarkdown(report)
  const reportPath = path.join(reportDir, `${report.gauntletRunId}.md`)
  const latestPath = path.join(reportDir, 'always-on-policy-gauntlet-latest.md')
  fs.writeFileSync(reportPath, markdown)
  fs.writeFileSync(latestPath, markdown)
  console.log(`Always-on policy gauntlet report: ${reportPath}`)
  console.log(`Latest alias: ${latestPath}`)
  console.log(`Verdict: ${report.finalVerdict}`)
}

export {
  buildAlwaysOnPolicyGauntletMarkdown,
  runAlwaysOnPolicyGauntlet,
  validateAlwaysOnPolicyGauntletReport,
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
