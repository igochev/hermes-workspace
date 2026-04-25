import { describe, expect, it } from 'vitest'

import {
  BOARD_FILTER_OPTIONS,
  PROJECT_ACCEPTANCE_CRITERIA_HELP_TEXT,
  PROJECT_BOARD_COLUMNS_CLASS,
  PROJECT_BOARD_EMPTY_STATE_CLASS,
  PROJECT_BOARD_SIGNAL_CHIP_CLASS,
  PROJECT_CARD_TONE_CLASSES,
  PROJECT_DETAIL_BOARD_ORDER,
  PROJECT_FORM_NATIVE_SELECT_STYLE,
  PROJECT_FORM_SELECT_CLASS,
  PROJECT_PHASE_ROUTING_POLICY_LABELS,
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
      blocked: 'Blocked',
      changesRequested: 'Changes requested',
      failedMissions: 'Mission failures',
      pendingApprovals: 'Pending approvals',
      runningMissions: 'Missions running',
    })
    expect(PROJECT_URGENCY_SUMMARY_FILTERS).toEqual({
      blocked: 'attention',
      changesRequested: 'approvals',
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

  it('surfaces project workflow policy copy and helper summaries for routing governance', () => {
    expect(PROJECT_WORKFLOW_POLICY_TOGGLE_LABEL).toBe('Workflow Policy')
    expect(PROJECT_WORKFLOW_POLICY_PANEL_TITLE).toBe('Project Workflow Policy')
    expect(PROJECT_WORKFLOW_POLICY_SAVE_LABEL).toBe('Save Workflow Policy')
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

})
