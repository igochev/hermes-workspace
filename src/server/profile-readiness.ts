import type { ConductorPhaseKey } from '../lib/conductor-phase-profiles'
import type { ProjectRecord } from './projects-store'
import type { WorkItemRecord } from './work-items-store'

export type ProfileReadinessRole =
  | 'research'
  | 'build'
  | 'review'
  | 'deploy'
  | 'supervisor'
  | 'autopilot-scout'

export type ProfileReadinessStatus = 'ready' | 'unmapped' | 'missing' | 'unknown'

export type ProfileReadinessSeverity = 'ready' | 'info' | 'warning' | 'unknown'

export type ProfileReadinessSource =
  | 'project-phase-profile'
  | 'work-item-assigned-profile'
  | 'project-autopilot-policy'
  | 'default'
  | 'none'

export type ProfileReadinessRoleReport = {
  role: ProfileReadinessRole
  mappedProfile: string | null
  source: ProfileReadinessSource
  status: ProfileReadinessStatus
  severity: ProfileReadinessSeverity
  fixHint: string
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

function getSupervisorMapping(defaults: EvaluateProfileReadinessInput['defaults']): Mapping {
  return {
    profile: normalizeProfileName(defaults?.supervisorProfile),
    source: normalizeProfileName(defaults?.supervisorProfile) ? 'default' : 'none',
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
  if (!mapping.profile) {
    return {
      role,
      mappedProfile: null,
      source: mapping.source === 'none' ? 'project-phase-profile' : mapping.source,
      status: 'unmapped',
      severity: 'info',
      fixHint: `Map a Hermes profile for ${role} when this role should launch through a dedicated profile.`,
    }
  }

  if (availableProfiles === null) {
    return {
      role,
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
      mappedProfile: mapping.profile,
      source: mapping.source,
      status: 'missing',
      severity: 'warning',
      fixHint: `Create or rename Hermes profile ${mapping.profile}, or update the ${role} mapping to an existing profile.`,
    }
  }

  return {
    role,
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
    evaluateRole('supervisor', getSupervisorMapping(defaults), availableProfileSet),
    evaluateRole('autopilot-scout', getAutopilotScoutMapping(project, defaults), availableProfileSet),
  ]
  const summary = summarizeStatus(roles)

  return {
    ...summary,
    roles,
  }
}
