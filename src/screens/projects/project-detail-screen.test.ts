import { describe, expect, it } from 'vitest'

import {
  BOARD_FILTER_OPTIONS,
  PROJECT_ACCEPTANCE_CRITERIA_HELP_TEXT,
  PROJECT_BOARD_COLUMNS_CLASS,
  PROJECT_BOARD_EMPTY_STATE_CLASS,
  PROJECT_BOARD_SIGNAL_CHIP_CLASS,
  PROJECT_CARD_TONE_CLASSES,
  PROJECT_CREATE_WORK_ITEM_BUTTON_LABEL,
  PROJECT_CREATE_WORK_ITEM_SUBMIT_LABEL,
  PROJECT_DETAIL_BOARD_ORDER,
  PROJECT_FORM_NATIVE_SELECT_STYLE,
  PROJECT_FORM_SELECT_CLASS,
  PROJECT_LANE_COCKPIT_MODE_LABEL,
  PROJECT_LANE_COCKPIT_PANEL_TITLE,
  PROJECT_LANE_EVIDENCE_HEADING,
  PROJECT_LANE_EVIDENCE_LABELS,
  PROJECT_LANE_PARALLEL_WORKTREES_NOTE,
  PROJECT_LANE_RECOVERY_ACTIONS_HEADING,
  PROJECT_ALWAYS_ON_POLICY_PANEL_TITLE,
  PROJECT_ALWAYS_ON_POLICY_LABELS,
  PROJECT_ALWAYS_ON_POLICY_SAFE_TOGGLE_LABEL,
  PROJECT_PHASE_ROUTING_POLICY_LABELS,
  PROJECT_PROFILE_READINESS_COPY,
  PROJECT_PROFILE_READINESS_PANEL_TITLE,
  PROJECT_PROFILE_READINESS_ROLE_LABELS,
  PROJECT_PROFILE_READINESS_STATUS_LABELS,
  PROJECT_PROFILE_READINESS_STATUS_TONE_CLASSES,
  PROJECT_RECOVERY_HINT_CLASS,
  PROJECT_ROUTING_PRECEDENCE_LABELS,
  PROJECT_ROUTING_POLICY_EMPTY_VALUE,
  PROJECT_WORKFLOW_POLICY_PANEL_TITLE,
  PROJECT_WORKFLOW_POLICY_SAVE_LABEL,
  PROJECT_WORKFLOW_POLICY_TOGGLE_LABEL,
  PROJECT_WORKFLOW_DEPLOY_GOVERNANCE_HEADING,
  PROJECT_WIP_WARNING_BADGE_LABEL,
  PROJECT_WIP_WARNING_LAUNCH_HINT,
  buildProjectDeployGovernanceSummary,
  PROJECT_URGENCY_SUMMARY_FILTERS,
  PROJECT_URGENCY_SUMMARY_LABELS,
  PROJECT_URGENCY_SUMMARY_SHORTCUT_LABELS,
  buildAssignedProfileOptions,
  buildProjectReviewAutoApprovalSummary,
  buildProjectWorkflowPolicyPhaseSummaries,
  toggleProjectBoardShortcutFilter,
} from './project-detail-screen'
import { buildWorkItemOperatorSignals } from '@/lib/projects-view-model'
import type { WorkItemRecord } from '@/lib/projects-api'

describe('project detail screen board constants', () => {
  it('orders project board columns in a left-to-right operational flow', () => {
    expect(PROJECT_DETAIL_BOARD_ORDER).toEqual([
      'inbox',
      'ready',
      'active',
      'blocked',
      'done',
      'cancelled',
    ])
  })

  it('uses a responsive multi-column board layout for the kanban surface', () => {
    expect(PROJECT_BOARD_COLUMNS_CLASS).toContain('xl:grid-cols-3')
    expect(PROJECT_BOARD_COLUMNS_CLASS).toContain('2xl:grid-cols-6')
  })

  it('uses theme-aware empty states and operator signal chips', () => {
    expect(PROJECT_BOARD_EMPTY_STATE_CLASS).toContain('border-dashed')
    expect(PROJECT_BOARD_EMPTY_STATE_CLASS).toContain('bg-[var(--theme-card2)]')
    expect(PROJECT_BOARD_SIGNAL_CHIP_CLASS).toContain('bg-[var(--theme-card)]')
    expect(PROJECT_BOARD_SIGNAL_CHIP_CLASS).toContain('text-[var(--theme-text)]')
    expect(PROJECT_RECOVERY_HINT_CLASS).toContain('text-amber')
  })

  it('offers operator-centric board filters for attention triage', () => {
    expect(BOARD_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      'all',
      'attention',
      'execution',
      'approvals',
    ])
  })

  it('defines urgency summary labels, filter routing, stronger urgent card tones, and clearer shortcut state helpers', () => {
    expect(PROJECT_URGENCY_SUMMARY_LABELS).toEqual({
      activeThisWeek: 'Active this week',
      blocked: 'Blocked',
      blockedThisWeek: 'Blocked this week',
      changesRequested: 'Changes requested',
      doneThisWeek: 'Done this week',
      failedMissions: 'Mission failures',
      pendingApprovals: 'Pending approvals',
      runningMissions: 'Missions running',
    })
    expect(PROJECT_URGENCY_SUMMARY_FILTERS).toEqual({
      activeThisWeek: 'attention',
      blocked: 'attention',
      blockedThisWeek: 'attention',
      changesRequested: 'approvals',
      doneThisWeek: 'attention',
      failedMissions: 'execution',
      pendingApprovals: 'approvals',
      runningMissions: 'execution',
    })
    expect(PROJECT_URGENCY_SUMMARY_SHORTCUT_LABELS).toEqual({
      all: 'All work',
      attention: 'Needs attention',
      approvals: 'Approvals',
      execution: 'Execution',
    })
    expect(toggleProjectBoardShortcutFilter('all', 'approvals')).toBe('approvals')
    expect(toggleProjectBoardShortcutFilter('approvals', 'approvals')).toBe('all')
    expect(PROJECT_CARD_TONE_CLASSES.warning).toContain('amber')
    expect(PROJECT_CARD_TONE_CLASSES.danger).toContain('red')
    expect(PROJECT_CARD_TONE_CLASSES.default).toContain('border-[var(--theme-border)]')
  })

  it('uses theme-aware native select styling and assigned-profile options that support auto routing', () => {
    expect(PROJECT_FORM_SELECT_CLASS).toContain('bg-[var(--theme-card)]')
    expect(PROJECT_FORM_SELECT_CLASS).toContain('text-[var(--theme-text)]')
    expect(PROJECT_FORM_NATIVE_SELECT_STYLE).toEqual({ colorScheme: 'dark' })
    expect(
      buildAssignedProfileOptions(['builder', 'planner'], {
        research: 'planner',
        build: 'builder',
        review: 'reviewer',
        deploy: '',
      }, 'build'),
    ).toEqual([
      ['', 'Auto (Build → builder)'],
      ['builder', 'builder'],
      ['planner', 'planner'],
      ['reviewer', 'reviewer'],
    ])
  })

  it('surfaces project profile readiness labels and status tone mapping', () => {
    expect(PROJECT_PROFILE_READINESS_PANEL_TITLE).toBe('Profile Readiness')
    expect(PROJECT_PROFILE_READINESS_COPY).toBe(
      'Profile readiness checks whether mapped Hermes profiles exist before launches use them.',
    )
    expect(PROJECT_PROFILE_READINESS_ROLE_LABELS).toEqual({
      'autopilot-scout': 'Autopilot Scout',
      build: 'Build',
      deploy: 'Deploy',
      research: 'Research',
      review: 'Review',
      supervisor: 'Supervisor',
    })
    expect(PROJECT_PROFILE_READINESS_STATUS_LABELS).toEqual({
      missing: 'Missing',
      ready: 'Ready',
      unknown: 'Unknown',
      unmapped: 'Unmapped',
    })
    expect(PROJECT_PROFILE_READINESS_STATUS_TONE_CLASSES.ready).toContain('emerald')
    expect(PROJECT_PROFILE_READINESS_STATUS_TONE_CLASSES.unmapped).toContain('sky')
    expect(PROJECT_PROFILE_READINESS_STATUS_TONE_CLASSES.missing).toContain('amber')
    expect(PROJECT_PROFILE_READINESS_STATUS_TONE_CLASSES.unknown).toContain('slate')
  })

  it('surfaces project lane cockpit copy for single-lane branch autonomy', () => {
    expect(PROJECT_LANE_COCKPIT_PANEL_TITLE).toBe('Project Lane Cockpit')
    expect(PROJECT_LANE_COCKPIT_MODE_LABEL).toBe('Single-lane branch autonomy')
    expect(PROJECT_LANE_PARALLEL_WORKTREES_NOTE).toBe(
      'Parallel worktrees disabled unless advanced mode is enabled.',
    )
    expect(PROJECT_LANE_RECOVERY_ACTIONS_HEADING).toBe('Recovery actions')
    expect(PROJECT_LANE_EVIDENCE_HEADING).toBe('Operator evidence truth')
    expect(PROJECT_LANE_EVIDENCE_LABELS).toEqual({
      planner: 'Planner artifact',
      builderJob: 'Builder job',
      builderState: 'Builder state',
      builderArtifacts: 'Builder evidence artifacts',
      changedFiles: 'Product/test changed files',
      review: 'Review decision/source',
      merge: 'Merge-Healer result',
      mergeTest: 'Merge test result',
      repoHygiene: 'Repo hygiene',
    })
  })

  it('surfaces project always-on policy panel copy for owner controls', () => {
    expect(PROJECT_ALWAYS_ON_POLICY_PANEL_TITLE).toBe('ALWAYS-ON POLICY')
    expect(PROJECT_ALWAYS_ON_POLICY_SAFE_TOGGLE_LABEL).toBe('Enable supervised always-on digest')
    expect(PROJECT_ALWAYS_ON_POLICY_LABELS).toEqual({
      mode: 'Mode',
      retry: 'Retry guardrails',
      notifications: 'Notification digest events',
      prPublishing: 'PR publishing gate',
      cleanup: 'Cleanup retention',
      safety: 'Safety gates',
    })
  })

  it('surfaces project workflow policy copy and helper summaries for routing governance', () => {
    expect(PROJECT_WORKFLOW_POLICY_TOGGLE_LABEL).toBe('Profile & Workflow Policy')
    expect(PROJECT_WORKFLOW_POLICY_PANEL_TITLE).toBe('Project Profile & Workflow Policy')
    expect(PROJECT_WORKFLOW_POLICY_SAVE_LABEL).toBe('Save Profile & Workflow Policy')
    expect(PROJECT_WORKFLOW_DEPLOY_GOVERNANCE_HEADING).toBe('Deploy governance')
    expect(PROJECT_WIP_WARNING_BADGE_LABEL).toBe('WIP high')
    expect(PROJECT_WIP_WARNING_LAUNCH_HINT).toBe('WIP is high; finish one active item first.')
    expect(PROJECT_ROUTING_POLICY_EMPTY_VALUE).toBe('Auto fallback')
    expect(PROJECT_ROUTING_PRECEDENCE_LABELS).toEqual([
      '1. Work item override',
      '2. Project phase routing',
      '3. Global/request phase routing',
    ])
    expect(PROJECT_PHASE_ROUTING_POLICY_LABELS).toEqual({
      build: 'Build launches route to builder by default.',
      deploy: 'Deploy launches route to deployer by default.',
      research: 'Research/planning phase routes to Planner profile by default.',
      review: 'Review launches route to reviewer by default.',
    })
    expect(
      buildProjectWorkflowPolicyPhaseSummaries({
        research: 'planner',
        build: '',
        review: 'reviewer',
        deploy: '',
      }),
    ).toEqual([
      'Research → planner',
      'Build → Auto fallback',
      'Review → reviewer',
      'Deploy → Auto fallback',
    ])
    expect(buildProjectReviewAutoApprovalSummary({ enabled: true, maxPriority: 'medium' })).toBe(
      'Review auto-approval is enabled for Low + Medium priority work items.',
    )
    expect(buildProjectReviewAutoApprovalSummary({ enabled: false, maxPriority: 'high' })).toBe(
      'Review auto-approval is disabled. Every review-phase work item will wait for an operator decision.',
    )
    expect(buildProjectDeployGovernanceSummary({ deploy: 'deployer' })).toBe(
      'Deploy governance routes deploy launches to deployer and requires explicit deploy approval before done.',
    )
    expect(buildProjectDeployGovernanceSummary({ deploy: '' })).toBe(
      'Deploy governance uses Auto fallback routing and requires explicit deploy approval before done.',
    )
  })

  it('surfaces rough-idea creation labels and planner-state board chips', () => {
    expect(PROJECT_CREATE_WORK_ITEM_BUTTON_LABEL).toBe('Capture rough idea')
    expect(PROJECT_CREATE_WORK_ITEM_SUBMIT_LABEL).toBe('Create rough idea')

    const baseItem: WorkItemRecord = {
      id: 'work-item-1',
      projectId: 'project-1',
      title: 'Rough idea',
      description: '',
      status: 'inbox',
      phase: 'research',
      priority: 'medium',
      riskLevel: 'medium',
      labels: [],
      repoPathSnapshot: '/repo',
      sourceSuggestionEvidence: [],
      reviewQualityGateReasons: [],
      reviewMissingEvidence: [],
      sessionKeys: [],
      artifactPaths: [],
      acceptanceCriteria: [],
      criteriaStatus: [],
      notes: [],
      approvals: [],
      history: [],
      createdAt: '2026-04-25T00:00:00.000Z',
      updatedAt: '2026-04-25T00:00:00.000Z',
    }

    expect(buildWorkItemOperatorSignals(baseItem)).toEqual(
      expect.arrayContaining(['Needs Planner', 'Research phase']),
    )
    expect(
      buildWorkItemOperatorSignals({
        ...baseItem,
        latestPlanningDraft: {
          id: 'draft-1',
          workItemId: baseItem.id,
          projectId: baseItem.projectId,
          status: 'structured_ready',
          parseWarnings: [],
          createdAt: '2026-04-25T00:10:00.000Z',
          updatedAt: '2026-04-25T00:10:00.000Z',
        },
      }),
    ).toEqual(expect.arrayContaining(['Draft ready']))
    expect(
      buildWorkItemOperatorSignals({
        ...baseItem,
        latestPlanningDraft: {
          id: 'draft-2',
          workItemId: baseItem.id,
          projectId: baseItem.projectId,
          status: 'parse_failed',
          parseWarnings: [],
          parseError: 'Missing required planFilePath',
          createdAt: '2026-04-25T00:20:00.000Z',
          updatedAt: '2026-04-25T00:20:00.000Z',
        },
      }),
    ).toEqual(expect.arrayContaining(['Planner revision needed']))
  })

})
