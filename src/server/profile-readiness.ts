import type { ConductorPhaseKey } from '../lib/conductor-phase-profiles'
import type { ProjectRecord } from './projects-store'
import type { WorkItemRecord } from './work-items-store'

export type ProfileReadinessRole =
  | 'research'
  | 'build'
  | 'review'
  | 'deploy'
  | 'merge-healer'
  | 'supervisor'
  | 'autopilot-scout'

export type ProfileReadinessStatus = 'ready' | 'unmapped' | 'missing' | 'unknown'

export type ProfileReadinessSeverity = 'ready' | 'info' | 'warning' | 'unknown'

export type ProfileReadinessSource =
  | 'project-phase-profile'
  | 'project-runtime-profile'
  | 'work-item-assigned-profile'
  | 'project-autopilot-policy'
  | 'default'
  | 'none'

export type ProfileReadinessRoleReport = {
  role: ProfileReadinessRole
  label: string
  contract: string
  capabilities: Array<string>
  mappedProfile: string | null
  source: ProfileReadinessSource
  status: ProfileReadinessStatus
  severity: ProfileReadinessSeverity
  fixHint: string
}

export type ProfileReadinessRoleContract = {
  role: ProfileReadinessRole
  label: string
  contract: string
  capabilities: Array<string>
  runtimeProfileKey?: 'mergeHealerProfile' | 'supervisorProfile'
}

export type ProfileReadinessReport = {
  overallStatus: ProfileReadinessStatus
  severity: ProfileReadinessSeverity
  roles: Array<ProfileReadinessRoleReport>
}

type EvaluateProfileReadinessInput = {
  project: ProjectRecord
  workItem?: WorkItemRecord | null
  availableProfiles?: Array<string> | null
  defaults?: {
    supervisorProfile?: string
    autopilotScoutProfile?: string
  }
}

type Mapping = {
  profile: string | null
  source: ProfileReadinessSource
}

const PHASE_ROLES: Array<ConductorPhaseKey> = ['research', 'build', 'review', 'deploy']

export const PROFILE_READINESS_ROLE_CONTRACTS: Record<
  ProfileReadinessRole,
  ProfileReadinessRoleContract
> = {
  research: {
    role: 'research',
    label: 'Research / Planner',
    contract: 'Prepares plans, acceptance criteria, and grounded implementation guidance.',
    capabilities: ['inspect repository state', 'draft plans', 'prepare acceptance criteria'],
  },
  build: {
    role: 'build',
    label: 'Builder',
    contract: 'Implements approved plans with tests and concrete evidence.',
    capabilities: ['edit code', 'run tests', 'produce build evidence'],
  },
  review: {
    role: 'review',
    label: 'Reviewer',
    contract: 'Reviews Builder output and emits structured approval or change requests.',
    capabilities: ['inspect diffs', 'validate acceptance criteria', 'emit structured decisions'],
  },
  deploy: {
    role: 'deploy',
    label: 'Deploy',
    contract: 'Performs deploy/release actions only when policy allows a deploy phase.',
    capabilities: ['release execution', 'deployment evidence capture'],
  },
  'merge-healer': {
    role: 'merge-healer',
    label: 'Merge-Healer',
    contract: 'Performs bounded merge/rebase/test repair after review and policy gates pass.',
    capabilities: ['merge approved branches', 'repair bounded conflicts', 'run merge tests'],
    runtimeProfileKey: 'mergeHealerProfile',
  },
  supervisor: {
    role: 'supervisor',
    label: 'Supervisor',
    contract: 'Audits release evidence and can approve, veto, or require manual review before merge.',
    capabilities: ['read-only release audit', 'veto unsafe releases', 'record audit evidence'],
    runtimeProfileKey: 'supervisorProfile',
  },
  'autopilot-scout': {
    role: 'autopilot-scout',
    label: 'Autopilot Scout',
    contract: 'Scans configured sources and proposes suggestions without directly mutating work items.',
    capabilities: ['scan configured sources', 'propose suggestions'],
  },
}

function normalizeProfileName(profile: string | null | undefined): string | null {
  const trimmed = typeof profile === 'string' ? profile.trim() : ''
  return trimmed ? trimmed : null
}

function buildAvailableProfileSet(profiles: Array<string> | null | undefined): Set<string> | null {
  if (!Array.isArray(profiles)) return null
  return new Set(profiles.map((profile) => profile.trim()).filter(Boolean))
}

function getPhaseMapping(
  phase: ConductorPhaseKey,
  project: ProjectRecord,
  workItem?: WorkItemRecord | null,
): Mapping {
  const assignedProfile = normalizeProfileName(workItem?.assignedProfile)
  if (assignedProfile && (workItem?.phase ?? 'build') === phase) {
    return { profile: assignedProfile, source: 'work-item-assigned-profile' }
  }

  return {
    profile: normalizeProfileName(project.phaseProfiles[phase]),
    source: 'project-phase-profile',
  }
}

function getSupervisorMapping(
  project: ProjectRecord,
  defaults: EvaluateProfileReadinessInput['defaults'],
): Mapping {
  const projectSupervisorProfile = normalizeProfileName(project.runtimeProfiles.supervisorProfile)
  if (projectSupervisorProfile) {
    return { profile: projectSupervisorProfile, source: 'project-runtime-profile' }
  }

  return {
    profile: normalizeProfileName(defaults?.supervisorProfile),
    source: normalizeProfileName(defaults?.supervisorProfile) ? 'default' : 'none',
  }
}

function getMergeHealerMapping(project: ProjectRecord): Mapping {
  return {
    profile: normalizeProfileName(project.runtimeProfiles.mergeHealerProfile),
    source: 'project-runtime-profile',
  }
}

function getAutopilotScoutMapping(
  project: ProjectRecord,
  defaults: EvaluateProfileReadinessInput['defaults'],
): Mapping {
  const policyProfile = normalizeProfileName(project.autopilotPolicy.scoutProfile)
  if (policyProfile) {
    return { profile: policyProfile, source: 'project-autopilot-policy' }
  }

  const defaultProfile = normalizeProfileName(defaults?.autopilotScoutProfile)
  return {
    profile: defaultProfile,
    source: defaultProfile ? 'default' : 'none',
  }
}

function evaluateRole(
  role: ProfileReadinessRole,
  mapping: Mapping,
  availableProfiles: Set<string> | null,
): ProfileReadinessRoleReport {
  const contract = PROFILE_READINESS_ROLE_CONTRACTS[role]
  const contractFields = {
    label: contract.label,
    contract: contract.contract,
    capabilities: contract.capabilities,
  }

  if (!mapping.profile) {
    return {
      role,
      ...contractFields,
      mappedProfile: null,
      source:
        mapping.source === 'none' && (role === 'supervisor' || role === 'merge-healer')
          ? 'project-runtime-profile'
          : mapping.source === 'none'
            ? 'project-phase-profile'
            : mapping.source,
      status: 'unmapped',
      severity: 'info',
      fixHint: `Map a Hermes profile for ${role} when this role should launch through a dedicated profile.`,
    }
  }

  if (availableProfiles === null) {
    return {
      role,
      ...contractFields,
      mappedProfile: mapping.profile,
      source: mapping.source,
      status: 'unknown',
      severity: 'unknown',
      fixHint: `Profile ${mapping.profile} is mapped for ${role}, but available profiles could not be checked.`,
    }
  }

  if (!availableProfiles.has(mapping.profile)) {
    return {
      role,
      ...contractFields,
      mappedProfile: mapping.profile,
      source: mapping.source,
      status: 'missing',
      severity: 'warning',
      fixHint: `Create or rename Hermes profile ${mapping.profile}, or update the ${role} mapping to an existing profile.`,
    }
  }

  return {
    role,
    ...contractFields,
    mappedProfile: mapping.profile,
    source: mapping.source,
    status: 'ready',
    severity: 'ready',
    fixHint: `Hermes profile ${mapping.profile} is available for ${role}.`,
  }
}

function summarizeStatus(roles: Array<ProfileReadinessRoleReport>): {
  overallStatus: ProfileReadinessStatus
  severity: ProfileReadinessSeverity
} {
  if (roles.some((role) => role.status === 'missing')) {
    return { overallStatus: 'missing', severity: 'warning' }
  }
  if (roles.some((role) => role.status === 'unknown')) {
    return { overallStatus: 'unknown', severity: 'unknown' }
  }
  if (roles.some((role) => role.status === 'unmapped')) {
    return { overallStatus: 'unmapped', severity: 'info' }
  }
  return { overallStatus: 'ready', severity: 'ready' }
}

export function evaluateProfileReadiness({
  project,
  workItem = null,
  availableProfiles,
  defaults,
}: EvaluateProfileReadinessInput): ProfileReadinessReport {
  const availableProfileSet = buildAvailableProfileSet(availableProfiles)
  const phaseReports = PHASE_ROLES.map((phase) =>
    evaluateRole(phase, getPhaseMapping(phase, project, workItem), availableProfileSet),
  )
  const roles: Array<ProfileReadinessRoleReport> = [
    ...phaseReports,
    evaluateRole('merge-healer', getMergeHealerMapping(project), availableProfileSet),
    evaluateRole('supervisor', getSupervisorMapping(project, defaults), availableProfileSet),
    evaluateRole('autopilot-scout', getAutopilotScoutMapping(project, defaults), availableProfileSet),
  ]
  const summary = summarizeStatus(roles)

  return {
    ...summary,
    roles,
  }
}
