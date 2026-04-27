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
