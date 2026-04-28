import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const lifecycleScriptUrl = pathToFileURL(join(process.cwd(), 'scripts/mission-control-work-item-e2e.mjs')).href
const autonomousScriptPath = join(process.cwd(), 'scripts/mission-control-autonomous-work-item-e2e.mjs')
const autonomousScriptUrl = pathToFileURL(autonomousScriptPath).href
const singleLaneScriptPath = join(process.cwd(), 'scripts/mission-control-single-lane-autonomy-e2e.mjs')
const singleLaneScriptUrl = pathToFileURL(singleLaneScriptPath).href
const sequentialGauntletScriptPath = join(process.cwd(), 'scripts/mission-control-single-lane-sequential-gauntlet.mjs')
const sequentialGauntletScriptUrl = pathToFileURL(sequentialGauntletScriptPath).href
const alwaysOnPolicyGauntletScriptPath = join(process.cwd(), 'scripts/mission-control-always-on-policy-gauntlet.mjs')
const alwaysOnPolicyGauntletScriptUrl = pathToFileURL(alwaysOnPolicyGauntletScriptPath).href

type WorkItemE2eReport = {
  e2eRunId: string
  createdWorkItemIds: Array<string>
  workItemId: string
  transitions: Array<{ name: string; workItemId: string; status: string; phase?: string }>
  finalInboxCheck: { workItemIdStillInInbox: boolean; sameRunInboxItemIds: Array<string> }
  extraE2eItemsCreated: Array<string>
  finalPersistedStatus: string
}

type AutonomousWorkItemE2eReport = {
  e2eRunId: string
  createdWorkItemIds: Array<string>
  workItemId: string
  manualPhaseMutationCalls: Array<string>
  orchestratorEvents: Array<{ action: string; workItemId: string }>
  candidateRepo: { changedFiles: Array<string>; beforeStatus: string; afterStatus: string }
  finalWorkItem: { status: string; phase?: string }
}

type SingleLaneAutonomyE2eReport = {
  e2eRunId: string
  mode: 'fresh' | 'resume'
  createdWorkItemIds: Array<string>
  workItemId: string
  manualPhaseMutationCalls: Array<string>
  orchestratorEvents: Array<{ action: string; workItemId: string }>
  lane: {
    branchCreated: boolean
    branchName: string
    expectedBranchName: string
    baseBranch: string
    plannerLaunchedAfterLaneEntry: boolean
  }
  candidateRepo: {
    initialBranch: string
    beforeStatus: string
    afterStatus: string
    changedFiles: Array<string>
    testsPassed: boolean
  }
  repoHygiene: {
    beforeBranch: string
    afterBranch: string
    beforeDirtyStatus: string
    afterDirtyStatus: string
    checkoutAttempted: boolean
    checkoutResult: string
    currentBranch?: string
    baseBranch?: string
    featureBranch?: string
    untrackedFiles?: Array<string>
    localBranchesCreatedByLane?: Array<string>
    stashIdsCreatedByLane?: Array<string>
    aheadBehind?: string
    prUrl?: string
    cleanupBranchDeletionEnabled?: boolean
    findings: Array<string>
  }
  mergeHealer: { ran: boolean; mergeState: string; mergeCommit?: string }
  finalWorkItem: { status: string; phase?: string; laneState?: string }
}

type AlwaysOnPolicyGauntletReport = {
  gauntletRunId: string
  projectPolicySnapshot: {
    enabled: boolean
    retry: { enabled: boolean; maxAttemptsPerPhase: number; cooldownMinutes: number }
    notifications: { enabled: boolean; digestOnly: boolean; notifyOn: Array<string> }
    prPublishing: { enabled: boolean; mode: string; requireCleanRepo: boolean; requirePassingMergeTests: boolean }
    cleanup: { enabled: boolean; dryRun: boolean; retainMergedBranchDays: number; retainLaneStashes: boolean }
  }
  retryDisabledDecision: { decision: string; shouldRetry: boolean; evidence: Array<string> }
  simulatedStaleJobDecision: { decision: string; shouldRetry: boolean; evidence: Array<string> }
  simulatedRetryExhaustionDecision: { decision: string; shouldRetry: boolean; evidence: Array<string> }
  unsafeRepoRefusal: { decision: string; shouldRetry: boolean; evidence: Array<string> }
  prPreflightProof: { status: string; command?: Array<string>; evidence: Array<string> }
  cleanupDryRunProof: { dryRun: boolean; actions: Array<{ destructive: boolean; command: Array<string> }>; blockers: Array<string> }
  digestTextExcerpt: string
  manualPhaseMutationCalls: Array<string>
  destructiveCleanupExecuted: boolean
  prPublishExecuted: boolean
  finalVerdict: string
}

type SequentialGauntletReport = {
  gauntletRunId: string
  createdWorkItemIds: Array<string>
  manualPhaseMutationCalls: Array<string>
  maxConcurrentActiveLaneItems: number
  itemProofs: Array<{
    workItemId: string
    branchName: string
    laneEnteredAt: string
    plannerLaunchedAt: string
    builderLaunchedAt: string
    mergeCompletedAt: string
    finalStatus: string
    finalLaneState: string
    mergeState: string
    mergeCommit?: string
  }>
  sequencingProof: Array<{ previousWorkItemId: string; nextWorkItemId: string; previousDoneOrParkedAt: string; nextBuildStartedAt: string }>
  finalWorkItems: Array<{ id: string; status: string; laneState?: string; mergeState?: string }>
  repoHygiene?: {
    beforeBranch: string
    afterBranch: string
    beforeDirtyStatus: string
    afterDirtyStatus: string
    checkoutAttempted?: boolean
    checkoutResult?: string
    currentBranch?: string
    baseBranch?: string
    featureBranch?: string
    untrackedFiles?: Array<string>
    localBranchesCreatedByLane?: Array<string>
    stashIdsCreatedByLane?: Array<string>
    aheadBehind?: string
    prUrl?: string
    cleanupBranchDeletionEnabled?: boolean
    findings?: Array<string>
  }
}

function validReport(overrides: Partial<WorkItemE2eReport> = {}): WorkItemE2eReport {
  const workItemId = overrides.workItemId ?? 'wi-e2e-1'
  return {
    e2eRunId: 'work-item-e2e-2026-04-27T17-00-00-000Z',
    createdWorkItemIds: [workItemId],
    workItemId,
    transitions: [
      { name: 'created-inbox', workItemId, status: 'inbox', phase: 'research' },
      { name: 'ready-after-auto-approval', workItemId, status: 'ready' },
      { name: 'active-build', workItemId, status: 'active', phase: 'build' },
      { name: 'active-review', workItemId, status: 'active', phase: 'review' },
      { name: 'active-deploy', workItemId, status: 'active', phase: 'deploy' },
      { name: 'done', workItemId, status: 'done' },
    ],
    finalInboxCheck: { workItemIdStillInInbox: false, sameRunInboxItemIds: [] },
    extraE2eItemsCreated: [],
    finalPersistedStatus: 'done',
    ...overrides,
  }
}

function validAutonomousReport(
  overrides: Partial<AutonomousWorkItemE2eReport> = {},
): AutonomousWorkItemE2eReport {
  const workItemId = overrides.workItemId ?? 'wi-autonomy-1'
  return {
    e2eRunId: 'autonomous-work-item-e2e-2026-04-27T17-00-00-000Z',
    createdWorkItemIds: [workItemId],
    workItemId,
    manualPhaseMutationCalls: [],
    orchestratorEvents: [
      { action: 'launch_planner', workItemId },
      { action: 'ingest_planner_output', workItemId },
      { action: 'accept_planning_draft', workItemId },
      { action: 'launch_builder', workItemId },
      { action: 'sync_execution', workItemId },
    ],
    candidateRepo: {
      beforeStatus: '',
      afterStatus: ' M lib/quick-capture.ts\n M tests/quick-capture.test.ts',
      changedFiles: ['lib/quick-capture.ts', 'tests/quick-capture.test.ts'],
    },
    finalWorkItem: { status: 'done' },
    ...overrides,
  }
}

function validSingleLaneReport(overrides: Partial<SingleLaneAutonomyE2eReport> = {}): SingleLaneAutonomyE2eReport {
  const workItemId = overrides.workItemId ?? '84bfe2c2-e899-437a-8a6c-a6fa9884886d'
  const expectedBranchName = `mission/${workItemId.slice(0, 8)}-single-lane-e2e-code-delivery`
  return {
    e2eRunId: 'single-lane-autonomy-e2e-2026-04-28T00-00-00-000Z',
    mode: 'fresh',
    createdWorkItemIds: [workItemId],
    workItemId,
    manualPhaseMutationCalls: [],
    orchestratorEvents: [
      { action: 'launch_planner', workItemId },
      { action: 'ingest_planner_output', workItemId },
      { action: 'launch_builder', workItemId },
      { action: 'sync_execution', workItemId },
      { action: 'run_merge_healer', workItemId },
    ],
    lane: {
      branchCreated: true,
      branchName: expectedBranchName,
      expectedBranchName,
      baseBranch: 'test-hermes-workspace',
      plannerLaunchedAfterLaneEntry: true,
    },
    candidateRepo: {
      initialBranch: 'test-hermes-workspace',
      beforeStatus: '',
      afterStatus: '',
      changedFiles: ['lib/quick-capture.ts', 'tests/quick-capture.test.ts'],
      testsPassed: true,
    },
    repoHygiene: {
      beforeBranch: 'test-hermes-workspace',
      afterBranch: 'test-hermes-workspace',
      beforeDirtyStatus: '',
      afterDirtyStatus: '',
      checkoutAttempted: true,
      checkoutResult: 'Already on target base branch test-hermes-workspace.',
      currentBranch: 'test-hermes-workspace',
      baseBranch: 'test-hermes-workspace',
      featureBranch: expectedBranchName,
      untrackedFiles: [],
      localBranchesCreatedByLane: [expectedBranchName],
      stashIdsCreatedByLane: [],
      aheadBehind: 'ahead 1',
      prUrl: null as unknown as string,
      cleanupBranchDeletionEnabled: false,
      findings: [],
    },
    mergeHealer: { ran: true, mergeState: 'merged', mergeCommit: 'abc1234' },
    finalWorkItem: { status: 'done', phase: 'deploy', laneState: 'done' },
    ...overrides,
  }
}

function validSequentialGauntletReport(overrides: Partial<SequentialGauntletReport> = {}): SequentialGauntletReport {
  const ids = overrides.createdWorkItemIds ?? ['gauntlet-1', 'gauntlet-2', 'gauntlet-3']
  const itemProofs = ids.map((workItemId, index) => ({
    workItemId,
    branchName: `mission/${workItemId.slice(0, 8)}-sequential-lane-gauntlet-${index + 1}`,
    laneEnteredAt: `2026-04-28T00:0${index}:00.000Z`,
    plannerLaunchedAt: `2026-04-28T00:0${index}:05.000Z`,
    builderLaunchedAt: `2026-04-28T00:0${index}:10.000Z`,
    mergeCompletedAt: `2026-04-28T00:0${index}:50.000Z`,
    finalStatus: 'done',
    finalLaneState: 'done',
    mergeState: 'merged',
    mergeCommit: `merge-${index + 1}`,
  }))
  return {
    gauntletRunId: 'single-lane-sequential-gauntlet-2026-04-28T00-00-00-000Z',
    createdWorkItemIds: ids,
    manualPhaseMutationCalls: [],
    maxConcurrentActiveLaneItems: 1,
    itemProofs,
    sequencingProof: [
      { previousWorkItemId: ids[0], nextWorkItemId: ids[1], previousDoneOrParkedAt: itemProofs[0].mergeCompletedAt, nextBuildStartedAt: itemProofs[1].builderLaunchedAt },
      { previousWorkItemId: ids[1], nextWorkItemId: ids[2], previousDoneOrParkedAt: itemProofs[1].mergeCompletedAt, nextBuildStartedAt: itemProofs[2].builderLaunchedAt },
    ],
    finalWorkItems: ids.map((id) => ({ id, status: 'done', laneState: 'done', mergeState: 'merged' })),
    repoHygiene: {
      beforeBranch: 'test-hermes-workspace',
      afterBranch: 'test-hermes-workspace',
      beforeDirtyStatus: '',
      afterDirtyStatus: '',
      checkoutResult: 'Already on target base branch test-hermes-workspace.',
      currentBranch: 'test-hermes-workspace',
      baseBranch: 'test-hermes-workspace',
      untrackedFiles: [],
      localBranchesCreatedByLane: itemProofs.map((item) => item.branchName),
      stashIdsCreatedByLane: [],
      aheadBehind: 'ahead 3',
      prUrl: '',
      cleanupBranchDeletionEnabled: false,
      findings: [],
    },
    ...overrides,
  }
}

function validAlwaysOnPolicyGauntletReport(
  overrides: Partial<AlwaysOnPolicyGauntletReport> = {},
): AlwaysOnPolicyGauntletReport {
  return {
    gauntletRunId: 'always-on-policy-gauntlet-2026-04-28T00-00-00-000Z',
    projectPolicySnapshot: {
      enabled: false,
      retry: { enabled: false, maxAttemptsPerPhase: 1, cooldownMinutes: 30 },
      notifications: {
        enabled: true,
        digestOnly: true,
        notifyOn: ['blocked', 'retry_exhausted', 'unsafe_repo', 'pr_ready', 'cleanup_recommended'],
      },
      prPublishing: { enabled: false, mode: 'manual', requireCleanRepo: true, requirePassingMergeTests: true },
      cleanup: { enabled: false, dryRun: true, retainMergedBranchDays: 30, retainLaneStashes: true },
    },
    retryDisabledDecision: {
      decision: 'recommend_retry',
      shouldRetry: false,
      evidence: ['policy=disabled', 'retry=disabled'],
    },
    simulatedStaleJobDecision: {
      decision: 'schedule_retry',
      shouldRetry: true,
      evidence: ['finding=mission_stale', 'retryCount=0/1', 'repo=safe'],
    },
    simulatedRetryExhaustionDecision: {
      decision: 'retry_exhausted',
      shouldRetry: false,
      evidence: ['retryCount=1/1', 'max attempts exhausted'],
    },
    unsafeRepoRefusal: {
      decision: 'unsafe_repo',
      shouldRetry: false,
      evidence: ['repo=unsafe', 'dirty repo refused'],
    },
    prPreflightProof: {
      status: 'manual_required',
      command: [],
      evidence: ['ahead 15', 'mode=manual', 'no publish executed'],
    },
    cleanupDryRunProof: {
      dryRun: true,
      actions: [{ destructive: false, command: ['git', 'branch', '-d', 'mission/example'] }],
      blockers: [],
    },
    digestTextExcerpt: 'Lane Escalations\nretry_exhausted\nunsafe_repo\ncleanup_recommended',
    manualPhaseMutationCalls: [],
    destructiveCleanupExecuted: false,
    prPublishExecuted: false,
    finalVerdict: 'ACCEPTED FOR SUPERVISED ALWAYS-ON POLICY ONLY',
    ...overrides,
  }
}

describe('always-on policy gauntlet script contract', () => {
  it('reports policy guardrail proofs without manual lifecycle movement, destructive cleanup, or PR publishing', () => {
    const source = readFileSync(alwaysOnPolicyGauntletScriptPath, 'utf8')

    expect(source).toContain('always-on-policy-gauntlet')
    expect(source).toContain('projectPolicySnapshot')
    expect(source).toContain('retryDisabledDecision')
    expect(source).toContain('simulatedStaleJobDecision')
    expect(source).toContain('simulatedRetryExhaustionDecision')
    expect(source).toContain('unsafeRepoRefusal')
    expect(source).toContain('prPreflightProof')
    expect(source).toContain('cleanupDryRunProof')
    expect(source).toContain('digestTextExcerpt')
    expect(source).toContain('manualPhaseMutationCalls')
    expect(source).toContain('destructiveCleanupExecuted')
    expect(source).toContain('prPublishExecuted')
    expect(source).toContain('HERMES_ALWAYS_ON_POLICY_ENABLE_DESTRUCTIVE_CLEANUP')
    expect(source).toContain('HERMES_ALWAYS_ON_POLICY_ENABLE_PR_PUBLISH')

    expect(source).not.toMatch(/\/lifecycle/)
    expect(source).not.toMatch(/method:\s*['"]PATCH['"][\s\S]{0,240}(status|phase)/)
    expect(source).not.toMatch(/git\([^\)]*['"]worktree['"]/)
  })

  it('validates safe always-on policy evidence and final supervised verdict', async () => {
    const { validateAlwaysOnPolicyGauntletReport } = await import(`${alwaysOnPolicyGauntletScriptUrl}?contract-validator`)
    const report = validAlwaysOnPolicyGauntletReport()

    expect(validateAlwaysOnPolicyGauntletReport(report)).toBe(report)
    expect(report.manualPhaseMutationCalls).toEqual([])
    expect(report.destructiveCleanupExecuted).toBe(false)
    expect(report.prPublishExecuted).toBe(false)
    expect(report.finalVerdict).toBe('ACCEPTED FOR SUPERVISED ALWAYS-ON POLICY ONLY')
  })

  it('rejects unsafe or incomplete always-on policy gauntlet evidence', async () => {
    const { validateAlwaysOnPolicyGauntletReport } = await import(`${alwaysOnPolicyGauntletScriptUrl}?contract-rejections`)
    const report = validAlwaysOnPolicyGauntletReport()

    expect(() => validateAlwaysOnPolicyGauntletReport({ ...report, manualPhaseMutationCalls: ['PATCH /api/work-items/wi'] })).toThrow(/manual phase/i)
    expect(() => validateAlwaysOnPolicyGauntletReport({ ...report, destructiveCleanupExecuted: true })).toThrow(/destructive cleanup/i)
    expect(() => validateAlwaysOnPolicyGauntletReport({ ...report, prPublishExecuted: true })).toThrow(/PR publish/i)
    expect(() => validateAlwaysOnPolicyGauntletReport({ ...report, unsafeRepoRefusal: { ...report.unsafeRepoRefusal, shouldRetry: true } })).toThrow(/unsafe repo/i)
    expect(() => validateAlwaysOnPolicyGauntletReport({ ...report, cleanupDryRunProof: { ...report.cleanupDryRunProof, dryRun: false } })).toThrow(/dry-run/i)
    expect(() => validateAlwaysOnPolicyGauntletReport({ ...report, digestTextExcerpt: '' })).toThrow(/digest/i)
  })

  it('builds final always-on policy markdown with guardrails and verdict', async () => {
    const { buildAlwaysOnPolicyGauntletMarkdown } = await import(`${alwaysOnPolicyGauntletScriptUrl}?contract-markdown`)
    const report = validAlwaysOnPolicyGauntletReport()
    const markdown = buildAlwaysOnPolicyGauntletMarkdown(report)

    expect(markdown).toContain('# Always-On Policy Gauntlet Report')
    expect(markdown).toContain('Verdict: ACCEPTED FOR SUPERVISED ALWAYS-ON POLICY ONLY')
    expect(markdown).toContain('Retry disabled/default behavior: recommend_retry')
    expect(markdown).toContain('Simulated stale job decision: schedule_retry')
    expect(markdown).toContain('Retry exhaustion decision: retry_exhausted')
    expect(markdown).toContain('Unsafe repo refusal: unsafe_repo')
    expect(markdown).toContain('PR preflight: manual_required')
    expect(markdown).toContain('Cleanup dry-run: true')
    expect(markdown).toContain('Manual phase mutation calls: []')
    expect(markdown).toContain('Destructive cleanup executed: no')
    expect(markdown).toContain('PR publish executed: no')
  })
})

describe('single-lane sequential gauntlet script contract', () => {
  it('uses three queued work items, orchestrator polling, and forbids manual lifecycle/PATCH phase movement', () => {
    const source = readFileSync(sequentialGauntletScriptPath, 'utf8')

    expect(source).toContain('single-lane-sequential-gauntlet')
    expect(source).toContain('createdWorkItemIds.length === 3')
    expect(source).toContain('maxConcurrentActiveLaneItems')
    expect(source).toContain('/api/work-items/orchestrator/reconcile')
    expect(source).toContain('syncExecution=true')
    expect(source).toContain('autonomyLanePolicy')
    expect(source).toContain('checkpointCandidateRepoDirt')
    expect(source).toContain('HERMES_SINGLE_LANE_GAUNTLET_RUN_ID')
    expect(source).toContain('resumeGauntletItems')
    expect(source).toContain('mode')
    expect(source).toContain('laneEnteredAt')
    expect(source).toContain('plannerLaunchedAt')
    expect(source).toContain('builderLaunchedAt')
    expect(source).toContain('mergeCompletedAt')
    expect(source).toContain('localBranchesCreatedByLane')
    expect(source).toContain('stashIdsCreatedByLane')
    expect(source).toContain('aheadBehind')
    expect(source).toContain('untrackedFiles')
    expect(source).toContain('HERMES_SINGLE_LANE_GAUNTLET_CLEANUP_BRANCHES')
    expect(source).toContain('ahead of origin')

    expect(source).not.toMatch(/\/lifecycle/)
    expect(source).not.toMatch(/method:\s*['"]PATCH['"][\s\S]{0,240}status/)
    expect(source).not.toMatch(/git\([^\)]*['"]worktree['"]/) 
  })

  it('validates exactly three sequential done lane items without hidden parallelism', async () => {
    const { validateSingleLaneSequentialGauntletReport } = await import(`${sequentialGauntletScriptUrl}?contract-validator`)
    const report = validSequentialGauntletReport()

    expect(validateSingleLaneSequentialGauntletReport(report)).toBe(report)
    expect(report.createdWorkItemIds).toHaveLength(3)
    expect(report.maxConcurrentActiveLaneItems).toBe(1)
  })

  it('rejects non-sequential, parallel, incomplete, or manually mutated reports', async () => {
    const { validateSingleLaneSequentialGauntletReport } = await import(`${sequentialGauntletScriptUrl}?contract-rejections`)
    const report = validSequentialGauntletReport()

    expect(() => validateSingleLaneSequentialGauntletReport({ ...report, createdWorkItemIds: report.createdWorkItemIds.slice(0, 2) })).toThrow(/three/i)
    expect(() => validateSingleLaneSequentialGauntletReport({ ...report, createdWorkItemIds: ['gauntlet-1', 'gauntlet-1', 'gauntlet-3'] })).toThrow(/distinct/i)
    expect(() => validateSingleLaneSequentialGauntletReport({ ...report, maxConcurrentActiveLaneItems: 2 })).toThrow(/parallel/i)
    expect(() => validateSingleLaneSequentialGauntletReport({ ...report, manualPhaseMutationCalls: ['PATCH /api/work-items/gauntlet-1'] })).toThrow(/manual phase/i)
    expect(() => validateSingleLaneSequentialGauntletReport({ ...report, blockers: ['work item blocked'] })).toThrow(/blockers/i)
    expect(() => validateSingleLaneSequentialGauntletReport({ ...report, finalWorkItems: report.finalWorkItems.map((item, index) => (index === 0 ? { ...item, status: 'blocked', laneState: 'blocked' } : item)) })).toThrow(/done/i)
    expect(() => validateSingleLaneSequentialGauntletReport({ ...report, sequencingProof: [] })).toThrow(/sequential/i)
    expect(() => validateSingleLaneSequentialGauntletReport({ ...report, sequencingProof: [...report.sequencingProof].reverse() })).toThrow(/ordered/i)
  })

  it('builds sequential gauntlet markdown with item and ordering evidence', async () => {
    const { buildSingleLaneSequentialGauntletMarkdown } = await import(`${sequentialGauntletScriptUrl}?contract-markdown`)
    const report = validSequentialGauntletReport()
    const markdown = buildSingleLaneSequentialGauntletMarkdown(report)

    expect(markdown).toContain('# Single-Lane Sequential Gauntlet Report')
    expect(markdown).toContain('Verdict: PASS')
    expect(markdown).toContain('Created work item ids: ["gauntlet-1","gauntlet-2","gauntlet-3"]')
    expect(markdown).toContain('Max concurrent active lane items: 1')
    expect(markdown).toContain('Local lane branches: mission/gauntlet-sequential-lane-gauntlet-1')
    expect(markdown).toContain('Stash backups: none')
    expect(markdown).toContain('Ahead/behind: ahead 3')
    expect(markdown).toContain('| gauntlet-1 |')
    expect(markdown).toContain('| gauntlet-1 | gauntlet-2 |')
  })
})

describe('branch-based single-lane autonomy E2E script contract', () => {
  it('uses canonical repo branch lane APIs and never manual lifecycle/PATCH phase movement or worktrees', () => {
    const source = readFileSync(singleLaneScriptPath, 'utf8')

    expect(source).toContain('process.env.HERMES_SINGLE_LANE_E2E_TARGET_REPO')
    expect(source).toContain('process.env.HERMES_SINGLE_LANE_E2E_TARGET_BRANCH')
    expect(source).toContain('process.env.HERMES_SINGLE_LANE_E2E_WORK_ITEM_ID')
    expect(source).toContain('historyEventsForReport')
    expect(source).toContain('gitChangedFilesForCommit')
    expect(source).toContain('autonomyLanePolicy')
    expect(source).toContain('/api/work-items/orchestrator/reconcile')
    expect(source).toContain('syncExecution=true')
    expect(source).toContain('expectedBranchName')
    expect(source).toContain('gitChangedFilesSince')
    expect(source).toContain('createdWorkItemIds.length === 1')
    expect(source).toContain('mode')
    expect(source).toContain('repoHygiene')
    expect(source).toContain('active non-terminal')
    expect(source).toContain('checkout')
    expect(source).toContain('HERMES_SINGLE_LANE_E2E_ALLOW_NON_E2E_RESUME')
    expect(source).toContain('HERMES_SINGLE_LANE_E2E_CLEANUP_BRANCHES')
    expect(source).toContain('localBranchesCreatedByLane')
    expect(source).toContain('stashIdsCreatedByLane')
    expect(source).toContain('aheadBehind')
    expect(source).toContain('untrackedFiles')
    expect(source).toContain('PR URL')
    expect(source).toContain('ahead of origin')

    expect(source).not.toMatch(/\/api\/work-items\/\$\{workItemId\}\/lifecycle/)
    expect(source).not.toMatch(/method:\s*['"]PATCH['"][\s\S]{0,240}\/api\/work-items\/[\s\S]{0,240}(status|phase)/)
    expect(source).not.toMatch(/git\([^\)]*['"]worktree['"]/) 
  })

  it('validates a same-work-item PASS with branch, product/test evidence, tests, and Merge-Healer integration', async () => {
    const { validateSingleLaneAutonomyE2eReport } = await import(`${singleLaneScriptUrl}?contract-validator`)
    const report = validSingleLaneReport()

    expect(validateSingleLaneAutonomyE2eReport(report)).toBe(report)
    expect(report.mode).toBe('fresh')
    expect(report.createdWorkItemIds).toHaveLength(1)
    expect(report.manualPhaseMutationCalls).toEqual([])
    expect(report.lane.branchName).toBe(report.lane.expectedBranchName)
    expect(report.finalWorkItem).toMatchObject({ status: 'done', laneState: 'done' })
  })

  it('rejects reports without branch lane proof, product/test diff, passing tests, merge healer, or done final state', async () => {
    const { validateSingleLaneAutonomyE2eReport } = await import(`${singleLaneScriptUrl}?contract-rejections`)

    expect(() => validateSingleLaneAutonomyE2eReport(validSingleLaneReport({ manualPhaseMutationCalls: ['PATCH /api/work-items/wi'] }))).toThrow(/manual phase mutation/i)
    expect(() => validateSingleLaneAutonomyE2eReport(validSingleLaneReport({ lane: { ...validSingleLaneReport().lane, branchCreated: false } }))).toThrow(/feature branch/i)
    expect(() => validateSingleLaneAutonomyE2eReport(validSingleLaneReport({ candidateRepo: { ...validSingleLaneReport().candidateRepo, changedFiles: ['docs/plan.md'] } }))).toThrow(/product.*test/i)
    expect(() => validateSingleLaneAutonomyE2eReport(validSingleLaneReport({ candidateRepo: { ...validSingleLaneReport().candidateRepo, testsPassed: false } }))).toThrow(/tests passed/i)
    expect(() => validateSingleLaneAutonomyE2eReport(validSingleLaneReport({ mergeHealer: { ran: true, mergeState: 'conflict' } }))).toThrow(/merge-healer/i)
    expect(() => validateSingleLaneAutonomyE2eReport(validSingleLaneReport({ finalWorkItem: { status: 'blocked', laneState: 'blocked' } }))).toThrow(/done/i)
  })

  it('builds branch-based single-lane markdown with PASS criteria and blocker evidence', async () => {
    const { buildSingleLaneAutonomyE2eMarkdown } = await import(`${singleLaneScriptUrl}?contract-markdown`)
    const report = validSingleLaneReport()
    const markdown = buildSingleLaneAutonomyE2eMarkdown(report)

    expect(markdown).toContain('# Branch-Based Single-Lane Autonomy E2E Report')
    expect(markdown).toContain('Verdict: PASS')
    expect(markdown).toContain('Mode: fresh')
    expect(markdown).toContain('Manual phase mutation calls: []')
    expect(markdown).toContain(`Feature branch: ${report.lane.branchName}`)
    expect(markdown).toContain('Merge-Healer: merged')
    expect(markdown).toContain('Checkout result: Already on target base branch test-hermes-workspace.')
    expect(markdown).toContain('Local lane branches: mission/84bfe2c2-single-lane-e2e-code-delivery')
    expect(markdown).toContain('Stash backups: none')
    expect(markdown).toContain('Ahead/behind: ahead 1')
    expect(markdown).toContain('PR URL: none')
    expect(markdown).toContain('Branch cleanup deletion enabled: no')
    expect(markdown).toContain('Repo hygiene findings: none')
    expect(markdown).toContain('- lib/quick-capture.ts')
    expect(markdown).toContain('- tests/quick-capture.test.ts')
  })
})

describe('autonomous work item E2E script contract', () => {
  it('uses only create, orchestrator reconcile, read polling, and candidate diff evidence', async () => {
    const source = readFileSync(autonomousScriptPath, 'utf8')

    expect(source).toContain('process.env.HERMES_AUTONOMOUS_E2E_TARGET_REPO')
    expect(source).toContain('process.env.HERMES_AUTONOMOUS_E2E_TARGET_BRANCH')
    expect(source).toContain('/api/work-items')
    expect(source).toContain('/api/work-items/orchestrator/reconcile')
    expect(source).toContain('syncExecution=true')
    expect(source).toContain('gitDiffNameOnly')
    expect(source).toContain('createdWorkItemIds.length === 1')

    expect(source).not.toMatch(/\/api\/work-items\/\$\{workItemId\}\/lifecycle/)
    expect(source).not.toMatch(/method:\s*['"]PATCH['"][\s\S]{0,240}\/api\/work-items\/[\s\S]{0,240}(status|phase)/)
    expect(source).not.toContain('/.local/bin/builder')
    expect(source).not.toMatch(/builder\s+chat/)
  })

  it('validates one autonomous work item with Planner ingestion, Builder launch, and candidate code diff', async () => {
    const { validateAutonomousWorkItemE2eReport } = await import(`${autonomousScriptUrl}?contract-validator`)
    const report = validAutonomousReport()

    expect(validateAutonomousWorkItemE2eReport(report)).toBe(report)
    expect(report.createdWorkItemIds).toHaveLength(1)
    expect(report.manualPhaseMutationCalls).toEqual([])
    expect(report.orchestratorEvents.map((event) => event.action)).toEqual(
      expect.arrayContaining(['launch_planner', 'ingest_planner_output', 'launch_builder']),
    )
  })

  it('rejects fake autonomous reports with manual movement, missing Builder launch, or no candidate code diff', async () => {
    const { validateAutonomousWorkItemE2eReport } = await import(`${autonomousScriptUrl}?contract-rejections`)

    expect(() =>
      validateAutonomousWorkItemE2eReport(validAutonomousReport({ manualPhaseMutationCalls: ['PATCH /api/work-items/wi'] })),
    ).toThrow(/manual phase mutation/i)
    expect(() =>
      validateAutonomousWorkItemE2eReport(
        validAutonomousReport({
          orchestratorEvents: [
            { action: 'launch_planner', workItemId: 'wi-autonomy-1' },
            { action: 'ingest_planner_output', workItemId: 'wi-autonomy-1' },
          ],
        }),
      ),
    ).toThrow(/builder launch/i)
    expect(() =>
      validateAutonomousWorkItemE2eReport(validAutonomousReport({ candidateRepo: { beforeStatus: '', afterStatus: '', changedFiles: [] } })),
    ).toThrow(/candidate repo diff/i)
  })

  it('builds autonomous report markdown with no manual mutation list and candidate diff evidence', async () => {
    const { buildAutonomousWorkItemE2eMarkdown } = await import(`${autonomousScriptUrl}?contract-markdown`)
    const report = validAutonomousReport()
    const markdown = buildAutonomousWorkItemE2eMarkdown(report)

    expect(markdown).toContain('# Autonomous Work Item E2E Report')
    expect(markdown).toContain('AUTONOMOUS WORKFLOW PASS')
    expect(markdown).toContain('AUTONOMOUS CODE DELIVERY PASS')
    expect(markdown).toContain('Manual phase mutation calls: []')
    expect(markdown).toContain('- lib/quick-capture.ts')
    expect(markdown).toContain('- tests/quick-capture.test.ts')
  })
})

describe('REAL work item E2E script contract', () => {
  it('exports a validator that requires one same-id work item through Inbox, Ready, Build, Review, Deploy, Done', async () => {
    const { validateWorkItemE2eReport } = await import(`${lifecycleScriptUrl}?contract-validator`)
    const report = validReport()

    expect(validateWorkItemE2eReport(report)).toBe(report)
    expect(report.e2eRunId).toMatch(/^work-item-e2e-/)
    expect(report.createdWorkItemIds).toHaveLength(1)
    expect(report.workItemId).toBe(report.createdWorkItemIds[0])
    expect(report.transitions.map((step) => step.name)).toEqual([
      'created-inbox',
      'ready-after-auto-approval',
      'active-build',
      'active-review',
      'active-deploy',
      'done',
    ])
    expect(report.transitions.at(0)).toMatchObject({ status: 'inbox', phase: 'research' })
    expect(report.transitions.at(1)).toMatchObject({ status: 'ready' })
    expect(report.transitions.at(2)).toMatchObject({ status: 'active', phase: 'build' })
    expect(report.transitions.at(3)).toMatchObject({ status: 'active', phase: 'review' })
    expect(report.transitions.at(4)).toMatchObject({ status: 'active', phase: 'deploy' })
    expect(report.transitions.at(5)).toMatchObject({ status: 'done' })
    expect(report.finalInboxCheck).toMatchObject({ workItemIdStillInInbox: false })
    expect(report.extraE2eItemsCreated).toEqual([])
  })

  it('rejects fake E2E reports with multiple created items, split IDs, inbox leftovers, or non-done final state', async () => {
    const { validateWorkItemE2eReport } = await import(`${lifecycleScriptUrl}?contract-rejections`)

    expect(() => validateWorkItemE2eReport(validReport({ createdWorkItemIds: ['wi-e2e-1', 'wi-e2e-2'] }))).toThrow(/exactly one/i)
    expect(() => validateWorkItemE2eReport(validReport({ transitions: validReport().transitions.map((step, index) => index === 3 ? { ...step, workItemId: 'wi-other' } : step) }))).toThrow(/same work item id/i)
    expect(() => validateWorkItemE2eReport(validReport({ finalInboxCheck: { workItemIdStillInInbox: true, sameRunInboxItemIds: ['wi-e2e-1'] } }))).toThrow(/inbox/i)
    expect(() => validateWorkItemE2eReport(validReport({ finalPersistedStatus: 'active' }))).toThrow(/done/i)
  })

  it('builds a latest-report markdown artifact with the required transition table and final persisted status', async () => {
    const { buildWorkItemE2eMarkdown } = await import(`${lifecycleScriptUrl}?contract-markdown`)
    const report = validReport()
    const markdown = buildWorkItemE2eMarkdown(report)

    expect(markdown).toContain('# REAL Work Item E2E Report')
    expect(markdown).toContain('Verdict: PASS')
    expect(markdown).toContain(`Work item id: ${report.workItemId}`)
    expect(markdown).toContain('Final persisted status: done')
    expect(markdown).toContain('| created-inbox | wi-e2e-1 | inbox | research |')
    expect(markdown).toContain('| done | wi-e2e-1 | done | — |')
  })
})
