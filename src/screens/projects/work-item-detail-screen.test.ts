import { describe, expect, it } from 'vitest'

import {
  buildWorkItemConductorHref,
  getWorkItemApprovalSummary,
  getWorkItemExecutionSummary,
  getWorkItemLifecycleActionLabel,
  getAvailableWorkItemLifecycleActions,
  getWorkItemOperatorGuidance,
  parseWorkItemDetailListDraft,
  WORK_ITEM_DETAIL_ACCEPTANCE_CRITERIA_HELP_TEXT,
  WORK_ITEM_DETAIL_ACTION_GROUP_TITLES,
  WORK_ITEM_DETAIL_AUTO_SYNC_MODE,
  WORK_ITEM_DETAIL_HEADER_CLASS,
  WORK_ITEM_DETAIL_MUTED_TEXT_CLASS,
  WORK_ITEM_DETAIL_NOTES_HELP_TEXT,
  WORK_ITEM_DETAIL_OPEN_CONDUCTOR_LABEL,
  WORK_ITEM_DETAIL_PANEL_CLASS,
  stringifyWorkItemDetailListDraft,
  getWorkItemPrimaryLaunchLabel,
} from './work-item-detail-screen'

describe('work item detail screen theme classes', () => {
  it('uses theme-aware dark surfaces for header and panels', () => {
    expect(WORK_ITEM_DETAIL_HEADER_CLASS).toContain('bg-[var(--theme-card)]')
    expect(WORK_ITEM_DETAIL_PANEL_CLASS).toContain('bg-[var(--theme-card)]')
    expect(WORK_ITEM_DETAIL_HEADER_CLASS).not.toContain('bg-primary-50/85')
    expect(WORK_ITEM_DETAIL_PANEL_CLASS).not.toContain('bg-white/80')
  })

  it('uses muted theme text instead of hardcoded primary copy', () => {
    expect(WORK_ITEM_DETAIL_MUTED_TEXT_CLASS).toContain('text-[var(--theme-muted)]')
    expect(WORK_ITEM_DETAIL_MUTED_TEXT_CLASS).not.toContain('text-primary-600')
  })

  it('defaults detail loading to execution-sync mode so evidence renders without manual sync', () => {
    expect(WORK_ITEM_DETAIL_AUTO_SYNC_MODE).toBe('sync-execution')
  })

  it('uses workflow-specific launch labels instead of a generic conductor label', () => {
    expect(getWorkItemPrimaryLaunchLabel({ phase: 'research', status: 'active' })).toBe('Plan with Researcher')
    expect(getWorkItemPrimaryLaunchLabel({ phase: 'build', status: 'active' })).toBe('Launch Build')
    expect(getWorkItemPrimaryLaunchLabel({ phase: 'build', status: 'blocked' })).toBe('Relaunch Build')
    expect(getWorkItemPrimaryLaunchLabel({ phase: 'review', status: 'active' })).toBe('Launch Review')
    expect(getWorkItemPrimaryLaunchLabel({ phase: 'deploy', status: 'active' })).toBe('Launch Deploy')
    expect(getWorkItemPrimaryLaunchLabel({ phase: undefined, status: 'ready' })).toBe('Launch Build')
  })

  it('exposes explicit lifecycle action labels for the intended operator workflow', () => {
    expect(getWorkItemLifecycleActionLabel('send_to_planning')).toBe('Send to Planning')
    expect(getWorkItemLifecycleActionLabel('mark_ready')).toBe('Mark Ready')
    expect(getWorkItemLifecycleActionLabel('request_review')).toBe('Request Review')
    expect(getWorkItemLifecycleActionLabel('request_deploy_approval')).toBe('Request Deploy Approval')
    expect(getWorkItemLifecycleActionLabel('resume_build')).toBe('Resume Build')
  })

  it('derives lifecycle actions from current status and phase', () => {
    expect(getAvailableWorkItemLifecycleActions({ status: 'inbox', phase: 'research' })).toEqual([
      'send_to_planning',
    ])
    expect(getAvailableWorkItemLifecycleActions({ status: 'active', phase: 'research' })).toEqual([
      'mark_ready',
    ])
    expect(getAvailableWorkItemLifecycleActions({ status: 'active', phase: 'build' })).toEqual([
      'request_review',
    ])
    expect(getAvailableWorkItemLifecycleActions({ status: 'active', phase: 'deploy' })).toEqual([
      'request_deploy_approval',
    ])
    expect(getAvailableWorkItemLifecycleActions({ status: 'blocked', phase: 'build' })).toEqual(['resume_build'])
    expect(getAvailableWorkItemLifecycleActions({ status: 'ready', phase: undefined })).toEqual([])
  })

  it('supports planning-oriented draft helpers for acceptance criteria and notes', () => {
    expect(WORK_ITEM_DETAIL_ACCEPTANCE_CRITERIA_HELP_TEXT).toBe(
      'Planning can draft or refine acceptance criteria here before build execution.',
    )
    expect(WORK_ITEM_DETAIL_NOTES_HELP_TEXT).toBe(
      'Capture planning output, operator guidance, or open questions as one note per line.',
    )
    expect(stringifyWorkItemDetailListDraft(['Draft API contract', 'Confirm rollout guardrails'])).toBe(
      'Draft API contract\nConfirm rollout guardrails',
    )
    expect(
      parseWorkItemDetailListDraft('  Draft API contract\n\nConfirm rollout guardrails  \n  '),
    ).toEqual(['Draft API contract', 'Confirm rollout guardrails'])
    expect(parseWorkItemDetailListDraft('')).toEqual([])
  })

  it('exposes execution cockpit summaries and operator action groups for the current work state', () => {
    expect(WORK_ITEM_DETAIL_ACTION_GROUP_TITLES).toEqual({
      operator: 'Operator Workflow',
      execution: 'Execution Controls',
      administration: 'Administrative Actions',
    })
    expect(
      getWorkItemOperatorGuidance({ status: 'active', phase: 'build', missionState: 'running' }),
    ).toBe('Build mission is in flight. Sync execution for fresh evidence or request review once implementation is ready.')
    expect(getWorkItemOperatorGuidance({ status: 'blocked', phase: 'build', missionState: 'failed' })).toBe(
      'This work item is blocked by a failed build mission. Capture fixes, run Resume Build, and relaunch Build to continue delivery.',
    )
    expect(getWorkItemExecutionSummary({ missionState: 'failed', latestRunStatus: 'failed' })).toBe(
      'Mission failed — inspect the latest run, capture follow-up notes, run Resume Build, and relaunch Build when ready.',
    )
    expect(
      getWorkItemApprovalSummary([
        { status: 'pending', phase: 'review' },
        { status: 'changes_requested', phase: 'review' },
      ]),
    ).toBe('2 approvals need attention — pending review approval and changes requested.')
    expect(getWorkItemApprovalSummary([])).toBe('No approvals are currently blocking this work item.')
  })
})
