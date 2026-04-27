'use client'

import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from 'react'
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
  type ProjectAutopilotPolicy,
  type ProjectRuntimeProfiles,
  type ReviewAutoApprovalPolicy,
  type WorkItemRiskLevel,
  WORK_ITEM_BLOCKED_REASON_LABELS,
  WORK_ITEM_PHASE_LABELS,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_RISK_LEVEL_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/projects-api'
import {
  PROJECT_STATUS_ORDER,
  PROJECT_BOARD_FLOW_ORDER,
  PROJECT_ACTIVE_WIP_WARNING_THRESHOLD,
  buildLabelAnalytics,
  buildProjectBoardUrgencySummary,
  buildProjectLaneCockpit,
  buildProjectWipHint,
  buildWorkItemOperatorSignals,
  buildWorkItemRecoveryHint,
  filterWorkItemsForProjectBoard,
  getUniqueLabels,
  getWorkItemUrgencyTone,
  isProjectWipHigh,
  sortWorkItemsForProjectBoard,
  type LabelAnalyticsEntry,
  type ProjectBoardFilter,
  type ProjectBoardUrgencySummary,
  type WorkItemUrgencyTone,
} from '@/lib/projects-view-model'
import { fetchProjectProfileReadiness } from '@/lib/profile-readiness-api'
import type {
  ProfileReadinessRole,
  ProfileReadinessRoleReport,
  ProfileReadinessStatus,
} from '@/server/profile-readiness'
import { cn } from '@/lib/utils'

const EMPTY_WORK_ITEM_FORM: Omit<CreateWorkItemInput, 'projectId'> = {
  title: '',
  description: '',
  status: 'inbox',
  phase: 'research',
  priority: 'medium',
  riskLevel: 'medium',
  assignedProfile: '',
  labels: [],
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

const EMPTY_RUNTIME_PROFILES: ProjectRuntimeProfiles = {
  supervisorProfile: '',
}

const DEFAULT_AUTOPILOT_POLICY: ProjectAutopilotPolicy = {
  enabled: false,
  schedulePreset: 'manual',
  scoutProfile: '',
  suggestionLimit: 5,
  scoutSources: ['repo-health-scout', 'stale-docs-scout', 'architecture-debt-scout'],
}

type AvailableProfile = {
  name: string
}

type ProfilesListResponse = {
  profiles?: Array<AvailableProfile>
}

type ProjectProfileWorkflowPolicySavePayload = {
  phaseProfiles: PhaseProfiles
  runtimeProfiles: ProjectRuntimeProfiles
  reviewAutoApproval: ReviewAutoApprovalPolicy
  autopilotPolicy: ProjectAutopilotPolicy
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
export const PROJECT_WORKFLOW_POLICY_TOGGLE_LABEL = 'Profile & Workflow Policy'
export const PROJECT_WORKFLOW_POLICY_PANEL_TITLE = 'Project Profile & Workflow Policy'
export const PROJECT_WORKFLOW_POLICY_SAVE_LABEL = 'Save Profile & Workflow Policy'
export const PROJECT_PROFILE_MAPPING_CONFIGURE_LABEL = 'Configure profile mappings'
export const PROJECT_WORKFLOW_DEPLOY_GOVERNANCE_HEADING = 'Deploy governance'
export const PROJECT_WIP_WARNING_BADGE_LABEL = 'WIP high'
export const PROJECT_WIP_WARNING_LAUNCH_HINT = 'WIP is high; finish one active item first.'
export const PROJECT_CREATE_WORK_ITEM_BUTTON_LABEL = 'Capture rough idea'
export const PROJECT_CREATE_WORK_ITEM_SUBMIT_LABEL = 'Create rough idea'
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
export const PROJECT_PROFILE_READINESS_PANEL_TITLE = 'Profile Readiness'
export const PROJECT_PROFILE_READINESS_COPY =
  'Profile readiness checks whether mapped Hermes profiles exist before launches use them.'
export const PROJECT_PROFILE_READINESS_ROLE_LABELS: Record<ProfileReadinessRole, string> = {
  research: 'Research',
  build: 'Build',
  review: 'Review',
  deploy: 'Deploy',
  supervisor: 'Supervisor',
  'autopilot-scout': 'Autopilot Scout',
}
export const PROJECT_PROFILE_READINESS_STATUS_LABELS: Record<ProfileReadinessStatus, string> = {
  ready: 'Ready',
  unmapped: 'Unmapped',
  missing: 'Missing',
  unknown: 'Unknown',
}
export const PROJECT_PROFILE_READINESS_STATUS_TONE_CLASSES: Record<ProfileReadinessStatus, string> = {
  ready: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
  unmapped: 'border-sky-500/35 bg-sky-500/10 text-sky-200',
  missing: 'border-amber-500/35 bg-amber-500/10 text-amber-200',
  unknown: 'border-slate-500/35 bg-slate-500/10 text-slate-200',
}
export const PROJECT_LANE_COCKPIT_PANEL_TITLE = 'Project Lane Cockpit'
export const PROJECT_LANE_COCKPIT_MODE_LABEL = 'Single-lane branch autonomy'
export const PROJECT_LANE_PARALLEL_WORKTREES_NOTE =
  'Parallel worktrees disabled unless advanced mode is enabled.'
export const PROJECT_LANE_RECOVERY_ACTIONS_HEADING = 'Recovery actions'

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
  activeThisWeek: 'Active this week',
  blockedThisWeek: 'Blocked this week',
  doneThisWeek: 'Done this week',
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
  activeThisWeek: 'attention',
  blockedThisWeek: 'attention',
  doneThisWeek: 'attention',
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
  const [runtimeProfiles, setRuntimeProfiles] = useState<ProjectRuntimeProfiles>(EMPTY_RUNTIME_PROFILES)
  const [autopilotPolicy, setAutopilotPolicy] = useState<ProjectAutopilotPolicy>(
    DEFAULT_AUTOPILOT_POLICY,
  )
  const [reviewAutoApproval, setReviewAutoApproval] = useState<ReviewAutoApprovalPolicy>(
    DEFAULT_REVIEW_AUTO_APPROVAL,
  )

  const readinessQueryKey = ['mission-control', 'projects', projectId, 'profile-readiness'] as const
  const projectQuery = useQuery({
    queryKey,
    queryFn: () => fetchProject(projectId),
    refetchInterval: 30_000,
  })
  const profileReadinessQuery = useQuery({
    queryKey: readinessQueryKey,
    queryFn: () => fetchProjectProfileReadiness(projectId),
    refetchInterval: 60_000,
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
    setRuntimeProfiles(project.runtimeProfiles ?? EMPTY_RUNTIME_PROFILES)
    setAutopilotPolicy(project.autopilotPolicy ?? DEFAULT_AUTOPILOT_POLICY)
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
  const activeWorkItemCount = useMemo(
    () => workItems.filter((item) => item.status === 'active').length,
    [workItems],
  )
  const uniqueLabels = useMemo(
    () => getUniqueLabels(workItems),
    [workItems],
  )
  const labelAnalytics = useMemo(
    () => buildLabelAnalytics(workItems),
    [workItems],
  )
  const laneCockpit = useMemo(
    () => buildProjectLaneCockpit(project ?? {
      autonomyLanePolicy: {
        enabled: false,
        mode: 'single_lane',
        isolation: 'branch',
        maxActiveWorkItems: 1,
        plannerTiming: 'on_lane_entry',
        blockedBehavior: 'park_and_continue_when_repo_clean',
        mergeHealerEnabled: true,
        allowParallelWorktrees: false,
      },
    }, workItems),
    [project, workItems],
  )
  const [labelFilter, setLabelFilter] = useState<string | null>(null)
  const projectWipLaunchHint = useMemo(
    () => buildProjectWipHint(activeWorkItemCount, PROJECT_ACTIVE_WIP_WARNING_THRESHOLD),
    [activeWorkItemCount],
  )
  const projectHasHighWip = isProjectWipHigh(activeWorkItemCount, PROJECT_ACTIVE_WIP_WARNING_THRESHOLD)
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
    mutationFn: (payload: ProjectProfileWorkflowPolicySavePayload) => updateProject(projectId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey })
      await queryClient.invalidateQueries({ queryKey: ['mission-control', 'projects'] })
      await queryClient.invalidateQueries({ queryKey: readinessQueryKey })
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
      labels: form.labels,
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
                onClick={() => {
                  void projectQuery.refetch()
                  void profileReadinessQuery.refetch()
                }}
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
                {showCreateWorkItem ? 'Close' : PROJECT_CREATE_WORK_ITEM_BUTTON_LABEL}
              </button>
              <Link
                to="/projects/approvals"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]/80"
              >
                Approvals Inbox
              </Link>
              <Link
                to="/projects/$projectId/autopilot"
                params={{ projectId: project.id }}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-xs font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card2)]/80"
              >
                Project Autopilot
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
            <MetricCard
              label="Work Items"
              value={`${project.workItemCount}`}
              hint={projectWipLaunchHint ?? undefined}
            />
          </div>

          {projectHasHighWip && projectWipLaunchHint ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 font-semibold uppercase tracking-wide">
                {PROJECT_WIP_WARNING_BADGE_LABEL}
              </span>
              <span>{projectWipLaunchHint}</span>
            </div>
          ) : null}

          <ProjectProfileReadinessPanel
            isLoading={profileReadinessQuery.isLoading}
            error={profileReadinessQuery.error}
            roles={profileReadinessQuery.data?.report.roles ?? []}
            profileDiscoveryAvailable={profileReadinessQuery.data?.profileDiscoveryAvailable}
            profileDiscoveryError={profileReadinessQuery.data?.profileDiscoveryError}
            onConfigureProfileMappings={() => setShowProjectRouting(true)}
          />

          <section className="mt-5 rounded-2xl border border-sky-500/25 bg-sky-500/8 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-200">
                  {PROJECT_LANE_COCKPIT_PANEL_TITLE}
                </p>
                <h2 className="text-lg font-semibold text-ink">{laneCockpit.modeLabel}</h2>
                <p className="text-xs text-[var(--theme-muted)]">{laneCockpit.parallelWorktreesNote}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <Tag>{laneCockpit.currentPhaseLabel}</Tag>
                <Tag>{laneCockpit.heartbeatLabel}</Tag>
                <Tag>{laneCockpit.mergeStateLabel}</Tag>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Active lane item" value={laneCockpit.activeWorkItem?.title ?? 'Idle'} />
              <MetricCard label="Branch" value={laneCockpit.currentBranch ?? '—'} />
              <MetricCard label="Base branch" value={laneCockpit.baseBranch} />
              <MetricCard label="Next queued" value={laneCockpit.nextQueuedWorkItem?.title ?? '—'} />
            </div>

            {laneCockpit.parkedBlockedItems.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                <div className="font-semibold">Parked blocked items</div>
                <ul className="mt-2 space-y-1 text-xs">
                  {laneCockpit.parkedBlockedItems.map((item) => (
                    <li key={item.id}>
                      {item.title}: {item.laneBlockedReason ?? 'Blocked with lane evidence'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {laneCockpit.blockerLabel ? (
              <p className="mt-3 text-xs font-medium text-amber-200">Blocker: {laneCockpit.blockerLabel}</p>
            ) : null}

            {laneCockpit.recoveryActions.length > 0 ? (
              <div className="mt-3 text-xs text-[var(--theme-muted)]">
                <div className="font-semibold text-[var(--theme-text)]">
                  {PROJECT_LANE_RECOVERY_ACTIONS_HEADING}
                </div>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {laneCockpit.recoveryActions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {showProjectRouting ? (
            <ProjectProfileWorkflowPolicyEditor
              phaseProfiles={projectRouting}
              runtimeProfiles={runtimeProfiles}
              reviewAutoApproval={reviewAutoApproval}
              autopilotPolicy={autopilotPolicy}
              availableProfiles={availableProfiles}
              isSaving={updateProjectMutation.isPending}
              onCancel={() => {
                setProjectRouting(project.phaseProfiles ?? EMPTY_PHASE_PROFILES)
                setRuntimeProfiles(project.runtimeProfiles ?? EMPTY_RUNTIME_PROFILES)
                setAutopilotPolicy(project.autopilotPolicy ?? DEFAULT_AUTOPILOT_POLICY)
                setReviewAutoApproval(project.reviewAutoApproval ?? DEFAULT_REVIEW_AUTO_APPROVAL)
                setShowProjectRouting(false)
              }}
              onSave={(payload) => {
                setProjectRouting(payload.phaseProfiles)
                setRuntimeProfiles(payload.runtimeProfiles)
                setAutopilotPolicy(payload.autopilotPolicy)
                setReviewAutoApproval(payload.reviewAutoApproval)
                updateProjectMutation.mutate(payload)
              }}
            />
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
                  Labels
                </label>
                <textarea
                  value={form.labels.join('\n')}
                  onChange={(event) =>
                    updateField(
                      'labels',
                      event.target.value
                        .split('\n')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    )
                  }
                  placeholder="One label per line (e.g. frontend, api, urgent)"
                  className="min-h-16 w-full rounded-2xl border border-[var(--theme-border)] bg-surface px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-[var(--theme-accent)]/25"
                />
                <p className="text-xs text-[var(--theme-muted)]">
                  Optional tags for filtering and organization.
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
                    : PROJECT_CREATE_WORK_ITEM_SUBMIT_LABEL}
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

          {labelAnalytics.labels.length > 0 && (
            <div className="space-y-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-muted)]">
                  Label Analytics
                </h3>
                <span className="text-[11px] text-[var(--theme-muted)]">
                  {labelAnalytics.totalLabels} labels · {labelAnalytics.totalWorkItems} items
                </span>
              </div>

              {/* Project-level aggregate metrics */}
              <div className="grid gap-2 sm:grid-cols-4">
                {/* Average Cycle Time */}
                <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--theme-muted)]">
                    Avg Cycle Time
                  </div>
                  <div className="text-lg font-bold text-[var(--theme-text)]">
                    {labelAnalytics.avgCycleTimeDays != null
                      ? `${labelAnalytics.avgCycleTimeDays.toFixed(1)}d`
                      : '—'}
                  </div>
                </div>

                {/* Throughput */}
                <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--theme-muted)]">
                    Throughput
                  </div>
                  <div className="text-lg font-bold text-[var(--theme-text)]">
                    {labelAnalytics.throughputPerWeek > 0
                      ? `${labelAnalytics.throughputPerWeek.toFixed(1)}/wk`
                      : '—'}
                  </div>
                </div>

                {/* Rework Rate */}
                <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--theme-muted)]">
                    Rework Rate
                  </div>
                  <div className={`text-lg font-bold ${labelAnalytics.reworkRate > 0.2 ? 'text-red-400' : labelAnalytics.reworkRate > 0 ? 'text-amber-400' : 'text-[var(--theme-text)]'}`}>
                    {labelAnalytics.reworkRate > 0
                      ? `${(labelAnalytics.reworkRate * 100).toFixed(0)}%`
                      : '—'}
                  </div>
                </div>

                {/* Status Summary */}
                <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-2.5">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--theme-muted)]">
                    Status
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--theme-text)]">
                    <span className="text-emerald-400">{labelAnalytics.totalDone}</span>
                    <span className="text-[var(--theme-muted)]">·</span>
                    <span className="text-sky-400">{labelAnalytics.totalActive}</span>
                    <span className="text-[var(--theme-muted)]">·</span>
                    <span className="text-red-400">{labelAnalytics.totalBlocked}</span>
                  </div>
                </div>
              </div>

              {/* Summary insights */}
              <div className="flex flex-wrap gap-2">
                {labelAnalytics.mostUsedLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--theme-border)] bg-[var(--theme-card2)] px-2 py-0.5 text-[11px] text-[var(--theme-muted)]">
                    Most used: <strong className="text-[var(--theme-text)]">{labelAnalytics.mostUsedLabel}</strong>
                  </span>
                )}
                {labelAnalytics.mostBlockedLabel && labelAnalytics.mostBlockedLabel !== labelAnalytics.mostUsedLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/8 px-2 py-0.5 text-[11px] text-red-300">
                    Most blocked: <strong>{labelAnalytics.mostBlockedLabel}</strong>
                  </span>
                )}
                {labelAnalytics.healthiestLabel && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/8 px-2 py-0.5 text-[11px] text-emerald-300">
                    Healthiest: <strong>{labelAnalytics.healthiestLabel}</strong>
                  </span>
                )}
                {labelAnalytics.reworkRate > 0.1 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/8 px-2 py-0.5 text-[11px] text-amber-300">
                    ⚠ Rework: {(labelAnalytics.reworkRate * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Per-label breakdown */}
              <div className="space-y-2">
                {labelAnalytics.labels.map((entry) => (
                  <div key={entry.label} className="flex items-center gap-3">
                    {/* Label name - clickable to filter */}
                    <button
                      type="button"
                      onClick={() => setBoardFilter(`label:${entry.label}` as ProjectBoardFilter)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="text-xs font-medium text-[var(--theme-text)]">{entry.label}</span>
                    </button>

                    {/* Status counts */}
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--theme-muted)]">
                      <span>{entry.total}</span>
                      {entry.active > 0 && <span className="text-sky-400">· {entry.active} active</span>}
                      {entry.blocked > 0 && <span className="text-red-400">· {entry.blocked} blocked</span>}
                      {entry.done > 0 && <span className="text-emerald-400">· {entry.done} done</span>}
                    </div>

                    {/* Cycle time per label */}
                    {entry.avgCycleTimeDays != null && (
                      <span className="text-[11px] text-[var(--theme-muted)]">
                        {entry.avgCycleTimeDays.toFixed(1)}d avg
                      </span>
                    )}

                    {/* Health indicator */}
                    <span
                      className={cn(
                        'inline-flex h-2 w-2 rounded-full',
                        entry.health === 'critical' && 'bg-red-500',
                        entry.health === 'warning' && 'bg-amber-500',
                        entry.health === 'healthy' && 'bg-emerald-500',
                      )}
                      title={`Health: ${entry.health}`}
                    />

                    {/* Insight */}
                    {entry.insight && (
                      <span className="text-[11px] text-[var(--theme-muted)]">{entry.insight}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {uniqueLabels.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">
                Labels
              </span>
              <button
                type="button"
                onClick={() => setBoardFilter('all')}
                aria-pressed={boardFilter === 'all'}
                className={cn(
                  PROJECT_BOARD_FILTER_BUTTON_CLASS,
                  boardFilter === 'all'
                    ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)] text-white'
                    : 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-text)] hover:bg-[var(--theme-card)]',
                )}
              >
                All
              </button>
              {uniqueLabels.map((label) => {
                const filterValue = `label:${label}` as ProjectBoardFilter
                const active = boardFilter === filterValue
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setBoardFilter(filterValue)}
                    aria-pressed={active}
                    className={cn(
                      PROJECT_BOARD_FILTER_BUTTON_CLASS,
                      active
                        ? 'border-[var(--theme-accent)] bg-[var(--theme-accent)] text-white'
                        : 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-text)] hover:bg-[var(--theme-card)]',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}

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
                              {item.blockedReason ? (
                                <Tag>{WORK_ITEM_BLOCKED_REASON_LABELS[item.blockedReason]}</Tag>
                              ) : null}
                              {item.labels.map((label) => (
                                <span key={label} className="inline-flex items-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-0.5 text-[11px] font-medium text-[var(--theme-muted)]">{label}</span>
                              ))}
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


function buildProfileOptions(
  availableProfiles: Array<string>,
  currentValue?: string,
): Array<[string, string]> {
  const values = Array.from(
    new Set(
      [currentValue, ...availableProfiles].filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      ),
    ),
  )
  return [["", PROJECT_ROUTING_POLICY_EMPTY_VALUE], ...values.map((value) => [value, value] as [string, string])]
}

export function ProjectProfileWorkflowPolicyEditor({
  phaseProfiles,
  runtimeProfiles,
  reviewAutoApproval,
  autopilotPolicy,
  availableProfiles,
  isSaving,
  onCancel,
  onSave,
}: {
  phaseProfiles: PhaseProfiles
  runtimeProfiles: ProjectRuntimeProfiles
  reviewAutoApproval: ReviewAutoApprovalPolicy
  autopilotPolicy: ProjectAutopilotPolicy
  availableProfiles: Array<string>
  isSaving: boolean
  onCancel: () => void
  onSave: (payload: ProjectProfileWorkflowPolicySavePayload) => void
}) {
  const workflowPolicyPhaseSummaries = buildProjectWorkflowPolicyPhaseSummaries(phaseProfiles)
  const reviewAutoApprovalSummary = buildProjectReviewAutoApprovalSummary(reviewAutoApproval)
  const deployGovernanceSummary = buildProjectDeployGovernanceSummary(phaseProfiles)

  function readString(formData: FormData, key: string): string {
    const value = formData.get(key)
    return typeof value === 'string' ? value : ''
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    onSave({
      phaseProfiles: {
        research: readString(formData, 'researchProfile'),
        build: readString(formData, 'buildProfile'),
        review: readString(formData, 'reviewProfile'),
        deploy: readString(formData, 'deployProfile'),
      },
      runtimeProfiles: { supervisorProfile: readString(formData, 'supervisorProfile') },
      reviewAutoApproval: {
        enabled: formData.get('reviewAutoApprovalEnabled') === 'on',
        maxPriority: readString(formData, 'reviewAutoApprovalMaxPriority') as ReviewAutoApprovalPolicy['maxPriority'],
      },
      autopilotPolicy: { ...autopilotPolicy, scoutProfile: readString(formData, 'autopilotScoutProfile') },
    })
  }

  return (
    <form onSubmit={handleSave} className="mt-5 space-y-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
        <div className="space-y-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">{PROJECT_WORKFLOW_POLICY_PANEL_TITLE}</h2>
            <p className="mt-1 text-sm text-[var(--theme-muted)]">
              Configure every profile role reported by Profile Readiness: phase routing, Supervisor, Autopilot Scout, and review governance.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflowPolicyPhaseSummaries.map((summary, index) => {
              const phase = (Object.keys(WORK_ITEM_PHASE_LABELS) as Array<keyof PhaseProfiles>)[index]
              return (
                <div key={phase} className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
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
              <li key={label} className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-2">
                {label}
              </li>
            ))}
          </ol>
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">Review governance</div>
            <div className="mt-2 text-sm font-medium text-ink">{reviewAutoApprovalSummary}</div>
          </div>
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">{PROJECT_WORKFLOW_DEPLOY_GOVERNANCE_HEADING}</div>
            <div className="mt-2 text-sm font-medium text-ink">{deployGovernanceSummary}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <SelectField label="Research Profile" name="researchProfile" value={phaseProfiles.research} options={buildProfileOptions(availableProfiles, phaseProfiles.research)} />
        <SelectField label="Build Profile" name="buildProfile" value={phaseProfiles.build} options={buildProfileOptions(availableProfiles, phaseProfiles.build)} />
        <SelectField label="Review Profile" name="reviewProfile" value={phaseProfiles.review} options={buildProfileOptions(availableProfiles, phaseProfiles.review)} />
        <SelectField label="Deploy Profile" name="deployProfile" value={phaseProfiles.deploy} options={buildProfileOptions(availableProfiles, phaseProfiles.deploy)} />
        <SelectField label="Supervisor Profile" name="supervisorProfile" value={runtimeProfiles.supervisorProfile ?? ''} options={buildProfileOptions(availableProfiles, runtimeProfiles.supervisorProfile)} />
        <SelectField label="Autopilot Scout Profile" name="autopilotScoutProfile" value={autopilotPolicy.scoutProfile ?? ''} options={buildProfileOptions(availableProfiles, autopilotPolicy.scoutProfile)} />
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
              name="reviewAutoApprovalEnabled"
              defaultChecked={reviewAutoApproval.enabled}
            />
            Enabled
          </label>
        </div>
        <div className="space-y-1 max-w-xs">
          <label className="text-xs font-medium uppercase tracking-wide text-[var(--theme-muted)]">Max Priority</label>
          <select
            name="reviewAutoApprovalMaxPriority"
            defaultValue={reviewAutoApproval.maxPriority}
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
        <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] transition-colors hover:bg-[var(--theme-card)]">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-[var(--theme-accent)] px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : PROJECT_WORKFLOW_POLICY_SAVE_LABEL}
        </button>
      </div>
    </form>
  )
}

export function ProjectProfileReadinessPanel({
  isLoading,
  error,
  roles,
  profileDiscoveryAvailable,
  profileDiscoveryError,
  onConfigureProfileMappings,
}: {
  isLoading: boolean
  error: Error | null
  roles: Array<ProfileReadinessRoleReport>
  profileDiscoveryAvailable?: boolean
  profileDiscoveryError?: string
  onConfigureProfileMappings?: () => void
}) {
  const needsProfileMapping = roles.some((role) =>
    ['unmapped', 'missing', 'unknown'].includes(role.status),
  )

  return (
    <div className="mt-5 space-y-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card2)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{PROJECT_PROFILE_READINESS_PANEL_TITLE}</h2>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            {PROJECT_PROFILE_READINESS_COPY}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {needsProfileMapping && onConfigureProfileMappings ? (
            <button
              type="button"
              onClick={onConfigureProfileMappings}
              className="rounded-full bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
            >
              {PROJECT_PROFILE_MAPPING_CONFIGURE_LABEL}
            </button>
          ) : null}
          {profileDiscoveryAvailable === false ? (
            <span className="rounded-full border border-slate-500/35 bg-slate-500/10 px-2 py-0.5 text-[11px] font-medium text-slate-200">
              Discovery unavailable
            </span>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-muted)]">
          Checking profile readiness…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Profile readiness unavailable: {error.message}
        </div>
      ) : roles.length === 0 ? (
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-muted)]">
          No profile readiness roles reported yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)]">
          <table className="min-w-full divide-y divide-[var(--theme-border)] text-sm">
            <thead className="bg-[var(--theme-card2)] text-left text-xs uppercase tracking-wide text-[var(--theme-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Mapped Profile</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Fix Hint</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--theme-border)]">
              {roles.map((role) => (
                <tr key={role.role}>
                  <td className="px-3 py-2 font-medium text-ink">
                    {PROJECT_PROFILE_READINESS_ROLE_LABELS[role.role]}
                  </td>
                  <td className="px-3 py-2 text-[var(--theme-text)]">
                    {role.mappedProfile ?? 'Auto fallback'}
                  </td>
                  <td className="px-3 py-2 text-[var(--theme-muted)]">{role.source}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium',
                        PROJECT_PROFILE_READINESS_STATUS_TONE_CLASSES[role.status],
                      )}
                    >
                      {PROJECT_PROFILE_READINESS_STATUS_LABELS[role.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--theme-muted)]">{role.fixHint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {profileDiscoveryError ? (
        <p className="text-xs text-[var(--theme-muted)]">Profile discovery note: {profileDiscoveryError}</p>
      ) : null}
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
  name,
  value,
  onChange,
  options,
}: {
  label: string
  hideLabel?: boolean
  name?: string
  value: string
  onChange?: (value: string) => void
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
        name={name}
        value={onChange ? value : undefined}
        defaultValue={onChange ? undefined : value}
        onChange={(event) => onChange?.(event.target.value)}
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
