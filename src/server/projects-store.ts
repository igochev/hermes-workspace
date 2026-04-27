import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { normalizePhaseProfiles, type ConductorPhaseProfiles } from '../lib/conductor-phase-profiles'

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
    slug: uniqueSlug(baseSlug, file.projects.map((project) => normalizeProject(project))),
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
        ? {
            ...current.autonomyLanePolicy,
            ...(updates.autonomyLanePolicy && typeof updates.autonomyLanePolicy === 'object'
              ? updates.autonomyLanePolicy
              : {}),
          }
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
