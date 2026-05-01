/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  PROJECT_PROFILE_MAPPING_CONFIGURE_LABEL,
  PROJECT_WORKFLOW_POLICY_SAVE_LABEL,
  ProjectProfileReadinessPanel,
  ProjectProfileWorkflowPolicyEditor,
} from './project-detail-screen'
import type { ProfileReadinessRoleReport } from '@/server/profile-readiness'
import type { PhaseProfiles, ProjectAutopilotPolicy, ReviewAutoApprovalPolicy } from '@/lib/projects-api'

function roleReport(role: ProfileReadinessRoleReport['role'], status: ProfileReadinessRoleReport['status']): ProfileReadinessRoleReport {
  return {
    role,
    label: role,
    contract: `${role} role contract`,
    capabilities: [],
    mappedProfile: null,
    source: 'none',
    status,
    severity: status === 'missing' ? 'warning' : status === 'ready' ? 'ready' : 'info',
    fixHint: `Map ${role}`,
  }
}

const phaseProfiles: PhaseProfiles = {
  research: 'planner',
  build: 'builder',
  review: 'reviewer',
  deploy: '',
}

const reviewAutoApproval: ReviewAutoApprovalPolicy = { enabled: false, maxPriority: 'low' }
const autopilotPolicy: ProjectAutopilotPolicy = {
  enabled: true,
  schedulePreset: 'daily',
  scoutProfile: '',
  suggestionLimit: 5,
  scoutSources: ['repo-health-scout'],
  jobId: 'keep-job-id',
}

describe('project detail profile mapping clickability', () => {
  it('offers a configure action from readiness when supervisor or autopilot scout is unmapped', () => {
    const onConfigureProfileMappings = vi.fn()

    render(
      <ProjectProfileReadinessPanel
        isLoading={false}
        error={null}
        roles={[
          roleReport('research', 'ready'),
          roleReport('supervisor', 'unmapped'),
          roleReport('autopilot-scout', 'unmapped'),
        ]}
        onConfigureProfileMappings={onConfigureProfileMappings}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: PROJECT_PROFILE_MAPPING_CONFIGURE_LABEL }))

    expect(onConfigureProfileMappings).toHaveBeenCalledTimes(1)
  })

  it('clicks through the profile workflow editor and saves all readiness role mappings without wiping autopilot policy', () => {
    const onSave = vi.fn()

    render(
      <ProjectProfileWorkflowPolicyEditor
        phaseProfiles={phaseProfiles}
        reviewAutoApproval={reviewAutoApproval}
        autopilotPolicy={autopilotPolicy}
        runtimeProfiles={{ supervisorProfile: '' }}
        availableProfiles={['planner', 'builder', 'reviewer', 'supervisor', 'scout']}
        isSaving={false}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    )

    expect(screen.getByLabelText('Research Profile')).not.toBeNull()
    expect(screen.getByLabelText('Build Profile')).not.toBeNull()
    expect(screen.getByLabelText('Review Profile')).not.toBeNull()
    expect(screen.getByLabelText('Deploy Profile')).not.toBeNull()

    fireEvent.change(screen.getByLabelText('Supervisor Profile'), { target: { value: 'supervisor' } })
    fireEvent.change(screen.getByLabelText('Autopilot Scout Profile'), { target: { value: 'scout' } })
    fireEvent.click(screen.getByRole('button', { name: PROJECT_WORKFLOW_POLICY_SAVE_LABEL }))

    expect(onSave).toHaveBeenCalledWith({
      phaseProfiles,
      reviewAutoApproval,
      runtimeProfiles: { supervisorProfile: 'supervisor' },
      autopilotPolicy: {
        ...autopilotPolicy,
        scoutProfile: 'scout',
      },
    })
  })
})
