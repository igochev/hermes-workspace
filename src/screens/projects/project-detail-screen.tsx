'use client'

import { type CSSProperties, useEffect, useMemo, useState } from 'react'
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
  updateProject,
  type CreateWorkItemInput,
  type PhaseProfiles,
  type ReviewAutoApprovalPolicy,
  type WorkItemRiskLevel,
  WORK_ITEM_PHASE_LABELS,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_RISK_LEVEL_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/projects-api'
import {
  PROJECT_STATUS_ORDER,
  PROJECT_BOARD_FLOW_ORDER,
  buildProjectBoardUrgencySummary,
  buildWorkItemOperatorSignals,
  buildWorkItemRecoveryHint,
  filterWorkItemsForProjectBoard,
  getWorkItemUrgencyTone,
  sortWorkItemsForProjectBoard,
  type ProjectBoardFilter,
  type ProjectBoardUrgencySummary,
  type WorkItemUrgencyTone,
} from '@/lib/projects-view-model'
import { cn } from '@/lib/utils'

const EMPTY_WORK_ITEM_FORM: Omit<CreateWorkItemInput, 'projectId'> = {
  title: '',
  description: '',
  status: 'inbox',
  phase: 'research',
  priority: 'medium',
  riskLevel: 'medium',
  assignedProfile: '',
  repoPathSnapshot: '',
  acceptanceCriteria: [],
  notes: [],
}

const EMPTY_PHASE_PROFILES: PhaseProfiles = {
  research: '',
  build: '',
  review: '',
  deploy: '',
}

const DEFAULT_REVIEW_AUTO_APPROVAL: ReviewAutoApprovalPolicy = {
  enabled: false,
  maxPriority: 'low',
}

type AvailableProfile = {
  name: string
}

type ProfilesListResponse = {
  profiles?: Array<AvailableProfile>
}

export const PROJECT_BOARD_COLUMNS_CLASS = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6'
export const PROJECT_BOARD_EMPTY_STATE_CLASS =
  'rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-6 text-center text-sm text-[var(--theme-muted)]'
export const PROJECT_BOARD_SIGNAL_CHIP_CLASS =
  'inline-flex items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-0.5 text-[11px] font-medium text-[var(--theme-text)]'
export const PROJECT_RECOVERY_HINT_CLASS = 'mt-2 text-[11px] font-medium text-amber-300/90'
export const PROJECT_BOARD_FILTER_BUTTON_CLASS =
  'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors'
export const PROJECT_FORM_SELECT_CLASS =
  'h-11 w-full rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 text-sm text-[var(--theme-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25'
export const PROJECT_FORM_NATIVE_SELECT_STYLE = {
  colorScheme: 'dark',
} satisfies CSSProperties
export const PROJECT_ACCEPTANCE_CRITERIA_HELP_TEXT =
  'Optional for idea capture. Planning can draft or refine acceptance criteria later.'
export const PROJECT_WORKFLOW_POLICY_TOGGLE_LABEL = 'Workflow Policy'
export const PROJECT_WORKFLOW_POLICY_PANEL_TITLE = 'Project Workflow Policy'
export const PROJECT_WORKFLOW_POLICY_SAVE_LABEL = 'Save Workflow Policy'
export const PROJECT_WORKFLOW_DEPLOY_GOVERNANCE_HEADING = 'Deploy governance'
export const PROJECT_ROUTING_POLICY_EMPTY_VALUE = 'Auto fallback'
export const PROJECT_ROUTING_PRECEDENCE_LABELS = [
  '1. Work item override',
  '2. Project phase routing',
  '3. Global/request phase routing',
] as const
export const PROJECT_PHASE_ROUTING_POLICY_LABELS: Record<keyof PhaseProfiles, string> = {
  research: 'Research/planning phase routes to Planner profile by default.',
  build: 'Build launches route to builder by default.',
  review: 'Review launches route to reviewer by default.',
  deploy: 'Deploy launches route to deployer by default.',
}

const REVIEW_AUTO_APPROVAL_PRIORITY_LABELS: Record<ReviewAutoApprovalPolicy['maxPriority'], string> = {
  low: 'Low only',
  medium: 'Low + Medium',
  high: 'All priorities',
}

export function buildProjectWorkflowPolicyPhaseSummaries(
  phaseProfiles: PhaseProfiles,
): Array<string> {
  return (Object.keys(WORK_ITEM_PHASE_LABELS) as Array<keyof PhaseProfiles>).map((phase) => {
    const mappedProfile = phaseProfiles[phase]?.trim() || PROJECT_ROUTING_POLICY_EMPTY_VALUE
    return `${WORK_ITEM_PHASE_LABELS[phase]} → ${mappedProfile}`
  })
}

export function buildProjectReviewAutoApprovalSummary(
  reviewAutoApproval: ReviewAutoApprovalPolicy,
): string {
  if (!reviewAutoApproval.enabled) {
    return 'Review auto-approval is disabled. Every review-phase work item will wait for an operator decision.'
  }

  return `Review auto-approval is enabled for ${REVIEW_AUTO_APPROVAL_PRIORITY_LABELS[reviewAutoApproval.maxPriority]} priority work items.`
}

export function buildProjectDeployGovernanceSummary(phaseProfiles: Pick<PhaseProfiles, 'deploy'>): string {
  const deployProfile = phaseProfiles.deploy?.trim()
  if (!deployProfile) {
    return 'Deploy governance uses Auto fallback routing and requires explicit deploy approval before done.'
  }

  return `Deploy governance routes deploy launches to ${deployProfile} and requires explicit deploy approval before done.`
}

export const PROJECT_URGENCY_SUMMARY_LABELS: Record<keyof ProjectBoardUrgencySummary, string> = {
  pendingApprovals: 'Pending approvals',
  changesRequested: 'Changes requested',
  runningMissions: 'Missions running',
  failedMissions: 'Mission failures',
  blocked: 'Blocked',
}
export const PROJECT_URGENCY_SUMMARY_SHORTCUT_LABELS: Record<ProjectBoardFilter, string> = {
  all: 'All work',
  attention: 'Needs attention',
  execution: 'Execution',
  approvals: 'Approvals',
}
export const PROJECT_CARD_TONE_CLASSES: Record<WorkItemUrgencyTone, string> = {
  default: 'border-[var(--theme-border)] bg-[var(--theme-card2)] hover:border-[var(--theme-accent)] hover:bg-[var(--theme-card)]',
  warning: 'border-amber-500/35 bg-amber-500/8 hover:border-amber-500/50 hover:bg-amber-500/12',
  danger: 'border-red-500/35 bg-red-500/10 hover:border-red-500/50 hover:bg-red-500/14',
}
export const PROJECT_DETAIL_BOARD_ORDER = PROJECT_BOARD_FLOW_ORDER
export const BOARD_FILTER_OPTIONS: Array<{ value: ProjectBoardFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'execution', label: 'Execution' },
  { value: 'approvals', label: 'Approvals' },
]
export const PROJECT_URGENCY_SUMMARY_FILTERS: Record<keyof ProjectBoardUrgencySummary, ProjectBoardFilter> = {
  pendingApprovals: 'approvals',
  changesRequested: 'approvals',
  runningMissions: 'execution',
  failedMissions: 'execution',
  blocked: 'attention',
}

export function toggleProjectBoardShortcutFilter(
  currentFilter: ProjectBoardFilter,
  shortcutFilter: ProjectBoardFilter,
): ProjectBoardFilter {
  return currentFilter === shortcutFilter ? 'all' : shortcutFilter
}

export function buildAssignedProfileOptions(
  availableProfiles: Array<string>,
  phaseProfiles: PhaseProfiles,
  phase: keyof PhaseProfiles,
): Array<[string, string]> {
  const suggestedProfile = phaseProfiles[phase]?.trim() || ''
  const autoLabel = suggestedProfile
    ? `Auto (${WORK_ITEM_PHASE_LABELS[phase]} → ${suggestedProfile})`
    : `Auto (${WORK_ITEM_PHASE_LABELS[phase]} routing)`
  const profileNames = Array.from(
    new Set(
      [
        suggestedProfile,
        phaseProfiles.research,
        phaseProfiles.build,
        phaseProfiles.review,
        phaseProfiles.deploy,
        ...availableProfiles,
      ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
    ),
  )

  return [
    ['', autoLabel],
    ...profileNames.map((profileName) => [profileName, profileName] as [string, string]),
  ]
}

export function ProjectDetailScreen({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const queryKey = ['mission-control', 'projects', projectId] as const
  const [showCreateWorkItem, setShowCreateWorkItem] = useState(false)
  const [showProjectRouting, setShowProjectRouting] = useState(false)
  const [boardFilter, setBoardFilter] = useState<ProjectBoardFilter>('all')
  const [form, setForm] = useState(EMPTY_WORK_ITEM_FORM)
  const [projectRouting, setProjectRouting] = useState<PhaseProfiles>(EMPTY_PHASE_PROFILES)
  const [reviewAutoApproval, setReviewAutoApproval] = useState<ReviewAutoApprovalPolicy>(
    DEFAULT_REVIEW_AUTO_APPROVAL,
  )

  const projectQuery = useQuery({
    queryKey,
    queryFn: () => fetchProject(projectId),
    refetchInterval: 30_000,
  })
  const profilesQuery = useQuery({
    queryKey: ['project-detail', 'profiles', 'list'],
    queryFn: async () => {
      const response = await fetch('/api/profiles/list')
      if (!response.ok) throw new Error(`Failed to fetch profiles: ${response.status}`)
      const data = (await response.json()) as ProfilesListResponse
      return Array.from(
        new Set(
          (data.profiles ?? [])
            .map((profile) => profile.name?.trim())
            .filter((profileName): profileName is string =>
              typeof profileName === 'string' &&
              profileName.length > 0 &&
              profileName !== 'default',
            ),
        ),
      ).sort((left, right) => left.localeCompare(right))
    },
    staleTime: 60_000,
  })

  const project = projectQuery.data?.project ?? null
  const workItems = projectQuery.data?.workItems ?? []
  const availableProfiles = profilesQuery.data ?? []

  useEffect(() => {
    if (!project) return
    setProjectRouting(project.phaseProfiles ?? EMPTY_PHASE_PROFILES)
    setReviewAutoApproval(project.reviewAutoApproval ?? DEFAULT_REVIEW_AUTO_APPROVAL)
  }, [project])

  const boardUrgencySummary = useMemo(
    () => buildProjectBoardUrgencySummary(workItems),
    [workItems],
  )
  const workflowPolicyPhaseSummaries = useMemo(
    () => buildProjectWorkflowPolicyPhaseSummaries(projectRouting),
    [projectRouting],
  )
  const reviewAutoApprovalSummary = useMemo(
    () => buildProjectReviewAutoApprovalSummary(reviewAutoApproval),
    [reviewAutoApproval],
  )
  const deployGovernanceSummary = useMemo(
    () => buildProjectDeployGovernanceSummary(projectRouting),
    [projectRouting],
  )
  const workItemsByStatus = useMemo(() => {
    const filteredWorkItems = filterWorkItemsForProjectBoard(workItems, boardFilter)
    return PROJECT_STATUS_ORDER.map((status) => ({
      status,
      items: sortWorkItemsForProjectBoard(
        filteredWorkItems.filter((item) => item.status === status),
      ),
    }))
  }, [boardFilter, workItems])
  const assignedProfileOptions = useMemo(
    () => buildAssignedProfileOptions(availableProfiles, projectRouting, form.phase ?? 'research'),
    [availableProfiles, form.phase, projectRouting],
  )

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

  const updateProjectMutation = useMutation({
    mutationFn: () =>
      updateProject(projectId, {
        phaseProfiles: projectRouting,
        reviewAutoApproval,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects'] })
      toast('Project launch routing updated')
      setShowProjectRouting(false)
    },
    onError: (error) => {
      toast(error instanceof Error ? error.message : 'Failed to update project routing', {
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

  function updateProjectRoutingField(key: keyof PhaseProfiles, value: string) {
    setProjectRouting((current) => ({ ...current, [key]: value }))
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
      riskLevel: form.riskLevel,
      assignedProfile: form.assignedProfile?.trim() || undefined,
      repoPathSnapshot: form.repoPathSnapshot?.trim() || project.repoPath,
      acceptanceCriteria: form.acceptanceCriteria,
      notes: form.notes,
    })
  }

  if (projectQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-sm text-[var(--theme-muted)]">Loading project…</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-8 text-center">
          <h2 className="text-xl font-semibold text-ink">Project not found</h2>
          <p className="mt-2 text-sm text-[var(--theme-muted)]">
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
        <header className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3 min-w-0">
              <Link
                to="/projects"
                className="inline-flex items-center gap-2 text-sm font-medium text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-text)]"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
                Back to Projects
              </Link>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                  {project.slug}
                </p>
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={FolderDetailsIcon}
                    size={18}
                    className="text-[var(--theme-muted)]"
                  />
                  <h1 className="text-2xl font-medium text-ink">{project.name}</h1>
                </div>
                <p className="max-w-3xl text-sm text-[var(--theme-muted)]">
                  {project.description || 'No project description yet.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void projectQuery.refetch()}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]/80"
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
              <Link
                to="/projects/approvals"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]/80"
              >
                Approvals Inbox
              </Link>
              <button
                type="button"
                onClick={() => setShowProjectRouting((value) => !value)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]/80"
              >
                {showProjectRouting ? 'Close Policy' : PROJECT_WORKFLOW_POLICY_TOGGLE_LABEL}
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

          {showProjectRouting ? (
            <div className="mt-5 space-y-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
                <div className="space-y-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
                  <div>
                    <h2 className="text-sm font-semibold text-ink">{PROJECT_WORKFLOW_POLICY_PANEL_TITLE}</h2>
                    <p className="mt-1 text-sm text-[var(--theme-muted)]">
                      Make phase routing and review governance visible at the project level so operators can predict how planning, build, review, and deploy launches will route.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {workflowPolicyPhaseSummaries.map((summary, index) => {
                      const phase = (Object.keys(WORK_ITEM_PHASE_LABELS) as Array<keyof PhaseProfiles>)[index]
                      return (
                        <div
                          key={phase}
                          className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3"
                        >
                          <div className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                            {WORK_ITEM_PHASE_LABELS[phase]} routing
                          </div>
                          <div className="mt-2 text-sm font-medium text-ink">{summary}</div>
                          <div className="mt-1 text-xs text-[var(--theme-muted)]">
                            {PROJECT_PHASE_ROUTING_POLICY_LABELS[phase]}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="space-y-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Routing precedence</h3>
                    <p className="mt-1 text-sm text-[var(--theme-muted)]">
                      Launch profile resolution follows the same operational order everywhere in Mission Control.
                    </p>
                  </div>
                  <ol className="space-y-2 text-sm text-[var(--theme-text)]">
                    {PROJECT_ROUTING_PRECEDENCE_LABELS.map((label) => (
                      <li
                        key={label}
                        className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2"
                      >
                        {label}
                      </li>
                    ))}
                  </ol>
                  <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                      Review governance
                    </div>
                    <div className="mt-2 text-sm font-medium text-ink">{reviewAutoApprovalSummary}</div>
                  </div>
                  <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                      {PROJECT_WORKFLOW_DEPLOY_GOVERNANCE_HEADING}
                    </div>
                    <div className="mt-2 text-sm font-medium text-ink">{deployGovernanceSummary}</div>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">Research Profile</label>
                  <Input value={projectRouting.research} onChange={(event) => updateProjectRoutingField('research', event.target.value)} placeholder="planner" nativeInput />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">Build Profile</label>
                  <Input value={projectRouting.build} onChange={(event) => updateProjectRoutingField('build', event.target.value)} placeholder="builder" nativeInput />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">Review Profile</label>
                  <Input value={projectRouting.review} onChange={(event) => updateProjectRoutingField('review', event.target.value)} placeholder="reviewer" nativeInput />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">Deploy Profile</label>
                  <Input value={projectRouting.deploy} onChange={(event) => updateProjectRoutingField('deploy', event.target.value)} placeholder="deployer" nativeInput />
                </div>
              </div>
              <div className="space-y-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Review Auto-Approval</h3>
                    <p className="mt-1 text-sm text-[var(--theme-muted)]">
                      Automatically approve review-phase work items up to the selected priority threshold.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--theme-text)]">
                    <input
                      type="checkbox"
                      checked={reviewAutoApproval.enabled}
                      onChange={(event) =>
                        setReviewAutoApproval((current) => ({
                          ...current,
                          enabled: event.target.checked,
                        }))
                      }
                    />
                    Enabled
                  </label>
                </div>
                <div className="space-y-1 max-w-xs">
                  <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                    Max Priority
                  </label>
                  <select
                    value={reviewAutoApproval.maxPriority}
                    onChange={(event) =>
                      setReviewAutoApproval((current) => ({
                        ...current,
                        maxPriority: event.target.value as ReviewAutoApprovalPolicy['maxPriority'],
                      }))
                    }
                    className={PROJECT_FORM_SELECT_CLASS}
                    style={PROJECT_FORM_NATIVE_SELECT_STYLE}
                  >
                    <option value="low">Low only</option>
                    <option value="medium">Low + Medium</option>
                    <option value="high">All priorities</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProjectRouting(project.phaseProfiles ?? EMPTY_PHASE_PROFILES)
                    setReviewAutoApproval(
                      project.reviewAutoApproval ?? DEFAULT_REVIEW_AUTO_APPROVAL,
                    )
                    setShowProjectRouting(false)
                  }}
                  className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => updateProjectMutation.mutate()}
                  disabled={updateProjectMutation.isPending}
                  className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {updateProjectMutation.isPending ? 'Saving…' : PROJECT_WORKFLOW_POLICY_SAVE_LABEL}
                </button>
              </div>
            </div>
          ) : null}

          {showCreateWorkItem ? (
            <div className="mt-5 grid gap-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
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
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                  Description
                </label>
                <textarea
                  value={form.description ?? ''}
                  onChange={(event) => updateField('description', event.target.value)}
                  placeholder="Describe the implementation goal and operator outcome"
                  className="min-h-24 w-full rounded-2xl border border-[var(--theme-border)] bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25"
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
              <SelectField
                label="Risk Level"
                value={form.riskLevel ?? 'medium'}
                onChange={(value) => updateField('riskLevel', value as WorkItemRiskLevel)}
                options={[
                  ['low', 'Low Risk'],
                  ['medium', 'Medium Risk'],
                  ['high', 'High Risk'],
                ]}
              />
              <div className="space-y-1">
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                  Assigned Profile
                </label>
                <SelectField
                  label="Assigned Profile"
                  hideLabel
                  value={form.assignedProfile ?? ''}
                  onChange={(value) => updateField('assignedProfile', value)}
                  options={assignedProfileOptions}
                />
                <p className="text-xs text-[var(--theme-muted)]">
                  Leave on Auto to use project launch routing for the selected phase.
                </p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
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
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
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
                  className="min-h-24 w-full rounded-2xl border border-[var(--theme-border)] bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25"
                />
                <p className="text-xs text-[var(--theme-muted)]">
                  {PROJECT_ACCEPTANCE_CRITERIA_HELP_TEXT}
                </p>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
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
                  className="min-h-24 w-full rounded-2xl border border-[var(--theme-border)] bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateWorkItem(false)
                    setForm(EMPTY_WORK_ITEM_FORM)
                  }}
                  className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]"
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

        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {(Object.keys(PROJECT_URGENCY_SUMMARY_LABELS) as Array<keyof ProjectBoardUrgencySummary>).map(
              (key) => {
                const summaryFilter = PROJECT_URGENCY_SUMMARY_FILTERS[key]
                const active = boardFilter === summaryFilter
                const shortcutLabel = PROJECT_URGENCY_SUMMARY_SHORTCUT_LABELS[summaryFilter]
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setBoardFilter((currentFilter) =>
                        toggleProjectBoardShortcutFilter(currentFilter, summaryFilter),
                      )
                    }
                    aria-pressed={active}
                    className={cn(
                      'text-left rounded-2xl border p-0 transition-colors',
                      active
                        ? 'border-[var(--theme-accent)] ring-2 ring-[var(--theme-accent)]/20'
                        : 'border-transparent hover:border-[var(--theme-border)]',
                    )}
                  >
                    <MetricCard
                      label={PROJECT_URGENCY_SUMMARY_LABELS[key]}
                      value={`${boardUrgencySummary[key]}`}
                      hint={active ? `Showing ${shortcutLabel}` : `Shortcut to ${shortcutLabel}`}
                    />
                  </button>
                )
              },
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
              Board Filter
            </span>
            {BOARD_FILTER_OPTIONS.map((option) => {
              const active = boardFilter === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setBoardFilter(option.value)}
                  aria-pressed={active}
                  className={cn(
                    PROJECT_BOARD_FILTER_BUTTON_CLASS,
                    active
                      ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)] text-white'
                      : 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-text)] hover:bg-[var(--theme-card)]',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          <div className={PROJECT_BOARD_COLUMNS_CLASS}>
            {PROJECT_DETAIL_BOARD_ORDER.map((status) => {
              const column = workItemsByStatus.find((entry) => entry.status === status)
              const items = column?.items ?? []
              return (
                <div
                  key={status}
                  className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-ink">
                        {WORK_ITEM_STATUS_LABELS[status]}
                      </h2>
                      <p className="text-xs text-[var(--theme-muted)]">
                        {items.length} work item{items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-0.5 text-xs font-medium text-[var(--theme-text)]">
                      {items.length}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {items.length === 0 ? (
                      <div className={PROJECT_BOARD_EMPTY_STATE_CLASS}>
                        No {WORK_ITEM_STATUS_LABELS[status].toLowerCase()} work items yet.
                      </div>
                    ) : (
                      items.map((item) => {
                        const tone = getWorkItemUrgencyTone(item)
                        const recoveryHint = buildWorkItemRecoveryHint(item)
                        return (
                          <Link
                            key={item.id}
                            to="/projects/$projectId/work-items/$workItemId"
                            params={{ projectId: project.id, workItemId: item.id }}
                            className={cn(
                              'group block rounded-2xl border p-4 transition-all',
                              PROJECT_CARD_TONE_CLASSES[tone],
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <h3 className="truncate text-sm font-semibold text-ink">
                                  {item.title}
                                </h3>
                                <p className="line-clamp-2 text-xs text-[var(--theme-muted)]">
                                  {item.description || 'No description yet.'}
                                </p>
                              </div>
                              <HugeiconsIcon
                                icon={ArrowRight01Icon}
                                size={16}
                                className="text-[var(--theme-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--theme-text)]"
                              />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {item.phase ? <Tag>{WORK_ITEM_PHASE_LABELS[item.phase]}</Tag> : null}
                              <Tag>{WORK_ITEM_PRIORITY_LABELS[item.priority]}</Tag>
                              <Tag>{WORK_ITEM_RISK_LEVEL_LABELS[item.riskLevel]}</Tag>
                              {item.assignedProfile ? <Tag>{item.assignedProfile}</Tag> : null}
                              {buildWorkItemOperatorSignals(item).map((signal) => (
                                <span key={signal} className={PROJECT_BOARD_SIGNAL_CHIP_CLASS}>
                                  {signal}
                                </span>
                              ))}
                            </div>
                            {recoveryHint ? <p className={PROJECT_RECOVERY_HINT_CLASS}>{recoveryHint}</p> : null}
                          </Link>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--theme-muted)]">{label}</div>
      <div className="mt-2 break-all text-sm font-medium text-ink">{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-[var(--theme-muted)]">{hint}</div> : null}
    </div>
  )
}

function SelectField({
  label,
  hideLabel,
  value,
  onChange,
  options,
}: {
  label: string
  hideLabel?: boolean
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <div className="space-y-1">
      {hideLabel ? null : (
        <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        className={PROJECT_FORM_SELECT_CLASS}
        style={PROJECT_FORM_NATIVE_SELECT_STYLE}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || '__auto__'} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-0.5 text-[11px] font-medium text-[var(--theme-text)]')}>
      {children}
    </span>
  )
}
