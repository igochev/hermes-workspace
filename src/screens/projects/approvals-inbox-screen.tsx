'use client'

import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon, CheckmarkCircle02Icon, RefreshIcon, TaskDone01Icon } from '@hugeicons/core-free-icons'
import { toast } from '@/components/ui/toast'
import {
  fetchApprovalInbox,
  resolveWorkItemApproval,
  type ApprovalInboxEntry,
} from '@/lib/work-item-approvals-api'

export const APPROVALS_INBOX_QUERY_KEY = ['mission-control', 'approvals'] as const
export const APPROVALS_INBOX_PANEL_CLASS =
  'rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm backdrop-blur-xl'
export const APPROVALS_INBOX_EMPTY_COPY = 'No pending approvals. Recent approval decisions stay visible below for audit.'

function formatTimestamp(value?: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function statusTone(status: ApprovalInboxEntry['status']): string {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (status === 'changes_requested') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (status === 'rejected') return 'border-red-200 bg-red-50 text-red-700'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

export function ApprovalsInboxScreen() {
  const queryClient = useQueryClient()
  const approvalsQuery = useQuery({
    queryKey: APPROVALS_INBOX_QUERY_KEY,
    queryFn: fetchApprovalInbox,
    refetchInterval: 30_000,
  })

  const resolveMutation = useMutation({
    mutationFn: ({ approvalId, decision }: { approvalId: string; decision: 'approved' | 'changes_requested' }) =>
      resolveWorkItemApproval(approvalId, {
        decision,
        resolvedBy: 'D3n13r',
      }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: APPROVALS_INBOX_QUERY_KEY })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects'] })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'work-items'] })
      toast(
        variables.decision === 'approved'
          ? 'Approval marked approved'
          : 'Approval marked changes requested',
      )
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to resolve approval', {
        type: 'error',
      })
    },
  })

  const approvals = approvalsQuery.data ?? []
  const pending = approvals.filter((approval) => approval.status === 'pending')
  const recent = approvals.filter((approval) => approval.status !== 'pending')

  return (
    <div className="min-h-full bg-surface text-ink">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 px-4 py-6 pb-[calc(var(--tabbar-h,80px)+1.5rem)] sm:px-6 lg:px-8">
        <header className={APPROVALS_INBOX_PANEL_CLASS}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3 min-w-0">
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-text)]"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                Back to Projects
              </Link>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1 text-xs font-medium text-[var(--theme-text)]">
                  <HugeiconsIcon icon={TaskDone01Icon} size={14} />
                  Mission Control
                </div>
                <div>
                  <h1 className="text-2xl font-medium text-ink">Approvals Inbox</h1>
                  <p className="mt-2 max-w-3xl text-sm text-[var(--theme-muted)]">
                    Review pending work-item approvals and keep recent decisions visible for audit.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--theme-muted)]">
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 font-medium text-[var(--theme-text)]">
                Pending {pending.length}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 font-medium text-[var(--theme-text)]">
                Recent {recent.length}
              </span>
              <button
                type="button"
                onClick={() => void approvalsQuery.refetch()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]/80"
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className={APPROVALS_INBOX_PANEL_CLASS}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">Pending Approvals</h2>
                {approvalsQuery.isLoading ? (
                  <span className="text-xs text-[var(--theme-muted)]">Loading…</span>
                ) : null}
              </div>

              {pending.length === 0 ? (
                <p className="text-sm text-[var(--theme-muted)]">{APPROVALS_INBOX_EMPTY_COPY}</p>
              ) : (
                <div className="space-y-3">
                  {pending.map((approval) => (
                    <ApprovalCard
                      key={approval.approvalId}
                      approval={approval}
                      pendingAction={resolveMutation.variables?.approvalId === approval.approvalId ? resolveMutation.variables.decision : null}
                      onApprove={() =>
                        resolveMutation.mutate({ approvalId: approval.approvalId, decision: 'approved' })
                      }
                      onChangesRequested={() =>
                        resolveMutation.mutate({
                          approvalId: approval.approvalId,
                          decision: 'changes_requested',
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className={APPROVALS_INBOX_PANEL_CLASS}>
              <h2 className="mb-4 text-sm font-semibold text-ink">Recent Decisions</h2>
              {recent.length === 0 ? (
                <p className="text-sm text-[var(--theme-muted)]">No approval decisions recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {recent.map((approval) => (
                    <div
                      key={approval.approvalId}
                      className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-ink">{approval.workItemTitle}</p>
                          <p className="text-xs text-[var(--theme-muted)]">{approval.projectName}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(approval.status)}`}>
                          {approval.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-[var(--theme-muted)]">
                        Requested {formatTimestamp(approval.requestedAt)}
                        {approval.resolvedAt ? ` • Resolved ${formatTimestamp(approval.resolvedAt)}` : ''}
                      </p>
                      {approval.resolutionNotes ? (
                        <p className="mt-2 text-sm text-[var(--theme-text)]">{approval.resolutionNotes}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function ApprovalCard({
  approval,
  pendingAction,
  onApprove,
  onChangesRequested,
}: {
  approval: ApprovalInboxEntry
  pendingAction: 'approved' | 'changes_requested' | null
  onApprove: () => void
  onChangesRequested: () => void
}) {
  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-ink">{approval.workItemTitle}</p>
          <p className="text-xs text-[var(--theme-muted)]">{approval.projectName}</p>
          <p className="text-xs text-[var(--theme-muted)]">
            Requested by {approval.requestedBy} • {formatTimestamp(approval.requestedAt)}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(approval.status)}`}>
          {approval.phase} review
        </span>
      </div>

      {approval.notes ? (
        <p className="mt-3 text-sm text-[var(--theme-text)]">{approval.notes}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          to="/projects/$projectId/work-items/$workItemId"
          params={{ projectId: approval.projectId, workItemId: approval.workItemId }}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]"
        >
          Open Work Item
          <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
        </Link>
        <button
          type="button"
          onClick={onApprove}
          disabled={pendingAction !== null}
          className="inline-flex items-center gap-1 rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
          {pendingAction === 'approved' ? 'Approving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={onChangesRequested}
          disabled={pendingAction !== null}
          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-60"
        >
          {pendingAction === 'changes_requested' ? 'Sending…' : 'Request Changes'}
        </button>
      </div>
    </div>
  )
}
