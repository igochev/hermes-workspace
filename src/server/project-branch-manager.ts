import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { WorkItemRecord } from './work-items-store'

const execFileAsync = promisify(execFile)

export type ProjectBranchState = {
  repoPath: string
  baseBranch: string
  currentBranch: string
  isClean: boolean
  headCommit: string
  changedFiles: string[]
}

export type ProjectRepoHygiene = {
  repoPath: string
  currentBranch: string
  baseBranch: string
  featureBranch?: string
  dirtyStatus: string
  untrackedFiles: string[]
  localBranchesCreatedByLane: string[]
  stashIdsCreatedByLane: string[]
  aheadBehind: string
  prUrl?: string
  warnings: string[]
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

async function git(repoPath: string, args: string[]): Promise<string> {
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

async function changedFiles(repoPath: string): Promise<string[]> {
  const result = (await execFileAsync('git', ['status', '--porcelain=v1'], {
    cwd: repoPath,
    encoding: 'utf8',
  })) as GitResult
  const porcelain = result.stdout
  return porcelainFiles(porcelain)
}

function porcelainFiles(porcelain: string): string[] {
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

async function gitLines(repoPath: string, args: string[]): Promise<string[]> {
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
  const localBranchesCreatedByLane = branchLines.filter((branch) =>
    branch.startsWith('mission/'),
  )
  const stashIdsCreatedByLane = stashLines.filter((line) =>
    /single-lane|mission|gauntlet/i.test(line),
  )
  const warnings: string[] = []
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
