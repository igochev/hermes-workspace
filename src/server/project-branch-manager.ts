import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { ProjectAutonomyAlwaysOnPolicy } from './projects-store'
import type { WorkItemRecord } from './work-items-store'

const execFileAsync = promisify(execFile)

export type ProjectBranchState = {
  repoPath: string
  baseBranch: string
  currentBranch: string
  isClean: boolean
  headCommit: string
  changedFiles: Array<string>
}

export type ProjectRepoHygiene = {
  repoPath: string
  currentBranch: string
  baseBranch: string
  featureBranch?: string
  dirtyStatus: string
  untrackedFiles: Array<string>
  localBranchesCreatedByLane: Array<string>
  stashIdsCreatedByLane: Array<string>
  aheadBehind: string
  upstreamBranch?: string
  remoteUrl?: string
  prUrl?: string
  warnings: Array<string>
}

export type PrPublishingPreflightStatus =
  | 'manual_required'
  | 'blocked'
  | 'unavailable'
  | 'ready'

export type PrPublishingPreflight = {
  status: PrPublishingPreflightStatus
  ready: boolean
  baseBranch: string
  headBranch?: string
  aheadBehind: string
  mergeCommit?: string
  blockers: Array<string>
  evidence: Array<string>
  publishCommand?: Array<string>
}

export type LaneCleanupBranchInventoryItem = {
  name: string
  merged: boolean
  ageDays: number
  lastCommitAt?: string
}

export type LaneCleanupStashInventoryItem = {
  id: string
  message: string
  ageDays: number
  createdAt?: string
}

export type LaneCleanupInventory = {
  branches: Array<LaneCleanupBranchInventoryItem>
  stashes: Array<LaneCleanupStashInventoryItem>
}

export type LaneCleanupAction = {
  type: 'delete_branch' | 'drop_stash'
  target: string
  destructive: boolean
  command: Array<string>
  reason: string
}

export type LaneCleanupPlan = {
  status: 'retained' | 'planned' | 'blocked'
  dryRun: boolean
  actions: Array<LaneCleanupAction>
  blockers: Array<string>
  evidence: Array<string>
}

export type CleanOrStashedLaneEntry = {
  isClean: boolean
  checkpointStashId?: string
  hygiene: ProjectRepoHygiene
}

type GitResult = {
  stdout: string
  stderr: string
}

async function git(repoPath: string, args: Array<string>): Promise<string> {
  const result = (await execFileAsync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
  })) as GitResult
  return result.stdout.trim()
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  return slug || 'work-item'
}

export function buildWorkItemBranchName(
  workItem: WorkItemRecord,
  prefix = 'mission',
): string {
  const cleanPrefix = slugify(prefix).replace(/-/g, '/') || 'mission'
  return `${cleanPrefix}/${workItem.id.slice(0, 8)}-${slugify(workItem.title)}`
}

async function branchExists(
  repoPath: string,
  branchName: string,
): Promise<boolean> {
  try {
    await git(repoPath, ['rev-parse', '--verify', `refs/heads/${branchName}`])
    return true
  } catch {
    return false
  }
}

async function currentBranch(repoPath: string): Promise<string> {
  const branch = await git(repoPath, ['branch', '--show-current'])
  return branch || 'HEAD'
}

async function headCommit(repoPath: string): Promise<string> {
  return git(repoPath, ['rev-parse', 'HEAD'])
}

async function changedFiles(repoPath: string): Promise<Array<string>> {
  const result = (await execFileAsync('git', ['status', '--porcelain=v1'], {
    cwd: repoPath,
    encoding: 'utf8',
  })) as GitResult
  const porcelain = result.stdout
  return porcelainFiles(porcelain)
}

function porcelainFiles(porcelain: string): Array<string> {
  return porcelain
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => ({
      status: line.slice(0, 2),
      file: (line.slice(3).trim().split(' -> ').at(-1) ?? '').trim(),
    }))
    .filter((item) => item.file.length > 0)
    .sort((a, b) => {
      const statusOrder =
        (a.status.includes('?') ? 1 : 0) - (b.status.includes('?') ? 1 : 0)
      if (statusOrder !== 0) return statusOrder
      return a.file.toLowerCase().localeCompare(b.file.toLowerCase())
    })
    .map((item) => item.file)
    .filter((file, index, files) => files.indexOf(file) === index)
}

async function gitLines(repoPath: string, args: Array<string>): Promise<Array<string>> {
  const output = await git(repoPath, args).catch(() => '')
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

async function dirtyStatus(repoPath: string): Promise<string> {
  const result = (await execFileAsync('git', ['status', '--short'], {
    cwd: repoPath,
    encoding: 'utf8',
  })) as GitResult
  return result.stdout.trim()
}

async function aheadBehind(repoPath: string, baseBranch: string): Promise<string> {
  const upstream = await git(repoPath, ['rev-parse', '--abbrev-ref', `${baseBranch}@{upstream}`]).catch(
    () => '',
  )
  if (!upstream) return 'no upstream'
  const counts = await git(repoPath, ['rev-list', '--left-right', '--count', `${upstream}...${baseBranch}`]).catch(
    () => '',
  )
  const [behindRaw, aheadRaw] = counts.split(/\s+/)
  const behind = Number(behindRaw || 0)
  const ahead = Number(aheadRaw || 0)
  return `ahead ${ahead}, behind ${behind}`
}

async function upstreamBranch(repoPath: string, baseBranch: string): Promise<string> {
  return git(repoPath, ['rev-parse', '--abbrev-ref', `${baseBranch}@{upstream}`]).catch(
    () => '',
  )
}

async function remoteUrl(repoPath: string): Promise<string> {
  return git(repoPath, ['remote', 'get-url', 'origin']).catch(() => '')
}

function behindCount(aheadBehindValue: string): number {
  const match = aheadBehindValue.match(/behind\s+(\d+)/i)
  return Number(match?.[1] ?? 0)
}

function ageDaysFrom(dateValue: string | undefined, nowValue: string): number {
  if (!dateValue) return 0
  const then = Date.parse(dateValue)
  const now = Date.parse(nowValue)
  if (!Number.isFinite(then) || !Number.isFinite(now) || now < then) return 0
  return Math.floor((now - then) / (24 * 60 * 60 * 1000))
}

function uniqueStrings(values: Array<string>): Array<string> {
  return values.filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
}

function buildPrBody(params: {
  workItem: WorkItemRecord
  hygiene: ProjectRepoHygiene
  mergeCommit?: string
}): string {
  return [
    `workItem=${params.workItem.id}`,
    `headBranch=${params.hygiene.featureBranch ?? params.workItem.branchName ?? 'unknown'}`,
    `baseBranch=${params.hygiene.baseBranch}`,
    `aheadBehind=${params.hygiene.aheadBehind}`,
    `mergeCommit=${params.mergeCommit ?? params.workItem.mergeCommit ?? 'unknown'}`,
    '',
    'Generated by Hermes Workspace PR publishing preflight. Command was built in dry-run mode before explicit operator execution.',
  ].join('\n')
}

export function buildPrPublishingPreflight(params: {
  policy: ProjectAutonomyAlwaysOnPolicy['prPublishing']
  hygiene: ProjectRepoHygiene
  workItem: WorkItemRecord
  ghAvailable?: boolean
}): PrPublishingPreflight {
  const baseBranch = params.policy.baseBranch || params.hygiene.baseBranch
  const headBranch = params.hygiene.featureBranch || params.workItem.branchName
  const mergeCommit = params.workItem.mergeCommit
  const evidence = [
    `policy=${params.policy.enabled ? params.policy.mode : 'disabled'}`,
    `baseBranch=${baseBranch}`,
    `headBranch=${headBranch ?? 'missing'}`,
    `aheadBehind=${params.hygiene.aheadBehind}`,
    `mergeState=${params.workItem.mergeState ?? 'unknown'}`,
    `mergeTestPassed=${String(params.workItem.mergeTestPassed ?? false)}`,
  ]

  if (!params.policy.enabled || params.policy.mode === 'manual') {
    return {
      status: 'manual_required',
      ready: false,
      baseBranch,
      headBranch,
      aheadBehind: params.hygiene.aheadBehind,
      mergeCommit,
      blockers: ['PR publishing policy is manual or disabled.'],
      evidence,
    }
  }

  const blockers: Array<string> = []
  if (params.policy.requireCleanRepo && params.hygiene.dirtyStatus) {
    blockers.push('Repo must be clean before draft PR publishing.')
  }
  if (!params.hygiene.upstreamBranch || /no upstream/i.test(params.hygiene.aheadBehind)) {
    blockers.push(`Missing upstream branch for ${params.hygiene.baseBranch}.`)
  }
  if (!params.hygiene.remoteUrl) {
    blockers.push('Missing git remote URL for PR publishing.')
  }
  if (behindCount(params.hygiene.aheadBehind) > 0) {
    blockers.push(`Base branch is behind upstream (${params.hygiene.aheadBehind}).`)
  }
  if (!headBranch) {
    blockers.push('Missing candidate feature branch for PR publishing.')
  }
  if (params.policy.requirePassingMergeTests && params.workItem.mergeTestPassed !== true) {
    blockers.push('Merge tests must pass before draft PR publishing.')
  }
  if (params.workItem.mergeState && params.workItem.mergeState !== 'merged') {
    blockers.push(`Work item merge state must be merged before publishing (${params.workItem.mergeState}).`)
  }

  if (blockers.length > 0) {
    return {
      status: 'blocked',
      ready: false,
      baseBranch,
      headBranch,
      aheadBehind: params.hygiene.aheadBehind,
      mergeCommit,
      blockers,
      evidence,
    }
  }

  if (params.ghAvailable !== true) {
    return {
      status: 'unavailable',
      ready: false,
      baseBranch,
      headBranch,
      aheadBehind: params.hygiene.aheadBehind,
      mergeCommit,
      blockers: ['GitHub CLI gh is unavailable; install/auth gh before publishing.'],
      evidence: [...evidence, 'gh=unavailable'],
    }
  }

  const titlePrefix = params.policy.titlePrefix.trim()
  const title = [titlePrefix, params.workItem.title].filter(Boolean).join(' ')
  const body = buildPrBody({ workItem: params.workItem, hygiene: params.hygiene, mergeCommit })
  return {
    status: 'ready',
    ready: true,
    baseBranch,
    headBranch,
    aheadBehind: params.hygiene.aheadBehind,
    mergeCommit,
    blockers: [],
    evidence: [...evidence, 'gh=available', 'dryRun=true'],
    publishCommand: [
      'gh',
      'pr',
      'create',
      '--draft',
      '--base',
      baseBranch,
      '--head',
      headBranch!,
      '--title',
      title,
      '--body',
      body,
    ],
  }
}

export async function collectProjectLaneCleanupInventory(params: {
  repoPath: string
  baseBranch: string
  now?: string
}): Promise<LaneCleanupInventory> {
  const now = params.now ?? new Date().toISOString()
  const branchLines = await gitLines(params.repoPath, [
    'for-each-ref',
    '--format=%(refname:short)|%(committerdate:iso-strict)',
    'refs/heads/mission',
  ])
  const mergedBranches = new Set(
    (await gitLines(params.repoPath, ['branch', '--merged', params.baseBranch, '--format=%(refname:short)'])).filter(
      (branch) => branch.startsWith('mission/'),
    ),
  )
  const stashLines = await gitLines(params.repoPath, ['stash', 'list', '--format=%gd|%ci|%s'])

  return {
    branches: branchLines
      .map((line) => {
        const [name = '', lastCommitAt = ''] = line.split('|')
        return {
          name,
          merged: mergedBranches.has(name),
          ageDays: ageDaysFrom(lastCommitAt, now),
          lastCommitAt: lastCommitAt || undefined,
        }
      })
      .filter((branch) => branch.name.startsWith('mission/'))
      .sort((a, b) => a.name.localeCompare(b.name)),
    stashes: stashLines
      .map((line) => {
        const [id = '', createdAt = '', ...messageParts] = line.split('|')
        return {
          id,
          message: messageParts.join('|'),
          ageDays: ageDaysFrom(createdAt, now),
          createdAt: createdAt || undefined,
        }
      })
      .filter((stash) => stash.id && /single-lane|mission|gauntlet/i.test(stash.message))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
}

export function buildLaneCleanupPlan(params: {
  policy: ProjectAutonomyAlwaysOnPolicy['cleanup']
  hygiene: ProjectRepoHygiene
  inventory: LaneCleanupInventory
}): LaneCleanupPlan {
  const dryRun = params.policy.dryRun !== false
  const evidence = [
    `cleanupPolicy=${params.policy.enabled ? 'enabled' : 'disabled'}`,
    `dryRun=${String(dryRun)}`,
    `deleteMergedBranches=${String(params.policy.deleteMergedBranches)}`,
    `retainMergedBranchDays=${params.policy.retainMergedBranchDays}`,
    `retainLaneStashes=${String(params.policy.retainLaneStashes)}`,
    `retainLaneStashDays=${params.policy.retainLaneStashDays}`,
  ]
  const blockers: Array<string> = []
  const actions: Array<LaneCleanupAction> = []

  if (!params.policy.enabled) {
    return { status: 'retained', dryRun: true, actions: [], blockers: [], evidence }
  }

  for (const branch of params.inventory.branches) {
    if (!branch.merged) {
      evidence.push(`retained branch ${branch.name}: branch is not merged`)
      if (!dryRun) blockers.push(`Unmerged lane branch ${branch.name} cannot be deleted.`)
      continue
    }
    if (!params.policy.deleteMergedBranches) {
      evidence.push(`retained branch ${branch.name}: branch deletion disabled`)
      continue
    }
    if (branch.ageDays < params.policy.retainMergedBranchDays) {
      evidence.push(`retained branch ${branch.name}: age ${branch.ageDays}d < retention ${params.policy.retainMergedBranchDays}d`)
      continue
    }
    actions.push({
      type: 'delete_branch',
      target: branch.name,
      destructive: !dryRun,
      command: ['git', 'branch', '-d', branch.name],
      reason: `merged branch age ${branch.ageDays}d >= retention ${params.policy.retainMergedBranchDays}d`,
    })
  }

  for (const stash of params.inventory.stashes) {
    if (params.policy.retainLaneStashes) {
      evidence.push(`retained stash ${stash.id}: lane stash retention enabled`)
      continue
    }
    if (stash.ageDays < params.policy.retainLaneStashDays) {
      evidence.push(`retained stash ${stash.id}: age ${stash.ageDays}d < retention ${params.policy.retainLaneStashDays}d`)
      continue
    }
    actions.push({
      type: 'drop_stash',
      target: stash.id,
      destructive: !dryRun,
      command: ['git', 'stash', 'drop', stash.id],
      reason: `lane stash age ${stash.ageDays}d >= retention ${params.policy.retainLaneStashDays}d`,
    })
  }

  if (!dryRun) {
    if (params.hygiene.dirtyStatus) blockers.push('Repo must be clean before destructive cleanup.')
    if (behindCount(params.hygiene.aheadBehind) > 0) blockers.push(`Base branch is behind upstream (${params.hygiene.aheadBehind}).`)
    if (blockers.length > 0) {
      return { status: 'blocked', dryRun, actions: [], blockers: uniqueStrings(blockers), evidence }
    }
  }

  return {
    status: actions.length > 0 ? 'planned' : 'retained',
    dryRun,
    actions,
    blockers: [],
    evidence,
  }
}

export async function collectProjectRepoHygiene(params: {
  repoPath: string
  baseBranch?: string
  featureBranch?: string
  prUrl?: string
}): Promise<ProjectRepoHygiene> {
  const state = await inspectProjectRepoState(params.repoPath)
  const baseBranch = params.baseBranch || state.baseBranch
  const status = await dirtyStatus(params.repoPath)
  const untrackedFiles = await gitLines(params.repoPath, ['ls-files', '--others', '--exclude-standard'])
  const branchLines = await gitLines(params.repoPath, ['branch', '--format=%(refname:short)'])
  const stashLines = await gitLines(params.repoPath, ['stash', 'list'])
  const baseAheadBehind = await aheadBehind(params.repoPath, baseBranch)
  const baseUpstreamBranch = await upstreamBranch(params.repoPath, baseBranch)
  const originRemoteUrl = await remoteUrl(params.repoPath)
  const localBranchesCreatedByLane = branchLines.filter((branch) =>
    branch.startsWith('mission/'),
  )
  const stashIdsCreatedByLane = stashLines.filter((line) =>
    /single-lane|mission|gauntlet/i.test(line),
  )
  const warnings: Array<string> = []
  if (/ahead [1-9]/i.test(baseAheadBehind)) {
    warnings.push(`Base branch ${baseBranch} is ahead of origin (${baseAheadBehind}).`)
  }
  if (status) warnings.push(`Repo has dirty status: ${status}`)
  if (untrackedFiles.length > 0) {
    warnings.push(`Repo has untracked files: ${untrackedFiles.join(', ')}`)
  }

  return {
    repoPath: params.repoPath,
    currentBranch: state.currentBranch,
    baseBranch,
    featureBranch: params.featureBranch,
    dirtyStatus: status,
    untrackedFiles,
    localBranchesCreatedByLane,
    stashIdsCreatedByLane,
    aheadBehind: baseAheadBehind,
    upstreamBranch: baseUpstreamBranch || undefined,
    remoteUrl: originRemoteUrl || undefined,
    prUrl: params.prUrl,
    warnings,
  }
}

export async function assertCleanOrStashedLaneEntry(params: {
  repoPath: string
  baseBranch?: string
  featureBranch?: string
  checkpointStashId?: string
}): Promise<CleanOrStashedLaneEntry> {
  const hygiene = await collectProjectRepoHygiene(params)
  const isClean = hygiene.dirtyStatus.length === 0
  if (!isClean && !params.checkpointStashId) {
    throw new Error(
      `Lane entry requires clean or checkpointed repo state before branch switching. Dirty status: ${hygiene.dirtyStatus}`,
    )
  }
  return { isClean, checkpointStashId: params.checkpointStashId, hygiene }
}

export async function inspectProjectRepoState(
  repoPath: string,
): Promise<ProjectBranchState> {
  const [baseBranch, current, head, files] = await Promise.all([
    git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD@{upstream}']).catch(
      () => 'main',
    ),
    currentBranch(repoPath),
    headCommit(repoPath),
    changedFiles(repoPath),
  ])

  return {
    repoPath,
    baseBranch: baseBranch.includes('/')
      ? baseBranch.split('/').slice(1).join('/')
      : baseBranch,
    currentBranch: current,
    isClean: files.length === 0,
    headCommit: head,
    changedFiles: files,
  }
}

export async function ensureWorkItemBranch(params: {
  repoPath: string
  baseBranch: string
  branchName: string
}): Promise<ProjectBranchState> {
  const before = await inspectProjectRepoState(params.repoPath)
  const alreadyOnBranch = before.currentBranch === params.branchName

  if (!before.isClean && !alreadyOnBranch) {
    throw new Error(
      `Refusing to switch to ${params.branchName}: canonical repo path is dirty (${before.changedFiles.join(', ')}).`,
    )
  }

  if (!alreadyOnBranch) {
    if (await branchExists(params.repoPath, params.branchName)) {
      await git(params.repoPath, ['checkout', params.branchName])
    } else {
      await git(params.repoPath, ['checkout', params.baseBranch])
      await git(params.repoPath, ['checkout', '-b', params.branchName])
    }
  }

  const after = await inspectProjectRepoState(params.repoPath)
  return {
    ...after,
    baseBranch: params.baseBranch,
  }
}
