import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from './projects-store'

describe('projects-store', () => {
  let tempHome: string
  let previousHermesHome: string | undefined

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-projects-'))
    previousHermesHome = process.env.HERMES_HOME
    process.env.HERMES_HOME = path.join(tempHome, '.hermes')
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (previousHermesHome === undefined) delete process.env.HERMES_HOME
    else process.env.HERMES_HOME = previousHermesHome
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('creates projects with stable slugs and persists them to the file-backed store', () => {
    const project = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
      description: 'Primary Hermes Mission Control repo',
      defaultBranch: 'main',
      phaseProfiles: {
          research: 'planner',
        build: 'builder',
      },
    })

    expect(project.name).toBe('Mission Control')
    expect(project.slug).toBe('mission-control')
    expect(project.repoPath).toBe('/repos/mission-control')
    expect(project.description).toBe('Primary Hermes Mission Control repo')
    expect(project.defaultBranch).toBe('main')
    expect(project.phaseProfiles).toEqual({
          research: 'planner',
      build: 'builder',
      review: '',
      deploy: '',
    })
    expect(project.reviewAutoApproval).toEqual({
      enabled: false,
      maxPriority: 'low',
    })
    expect(project.createdAt).toMatch(/T/)
    expect(project.updatedAt).toBe(project.createdAt)

    expect(listProjects()).toEqual([project])
    expect(getProject(project.id)).toEqual(project)
  })

  it('keeps slugs unique and supports project updates and deletion', () => {
    const first = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control',
    })
    const second = createProject({
      name: 'Mission Control',
      repoPath: '/repos/mission-control-next',
    })

    expect(first.slug).toBe('mission-control')
    expect(second.slug).toBe('mission-control-2')

    const updated = updateProject(second.id, {
      name: 'Mission Control Next',
      description: 'Project detail copy',
      repoUrl: 'https://github.com/igochev/hermes-workspace',
      defaultBranch: 'develop',
      phaseProfiles: {
        research: 'planner',
        build: 'project-builder',
        review: 'reviewer',
      },
      reviewAutoApproval: {
        enabled: true,
        maxPriority: 'medium',
      },
    })

    expect(updated).not.toBeNull()
    expect(updated?.name).toBe('Mission Control Next')
    expect(updated?.slug).toBe('mission-control-next')
    expect(updated?.description).toBe('Project detail copy')
    expect(updated?.repoUrl).toBe('https://github.com/igochev/hermes-workspace')
    expect(updated?.defaultBranch).toBe('develop')
    expect(updated?.phaseProfiles).toEqual({
      research: 'planner',
      build: 'project-builder',
      review: 'reviewer',
      deploy: '',
    })
    expect(updated?.reviewAutoApproval).toEqual({
      enabled: true,
      maxPriority: 'medium',
    })
    expect(updated?.updatedAt >= updated!.createdAt).toBe(true)

    expect(deleteProject(first.id)).toBe(true)
    expect(getProject(first.id)).toBeNull()
    expect(listProjects().map((project) => project.id)).toEqual([second.id])
  })

  it('applies default autopilot policy for new projects', () => {
    const project = createProject({
      name: 'Autopilot defaults',
      repoPath: '/repos/autopilot-defaults',
    })

    expect(project.autopilotPolicy).toEqual({
      enabled: false,
      schedulePreset: 'manual',
      suggestionLimit: 5,
      scoutSources: ['repo-health-scout', 'stale-docs-scout', 'architecture-debt-scout'],
    })
  })

  it('normalizes autopilot policy updates', () => {
    const project = createProject({
      name: 'Autopilot normalize',
      repoPath: '/repos/autopilot-normalize',
    })

    const updated = updateProject(project.id, {
      autopilotPolicy: {
        enabled: true,
        schedulePreset: 'yearly' as unknown as 'daily',
        suggestionLimit: 0,
        scoutSources: ['failing-tests-scout', 'failing-tests-scout', 'unknown-source' as unknown as 'manual'],
      },
    })

    expect(updated?.autopilotPolicy).toEqual({
      enabled: true,
      schedulePreset: 'manual',
      suggestionLimit: 1,
      scoutSources: ['failing-tests-scout'],
    })
  })

  it('hydrates existing project records without autopilotPolicy using defaults', () => {
    const hermesHome = process.env.HERMES_HOME!
    fs.mkdirSync(hermesHome, { recursive: true })
    const projectsFile = path.join(hermesHome, 'projects.json')
    fs.writeFileSync(
      projectsFile,
      JSON.stringify(
        {
          projects: [
            {
              id: 'project-legacy',
              name: 'Legacy Project',
              slug: 'legacy-project',
              repoPath: '/repos/legacy',
              phaseProfiles: { research: '', build: '', review: '', deploy: '' },
              reviewAutoApproval: { enabled: false, maxPriority: 'low' },
              createdAt: '2026-04-25T00:00:00.000Z',
              updatedAt: '2026-04-25T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    )

    const legacy = listProjects()[0]
    expect(legacy.autopilotPolicy).toEqual({
      enabled: false,
      schedulePreset: 'manual',
      suggestionLimit: 5,
      scoutSources: ['repo-health-scout', 'stale-docs-scout', 'architecture-debt-scout'],
    })
  })
})
