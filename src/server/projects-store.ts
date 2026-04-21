import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type ProjectRecord = {
  id: string
  name: string
  slug: string
  repoPath: string
  repoUrl?: string
  defaultBranch?: string
  description?: string
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
}

type UpdateProjectInput = Partial<Omit<ProjectRecord, 'id' | 'createdAt' | 'updatedAt'>>

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

function normalizeProject(project: Partial<ProjectRecord> & Pick<ProjectRecord, 'id' | 'name' | 'slug' | 'repoPath' | 'createdAt' | 'updatedAt'>): ProjectRecord {
  return {
    id: project.id,
    name: project.name.trim(),
    slug: project.slug.trim(),
    repoPath: project.repoPath.trim(),
    repoUrl: asOptionalString(project.repoUrl),
    defaultBranch: asOptionalString(project.defaultBranch),
    description: asOptionalString(project.description),
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
