import { describe, expect, it } from 'vitest'

import {
  WORK_ITEM_ADVANCED_EXECUTION_METADATA_TITLE,
  WORK_ITEM_ADVANCED_METADATA_DEFAULT_OPEN,
  WORK_ITEM_ALWAYS_ON_EVIDENCE_LABELS,
  WORK_ITEM_ALWAYS_ON_EVIDENCE_TITLE,
  WORK_ITEM_BLOCKED_REASON_FIELD_LABEL,
  WORK_ITEM_BLOCKED_REASON_HELP_TEXT,
  WORK_ITEM_DETAIL_ACCEPTANCE_CRITERIA_HELP_TEXT,
  WORK_ITEM_DETAIL_ACTION_GROUP_TITLES,
  WORK_ITEM_DETAIL_AUTO_SYNC_MODE,
  WORK_ITEM_DETAIL_CLICKABILITY_AUDIT,
  WORK_ITEM_DETAIL_HEADER_CLASS,
  WORK_ITEM_DETAIL_MUTED_TEXT_CLASS,
  WORK_ITEM_DETAIL_NOTES_HELP_TEXT,
  WORK_ITEM_DETAIL_OPEN_CONDUCTOR_LABEL,
  WORK_ITEM_DETAIL_PANEL_CLASS,
  WORK_ITEM_EXECUTION_DETAIL_LABELS,
  WORK_ITEM_EXECUTION_ERROR_LABEL,
  WORK_ITEM_EXECUTION_EVIDENCE_TITLE,
  WORK_ITEM_EXECUTION_STATE_LABEL,
  WORK_ITEM_EXECUTION_SUMMARY_TITLE,
  WORK_ITEM_EXECUTION_SYNC_WARNING_TITLE,
  WORK_ITEM_EXECUTION_TRACE_LABEL,
  WORK_ITEM_LAST_EXECUTION_LABEL,
  WORK_ITEM_OPERATOR_EVIDENCE_LABELS,
  WORK_ITEM_OPERATOR_SUMMARY_TITLE,
  WORK_ITEM_PROFILE_READINESS_PREFLIGHT_TITLE,
  WORK_ITEM_RECOVERY_PANEL_TITLE,
  WORK_ITEM_RUNS_SECTION_TITLE,
  buildPlanningDraftDiff,
  buildWorkItemAcceptanceCriteriaStatus,
  buildWorkItemConductorHref,
  canLaunchBuildFromPlanningState,
  getAvailableWorkItemLifecycleActions,
  getPlanningDraftGuidance,
  getPlanningDraftStatusLabel,
  getReviewEvidenceAttentionMessage,
  getRunTimelineStateLabel,
  getWorkItemAcceptanceCriteriaProgress,
  getWorkItemAcceptanceCriteriaProgressLabel,
  getWorkItemAdvancedExecutionMetadataRows,
  getWorkItemAlwaysOnEvidenceRows,
  getWorkItemApprovalSummary,
  getWorkItemBlockedReasonGuidance,
  getWorkItemCockpitSummary,
  getWorkItemEvidenceSnapshot,
  getWorkItemExecutionSummary,
  getWorkItemExecutionSyncWarningMessage,
  getWorkItemLifecycleActionLabel,
  getWorkItemMergeEvidenceSummary,
  getWorkItemOperatorGuidance,
  getWorkItemPrimaryLaunchLabel,
  getWorkItemProfileReadinessAdvisory,
  getWorkItemProfileReadinessDecision,
  getWorkItemRecoveryActionButtonLabel,
  getWorkItemRecoveryPanelItems,
  getWorkItemRunTimelineArtifactCopy,
  getWorkItemRunTimelineIdCopy,
  getWorkItemRunTimelineLinkHref,
  getWorkItemRunTimelineLinkLabel,
  parseWorkItemDetailListDraft,
  reviewDecisionLabel,
  reviewQualityGateLabel,
  stringifyWorkItemDetailListDraft,
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

  it('exposes execution vocabulary for former mission metadata labels', () => {
    expect(WORK_ITEM_EXECUTION_SUMMARY_TITLE).toBe('Execution Summary')
    expect(WORK_ITEM_EXECUTION_TRACE_LABEL).toBe('Execution Trace')
    expect(WORK_ITEM_EXECUTION_STATE_LABEL).toBe('Execution State')
    expect(WORK_ITEM_LAST_EXECUTION_LABEL).toBe('Last Execution')
    expect(WORK_ITEM_EXECUTION_ERROR_LABEL).toBe('Execution Error')
    expect(WORK_ITEM_EXECUTION_DETAIL_LABELS).toEqual({
      missionId: 'Execution ID',
      missionJobId: 'Scheduled Job ID',
      missionJobName: 'Execution Job Name',
      missionSessionKeyPrefix: 'Execution Session Prefix',
      missionLink: 'Execution Trace',
      missionState: 'Execution State',
      missionLastRunAt: 'Last Execution',
      missionLastError: 'Execution Error',
    })
    expect(WORK_ITEM_DETAIL_CLICKABILITY_AUDIT).toContainEqual(
      expect.objectContaining({ surface: 'mission-control-summary', label: 'Execution Summary' }),
    )
    expect(WORK_ITEM_DETAIL_CLICKABILITY_AUDIT).toContainEqual(
      expect.objectContaining({ surface: 'operator-summary-cockpit', label: 'Operator Summary' }),
    )
  })

  it('builds operator cockpit summary rows from current phase, status, and next action', () => {
    expect(WORK_ITEM_OPERATOR_SUMMARY_TITLE).toBe('Operator Summary')

    const summary = getWorkItemCockpitSummary({
      status: 'active',
      phase: 'build',
      missionState: 'running',
      riskLevel: 'medium',
      assignedProfile: 'builder',
      acceptanceCriteriaProgress: { metCount: 2, totalCount: 4 },
      approvals: [{ status: 'pending', phase: 'review' }],
      baseBranch: 'main',
      branchName: 'mission/p1-cockpit',
      mergeTargetBranch: 'main',
      mergeTestCommand: 'pnpm test',
      mergeTestPassed: true,
      prUrl: 'https://github.com/org/repo/pull/42',
      planFilePath: 'docs/plans/p1.md',
    })

    expect(summary.rows).toEqual(
      expect.arrayContaining([
        { label: 'Status / phase', value: 'Active / Build' },
        { label: 'Lane / execution', value: 'Agent session running' },
        { label: 'Risk / profile', value: 'Medium risk · builder' },
        { label: 'Branch snapshot', value: 'mission/p1-cockpit → main (base main)' },
        { label: 'Latest evidence', value: 'passed: pnpm test' },
        { label: 'Pull request', value: 'https://github.com/org/repo/pull/42' },
        { label: 'Plan file', value: 'docs/plans/p1.md' },
        { label: 'Attention', value: '1 approvals need attention — pending review approval.' },
      ]),
    )
    expect(summary.recommendedNextAction).toBe(
      'Build execution is in flight. Sync execution for fresh evidence or request review once implementation is ready.',
    )
  })

  it('summarizes execution evidence by operator role from timeline rows', () => {
    expect(WORK_ITEM_EXECUTION_EVIDENCE_TITLE).toBe('Execution Evidence')

    const evidence = getWorkItemEvidenceSnapshot({
      rows: [
        {
          phase: 'research',
          phaseLabel: 'Research',
          profileRole: 'planner',
          profileName: 'planner',
          state: 'succeeded',
          summary: 'Plan ready.',
          artifacts: ['docs/plans/p1.md'],
        },
        {
          phase: 'build',
          phaseLabel: 'Build',
          profileRole: 'builder',
          profileName: 'builder',
          state: 'running',
          summary: 'Builder running.',
          jobId: 'job-1234567890',
          sessionKeyPrefix: 'sess-deadbeef',
          artifacts: ['src/screens/projects/work-item-detail-screen.tsx'],
        },
        {
          phase: 'review',
          phaseLabel: 'Review',
          profileRole: 'reviewer',
          state: 'waiting',
          summary: 'Awaiting review.',
          artifacts: [],
        },
      ],
    })

    expect(evidence).toEqual([
      expect.objectContaining({ role: 'Planner', state: 'Succeeded', summary: 'Plan ready.' }),
      expect.objectContaining({ role: 'Builder', state: 'Agent session running', evidence: 'Execution artifacts: src/screens/projects/work-item-detail-screen.tsx' }),
      expect.objectContaining({ role: 'Reviewer', state: 'Waiting for approval', evidence: 'No execution artifacts yet' }),
      expect.objectContaining({ role: 'Merge-Healer', state: 'No job launched', summary: 'No merge-healer evidence yet.' }),
    ])
  })

  it('keeps raw execution identifiers in advanced metadata rows while routing trace actions to Executions', () => {
    expect(WORK_ITEM_ADVANCED_EXECUTION_METADATA_TITLE).toBe('Advanced execution metadata')
    expect(WORK_ITEM_ADVANCED_METADATA_DEFAULT_OPEN).toBe(false)

    expect(
      getWorkItemAdvancedExecutionMetadataRows({
        id: 'work-item-123',
        missionId: 'execution-123',
        missionJobId: 'job-456',
        missionJobName: 'Build Hermes Workspace',
        missionSessionKeyPrefix: 'sess-789',
        missionLink: '/jobs?jobId=job-456',
        missionState: 'running',
        missionLastRunAt: '2026-04-28T12:00:00.000Z',
        missionLastError: 'previous failure',
        sessionKeys: ['sess-789abcdef', 'review-sess'],
        createdAt: '2026-04-28T11:00:00.000Z',
        updatedAt: '2026-04-28T12:30:00.000Z',
      }),
    ).toEqual([
      { label: 'Execution ID', value: 'execution-123' },
      { label: 'Scheduled Job ID', value: 'job-456' },
      { label: 'Execution Job Name', value: 'Build Hermes Workspace' },
      { label: 'Execution Session Prefix', value: 'sess-789' },
      { label: 'Execution Trace', value: '/executions?jobId=job-456&workItemId=work-item-123' },
      { label: 'Execution State', value: 'running' },
      { label: 'Last Execution', value: '2026-04-28T12:00:00.000Z' },
      { label: 'Execution Error', value: 'previous failure' },
      { label: 'Launch Sessions', value: 'sess-789abcdef, review-sess' },
      { label: 'Created', value: '2026-04-28T11:00:00.000Z' },
      { label: 'Updated', value: '2026-04-28T12:30:00.000Z' },
    ])
  })

  it('builds work-item run timeline links for Executions instead of Scheduled Jobs', () => {
    expect(
      getWorkItemRunTimelineLinkHref({
        executionRunId: 'execution-run-1',
        jobId: 'job-456',
        sessionKey: 'session-123',
      }),
    ).toBe('/executions/execution-run-1')
    expect(
      getWorkItemRunTimelineLinkHref({
        jobId: 'job-456',
        sessionKey: 'session-123',
        link: '/executions?jobId=job-456&workItemId=work-item-123',
      }),
    ).toBe('/executions?jobId=job-456&workItemId=work-item-123')
    expect(
      getWorkItemRunTimelineLinkHref({
        jobId: 'job-456',
        sessionKey: 'session-123',
        link: '/jobs?jobId=job-456',
      }),
    ).toBe('/executions?jobId=job-456')
    expect(getWorkItemRunTimelineLinkLabel({ jobId: 'job-456' })).toBe('Open execution trace')
  })

  it('defaults detail loading to execution-sync mode so evidence renders without manual sync', () => {
    expect(WORK_ITEM_DETAIL_AUTO_SYNC_MODE).toBe('sync-execution')
  })

  it('uses workflow-specific launch labels instead of a generic conductor label', () => {
    expect(getWorkItemPrimaryLaunchLabel({ phase: 'research', status: 'inbox' })).toBe('Prepare Idea with Researcher')
    expect(getWorkItemPrimaryLaunchLabel({ phase: 'research', status: 'active' })).toBe('Continue Research Plan')
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
    ).toBe('Build execution is in flight. Sync execution for fresh evidence or request review once implementation is ready.')
    expect(getWorkItemOperatorGuidance({ status: 'blocked', phase: 'build', missionState: 'failed' })).toBe(
      'This work item is blocked by a failed build execution. Capture fixes, run Resume Build, and relaunch Build to continue delivery.',
    )
    expect(
      getWorkItemOperatorGuidance({
        status: 'blocked',
        phase: 'build',
        blockedReason: 'blocked_by_dependency',
      }),
    ).toContain('dependency')
    expect(getWorkItemExecutionSummary({ missionState: 'failed', latestRunStatus: 'failed' })).toBe(
      'Execution failed — inspect the latest run, capture follow-up notes, run Resume Build, and relaunch Build when ready.',
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

  it('builds the work-item recovery panel item list from open attention actions', () => {
    const panelItems = getWorkItemRecoveryPanelItems([
      {
        id: 'resolved-attention',
        status: 'resolved',
        title: 'Old attention',
        detail: 'Already handled.',
        recommendedActions: [
          {
            type: 'dismiss_attention',
            label: 'Dismiss attention',
            description: 'Dismiss this old attention item.',
            destructive: false,
            auditNote: 'Dismissed.',
          },
        ],
      },
      {
        id: 'failed-attention',
        status: 'open',
        title: 'Build mission failed',
        detail: 'Builder exited non-zero.',
        recommendedActions: [
          {
            type: 'relaunch_phase',
            label: 'Relaunch build',
            description: 'Relaunch the failed build through the existing launch path.',
            phase: 'build',
            destructive: false,
            auditNote: 'Relaunched.',
          },
          {
            type: 'cancel_work_item',
            label: 'Cancel work item',
            description: 'Cancel the work item with an operator-supplied reason.',
            destructive: true,
            auditNote: 'Cancelled.',
          },
        ],
      },
    ])

    expect(panelItems).toEqual([
      {
        attentionItemId: 'failed-attention',
        title: 'Build mission failed',
        detail: 'Builder exited non-zero.',
        actions: [
          expect.objectContaining({ type: 'relaunch_phase', phase: 'build', label: 'Relaunch build' }),
          expect.objectContaining({ type: 'cancel_work_item', label: 'Cancel work item' }),
        ],
      },
    ])
    expect(getWorkItemRecoveryActionButtonLabel(panelItems[0].actions[0])).toBe('Relaunch build')
    expect(getWorkItemRecoveryActionButtonLabel(panelItems[0].actions[1])).toBe('Cancel work item')
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

    expect(getPlanningDraftGuidance()).toContain('Prepare Idea with Researcher')
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
  it('exposes Execution Evidence cockpit labels for honest per-profile run states', () => {
    expect(WORK_ITEM_RUNS_SECTION_TITLE).toBe('Execution Evidence')
    expect(getRunTimelineStateLabel('not_started')).toBe('No execution launched')
    expect(getRunTimelineStateLabel('scheduled')).toBe('Execution queued')
    expect(getRunTimelineStateLabel('running')).toBe('Agent session running')
    expect(getRunTimelineStateLabel('output_ready')).toBe('Output ready for ingestion')
    expect(getRunTimelineStateLabel('succeeded')).toBe('Succeeded')
    expect(getRunTimelineStateLabel('failed')).toBe('Failed')
    expect(getRunTimelineStateLabel('stale')).toBe('Stuck / stale')
    expect(getRunTimelineStateLabel('waiting')).toBe('Waiting for approval')
  })

  it('summarizes run timeline row ids, artifacts, and link labels', () => {
    expect(
      getWorkItemRunTimelineIdCopy({
        phase: 'build',
        phaseLabel: 'Build',
        profileRole: 'builder',
        executionRunId: 'exec-run-123456',
        jobId: 'job-123456',
        runId: 'run-abcdef',
        sessionKeyPrefix: 'sess-deadbeef',
        state: 'running',
        summary: 'Builder is running.',
        artifacts: [],
      }),
    ).toBe('execution exec-run · legacy job job-1234 · run run-abc · session sess-dea')
    expect(
      getWorkItemRunTimelineIdCopy({
        phase: 'research',
        phaseLabel: 'Research',
        profileRole: 'planner',
        state: 'not_started',
        summary: 'No job launched',
        artifacts: [],
      }),
    ).toBe('No execution/session yet')
    expect(getWorkItemRunTimelineArtifactCopy([])).toBe('No execution artifacts yet')
    expect(getWorkItemRunTimelineArtifactCopy(['lib/quick-capture.ts', 'tests/quick-capture.test.ts'])).toBe(
      'Execution artifacts: lib/quick-capture.ts, tests/quick-capture.test.ts',
    )
    expect(getWorkItemRunTimelineLinkLabel({ link: 'http://localhost:3456/jobs/job-123' })).toBe('Open run')
    expect(getWorkItemRunTimelineLinkLabel({ sessionKey: 'sess-123' })).toBe('Open session')
    expect(getWorkItemRunTimelineLinkLabel({})).toBeNull()
  })

  it('summarizes work-item merge evidence for operator-visible truth', () => {
    expect(WORK_ITEM_OPERATOR_EVIDENCE_LABELS).toEqual({
      baseBranch: 'Base branch',
      featureBranch: 'Feature branch',
      mergeTarget: 'Merge target',
      mergeCommit: 'Merge commit',
      mergeTest: 'Merge test',
      mergeArtifacts: 'Merge artifacts',
    })
    expect(
      getWorkItemMergeEvidenceSummary({
        baseBranch: 'main',
        branchName: 'mission/abc-work',
        mergeTargetBranch: 'main',
        mergeCommit: 'abcdef1234567890',
        mergeTestCommand: 'npm test',
        mergeTestPassed: true,
        mergeArtifactPaths: ['.hermes/merge-healer/abc-test.log'],
      }),
    ).toEqual({
      baseBranch: 'main',
      featureBranch: 'mission/abc-work',
      mergeTarget: 'main',
      mergeCommit: 'abcdef1',
      mergeTest: 'passed: npm test',
      mergeArtifacts: '.hermes/merge-healer/abc-test.log',
    })
  })

  it('summarizes always-on evidence rows for retry and policy affordances', () => {
    expect(WORK_ITEM_ALWAYS_ON_EVIDENCE_TITLE).toBe('Always-on policy evidence')
    expect(WORK_ITEM_ALWAYS_ON_EVIDENCE_LABELS).toEqual({
      decision: 'Recovery decision',
      retry: 'Retry evidence',
      repo: 'Repo/blocker safety',
      pr: 'PR evidence',
      cleanup: 'Cleanup evidence',
    })

    expect(
      getWorkItemAlwaysOnEvidenceRows({
        laneRecoveryDecision: 'schedule_retry',
        laneRetryCount: 1,
        laneLastRetryAt: '2026-04-28T01:00:00.000Z',
        laneBlockedReason: 'Repo has uncommitted files',
        branchName: 'mission/retry',
        mergeState: 'merged',
        mergeTestCommand: 'npm test',
        mergeTestPassed: true,
      }).map((row) => row.value),
    ).toEqual([
      'Always-on decision: schedule retry',
      'Retry evidence: 1 attempt · last retry 2026-04-28T01:00:00.000Z',
      'Unsafe repo/blocker evidence: Repo has uncommitted files',
      'PR evidence: no PR URL recorded',
      'Cleanup evidence: merged branch mission/retry eligible for retention review after passing npm test',
    ])
  })

  it('documents work item detail clickability for launch preflight and recovery controls', () => {
    expect(WORK_ITEM_DETAIL_CLICKABILITY_AUDIT).toEqual([
      { surface: 'work-item-back-link', label: 'Back to Project', kind: 'link', target: '/projects/:projectId' },
      { surface: 'operator-lifecycle-actions', label: WORK_ITEM_DETAIL_ACTION_GROUP_TITLES.operator, kind: 'button', target: 'apply lifecycle transition' },
      { surface: 'execution-refresh', label: 'Refresh', kind: 'button', target: 'refetch work item and profile readiness' },
      { surface: 'execution-sync', label: 'Sync Execution', kind: 'button', target: 'sync work item execution evidence' },
      { surface: 'execution-launch', label: 'Launch/Relaunch phase', kind: 'button', target: 'launch selected work item phase' },
      { surface: 'profile-preflight-card', label: WORK_ITEM_PROFILE_READINESS_PREFLIGHT_TITLE, kind: 'static', target: null },
      { surface: 'operator-summary-cockpit', label: WORK_ITEM_OPERATOR_SUMMARY_TITLE, kind: 'static', target: null },
      { surface: 'runs-agents-cockpit', label: WORK_ITEM_RUNS_SECTION_TITLE, kind: 'link', target: 'job/session deep links from run timeline' },
      { surface: 'open-conductor', label: WORK_ITEM_DETAIL_OPEN_CONDUCTOR_LABEL, kind: 'link', target: '/conductor?mode=work-item&id=:workItemId' },
      { surface: 'recovery-actions', label: WORK_ITEM_RECOVERY_PANEL_TITLE, kind: 'button', target: 'execute selected recovery action' },
      { surface: 'approvals-attention-card', label: 'Approvals Attention', kind: 'static', target: null },
      { surface: 'mission-control-summary', label: WORK_ITEM_EXECUTION_SUMMARY_TITLE, kind: 'static', target: null },
    ])
  })
})
