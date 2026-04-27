import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const lifecycleScriptUrl = pathToFileURL(join(process.cwd(), 'scripts/mission-control-work-item-e2e.mjs')).href
const autonomousScriptPath = join(process.cwd(), 'scripts/mission-control-autonomous-work-item-e2e.mjs')
const autonomousScriptUrl = pathToFileURL(autonomousScriptPath).href
const singleLaneScriptPath = join(process.cwd(), 'scripts/mission-control-single-lane-autonomy-e2e.mjs')
const singleLaneScriptUrl = pathToFileURL(singleLaneScriptPath).href

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
  mergeHealer: { ran: boolean; mergeState: string; mergeCommit?: string }
  finalWorkItem: { status: string; phase?: string; laneState?: string }
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
    mergeHealer: { ran: true, mergeState: 'merged', mergeCommit: 'abc1234' },
    finalWorkItem: { status: 'done', phase: 'deploy', laneState: 'done' },
    ...overrides,
  }
}

describe('branch-based single-lane autonomy E2E script contract', () => {
  it('uses canonical repo branch lane APIs and never manual lifecycle/PATCH phase movement or worktrees', () => {
    const source = readFileSync(singleLaneScriptPath, 'utf8')

    expect(source).toContain('process.env.HERMES_SINGLE_LANE_E2E_TARGET_REPO')
    expect(source).toContain('process.env.HERMES_SINGLE_LANE_E2E_TARGET_BRANCH')
    expect(source).toContain('autonomyLanePolicy')
    expect(source).toContain('/api/work-items/orchestrator/reconcile')
    expect(source).toContain('syncExecution=true')
    expect(source).toContain('expectedBranchName')
    expect(source).toContain('gitChangedFilesSince')
    expect(source).toContain('createdWorkItemIds.length === 1')

    expect(source).not.toMatch(/\/api\/work-items\/\$\{workItemId\}\/lifecycle/)
    expect(source).not.toMatch(/method:\s*['"]PATCH['"][\s\S]{0,240}\/api\/work-items\/[\s\S]{0,240}(status|phase)/)
    expect(source).not.toMatch(/git\([^\)]*['"]worktree['"]/) 
  })

  it('validates a same-work-item PASS with branch, product/test evidence, tests, and Merge-Healer integration', async () => {
    const { validateSingleLaneAutonomyE2eReport } = await import(`${singleLaneScriptUrl}?contract-validator`)
    const report = validSingleLaneReport()

    expect(validateSingleLaneAutonomyE2eReport(report)).toBe(report)
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
    expect(markdown).toContain('Manual phase mutation calls: []')
    expect(markdown).toContain(`Feature branch: ${report.lane.branchName}`)
    expect(markdown).toContain('Merge-Healer: merged')
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
