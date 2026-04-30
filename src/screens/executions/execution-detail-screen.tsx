'use client'

import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

import type { ExecutionRunRecord } from '../../server/execution-runs-store'

export const EXECUTION_DETAIL_SCREEN_TITLE = 'Execution trace'
export const EXECUTION_DETAIL_SESSION_SECTION_TITLE =
  'Session / engine evidence'
export const EXECUTION_DETAIL_JOB_SECTION_TITLE = 'Job definition evidence'
export const EXECUTION_DETAIL_LIVE_PROGRESS_SECTION_TITLE = 'Live progress'
export const EXECUTION_DETAIL_REFRESH_NOW_LABEL = 'Refresh now'
export const EXECUTION_DETAIL_OPEN_SESSION_LABEL = 'Open Session'
export const EXECUTION_DETAIL_RUN_SECTION_TITLE = 'Run evidence'
export const EXECUTION_DETAIL_EVIDENCE_SECTION_TITLE =
  'Branch, PR, artifact, and error evidence'
export const EXECUTION_DETAIL_BACK_TO_WORK_ITEM_LABEL = 'Back to Work Item'
export const EXECUTION_DETAIL_OPEN_SCHEDULED_JOB_LABEL =
  'Open Scheduled Job definition'

export type ExecutionDetailItem = {
  label: string
  value: string
}

export type ExecutionDetailAction = {
  label: string
  href: string
  tone: 'primary' | 'secondary'
}

export type ExecutionDetailScreenViewModel = {
  header: {
    title: string
    executionId: string
    state: string
    phase: string
    role: string
    workItemId: string
    projectId: string
    workItemHref: string | null
    projectHref: string | null
    lastObservedAt: string
    startedAt: string
    finishedAt: string
  }
  liveProgress: { title: string; items: Array<ExecutionDetailItem> }
  polling: { enabled: boolean; intervalMs: number }
  staleWarning: string | null
  recoveryGuidance: string | null
  sections: {
    session: { title: string; items: Array<ExecutionDetailItem> }
    job: { title: string; items: Array<ExecutionDetailItem> }
    run: { title: string; items: Array<ExecutionDetailItem> }
    evidence: { title: string; items: Array<ExecutionDetailItem> }
  }
  actions: Array<ExecutionDetailAction>
}

type ExecutionRunDetailApiResponse = {
  run: ExecutionRunRecord
}

function present(value: string | undefined | null): string {
  return value && value.trim().length > 0 ? value : '—'
}

function hasValue(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function buildProjectHref(projectId: string | undefined): string | null {
  return hasValue(projectId)
    ? `/projects/${encodeURIComponent(projectId)}`
    : null
}

function buildWorkItemHref(run: ExecutionRunRecord): string | null {
  if (!hasValue(run.workItemId) || !hasValue(run.projectId)) return null
  return `/projects/${encodeURIComponent(run.projectId)}/work-items/${encodeURIComponent(run.workItemId)}`
}

function buildScheduledJobHref(jobId: string | undefined): string | null {
  if (!hasValue(jobId)) return null
  return `/jobs?jobId=${encodeURIComponent(jobId)}`
}

type BuildExecutionDetailOptions = { now?: string }

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function isActiveExecutionState(state: string): boolean {
  return state === 'queued' || state === 'scheduled' || state === 'running'
}

function secondsSince(timestamp: string | undefined, now: string): number | null {
  if (!hasValue(timestamp)) return null
  const delta = new Date(now).getTime() - new Date(timestamp).getTime()
  return Number.isFinite(delta) && delta > 0 ? Math.floor(delta / 1000) : 0
}

function buildExecutionTitle(run: ExecutionRunRecord): string {
  const phase = hasValue(run.phase) ? titleCase(run.phase) : 'Execution'
  const profile = hasValue(run.profile) ? run.profile : run.role
  const work = hasValue(run.workItemId) ? run.workItemId : run.id
  return `${phase} · ${profile} · ${work}`
}

export function buildExecutionDetailScreenViewModel(
  run: ExecutionRunRecord,
  options: BuildExecutionDetailOptions = {},
): ExecutionDetailScreenViewModel {
  const workItemHref = buildWorkItemHref(run)
  const scheduledJobHref = buildScheduledJobHref(run.jobId)
  const actions: Array<ExecutionDetailAction> = [
    { label: EXECUTION_DETAIL_REFRESH_NOW_LABEL, href: '#refresh', tone: 'secondary' },
  ]
  if (workItemHref) {
    actions.push({
      label: EXECUTION_DETAIL_BACK_TO_WORK_ITEM_LABEL,
      href: workItemHref,
      tone: 'primary',
    })
  }
  if (hasValue(run.sessionKey)) {
    actions.push({
      label: EXECUTION_DETAIL_OPEN_SESSION_LABEL,
      href: `/sessions/${encodeURIComponent(run.sessionKey)}`,
      tone: 'secondary',
    })
  }
  if (scheduledJobHref) {
    actions.push({
      label: EXECUTION_DETAIL_OPEN_SCHEDULED_JOB_LABEL,
      href: scheduledJobHref,
      tone: 'secondary',
    })
  }

  const active = isActiveExecutionState(run.state)
  const now = options.now ?? new Date().toISOString()
  const heartbeatAgeSeconds = secondsSince(run.lastObservedAt, now)
  const staleWarning =
    active && heartbeatAgeSeconds !== null && heartbeatAgeSeconds > 300
      ? `No heartbeat for ${heartbeatAgeSeconds} seconds; execution may be stale.`
      : null
  const recoveryGuidance =
    run.state === 'failed' && hasValue(run.error)
      ? `Execution failed: ${run.error}. Review the output, then retry or recover from the Work Item.`
      : null

  return {
    header: {
      title: buildExecutionTitle(run),
      executionId: run.id,
      state: run.state,
      phase: present(run.phase),
      role: run.role,
      workItemId: present(run.workItemId),
      projectId: present(run.projectId),
      workItemHref,
      projectHref: buildProjectHref(run.projectId),
      lastObservedAt: present(run.lastObservedAt),
      startedAt: present(run.startedAt),
      finishedAt: present(run.finishedAt),
    },
    liveProgress: {
      title: EXECUTION_DETAIL_LIVE_PROGRESS_SECTION_TITLE,
      items: [
        { label: 'Started', value: present(run.startedAt) },
        { label: 'Last observed', value: present(run.lastObservedAt) },
        { label: 'Finished', value: present(run.finishedAt) },
        { label: 'Current session', value: present(run.sessionKey) },
        { label: 'Latest output', value: present(run.latestOutputText) },
        { label: 'Final response', value: present(run.finalResponse) },
        { label: 'Error', value: present(run.error) },
      ],
    },
    polling: { enabled: active, intervalMs: active ? 3000 : 0 },
    staleWarning,
    recoveryGuidance,
    sections: {
      session: {
        title: EXECUTION_DETAIL_SESSION_SECTION_TITLE,
        items: [
          { label: 'Session key', value: present(run.sessionKey) },
          { label: 'Session prefix', value: present(run.sessionKeyPrefix) },
          { label: 'Engine', value: present(run.engine) },
        ],
      },
      job: {
        title: EXECUTION_DETAIL_JOB_SECTION_TITLE,
        items: [
          { label: 'Job ID', value: present(run.jobId) },
          { label: 'Job name', value: present(run.jobName) },
        ],
      },
      run: {
        title: EXECUTION_DETAIL_RUN_SECTION_TITLE,
        items: [{ label: 'Run ID', value: present(run.runId) }],
      },
      evidence: {
        title: EXECUTION_DETAIL_EVIDENCE_SECTION_TITLE,
        items: [
          { label: 'Branch', value: present(run.branchName) },
          { label: 'Pull request', value: present(run.prUrl) },
          {
            label: 'Artifacts / results',
            value:
              run.artifactPaths.length > 0 ? run.artifactPaths.join(', ') : '—',
          },
          { label: 'Error', value: present(run.error) },
        ],
      },
    },
    actions,
  }
}

async function fetchExecutionRunDetail(
  executionId: string,
): Promise<ExecutionRunRecord> {
  const response = await fetch(
    `/api/execution-runs/${encodeURIComponent(executionId)}`,
  )
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = (await response.json()) as Partial<ExecutionRunDetailApiResponse>
  if (!data.run) throw new Error('Execution run response did not include a run')
  return data.run
}

function Badge({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-[var(--theme-border)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
      {children}
    </span>
  )
}

function EvidenceSection({
  title,
  items,
}: {
  title: string
  items: Array<ExecutionDetailItem>
}) {
  return (
    <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <dl className="mt-4 grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              {item.label}
            </dt>
            <dd className="mt-1 break-words text-sm text-[var(--theme-text)]">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function ExecutionDetailScreen({
  executionIdOverride,
}: {
  executionIdOverride?: string
} = {}) {
  const params = useParams({ from: '/executions/$executionId', shouldThrow: false })
  const executionId = executionIdOverride ?? params?.executionId ?? ''
  const executionDetailQuery = useQuery({
    queryKey: ['mission-control', 'execution-detail', executionId],
    queryFn: () => fetchExecutionRunDetail(executionId),
    staleTime: 5_000,
    refetchInterval: (detailQuery) => {
      const state = detailQuery.state.data?.state
      return state && isActiveExecutionState(state) ? 3000 : false
    },
  })

  if (executionDetailQuery.isLoading) {
    return (
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 text-[var(--theme-text)] sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-muted)]">
          Loading execution trace…
        </div>
      </section>
    )
  }

  if (executionDetailQuery.isError || !executionDetailQuery.data) {
    return (
      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 text-[var(--theme-text)] sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-[var(--theme-danger)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-text)]">
          Failed to load execution trace:{' '}
          {executionDetailQuery.error instanceof Error ? executionDetailQuery.error.message : 'Unknown error'}
        </div>
      </section>
    )
  }

  const viewModel = buildExecutionDetailScreenViewModel(executionDetailQuery.data)

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 text-[var(--theme-text)] sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--theme-muted)]">
              Execution evidence
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              {viewModel.header.title}
            </h1>
            <p className="mt-2 break-all text-sm text-[var(--theme-muted)]">
              {viewModel.header.executionId}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>{viewModel.header.state}</Badge>
              <Badge>{viewModel.header.phase}</Badge>
              <Badge>{viewModel.header.role}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {viewModel.actions.map((action) =>
              action.href.startsWith('/projects/') ? (
                <Link
                  key={action.label}
                  to="/projects/$projectId/work-items/$workItemId"
                  params={{
                    projectId: executionDetailQuery.data.projectId,
                    workItemId: executionDetailQuery.data.workItemId,
                  }}
                  className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm text-[var(--theme-text)]"
                >
                  {action.label}
                </Link>
              ) : (
                <a
                  key={action.label}
                  href={action.href}
                  className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
                >
                  {action.label}
                </a>
              ),
            )}
          </div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Last observed
            </dt>
            <dd>{viewModel.header.lastObservedAt}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Started
            </dt>
            <dd>{viewModel.header.startedAt}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.18em] text-[var(--theme-muted)]">
              Finished
            </dt>
            <dd>{viewModel.header.finishedAt}</dd>
          </div>
        </dl>
      </header>

      {viewModel.staleWarning ? (
        <div className="rounded-2xl border border-amber-500/60 bg-[var(--theme-card)] p-5 text-sm text-amber-200">
          {viewModel.staleWarning}
        </div>
      ) : null}
      {viewModel.recoveryGuidance ? (
        <div className="rounded-2xl border border-[var(--theme-danger)] bg-[var(--theme-card)] p-5 text-sm text-[var(--theme-text)]">
          {viewModel.recoveryGuidance}
        </div>
      ) : null}
      <EvidenceSection
        title={viewModel.liveProgress.title}
        items={viewModel.liveProgress.items}
      />
      <EvidenceSection
        title={viewModel.sections.session.title}
        items={viewModel.sections.session.items}
      />
      <EvidenceSection
        title={viewModel.sections.job.title}
        items={viewModel.sections.job.items}
      />
      <EvidenceSection
        title={viewModel.sections.run.title}
        items={viewModel.sections.run.items}
      />
      <EvidenceSection
        title={viewModel.sections.evidence.title}
        items={viewModel.sections.evidence.items}
      />
    </section>
  )
}
