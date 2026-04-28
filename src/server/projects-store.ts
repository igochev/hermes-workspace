import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import {  normalizePhaseProfiles } from '../lib/conductor-phase-profiles'
import type {ConductorPhaseProfiles} from '../lib/conductor-phase-profiles';

export type ReviewAutoApprovalPolicy = {
  enabled: boolean
  maxPriority: 'low' | 'medium' | 'high'
}

export type ProjectAutopilotSchedulePreset = 'manual' | 'daily' | 'weekly'
export type ProjectAutopilotScoutSource =
  | 'manual'
  | 'autopilot'
  | 'repo-health-scout'
  | 'failing-tests-scout'
  | 'stale-docs-scout'
  | 'ux-friction-scout'
  | 'dependency-api-scout'
  | 'architecture-debt-scout'

export type ProjectAutopilotPolicy = {
  enabled: boolean
  schedulePreset: ProjectAutopilotSchedulePreset
  scoutProfile?: string
  suggestionLimit: number
  scoutSources: Array<ProjectAutopilotScoutSource>
  jobId?: string
  jobName?: string
  lastCreatedAt?: string
}

export type ProjectRuntimeProfiles = {
  supervisorProfile?: string
}

export type ProjectAutonomyAlwaysOnNotificationEvent =
  | 'blocked'
  | 'retry_scheduled'
  | 'retry_exhausted'
  | 'unsafe_repo'
  | 'pr_ready'
  | 'pr_published'
  | 'cleanup_recommended'

export type ProjectAutonomyAlwaysOnPolicy = {
  enabled: boolean
  retry: {
    enabled: boolean
    maxAttemptsPerPhase: number
    cooldownMinutes: number
    staleScheduledMinutes: number
    staleRunningMinutes: number
  }
  notifications: {
    enabled: boolean
    digestOnly: boolean
    notifyOn: Array<ProjectAutonomyAlwaysOnNotificationEvent>
    minRepeatMinutes: number
  }
  prPublishing: {
    enabled: boolean
    mode: 'manual' | 'draft'
    baseBranch?: string
    titlePrefix: string
    requireCleanRepo: boolean
    requirePassingMergeTests: boolean
  }
  cleanup: {
    enabled: boolean
    deleteMergedBranches: boolean
    retainMergedBranchDays: number
    retainLaneStashes: boolean
    retainLaneStashDays: number
    dryRun: boolean
  }
}

export type ProjectAutonomyLanePolicy = {
  enabled: boolean
  mode: 'single_lane'
  isolation: 'branch'
  maxActiveWorkItems: 1
  baseBranch?: string
  branchPrefix?: string
  plannerTiming: 'on_lane_entry'
  blockedBehavior: 'park_and_continue_when_repo_clean'
  mergeHealerEnabled: boolean
  allowParallelWorktrees: false
  alwaysOn: ProjectAutonomyAlwaysOnPolicy
}

export type ProjectRecord = {
  id: string
  name: string
  slug: string
  repoPath: string
  repoUrl?: string
  defaultBranch?: string
  description?: string
  phaseProfiles: ConductorPhaseProfiles
  runtimeProfiles: ProjectRuntimeProfiles
  reviewAutoApproval: ReviewAutoApprovalPolicy
  autopilotPolicy: ProjectAutopilotPolicy
  autonomyLanePolicy: ProjectAutonomyLanePolicy
  createdAt: string
  updatedAt: string
}

type ProjectFile = {
  projects: Array<ProjectRecord>
}

type CreateProjectInput = {
  id?: string
  name: string
  repoPath: string
  repoUrl?: string
  defaultBranch?: string
  description?: string
  phaseProfiles?: unknown
  runtimeProfiles?: unknown
  reviewAutoApproval?: unknown
  autopilotPolicy?: unknown
  autonomyLanePolicy?: unknown
}

type UpdateProjectInput = Partial<
  Omit<
    ProjectRecord,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'phaseProfiles'
    | 'runtimeProfiles'
    | 'reviewAutoApproval'
    | 'autopilotPolicy'
    | 'autonomyLanePolicy'
  >
> & {
  phaseProfiles?: unknown
  runtimeProfiles?: unknown
  reviewAutoApproval?: unknown
  autopilotPolicy?: unknown
  autonomyLanePolicy?: unknown
}

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getProjectsFile(): string {
  return path.join(getHermesHome(), 'projects.json')
}

function ensureProjectsFile(): void {
  const hermesHome = getHermesHome()
  const projectsFile = getProjectsFile()
  fs.mkdirSync(hermesHome, { recursive: true })
  if (!fs.existsSync(projectsFile)) {
    fs.writeFileSync(
      projectsFile,
      JSON.stringify({ projects: [] }, null, 2) + '\n',
      'utf-8',
    )
  }
}

function readProjectsFile(): ProjectFile {
  const projectsFile = getProjectsFile()
  ensureProjectsFile()
  try {
    const raw = fs.readFileSync(projectsFile, 'utf-8').trim()
    if (!raw) return { projects: [] }
    const parsed = JSON.parse(raw) as Partial<ProjectFile>
    return { projects: Array.isArray(parsed.projects) ? parsed.projects : [] }
  } catch {
    return { projects: [] }
  }
}

function writeProjectsFile(data: ProjectFile): void {
  const projectsFile = getProjectsFile()
  ensureProjectsFile()
  fs.writeFileSync(projectsFile, JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeReviewAutoApprovalPolicy(value: unknown): ReviewAutoApprovalPolicy {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    enabled: candidate.enabled === true,
    maxPriority:
      candidate.maxPriority === 'medium' || candidate.maxPriority === 'high'
        ? candidate.maxPriority
        : 'low',
  }
}

const DEFAULT_AUTOPILOT_SCOUT_SOURCES: Array<ProjectAutopilotScoutSource> = [
  'repo-health-scout',
  'stale-docs-scout',
  'architecture-debt-scout',
]

const VALID_AUTOPILOT_SOURCES = new Set<ProjectAutopilotScoutSource>([
  'manual',
  'autopilot',
  'repo-health-scout',
  'failing-tests-scout',
  'stale-docs-scout',
  'ux-friction-scout',
  'dependency-api-scout',
  'architecture-debt-scout',
])

function normalizeAutopilotPolicy(value: unknown): ProjectAutopilotPolicy {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

  const schedulePreset: ProjectAutopilotSchedulePreset =
    candidate.schedulePreset === 'daily' || candidate.schedulePreset === 'weekly'
      ? candidate.schedulePreset
      : 'manual'

  const scoutSources = Array.isArray(candidate.scoutSources)
    ? Array.from(
        new Set(
          candidate.scoutSources.filter(
            (source): source is ProjectAutopilotScoutSource =>
              typeof source === 'string' &&
              VALID_AUTOPILOT_SOURCES.has(source as ProjectAutopilotScoutSource),
          ),
        ),
      )
    : []

  return {
    enabled: candidate.enabled === true,
    schedulePreset,
    scoutProfile: asOptionalString(candidate.scoutProfile),
    suggestionLimit:
      typeof candidate.suggestionLimit === 'number' && Number.isFinite(candidate.suggestionLimit)
        ? Math.max(1, Math.round(candidate.suggestionLimit))
        : 5,
    scoutSources: scoutSources.length > 0 ? scoutSources : [...DEFAULT_AUTOPILOT_SCOUT_SOURCES],
    jobId: asOptionalString(candidate.jobId),
    jobName: asOptionalString(candidate.jobName),
    lastCreatedAt: asOptionalString(candidate.lastCreatedAt),
  }
}

function normalizeRuntimeProfiles(value: unknown): ProjectRuntimeProfiles {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    supervisorProfile: asOptionalString(candidate.supervisorProfile),
  }
}

const VALID_ALWAYS_ON_NOTIFY_EVENTS = new Set<ProjectAutonomyAlwaysOnNotificationEvent>([
  'blocked',
  'retry_scheduled',
  'retry_exhausted',
  'unsafe_repo',
  'pr_ready',
  'pr_published',
  'cleanup_recommended',
])

const DEFAULT_ALWAYS_ON_NOTIFY_EVENTS: Array<ProjectAutonomyAlwaysOnNotificationEvent> = [
  'blocked',
  'retry_exhausted',
  'unsafe_repo',
  'pr_ready',
  'cleanup_recommended',
]

function positiveIntegerOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback
}

export function normalizeAutonomyAlwaysOnPolicy(value: unknown): ProjectAutonomyAlwaysOnPolicy {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const retry = candidate.retry && typeof candidate.retry === 'object'
    ? (candidate.retry as Record<string, unknown>)
    : {}
  const notifications = candidate.notifications && typeof candidate.notifications === 'object'
    ? (candidate.notifications as Record<string, unknown>)
    : {}
  const prPublishing = candidate.prPublishing && typeof candidate.prPublishing === 'object'
    ? (candidate.prPublishing as Record<string, unknown>)
    : {}
  const cleanup = candidate.cleanup && typeof candidate.cleanup === 'object'
    ? (candidate.cleanup as Record<string, unknown>)
    : {}

  const notifyOn = Array.isArray(notifications.notifyOn)
    ? Array.from(
        new Set(
          notifications.notifyOn.filter(
            (event): event is ProjectAutonomyAlwaysOnNotificationEvent =>
              typeof event === 'string' &&
              VALID_ALWAYS_ON_NOTIFY_EVENTS.has(event as ProjectAutonomyAlwaysOnNotificationEvent),
          ),
        ),
      )
    : []

  return {
    enabled: candidate.enabled === true,
    retry: {
      enabled: retry.enabled === true,
      maxAttemptsPerPhase: positiveIntegerOrDefault(retry.maxAttemptsPerPhase, 1),
      cooldownMinutes: positiveIntegerOrDefault(retry.cooldownMinutes, 30),
      staleScheduledMinutes: positiveIntegerOrDefault(retry.staleScheduledMinutes, 30),
      staleRunningMinutes: positiveIntegerOrDefault(retry.staleRunningMinutes, 240),
    },
    notifications: {
      enabled: notifications.enabled === false ? false : true,
      digestOnly: notifications.digestOnly === false ? false : true,
      notifyOn: notifyOn.length > 0 ? notifyOn : [...DEFAULT_ALWAYS_ON_NOTIFY_EVENTS],
      minRepeatMinutes: positiveIntegerOrDefault(notifications.minRepeatMinutes, 60),
    },
    prPublishing: {
      enabled: prPublishing.enabled === true,
      mode: prPublishing.mode === 'draft' ? 'draft' : 'manual',
      baseBranch: asOptionalString(prPublishing.baseBranch),
      titlePrefix: asOptionalString(prPublishing.titlePrefix) ?? '[Hermes Workspace]',
      requireCleanRepo: prPublishing.requireCleanRepo === false ? false : true,
      requirePassingMergeTests: prPublishing.requirePassingMergeTests === false ? false : true,
    },
    cleanup: {
      enabled: cleanup.enabled === true,
      deleteMergedBranches: cleanup.deleteMergedBranches === true,
      retainMergedBranchDays: positiveIntegerOrDefault(cleanup.retainMergedBranchDays, 30),
      retainLaneStashes: cleanup.retainLaneStashes === false ? false : true,
      retainLaneStashDays: positiveIntegerOrDefault(cleanup.retainLaneStashDays, 30),
      dryRun: cleanup.dryRun === false ? false : true,
    },
  }
}

function normalizeAutonomyLanePolicy(
  value: unknown,
  projectDefaultBranch?: string,
): ProjectAutonomyLanePolicy {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    enabled: candidate.enabled === true,
    mode: 'single_lane',
    isolation: 'branch',
    maxActiveWorkItems: 1,
    baseBranch: asOptionalString(candidate.baseBranch) ?? projectDefaultBranch ?? 'main',
    branchPrefix: asOptionalString(candidate.branchPrefix) ?? 'mission',
    plannerTiming: 'on_lane_entry',
    blockedBehavior: 'park_and_continue_when_repo_clean',
    mergeHealerEnabled: candidate.mergeHealerEnabled === false ? false : true,
    allowParallelWorktrees: false,
    alwaysOn: normalizeAutonomyAlwaysOnPolicy(candidate.alwaysOn),
  }
}

function slugifyProjectName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || 'project'
}

function uniqueSlug(baseSlug: string, projects: Array<ProjectRecord>, excludeId?: string): string {
  const existing = new Set(
    projects
      .filter((project) => project.id !== excludeId)
      .map((project) => project.slug),
  )
  if (!existing.has(baseSlug)) return baseSlug
  let index = 2
  while (existing.has(`${baseSlug}-${index}`)) {
    index += 1
  }
  return `${baseSlug}-${index}`
}

function normalizeProject(
  project: (Omit<
    Partial<ProjectRecord>,
    'phaseProfiles' | 'runtimeProfiles' | 'reviewAutoApproval' | 'autopilotPolicy' | 'autonomyLanePolicy'
  > & {
    phaseProfiles?: unknown
    runtimeProfiles?: unknown
    reviewAutoApproval?: unknown
    autopilotPolicy?: unknown
    autonomyLanePolicy?: unknown
  }) &
    Pick<ProjectRecord, 'id' | 'name' | 'slug' | 'repoPath' | 'createdAt' | 'updatedAt'>,
): ProjectRecord {
  const defaultBranch = asOptionalString(project.defaultBranch)
  return {
    id: project.id,
    name: project.name.trim(),
    slug: project.slug.trim(),
    repoPath: project.repoPath.trim(),
    repoUrl: asOptionalString(project.repoUrl),
    defaultBranch,
    description: asOptionalString(project.description),
    phaseProfiles: normalizePhaseProfiles((project as Partial<ProjectRecord>).phaseProfiles),
    runtimeProfiles: normalizeRuntimeProfiles((project as Partial<ProjectRecord>).runtimeProfiles),
    reviewAutoApproval: normalizeReviewAutoApprovalPolicy(
      (project as Partial<ProjectRecord>).reviewAutoApproval,
    ),
    autopilotPolicy: normalizeAutopilotPolicy((project as Partial<ProjectRecord>).autopilotPolicy),
    autonomyLanePolicy: normalizeAutonomyLanePolicy(
      (project as Partial<ProjectRecord>).autonomyLanePolicy,
      defaultBranch,
    ),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}

export function listProjects(): Array<ProjectRecord> {
  return readProjectsFile().projects.map((project) => normalizeProject(project))
}

export function getProject(projectId: string): ProjectRecord | null {
  return listProjects().find((project) => project.id === projectId) ?? null
}

export function createProject(input: CreateProjectInput): ProjectRecord {
  const file = readProjectsFile()
  const now = new Date().toISOString()
  const baseSlug = slugifyProjectName(input.name)
  const project = normalizeProject({
    id: typeof input.id === 'string' && input.id.trim() ? input.id : randomUUID(),
    name: input.name,
    slug: uniqueSlug(baseSlug, file.projects.map((storedProject) => normalizeProject(storedProject))),
    repoPath: input.repoPath,
    repoUrl: input.repoUrl,
    defaultBranch: input.defaultBranch,
    description: input.description,
    phaseProfiles: input.phaseProfiles,
    runtimeProfiles: input.runtimeProfiles,
    reviewAutoApproval: input.reviewAutoApproval,
    autopilotPolicy: input.autopilotPolicy,
    autonomyLanePolicy: input.autonomyLanePolicy,
    createdAt: now,
    updatedAt: now,
  })
  file.projects.push(project)
  writeProjectsFile({ projects: file.projects.map((item) => normalizeProject(item)) })
  return project
}

function mergeAlwaysOnPolicyPatch(current: ProjectAutonomyAlwaysOnPolicy, updates: unknown): ProjectAutonomyAlwaysOnPolicy {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return current
  const patch = updates as Record<string, unknown>
  return normalizeAutonomyAlwaysOnPolicy({
    ...current,
    ...patch,
    retry:
      patch.retry && typeof patch.retry === 'object' && !Array.isArray(patch.retry)
        ? { ...current.retry, ...patch.retry }
        : current.retry,
    notifications:
      patch.notifications && typeof patch.notifications === 'object' && !Array.isArray(patch.notifications)
        ? { ...current.notifications, ...patch.notifications }
        : current.notifications,
    prPublishing:
      patch.prPublishing && typeof patch.prPublishing === 'object' && !Array.isArray(patch.prPublishing)
        ? { ...current.prPublishing, ...patch.prPublishing }
        : current.prPublishing,
    cleanup:
      patch.cleanup && typeof patch.cleanup === 'object' && !Array.isArray(patch.cleanup)
        ? { ...current.cleanup, ...patch.cleanup }
        : current.cleanup,
  })
}

function mergeAutonomyLanePolicyPatch(
  current: ProjectAutonomyLanePolicy,
  updates: unknown,
): ProjectAutonomyLanePolicy {
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return current
  const patch = updates as Record<string, unknown>
  return {
    ...current,
    ...patch,
    alwaysOn: mergeAlwaysOnPolicyPatch(current.alwaysOn, patch.alwaysOn),
  } as ProjectAutonomyLanePolicy
}

export function updateProject(projectId: string, updates: UpdateProjectInput): ProjectRecord | null {
  const file = readProjectsFile()
  const currentIndex = file.projects.findIndex((project) => project.id === projectId)
  if (currentIndex === -1) return null

  const current = normalizeProject(file.projects[currentIndex])
  const nextName = typeof updates.name === 'string' ? updates.name.trim() || current.name : current.name
  const nextSlug = uniqueSlug(
    slugifyProjectName(nextName),
    file.projects.map((project) => normalizeProject(project)),
    current.id,
  )
  const next = normalizeProject({
    ...current,
    ...updates,
    id: current.id,
    name: nextName,
    slug: nextSlug,
    repoPath:
      typeof updates.repoPath === 'string' && updates.repoPath.trim().length > 0
        ? updates.repoPath.trim()
        : current.repoPath,
    phaseProfiles:
      updates.phaseProfiles !== undefined ? updates.phaseProfiles : current.phaseProfiles,
    runtimeProfiles:
      updates.runtimeProfiles !== undefined ? updates.runtimeProfiles : current.runtimeProfiles,
    reviewAutoApproval:
      updates.reviewAutoApproval !== undefined
        ? updates.reviewAutoApproval
        : current.reviewAutoApproval,
    autopilotPolicy:
      updates.autopilotPolicy !== undefined
        ? {
            ...current.autopilotPolicy,
            ...(updates.autopilotPolicy && typeof updates.autopilotPolicy === 'object'
              ? updates.autopilotPolicy
              : {}),
          }
        : current.autopilotPolicy,
    autonomyLanePolicy:
      updates.autonomyLanePolicy !== undefined
        ? mergeAutonomyLanePolicyPatch(current.autonomyLanePolicy, updates.autonomyLanePolicy)
        : current.autonomyLanePolicy,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  })

  file.projects[currentIndex] = next
  writeProjectsFile({ projects: file.projects.map((project) => normalizeProject(project)) })
  return next
}

export function deleteProject(projectId: string): boolean {
  const file = readProjectsFile()
  const nextProjects = file.projects.filter((project) => project.id !== projectId)
  if (nextProjects.length === file.projects.length) return false
  writeProjectsFile({ projects: nextProjects.map((project) => normalizeProject(project)) })
  return true
}
