import { describe, expect, it } from 'vitest'

import {
  buildPlanningDraftDiff,
  buildWorkItemAcceptanceCriteriaStatus,
  buildWorkItemConductorHref,
  canLaunchBuildFromPlanningState,
  getAvailableWorkItemLifecycleActions,
  getPlanningDraftGuidance,
  getPlanningDraftStatusLabel,
  getWorkItemAcceptanceCriteriaProgress,
  getWorkItemAcceptanceCriteriaProgressLabel,
  getWorkItemApprovalSummary,
  getWorkItemBlockedReasonGuidance,
  getWorkItemExecutionSummary,
  getWorkItemExecutionSyncWarningMessage,
  getWorkItemLifecycleActionLabel,
  getWorkItemOperatorGuidance,
  getWorkItemPrimaryLaunchLabel,
  getWorkItemProfileReadinessAdvisory,
  getWorkItemProfileReadinessDecision,
  parseWorkItemDetailListDraft,
  reviewDecisionLabel,
  reviewQualityGateLabel,
  getReviewEvidenceAttentionMessage,
  stringifyWorkItemDetailListDraft,
  WORK_ITEM_BLOCKED_REASON_FIELD_LABEL,
  WORK_ITEM_BLOCKED_REASON_HELP_TEXT,
  WORK_ITEM_DETAIL_ACCEPTANCE_CRITERIA_HELP_TEXT,
  WORK_ITEM_DETAIL_ACTION_GROUP_TITLES,
  WORK_ITEM_DETAIL_AUTO_SYNC_MODE,
  WORK_ITEM_DETAIL_HEADER_CLASS,
  WORK_ITEM_DETAIL_MUTED_TEXT_CLASS,
  WORK_ITEM_DETAIL_NOTES_HELP_TEXT,
  WORK_ITEM_DETAIL_OPEN_CONDUCTOR_LABEL,
  WORK_ITEM_DETAIL_PANEL_CLASS,
  WORK_ITEM_EXECUTION_SYNC_WARNING_TITLE,
  WORK_ITEM_PROFILE_READINESS_PREFLIGHT_TITLE,
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
    expect(getWorkItemPrimaryLaunchLabel({ phase: 'research', status: 'active' })).toBe('Plan with Planner')
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
      'cancel',
    ])
    expect(getAvailableWorkItemLifecycleActions({ status: 'active', phase: 'research' })).toEqual([
      'mark_ready',
      'back_to_inbox',
      'cancel',
    ])
    expect(getAvailableWorkItemLifecycleActions({ status: 'active', phase: 'build' })).toEqual([
      'request_review',
      'back_to_research',
      'cancel',
    ])
    expect(getAvailableWorkItemLifecycleActions({ status: 'active', phase: 'deploy' })).toEqual([
      'request_deploy_approval',
      'back_to_build',
      'cancel',
    ])
    expect(getAvailableWorkItemLifecycleActions({ status: 'active', phase: 'review' })).toEqual(['back_to_research', 'cancel'])
    expect(getAvailableWorkItemLifecycleActions({ status: 'blocked', phase: 'build' })).toEqual(['resume_build', 'back_to_research', 'cancel'])
    expect(getAvailableWorkItemLifecycleActions({ status: 'ready', phase: undefined })).toEqual(['cancel'])
    expect(getAvailableWorkItemLifecycleActions({ status: 'done', phase: undefined })).toEqual([])
    expect(getAvailableWorkItemLifecycleActions({ status: 'cancelled', phase: undefined })).toEqual([])
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

  it('normalizes acceptance criteria status and exposes progress labels', () => {
    const status = buildWorkItemAcceptanceCriteriaStatus(
      ['Criterion A', 'Criterion B', 'Criterion C'],
      [
        { text: 'Criterion A', met: true },
        { text: 'Criterion B', met: false },
      ],
    )

    expect(status).toEqual([
      { text: 'Criterion A', met: true },
      { text: 'Criterion B', met: false },
      { text: 'Criterion C', met: false },
    ])

    const progress = getWorkItemAcceptanceCriteriaProgress(status)
    expect(progress).toEqual({ metCount: 1, totalCount: 3 })
    expect(getWorkItemAcceptanceCriteriaProgressLabel(progress)).toBe('1/3 criteria met')
  })

  it('exposes execution cockpit summaries and operator action groups for the current work state', () => {
    expect(WORK_ITEM_DETAIL_ACTION_GROUP_TITLES).toEqual({
      operator: 'Operator Workflow',
      execution: 'Execution Controls',
      administration: 'Administrative Actions',
    })
    expect(WORK_ITEM_BLOCKED_REASON_FIELD_LABEL).toBe('Blocked reason')
    expect(WORK_ITEM_BLOCKED_REASON_HELP_TEXT).toBe(
      'Classify why this work item is blocked so board triage and recovery guidance stay actionable.',
    )
    expect(getWorkItemBlockedReasonGuidance('review_feedback')).toContain('review')
    expect(
      getWorkItemOperatorGuidance({
        status: 'ready',
        phase: undefined,
        acceptanceCriteriaProgress: { metCount: 1, totalCount: 3 },
      }),
    ).toContain('Acceptance criteria progress: 1/3 met.')
    expect(
      getWorkItemOperatorGuidance({ status: 'active', phase: 'build', missionState: 'running' }),
    ).toBe('Build mission is in flight. Sync execution for fresh evidence or request review once implementation is ready.')
    expect(getWorkItemOperatorGuidance({ status: 'blocked', phase: 'build', missionState: 'failed' })).toBe(
      'This work item is blocked by a failed build mission. Capture fixes, run Resume Build, and relaunch Build to continue delivery.',
    )
    expect(
      getWorkItemOperatorGuidance({
        status: 'blocked',
        phase: 'build',
        blockedReason: 'blocked_by_dependency',
      }),
    ).toContain('dependency')
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

  it('formats profile readiness preflight advisories for launch controls', () => {
    const report = {
      overallStatus: 'missing' as const,
      severity: 'warning' as const,
      roles: [
        {
          role: 'build' as const,
          mappedProfile: 'missing-specialist',
          source: 'work-item-assigned-profile' as const,
          status: 'missing' as const,
          severity: 'warning' as const,
          fixHint: 'Create missing-specialist or choose an available build profile.',
        },
      ],
    }

    const decision = getWorkItemProfileReadinessDecision(report, 'build')

    expect(WORK_ITEM_PROFILE_READINESS_PREFLIGHT_TITLE).toBe('Profile Preflight')
    expect(decision).toMatchObject({
      mappedProfile: 'missing-specialist',
      source: 'work-item-assigned-profile',
      status: 'missing',
    })
    expect(getWorkItemProfileReadinessAdvisory(decision)).toBe(
      'Selected phase profile: missing-specialist (work-item override). Warning: missing Hermes profile. Create missing-specialist or choose an available build profile.',
    )
    expect(getWorkItemProfileReadinessAdvisory(undefined)).toBe(
      'Profile readiness is loading for this work item launch path.',
    )
  })

  it('formats ready project-mapped profile readiness preflight copy', () => {
    expect(
      getWorkItemProfileReadinessAdvisory({
        role: 'review',
        mappedProfile: 'planner',
        source: 'project-phase-profile',
        status: 'ready',
        severity: 'ready',
        fixHint: 'Hermes profile planner is available for review.',
      }),
    ).toBe('Selected phase profile: planner (project phase mapping). Ready for launch.')
  })

  it('formats non-fatal execution sync warnings for operator-visible banner copy', () => {
    expect(WORK_ITEM_EXECUTION_SYNC_WARNING_TITLE).toBe('Execution sync warning')
    expect(getWorkItemExecutionSyncWarningMessage('Hermes dashboard timed out')).toBe(
      'Execution data may be stale: Hermes dashboard timed out',
    )
    expect(getWorkItemExecutionSyncWarningMessage('  ')).toBeNull()
  })

  it('returns user-facing labels for planner review decisions', () => {
    expect(reviewDecisionLabel('approved')).toBe('✅ Approved — advance to deploy')
    expect(reviewDecisionLabel('changes_requested')).toBe(
      '🔧 Changes Requested — return to build',
    )
    expect(reviewDecisionLabel('manual_review')).toBe('🧑‍⚖️ Manual Review — CEO attention required')
    expect(reviewDecisionLabel('unknown')).toBe('unknown')
    expect(reviewDecisionLabel('')).toBe('—')
  })

  it('surfaces structured planner review gate labels and attention copy', () => {
    expect(reviewQualityGateLabel('pass')).toBe('✅ Gate passed')
    expect(reviewQualityGateLabel('fail')).toBe('🔧 Gate failed')
    expect(reviewQualityGateLabel('manual_review')).toBe('🧑‍⚖️ Manual review required')
    expect(reviewQualityGateLabel()).toBe('—')

    expect(
      getReviewEvidenceAttentionMessage({
        reviewDecision: 'manual_review',
        reviewParserError: 'No REVIEW_DECISION_JSON block found.',
      }),
    ).toBe('Manual review required — Planner review completed without valid structured decision.')

    expect(
      getReviewEvidenceAttentionMessage({
        reviewDecision: 'manual_review',
        reviewQualityGateStatus: 'manual_review',
      }),
    ).toBe('Manual review required — approved decision failed quality gates.')

    expect(
      getReviewEvidenceAttentionMessage({
        reviewDecision: 'approved',
        reviewQualityGateStatus: 'pass',
      }),
    ).toBe('Review gate passed — structured Planner approval verified.')

    expect(
      getReviewEvidenceAttentionMessage({
        reviewDecision: 'changes_requested',
        reviewQualityGateStatus: 'fail',
      }),
    ).toBe('Changes requested — Planner review found blockers or unmet criteria.')

    expect(
      getReviewEvidenceAttentionMessage({
        reviewDecision: 'approved',
        reviewMissingEvidence: ['test evidence'],
      }),
    ).toContain('Missing review evidence: test evidence')
  })

  it('maps planner enrichment statuses to operator labels, guidance, launch gating, and diff previews', () => {
    expect(getPlanningDraftStatusLabel()).toBe('No draft')
    expect(getPlanningDraftStatusLabel('running')).toBe('Planner running')
    expect(getPlanningDraftStatusLabel('structured_ready')).toBe('Draft ready')
    expect(getPlanningDraftStatusLabel('parse_failed')).toBe('Planner revision needed')
    expect(getPlanningDraftStatusLabel('accepted')).toBe('Accepted')

    expect(getPlanningDraftGuidance()).toContain('Prepare with Planner')
    expect(getPlanningDraftGuidance('parse_failed')).toContain('Request revision')
    expect(getPlanningDraftGuidance('structured_ready')).toContain('Accept Planner Draft')

    const roughIdea = { status: 'inbox' as const, phase: 'research' as const, planFilePath: undefined }
    const readyBuild = {
      status: 'ready' as const,
      phase: 'build' as const,
      planFilePath: 'docs/plans/project-1-abcd1234-planner-draft.md',
    }

    expect(canLaunchBuildFromPlanningState(roughIdea, null)).toBe(false)
    expect(
      canLaunchBuildFromPlanningState(roughIdea, {
        status: 'structured_ready' as const,
      }),
    ).toBe(false)
    expect(
      canLaunchBuildFromPlanningState(roughIdea, {
        status: 'accepted' as const,
      }),
    ).toBe(true)
    expect(canLaunchBuildFromPlanningState(readyBuild, null)).toBe(true)

    expect(
      buildPlanningDraftDiff(
        {
          title: 'Original title',
          description: 'Original description',
          priority: 'medium',
          riskLevel: 'high',
          labels: ['api'],
          acceptanceCriteria: ['Current criterion'],
          notes: ['Current note'],
          planFilePath: undefined,
        },
        {
          title: 'Improved title',
          description: 'Updated description',
          priority: 'high',
          riskLevel: 'medium',
          labels: ['api', 'planner'],
          acceptanceCriteria: ['Current criterion', 'New criterion'],
          notes: ['Current note', 'Refined note'],
          planFilePath: 'docs/plans/project-1-abcd1234-planner-draft.md',
          openQuestions: ['Need rollout owner?'],
          suggestedPhase: 'build',
        },
      ),
    ).toEqual([
      { label: 'Title', before: 'Original title', after: 'Improved title' },
      { label: 'Description', before: 'Original description', after: 'Updated description' },
      { label: 'Priority', before: 'medium', after: 'high' },
      { label: 'Risk level', before: 'high', after: 'medium' },
      { label: 'Labels', before: 'api', after: 'api, planner' },
      {
        label: 'Acceptance criteria',
        before: 'Current criterion',
        after: 'Current criterion\nNew criterion',
      },
      {
        label: 'Notes',
        before: 'Current note',
        after: 'Current note\nRefined note',
      },
      {
        label: 'Plan file path',
        before: '—',
        after: 'docs/plans/project-1-abcd1234-planner-draft.md',
      },
    ])
  })
})
