'use client'

import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  GithubIcon,
  GitBranchIcon,
  PlayIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { toast } from '@/components/ui/toast'
import {
  deleteWorkItem,
  fetchWorkItem,
  WORK_ITEM_PHASE_LABELS,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/projects-api'
import { launchWorkItem } from '@/lib/work-item-launch-api'

export function WorkItemDetailScreen({
  projectId,
  workItemId,
}: {
  projectId: string
  workItemId: string
}) {
  const queryClient = useQueryClient()
  const queryKey = ['mission-control', 'work-items', workItemId] as const
  const workItemQuery = useQuery({
    queryKey,
    queryFn: () => fetchWorkItem(workItemId),
    refetchInterval: 30_000,
  })

  const launchMutation = useMutation({
    mutationFn: () =>
      launchWorkItem(workItemId, {
        phase: workItem?.phase ?? 'build',
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast(
        result.launch.profile
          ? `Launched ${result.launch.phase} via Conductor (${result.launch.profile})`
          : `Launched ${result.launch.phase} via Conductor`,
      )
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to launch work item', {
        type: 'error',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteWorkItem,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects', projectId] })
      toast('Work item deleted')
      window.location.href = `/projects/${projectId}`
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to delete work item', {
        type: 'error',
      })
    },
  })

  const payload = workItemQuery.data
  const workItem = payload?.workItem ?? null
  const project = payload?.project ?? null

  if (workItemQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-primary-500">
        Loading work item…
      </div>
    )
  }

  if (!workItem) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-primary-200 bg-primary-50/70 p-8 text-center">
          <h2 className="text-xl font-semibold text-primary-900">Work item not found</h2>
          <p className="mt-2 text-sm text-primary-600">
            The requested work item could not be loaded.
          </p>
          <Link
            to="/projects/$projectId"
            params={{ projectId }}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--theme-accent)] px-4 py-2 text-sm font-medium text-white"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            Back to Project
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        <header className="rounded-2xl border border-primary-200 bg-primary-50/85 p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3 min-w-0">
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 transition-colors hover:text-primary-900"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                Back to {project?.name || 'Project'}
              </Link>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge>{WORK_ITEM_STATUS_LABELS[workItem.status]}</Badge>
                  {workItem.phase ? <Badge>{WORK_ITEM_PHASE_LABELS[workItem.phase]}</Badge> : null}
                  <Badge>{WORK_ITEM_PRIORITY_LABELS[workItem.priority]}</Badge>
                  {workItem.assignedProfile ? <Badge>{workItem.assignedProfile}</Badge> : null}
                </div>
                <h1 className="text-2xl font-medium text-ink">{workItem.title}</h1>
                <p className="max-w-3xl text-sm text-primary-600">
                  {workItem.description || 'No work item description yet.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void workItemQuery.refetch()}
                className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100"
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => launchMutation.mutate()}
                disabled={launchMutation.isPending}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <HugeiconsIcon icon={PlayIcon} size={14} />
                {launchMutation.isPending ? 'Launching…' : 'Launch via Conductor'}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(workItem.id)}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
          <div className="space-y-4">
            <Panel title="Mission Control Summary">
              <dl className="grid gap-3 md:grid-cols-2">
                <Detail label="Project" value={project?.name || 'Unknown project'} />
                <Detail label="Repo Snapshot" value={workItem.repoPathSnapshot} />
                <Detail label="Mission ID" value={workItem.missionId || '—'} />
                <Detail label="Mission Link" value={workItem.missionLink || '—'} />
                <Detail label="Assigned Profile" value={workItem.assignedProfile || '—'} />
                <Detail label="Launch Sessions" value={workItem.sessionKeys.join(', ') || '—'} />
                <Detail label="Created" value={workItem.createdAt} />
                <Detail label="Updated" value={workItem.updatedAt} />
              </dl>
            </Panel>

            <Panel title="Acceptance Criteria">
              {workItem.acceptanceCriteria.length === 0 ? (
                <EmptyCopy>No acceptance criteria recorded yet.</EmptyCopy>
              ) : (
                <ul className="space-y-2">
                  {workItem.acceptanceCriteria.map((criterion, index) => (
                    <li
                      key={`${criterion}-${index}`}
                      className="rounded-2xl border border-primary-200 bg-primary-50/70 px-3 py-2 text-sm text-primary-800"
                    >
                      {criterion}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Operator Notes">
              {workItem.notes.length === 0 ? (
                <EmptyCopy>No notes recorded yet.</EmptyCopy>
              ) : (
                <ul className="space-y-2">
                  {workItem.notes.map((note, index) => (
                    <li
                      key={`${note}-${index}`}
                      className="rounded-2xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-800"
                    >
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title="Delivery Evidence">
              <div className="space-y-3 text-sm text-primary-700">
                <EvidenceRow
                  icon={GitBranchIcon}
                  label="Branch"
                  value={workItem.branchName || 'No branch recorded'}
                />
                <EvidenceRow
                  icon={GithubIcon}
                  label="PR URL"
                  value={workItem.prUrl || 'No PR recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Mission Link"
                  value={workItem.missionLink || 'No mission link recorded'}
                />
                <EvidenceRow
                  icon={PlayIcon}
                  label="Session Keys"
                  value={
                    workItem.sessionKeys.length > 0
                      ? workItem.sessionKeys.join(', ')
                      : 'No linked sessions yet'
                  }
                />
              </div>
            </Panel>

            <Panel title="Phase History">
              {workItem.history.length === 0 ? (
                <EmptyCopy>No phase history recorded yet.</EmptyCopy>
              ) : (
                <ul className="space-y-2">
                  {workItem.history
                    .slice()
                    .reverse()
                    .map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-2xl border border-primary-200 bg-white px-3 py-3 text-sm text-primary-800"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-primary-500">
                          <span>{entry.action}</span>
                          {entry.phase ? <span>{WORK_ITEM_PHASE_LABELS[entry.phase]}</span> : null}
                          {entry.status ? <span>{WORK_ITEM_STATUS_LABELS[entry.status]}</span> : null}
                          {entry.profile ? <span>{entry.profile}</span> : null}
                        </div>
                        <div className="mt-2 font-medium text-primary-900">{entry.note}</div>
                        <div className="mt-2 space-y-1 text-xs text-primary-500">
                          {entry.missionId ? <div>Mission: {entry.missionId}</div> : null}
                          {entry.sessionKey ? <div>Session: {entry.sessionKey}</div> : null}
                          {entry.sessionKeyPrefix ? <div>Session Prefix: {entry.sessionKeyPrefix}</div> : null}
                          <div>{entry.createdAt}</div>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </Panel>

            <Panel title="Artifacts">
              {workItem.artifactPaths.length === 0 ? (
                <EmptyCopy>No artifacts recorded yet.</EmptyCopy>
              ) : (
                <ul className="space-y-2">
                  {workItem.artifactPaths.map((artifactPath) => (
                    <li
                      key={artifactPath}
                      className="break-all rounded-2xl border border-primary-200 bg-white px-3 py-2 text-sm text-primary-800"
                    >
                      {artifactPath}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-primary-200 bg-white/80 p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-primary-900">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-3">
      <div className="text-xs uppercase tracking-wide text-primary-500">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-primary-900">{value}</div>
    </div>
  )
}

function EvidenceRow({
  icon,
  label,
  value,
}: {
  icon: unknown
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-50/70 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary-500">
        <HugeiconsIcon icon={icon as never} size={14} />
        {label}
      </div>
      <div className="mt-2 break-all text-sm font-medium text-primary-900">{value}</div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary-200 bg-white px-2.5 py-1 text-xs font-medium text-primary-700">
      {children}
    </span>
  )
}

function EmptyCopy({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/60 px-3 py-6 text-center text-sm text-primary-500">
      {children}
    </div>
  )
}
