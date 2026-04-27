import { exec, execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { WorkItemRecord, WorkItemMergeState } from './work-items-store'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

type GitResult = { stdout: string; stderr: string }

export type WorkItemMergeHealerResult = {
  mergeState: WorkItemMergeState
  mergeTargetBranch: string
  mergeBaseCommit?: string
  mergeCommit?: string
  mergeConflictFiles: Array<string>
  mergeTestCommand?: string
  mergeTestPassed: boolean
  mergeArtifactPaths: Array<string>
  mergeBlockedReason?: string
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const result = (await execFileAsync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
  })) as GitResult
  return result.stdout.trim()
}

async function gitAllowFailure(repoPath: string, args: string[]): Promise<GitResult> {
  try {
    return (await execFileAsync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
    })) as GitResult
  } catch (error) {
    const failed = error as Error & { stdout?: string; stderr?: string }
    return { stdout: failed.stdout ?? '', stderr: failed.stderr ?? failed.message }
  }
}

function uniqueStrings(items: Array<string>): Array<string> {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

async function conflictedFiles(repoPath: string): Promise<Array<string>> {
  const output = await git(repoPath, ['diff', '--name-only', '--diff-filter=U']).catch(
    () => '',
  )
  return uniqueStrings(output.split('\n'))
}

async function isAncestor(repoPath: string, possibleAncestor: string, ref: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', possibleAncestor, ref], {
      cwd: repoPath,
      encoding: 'utf8',
    })
    return true
  } catch {
    return false
  }
}

async function runTestCommand(params: {
  repoPath: string
  workItemId: string
  command: string
}): Promise<{ passed: boolean; artifactPath?: string }> {
  try {
    await execAsync(params.command, { cwd: params.repoPath, encoding: 'utf8' })
    return { passed: true }
  } catch (error) {
    const failed = error as Error & { stdout?: string; stderr?: string }
    const artifactDir = join(params.repoPath, '.hermes', 'merge-healer')
    await mkdir(artifactDir, { recursive: true })
    const artifactPath = join(artifactDir, `${params.workItemId.slice(0, 8)}-test.log`)
    await writeFile(
      artifactPath,
      [
        `$ ${params.command}`,
        '',
        failed.stdout ?? '',
        failed.stderr ?? '',
        failed.message,
      ]
        .filter((part) => part.length > 0)
        .join('\n'),
      'utf8',
    )
    return { passed: false, artifactPath }
  }
}

export async function runWorkItemMergeHealer(params: {
  repoPath: string
  workItem: WorkItemRecord
  testCommand?: string
}): Promise<WorkItemMergeHealerResult> {
  const targetBranch =
    params.workItem.mergeTargetBranch || params.workItem.baseBranch || 'main'
  const featureBranch = params.workItem.branchName
  const testCommand = params.testCommand?.trim()

  if (params.workItem.mergeState === 'merged' && params.workItem.mergeCommit) {
    return {
      mergeState: 'merged',
      mergeTargetBranch: targetBranch,
      mergeBaseCommit: params.workItem.mergeBaseCommit,
      mergeCommit: params.workItem.mergeCommit,
      mergeConflictFiles: [],
      mergeTestCommand: testCommand,
      mergeTestPassed: true,
      mergeArtifactPaths: [],
    }
  }

  if (!featureBranch?.trim()) {
    return {
      mergeState: 'failed',
      mergeTargetBranch: targetBranch,
      mergeBaseCommit: params.workItem.mergeBaseCommit,
      mergeConflictFiles: [],
      mergeTestCommand: testCommand,
      mergeTestPassed: false,
      mergeArtifactPaths: [],
      mergeBlockedReason: 'Merge-Healer blocked: work item has no feature branch evidence.',
    }
  }

  await git(params.repoPath, ['checkout', targetBranch])
  const baseCommit = params.workItem.mergeBaseCommit || (await git(params.repoPath, ['rev-parse', 'HEAD']))

  if (!(await isAncestor(params.repoPath, featureBranch, 'HEAD'))) {
    const merge = await gitAllowFailure(params.repoPath, [
      'merge',
      '--no-ff',
      featureBranch,
      '-m',
      `Merge ${featureBranch} for ${params.workItem.id.slice(0, 8)}`,
    ])
    const conflicts = await conflictedFiles(params.repoPath)
    if (conflicts.length > 0) {
      await gitAllowFailure(params.repoPath, ['merge', '--abort'])
      return {
        mergeState: 'conflict',
        mergeTargetBranch: targetBranch,
        mergeBaseCommit: baseCommit,
        mergeConflictFiles: conflicts,
        mergeTestCommand: testCommand,
        mergeTestPassed: false,
        mergeArtifactPaths: [],
        mergeBlockedReason: `Merge-Healer blocked by merge conflicts: ${conflicts.join(', ')}`,
      }
    }
    if (merge.stderr && /conflict|failed/i.test(merge.stderr)) {
      await gitAllowFailure(params.repoPath, ['merge', '--abort'])
      return {
        mergeState: 'failed',
        mergeTargetBranch: targetBranch,
        mergeBaseCommit: baseCommit,
        mergeConflictFiles: [],
        mergeTestCommand: testCommand,
        mergeTestPassed: false,
        mergeArtifactPaths: [],
        mergeBlockedReason: `Merge-Healer failed to merge ${featureBranch}: ${merge.stderr.trim()}`,
      }
    }
  }

  const mergeCommit = await git(params.repoPath, ['rev-parse', 'HEAD'])
  const testResult = testCommand
    ? await runTestCommand({ repoPath: params.repoPath, workItemId: params.workItem.id, command: testCommand })
    : { passed: true as const }

  if (!testResult.passed) {
    return {
      mergeState: 'failed',
      mergeTargetBranch: targetBranch,
      mergeBaseCommit: baseCommit,
      mergeCommit,
      mergeConflictFiles: [],
      mergeTestCommand: testCommand,
      mergeTestPassed: false,
      mergeArtifactPaths: [testResult.artifactPath].filter((item): item is string => Boolean(item)),
      mergeBlockedReason: `Merge-Healer post-merge test command failed: ${testCommand}`,
    }
  }

  return {
    mergeState: 'merged',
    mergeTargetBranch: targetBranch,
    mergeBaseCommit: baseCommit,
    mergeCommit,
    mergeConflictFiles: [],
    mergeTestCommand: testCommand,
    mergeTestPassed: true,
    mergeArtifactPaths: [],
  }
}
