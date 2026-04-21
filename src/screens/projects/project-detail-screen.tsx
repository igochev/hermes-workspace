'use client'

import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  FolderDetailsIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import {
  createWorkItem,
  deleteProject,
  fetchProject,
  type CreateWorkItemInput,
  WORK_ITEM_PHASE_LABELS,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/projects-api'
import { PROJECT_STATUS_ORDER } from '@/lib/projects-view-model'
import { cn } from '@/lib/utils'

const EMPTY_WORK_ITEM_FORM: Omit<CreateWorkItemInput, 'projectId'> = {
  title: '',
  description: '',
  status: 'inbox',
  phase: 'research',
  priority: 'medium',
  assignedProfile: '',
  repoPathSnapshot: '',
  acceptanceCriteria: [],
  notes: [],
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const queryKey = ['mission-control', 'projects', projectId] as const
  const [showCreateWorkItem, setShowCreateWorkItem] = useState(false)
  const [form, setForm] = useState(EMPTY_WORK_ITEM_FORM)

  const projectQuery = useQuery({
    queryKey,
    queryFn: () => fetchProject(projectId),
    refetchInterval: 30_000,
  })

  const project = projectQuery.data?.project ?? null
  const workItems = projectQuery.data?.workItems ?? []
  const workItemsByStatus = useMemo(() => {
    return PROJECT_STATUS_ORDER.map((status) => ({
      status,
      items: workItems.filter((item) => item.status === status),
    }))
  }, [workItems])

  const createWorkItemMutation = useMutation({
    mutationFn: createWorkItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      toast('Work item created')
      setShowCreateWorkItem(false)
      setForm(EMPTY_WORK_ITEM_FORM)
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to create work item', {
        type: 'error',
      })
    },
  })

  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects'] })
      toast(
        result.deletedWorkItems > 0
          ? `Project deleted with ${result.deletedWorkItems} work items`
          : 'Project deleted',
      )
      void navigate({ to: '/projects' })
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to delete project', {
        type: 'error',
      })
    },
  })

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleCreateWorkItem() {
    if (!project) return
    if (!form.title.trim()) {
      toast('Work item title is required', { type: 'error' })
      return
    }

    createWorkItemMutation.mutate({
      projectId: project.id,
      title: form.title.trim(),
      description: form.description?.trim() || undefined,
      status: form.status,
      phase: form.phase,
      priority: form.priority,
      assignedProfile: form.assignedProfile?.trim() || undefined,
      repoPathSnapshot: form.repoPathSnapshot?.trim() || project.repoPath,
      acceptanceCriteria: form.acceptanceCriteria,
      notes: form.notes,
    })
  }

  if (projectQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-sm text-primary-500">Loading project…</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-primary-200 bg-primary-50/70 p-8 text-center">
          <h2 className="text-xl font-semibold text-primary-900">Project not found</h2>
          <p className="mt-2 text-sm text-primary-600">
            The requested Mission Control project does not exist.
          </p>
          <Link
            to="/projects"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--theme-accent)] px-4 py-2 text-sm font-medium text-white"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            Back to Projects
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-primary-200 bg-primary-50/85 p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3 min-w-0">
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 transition-colors hover:text-primary-900"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                Back to Projects
              </Link>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  {project.slug}
                </p>
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={FolderDetailsIcon}
                    size={18}
                    className="text-primary-500"
                  />
                  <h1 className="text-2xl font-medium text-ink">{project.name}</h1>
                </div>
                <p className="max-w-3xl text-sm text-primary-600">
                  {project.description || 'No project description yet.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void projectQuery.refetch()}
                className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => setShowCreateWorkItem((value) => !value)}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                <HugeiconsIcon icon={Add01Icon} size={14} />
                {showCreateWorkItem ? 'Close' : 'New Work Item'}
              </button>
              <button
                type="button"
                onClick={() => deleteProjectMutation.mutate(project.id)}
                disabled={deleteProjectMutation.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
              >
                Delete Project
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Repo Path" value={project.repoPath} />
            <MetricCard label="Repo URL" value={project.repoUrl || '—'} />
            <MetricCard label="Default Branch" value={project.defaultBranch || '—'} />
            <MetricCard label="Work Items" value={`${project.workItemCount}`} />
          </div>

          {showCreateWorkItem ? (
            <div className="mt-5 grid gap-3 rounded-2xl border border-primary-200 bg-white/70 p-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Work Item Title
                </label>
                <Input
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                  placeholder="Implement /projects detail route"
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
                  placeholder="Describe the implementation goal and operator outcome"
                  className="min-h-24 w-full rounded-2xl border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none transition-shadow focus:ring-2 focus:ring-primary-500/25"
                />
              </div>
              <SelectField
                label="Status"
                value={form.status ?? 'inbox'}
                onChange={(value) => updateField('status', value as typeof form.status)}
                options={[
                  ['inbox', 'Inbox'],
                  ['ready', 'Ready'],
                  ['active', 'Active'],
                  ['blocked', 'Blocked'],
                  ['done', 'Done'],
                  ['cancelled', 'Cancelled'],
                ]}
              />
              <SelectField
                label="Phase"
                value={form.phase ?? 'research'}
                onChange={(value) => updateField('phase', value as typeof form.phase)}
                options={[
                  ['research', 'Research'],
                  ['build', 'Build'],
                  ['review', 'Review'],
                  ['deploy', 'Deploy'],
                ]}
              />
              <SelectField
                label="Priority"
                value={form.priority ?? 'medium'}
                onChange={(value) => updateField('priority', value as typeof form.priority)}
                options={[
                  ['high', 'High'],
                  ['medium', 'Medium'],
                  ['low', 'Low'],
                ]}
              />
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Assigned Profile
                </label>
                <Input
                  value={form.assignedProfile ?? ''}
                  onChange={(event) => updateField('assignedProfile', event.target.value)}
                  placeholder="builder"
                  nativeInput
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Repo Path Snapshot
                </label>
                <Input
                  value={form.repoPathSnapshot ?? ''}
                  onChange={(event) => updateField('repoPathSnapshot', event.target.value)}
                  placeholder={project.repoPath}
                  nativeInput
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Acceptance Criteria
                </label>
                <textarea
                  value={form.acceptanceCriteria.join('\n')}
                  onChange={(event) =>
                    updateField(
                      'acceptanceCriteria',
                      event.target.value
                        .split('\n')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="One acceptance criterion per line"
                  className="min-h-24 w-full rounded-2xl border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none transition-shadow focus:ring-2 focus:ring-primary-500/25"
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
                  Notes
                </label>
                <textarea
                  value={form.notes.join('\n')}
                  onChange={(event) =>
                    updateField(
                      'notes',
                      event.target.value
                        .split('\n')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="One note per line"
                  className="min-h-24 w-full rounded-2xl border border-primary-200 bg-surface px-3 py-2 text-sm text-primary-900 outline-none transition-shadow focus:ring-2 focus:ring-primary-500/25"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateWorkItem(false)
                    setForm(EMPTY_WORK_ITEM_FORM)
                  }}
                  className="rounded-lg border border-primary-200 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateWorkItem}
                  disabled={createWorkItemMutation.isPending}
                  className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {createWorkItemMutation.isPending
                    ? 'Creating…'
                    : 'Create Work Item'}
                </button>
              </div>
            </div>
          ) : null}
        </header>

        <section className="grid gap-4 xl:grid-cols-3">
          {PROJECT_STATUS_ORDER.map((status) => {
            const column = workItemsByStatus.find((entry) => entry.status === status)
            const items = column?.items ?? []
            return (
              <div
                key={status}
                className="rounded-2xl border border-primary-200 bg-white/80 p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-primary-900">
                      {WORK_ITEM_STATUS_LABELS[status]}
                    </h2>
                    <p className="text-xs text-primary-500">
                      {items.length} work item{items.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                    {items.length}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {items.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/60 px-3 py-6 text-center text-sm text-primary-500">
                      No {WORK_ITEM_STATUS_LABELS[status].toLowerCase()} work items yet.
                    </div>
                  ) : (
                    items.map((item) => (
                      <Link
                        key={item.id}
                        to="/projects/$projectId/work-items/$workItemId"
                        params={{ projectId: project.id, workItemId: item.id }}
                        className="group block rounded-2xl border border-primary-200 bg-primary-50/50 p-4 transition-all hover:border-accent-200 hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <h3 className="truncate text-sm font-semibold text-primary-900">
                              {item.title}
                            </h3>
                            <p className="line-clamp-2 text-xs text-primary-600">
                              {item.description || 'No description yet.'}
                            </p>
                          </div>
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            size={16}
                            className="text-primary-400 transition-transform group-hover:translate-x-0.5"
                          />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.phase ? <Tag>{WORK_ITEM_PHASE_LABELS[item.phase]}</Tag> : null}
                          <Tag>{WORK_ITEM_PRIORITY_LABELS[item.priority]}</Tag>
                          {item.assignedProfile ? <Tag>{item.assignedProfile}</Tag> : null}
                          {item.sessionKeys.length > 0 ? (
                            <Tag>{item.sessionKeys.length} sessions</Tag>
                          ) : null}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </section>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-white/70 p-4">
      <div className="text-xs uppercase tracking-wide text-primary-500">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-primary-900">{value}</div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-wide text-primary-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-2xl border border-primary-200 bg-surface px-3 text-sm text-primary-900 outline-none transition-shadow focus:ring-2 focus:ring-primary-500/25"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border border-primary-200 bg-white px-2 py-0.5 text-[11px] font-medium text-primary-700')}>
      {children}
    </span>
  )
}
