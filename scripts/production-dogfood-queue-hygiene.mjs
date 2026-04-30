#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT_ID = 'production-dogfood-family-command-center-abacus'
const TARGET_REPO = '/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS'
const ARCHIVE_NOTE = 'Archived stale dogfood/test queue item before real ABACUS idea intake.'
const BACKUP_RELATIVE_DIR = 'backups/production-dogfood-queue-hygiene'
const REPORT_PREFIX = 'production-dogfood-queue-hygiene'

const HISTORICAL_EVIDENCE_IDS = new Set([
  '55e4cd15-f179-433c-80bf-24b67f7672a2',
  'b31ad72d-4ef0-4388-b867-e0bf11c14c82',
  'c6c218a8-b299-4f7f-9f64-33812b06df3d',
  '1a44d0b2-86d8-4202-8dfa-50d71a454da8',
  '38c30749-118e-4ade-9e85-df62a31b611e',
])
const BLOCKED_FIXTURE_IDS = new Set([
  '84bfe2c2-e899-437a-8a6c-a6fa9884886d',
  'ac6918e0-a46d-4de4-a618-ddda1b233f98',
])
const STALE_TEST_QUEUE_IDS = new Set([
  '110c9124-b898-43d3-a05a-a0ff304bc3fc',
  '8c501827-d537-4715-8de5-98fee3d1db24',
  '5961870a-3e41-4bb2-b36b-747f2989def8',
  'c04a7be8-7b78-4a3c-8eeb-656c0923c27d',
  '9457c095-238d-468e-84fe-25165c94499c',
  '2a00c64d-40a2-477f-8e0f-da7e85fe6187',
  'c6a7f30a-691f-496e-9455-db26ecc7e472',
  '9e52911f-93c4-4ec1-baef-6c2024dd3cbc',
  'fdccecf9-8590-49ca-b2d2-fe924465468b',
])
const TERMINAL_STATUSES = new Set(['done', 'cancelled'])
const ACTIVE_DRAFT_STATUSES = new Set(['requested', 'running', 'structured_ready'])
const DISPOSITIONS = [
  'preserve_historical_evidence',
  'preserve_blocked_fixture',
  'cancel_stale_test_queue',
  'already_terminal',
  'unknown_manual_review',
]

function parseArgs(argv) {
  const parsed = { projectId: PROJECT_ID, apply: false, dryRun: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--project') {
      parsed.projectId = argv[index + 1] ?? ''
      index += 1
      continue
    }
    if (arg === '--apply') {
      parsed.apply = true
      continue
    }
    if (arg === '--dry-run') {
      parsed.dryRun = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!parsed.apply) parsed.dryRun = true
  if (parsed.apply && parsed.dryRun && argv.includes('--dry-run')) {
    throw new Error('Choose exactly one mode: --dry-run or --apply')
  }
  return parsed
}

function usage() {
  return [
    'Usage:',
    `  node scripts/production-dogfood-queue-hygiene.mjs --project ${PROJECT_ID} --dry-run`,
    `  node scripts/production-dogfood-queue-hygiene.mjs --project ${PROJECT_ID} --apply`,
  ].join('\n')
}

function hermesHome() {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function readJson(filePath, fallback) {
  if (!existsSync(filePath)) return fallback
  const raw = readFileSync(filePath, 'utf8').trim()
  if (!raw) return fallback
  return JSON.parse(raw)
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function isStaleTestTitle(title) {
  return title.startsWith('Dogfood rough idea ') || title.startsWith('Autonomous E2E Code Delivery ')
}

function classifyWorkItem(workItem) {
  if (HISTORICAL_EVIDENCE_IDS.has(workItem.id) && workItem.status === 'done') {
    return classification(workItem, 'preserve_historical_evidence', 'Known completed ABACUS dogfood evidence; preserve unchanged.')
  }

  if (
    BLOCKED_FIXTURE_IDS.has(workItem.id) &&
    workItem.status === 'blocked' &&
    workItem.phase === 'build' &&
    workItem.laneState === 'blocked' &&
    typeof workItem.laneParkedAt === 'string' &&
    workItem.laneParkedAt.trim() &&
    typeof workItem.laneBlockedReason === 'string' &&
    workItem.laneBlockedReason.trim()
  ) {
    return classification(workItem, 'preserve_blocked_fixture', 'Known parked blocked regression fixture with explicit blocker metadata.')
  }

  if (workItem.status === 'cancelled') {
    return classification(workItem, 'already_terminal', 'Already cancelled and not runnable.')
  }

  if (!TERMINAL_STATUSES.has(workItem.status) && (STALE_TEST_QUEUE_IDS.has(workItem.id) || isStaleTestTitle(workItem.title ?? ''))) {
    return classification(workItem, 'cancel_stale_test_queue', 'Known stale dogfood/test queue item that should be archived before real idea intake.')
  }

  if (workItem.status === 'done') {
    return classification(workItem, 'already_terminal', 'Terminal done item outside the explicit evidence allow-list; not runnable.')
  }

  return classification(workItem, 'unknown_manual_review', 'Non-terminal ABACUS item is not in the approved stale-test or preserve allow-lists.')
}

function classification(workItem, disposition, reason) {
  return {
    workItemId: workItem.id,
    title: workItem.title ?? '',
    status: workItem.status ?? 'unknown',
    phase: workItem.phase,
    laneState: workItem.laneState,
    disposition,
    reason,
  }
}

function countByDisposition(classifications) {
  const counts = Object.fromEntries(DISPOSITIONS.map((disposition) => [disposition, 0]))
  for (const item of classifications) counts[item.disposition] += 1
  return counts
}

function inspectRepo() {
  if (!existsSync(TARGET_REPO)) return { repo: TARGET_REPO, error: 'missing target repo' }
  const run = (args) => execFileSync('git', ['-C', TARGET_REPO, ...args], { encoding: 'utf8' }).trim()
  try {
    return {
      repo: TARGET_REPO,
      branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
      commit: run(['rev-parse', '--short', 'HEAD']),
      status: run(['status', '--short']) || 'clean',
      aheadBehind: run(['status', '--short', '--branch']).split('\n')[0] ?? '',
    }
  } catch (error) {
    return { repo: TARGET_REPO, error: error instanceof Error ? error.message : String(error) }
  }
}

function ensureSafeToApply({ projectId, classifications }) {
  if (projectId !== PROJECT_ID) throw new Error(`Refusing to apply: project must be exactly ${PROJECT_ID}`)
  const unknown = classifications.filter((item) => item.disposition === 'unknown_manual_review')
  if (unknown.length > 0) {
    throw new Error(`Refusing to apply: unknown_manual_review items exist: ${unknown.map((item) => item.workItemId).join(', ')}`)
  }
  const unsafeNonTerminal = classifications.filter(
    (item) => !TERMINAL_STATUSES.has(item.status) && !['cancel_stale_test_queue', 'preserve_blocked_fixture'].includes(item.disposition),
  )
  if (unsafeNonTerminal.length > 0) {
    throw new Error(`Refusing to apply: unsafe non-terminal classifications: ${unsafeNonTerminal.map((item) => item.workItemId).join(', ')}`)
  }
}

function backupFiles(files, backupRoot) {
  mkdirSync(backupRoot, { recursive: true })
  for (const filePath of files) {
    const target = path.join(backupRoot, path.basename(filePath))
    if (existsSync(filePath)) copyFileSync(filePath, target)
    else writeFileSync(target, '', 'utf8')
  }
}

function archiveWorkItems(workItems, classifications, now) {
  const staleIds = new Set(classifications.filter((item) => item.disposition === 'cancel_stale_test_queue').map((item) => item.workItemId))
  const changedIds = []
  const nextWorkItems = workItems.map((workItem) => {
    if (!staleIds.has(workItem.id)) return workItem
    changedIds.push(workItem.id)
    const next = {
      ...workItem,
      status: 'cancelled',
      notes: [...(Array.isArray(workItem.notes) ? workItem.notes : []), ARCHIVE_NOTE],
      history: [
        ...(Array.isArray(workItem.history) ? workItem.history : []),
        {
          id: `queue-hygiene-${now}-${workItem.id}`,
          action: 'status-change',
          status: 'cancelled',
          note: ARCHIVE_NOTE,
          createdAt: now,
        },
      ],
      updatedAt: now,
    }
    delete next.phase
    return next
  })
  return { workItems: nextWorkItems, changedIds }
}

function cancelLinkedDrafts(drafts, cancelledWorkItemIds, now) {
  const cancelledSet = new Set(cancelledWorkItemIds)
  const changedIds = []
  const nextDrafts = drafts.map((draft) => {
    if (!cancelledSet.has(draft.workItemId) || !ACTIVE_DRAFT_STATUSES.has(draft.status)) return draft
    changedIds.push(draft.id)
    return {
      ...draft,
      status: 'cancelled',
      parseWarnings: [...(Array.isArray(draft.parseWarnings) ? draft.parseWarnings : []), ARCHIVE_NOTE],
      parseError: draft.parseError,
      updatedAt: now,
    }
  })
  return { drafts: nextDrafts, changedIds }
}

function buildReport({ mode, backupDirectory, classifications, changedWorkItemIds, changedDraftIds, repo, finalRunnableStaleCandidateCount }) {
  const counts = countByDisposition(classifications)
  const lines = [
    `# Production Dogfood Queue Hygiene Report`,
    '',
    `- Mode: ${mode}`,
    `- Project: ${PROJECT_ID}`,
    `- Backup directory: ${backupDirectory ?? 'n/a (dry-run)'}`,
    `- Changed work item ids: ${changedWorkItemIds.length ? changedWorkItemIds.join(', ') : 'none'}`,
    `- Linked draft ids changed: ${changedDraftIds.length ? changedDraftIds.join(', ') : 'none'}`,
    `- Preserved evidence item ids: ${[...HISTORICAL_EVIDENCE_IDS].join(', ')}`,
    `- Preserved blocked fixture item ids: ${[...BLOCKED_FIXTURE_IDS].join(', ')}`,
    `- Final runnable stale candidate count: ${finalRunnableStaleCandidateCount}`,
    '',
    '## Disposition counts',
    '',
    ...DISPOSITIONS.map((disposition) => `- ${disposition}: ${counts[disposition]}`),
    '',
    '## Candidate repo inspection',
    '',
    `- Repo: ${repo.repo}`,
    `- Branch: ${repo.branch ?? 'unknown'}`,
    `- Commit: ${repo.commit ?? 'unknown'}`,
    `- Status: ${repo.status ?? repo.error ?? 'unknown'}`,
    `- Ahead/behind: ${repo.aheadBehind ?? 'unknown'}`,
    '',
    '## Work items by disposition',
    '',
  ]

  for (const disposition of DISPOSITIONS) {
    lines.push(`### ${disposition}`, '')
    const rows = classifications.filter((item) => item.disposition === disposition)
    if (rows.length === 0) {
      lines.push('- none', '')
      continue
    }
    for (const item of rows) {
      lines.push(`- ${item.workItemId} — ${item.status}${item.phase ? `/${item.phase}` : ''}${item.laneState ? ` laneState=${item.laneState}` : ''} — ${item.title}`)
      lines.push(`  - Reason: ${item.reason}`)
    }
    lines.push('')
  }

  lines.push('## Next recommended action', '')
  lines.push(
    finalRunnableStaleCandidateCount === 0
      ? 'Ask Main/CEO to create the real “Family Command Center ABACUS” idea work item. Do not use old dummy work items.'
      : 'Do not create the real idea yet; resolve remaining runnable stale candidates first.',
  )
  lines.push('')
  return `${lines.join('\n')}\n`
}

function writeReport(markdown, now) {
  const outputDir = path.join(process.cwd(), 'dogfood-output')
  mkdirSync(outputDir, { recursive: true })
  const timestamped = path.join(outputDir, `${REPORT_PREFIX}-${now}.md`)
  const latest = path.join(outputDir, `${REPORT_PREFIX}-latest.md`)
  writeFileSync(timestamped, markdown, 'utf8')
  writeFileSync(latest, markdown, 'utf8')
  return { timestamped, latest }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(usage())
    return
  }
  if (args.projectId !== PROJECT_ID) throw new Error(`Project must be ${PROJECT_ID}; got ${args.projectId}`)

  const home = hermesHome()
  const files = {
    workItems: path.join(home, 'work-items.json'),
    planningDrafts: path.join(home, 'planning-drafts.json'),
    projects: path.join(home, 'projects.json'),
  }
  const workItemsFile = readJson(files.workItems, { workItems: [] })
  const planningDraftsFile = readJson(files.planningDrafts, { drafts: [] })
  const projectsFile = readJson(files.projects, { projects: [] })
  const projectExists = Array.isArray(projectsFile.projects) && projectsFile.projects.some((project) => project.id === PROJECT_ID)
  if (!projectExists) throw new Error(`Project ${PROJECT_ID} was not found in ${files.projects}`)

  const projectWorkItems = (Array.isArray(workItemsFile.workItems) ? workItemsFile.workItems : []).filter(
    (workItem) => workItem.projectId === PROJECT_ID,
  )
  const classifications = projectWorkItems.map(classifyWorkItem)
  ensureSafeToApply({ projectId: args.projectId, classifications })

  const now = timestamp()
  let backupDirectory = null
  let changedWorkItemIds = []
  let changedDraftIds = []
  let finalClassifications = classifications

  if (args.apply) {
    backupDirectory = path.join(home, BACKUP_RELATIVE_DIR, now)
    backupFiles([files.workItems, files.planningDrafts, files.projects], backupDirectory)

    const archived = archiveWorkItems(workItemsFile.workItems, classifications, now)
    changedWorkItemIds = archived.changedIds
    const cancelledDrafts = cancelLinkedDrafts(planningDraftsFile.drafts ?? [], changedWorkItemIds, now)
    changedDraftIds = cancelledDrafts.changedIds

    writeJson(files.workItems, { ...workItemsFile, workItems: archived.workItems })
    writeJson(files.planningDrafts, { ...planningDraftsFile, drafts: cancelledDrafts.drafts })
    finalClassifications = archived.workItems.filter((workItem) => workItem.projectId === PROJECT_ID).map(classifyWorkItem)
  }

  const finalRunnableStaleCandidateCount = finalClassifications.filter((item) => item.disposition === 'cancel_stale_test_queue').length
  const report = buildReport({
    mode: args.apply ? 'apply' : 'dry-run',
    backupDirectory,
    classifications: finalClassifications,
    changedWorkItemIds,
    changedDraftIds,
    repo: inspectRepo(),
    finalRunnableStaleCandidateCount,
  })
  const paths = writeReport(report, now)

  console.log(`${args.apply ? 'Applied' : 'Dry-run'} production dogfood queue hygiene.`)
  console.log(`Report: ${paths.latest}`)
  if (backupDirectory) console.log(`Backup: ${backupDirectory}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
