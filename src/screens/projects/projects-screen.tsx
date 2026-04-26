'use client'

import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowRight01Icon,
  Folder01Icon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import {
  buildProjectStatsLine,
  groupWorkItemsByStatus,
  PROJECT_STATUS_ORDER,
} from '@/lib/projects-view-model'
import {
  createProject,
  fetchProjects,
  WORK_ITEM_STATUS_LABELS,
  type CreateProjectInput,
} from '@/lib/projects-api'
import { cn } from '@/lib/utils'

export const PROJECTS_QUERY_KEY = ['mission-control', 'projects'] as const

export const PROJECTS_PANEL_CLASS =
  'rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm backdrop-blur-xl'

export const PROJECTS_CARD_CLASS =
  'group rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--theme-accent)] hover:shadow-lg'

export const PROJECTS_STAT_PILL_CLASS =
  'inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)]'

export const PROJECTS_CLICKABILITY_AUDIT = [
  { surface: 'refresh', label: 'Refresh', kind: 'button', target: 'projectsQuery.refetch' },
  { surface: 'approvals-inbox', label: 'Approvals Inbox', kind: 'link', target: '/projects/approvals' },
  { surface: 'autopilot-inbox', label: 'Autopilot Inbox', kind: 'link', target: '/projects/autopilot' },
  { surface: 'new-project', label: 'New Project', kind: 'button', target: 'toggle-create-project-form' },
  { surface: 'project-card', label: 'Open Project', kind: 'link', target: '/projects/:projectId' },
  { surface: 'status-pill', label: 'Project status counts', kind: 'static', target: null },
] as const

const EMPTY_PROJECT_FORM: CreateProjectInput = {
  name: '',
  repoPath: '',
  repoUrl: '',
  defaultBranch: 'main',
  description: '',
}

export function ProjectsScreen() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateProjectInput>(EMPTY_PROJECT_FORM)

  const projectsQuery = useQuery({
    queryKey: PROJECTS_QUERY_KEY,
    queryFn: fetchProjects,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

  const projects = projectsQuery.data ?? []
  const groupedCounts = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.total += project.workItemCount
        acc.active += project.activeWorkItemCount
        acc.done += project.doneWorkItemCount
        return acc
      },
      { total: 0, active: 0, done: 0 },
    )
  }, [projects])

  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY })
      toast('Project created')
      setShowCreate(false)
      setForm(EMPTY_PROJECT_FORM)
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to create project', {
        type: 'error',
      })
    },
  })

  function updateField<K extends keyof CreateProjectInput>(
    key: K,
    value: CreateProjectInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleCreateProject() {
    if (!form.name.trim() || !form.repoPath.trim()) {
      toast('Name and repo path are required', { type: 'error' })
      return
    }
    createProjectMutation.mutate({
      name: form.name.trim(),
      repoPath: form.repoPath.trim(),
      repoUrl: form.repoUrl?.trim() || undefined,
      defaultBranch: form.defaultBranch?.trim() || undefined,
      description: form.description?.trim() || undefined,
    })
  }

  return (
    <div className="min-h-full bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        <header className={PROJECTS_PANEL_CLASS}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1 text-xs font-medium text-[var(--theme-text)]">
                <HugeiconsIcon icon={Folder01Icon} size={14} />
                Mission Control
              </div>
              <div>
                <h1 className="text-2xl font-medium text-ink">Projects</h1>
                <p className="mt-2 max-w-3xl text-sm text-[var(--theme-muted)]">
                  Canonical project and work-item control plane for Hermes Workspace.
                  Phase 1 is file-backed and merge-safe by design.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--theme-muted)]">
              <StatPill label="Projects" value={projects.length} />
              <StatPill label="Work items" value={groupedCounts.total} />
              <StatPill label="Active" value={groupedCounts.active} />
              <StatPill label="Done" value={groupedCounts.done} />
              <button
                type="button"
                onClick={() => void projectsQuery.refetch()}
                className={`${PROJECTS_STAT_PILL_CLASS} transition-colors hover:bg-[var(--theme-card2)]/80`}
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} />
                Refresh
              </button>
              <Link
                to="/projects/approvals"
                className={PROJECTS_STAT_PILL_CLASS}
              >
                Approvals Inbox
              </Link>
              <Link
                to="/projects/autopilot"
                className={PROJECTS_STAT_PILL_CLASS}
              >
                Autopilot Inbox
              </Link>
              <button
                type="button"
                onClick={() => setShowCreate((value) => !value)}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                <HugeiconsIcon icon={Add01Icon} size={14} />
                {showCreate ? 'Close' : 'New Project'}
              </button>
            </div>
          </div>

          {showCreate ? (
            <div className="mt-5 grid gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-1">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Name
                </label>
                <Input
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Hermes Workspace"
                  nativeInput
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Repo Path
                </label>
                <Input
                  value={form.repoPath}
                  onChange={(event) => updateField('repoPath', event.target.value)}
                  placeholder="/home/d3ni3/.Hermes/workspace/projects/hermes-workspace"
                  nativeInput
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Repo URL
                </label>
                <Input
                  value={form.repoUrl ?? ''}
                  onChange={(event) => updateField('repoUrl', event.target.value)}
                  placeholder="https://github.com/igochev/hermes-workspace"
                  nativeInput
                />
              </div>
              <div className="space-y-1 md:col-span-1">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Default Branch
                </label>
                <Input
                  value={form.defaultBranch ?? ''}
                  onChange={(event) => updateField('defaultBranch', event.target.value)}
                  placeholder="main"
                  nativeInput
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Description
                </label>
                <textarea
                  value={form.description ?? ''}
                  onChange={(event) => updateField('description', event.target.value)}
                  placeholder="What this project controls or builds"
                  className="min-h-24 w-full rounded-2xl border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none transition-shadow focus:ring-2 focus:ring-primary-500/25"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false)
                    setForm(EMPTY_PROJECT_FORM)
                  }}
                  className="rounded-lg border border-primary-200 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateProject}
                  disabled={createProjectMutation.isPending}
                  className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {createProjectMutation.isPending ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </div>
          ) : null}
        </header>

        {projectsQuery.isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-primary-200 bg-primary-50/60 p-5 animate-pulse"
              >
                <div className="mb-3 h-5 w-40 rounded bg-primary-100" />
                <div className="mb-2 h-3 w-56 rounded bg-primary-100" />
                <div className="h-3 w-32 rounded bg-primary-100" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyProjectsState onCreate={() => setShowCreate(true)} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const grouped = groupWorkItemsByStatus([])
              return (
                <Link
                  key={project.id}
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className={PROJECTS_CARD_CLASS}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                        {project.slug}
                      </p>
                      <h2 className="truncate text-lg font-semibold text-ink">
                        {project.name}
                      </h2>
                    </div>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={18}
                      className="text-[var(--theme-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--theme-text)]"
                    />
                  </div>

                  <p className="mt-3 line-clamp-2 min-h-10 text-sm text-[var(--theme-muted)]">
                    {project.description || 'No project description yet.'}
                  </p>

                  <dl className="mt-4 space-y-2 text-sm text-[var(--theme-text)]">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-[var(--theme-muted)]">
                        Repo Path
                      </dt>
                      <dd className="truncate font-medium">{project.repoPath}</dd>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--theme-muted)]">
                      <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-1">
                        {buildProjectStatsLine(project)}
                      </span>
                      {project.defaultBranch ? (
                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-1">
                          Branch: {project.defaultBranch}
                        </span>
                      ) : null}
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {PROJECT_STATUS_ORDER.map((status) => {
                      const count =
                        status === 'active'
                          ? project.activeWorkItemCount
                          : status === 'done'
                            ? project.doneWorkItemCount
                            : grouped[status].length
                      if (count === 0) return null
                      return (
                        <span
                          key={status}
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                            status === 'active'
                              ? 'border-amber-200 bg-amber-50 text-amber-700'
                              : status === 'done'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-primary-200 bg-primary-50 text-primary-700',
                          )}
                        >
                          {WORK_ITEM_STATUS_LABELS[status]} · {count}
                        </span>
                      )
                    })}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className={PROJECTS_STAT_PILL_CLASS}>
      <span className="font-semibold text-ink">{value}</span>
      <span>{label}</span>
    </span>
  )
}

function EmptyProjectsState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card)] p-8 text-center">
      <div className="max-w-lg space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-text)] shadow-sm">
          <HugeiconsIcon icon={Folder01Icon} size={24} strokeWidth={1.7} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-ink">No projects yet</h2>
          <p className="mt-2 text-sm text-[var(--theme-muted)]">
            Create your first Mission Control project to start tracking canonical work items.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--theme-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          <HugeiconsIcon icon={Add01Icon} size={16} />
          Create First Project
        </button>
      </div>
    </div>
  )
}
