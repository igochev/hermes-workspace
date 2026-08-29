import {  listWorkItems } from './work-items-store'
import {
  DEFAULT_ROLE_CAPACITY_RULES,


  findRoleCapacityRule,
  listRoleCapacityRules,
  upsertRoleCapacityRule
} from './role-capacity-policy-store'
import type {WorkItemPhase} from './work-items-store';
import type {ExecutionRole, RoleCapacityRule} from './role-capacity-policy-store';

export { DEFAULT_ROLE_CAPACITY_RULES, listRoleCapacityRules, upsertRoleCapacityRule }
export type { ExecutionRole, RoleCapacityRule }

export type LaunchCapacityDecision = {
  role: ExecutionRole
  profile?: string
  activeCount: number
  maxActive: number
  allowed: boolean
  advisoryOnly: true
  message?: string
}

const ROLE_PHASES: Partial<Record<ExecutionRole, WorkItemPhase>> = {
  research: 'research',
  build: 'build',
  review: 'review',
  deploy: 'deploy',
}

type EvaluateLaunchCapacityInput = {
  role: ExecutionRole
  profile?: string
}

function normalizeProfile(profile: string | undefined): string | undefined {
  return typeof profile === 'string' && profile.trim().length > 0 ? profile.trim() : undefined
}

function countActiveWorkForRole(role: ExecutionRole, profile?: string): number {
  const phase = ROLE_PHASES[role]
  if (!phase) return 0
  const normalizedProfile = normalizeProfile(profile)
  return listWorkItems().filter((workItem) => {
    if (workItem.status !== 'active') return false
    if (workItem.phase !== phase) return false
    if (normalizedProfile && workItem.assignedProfile !== normalizedProfile) return false
    return true
  }).length
}

export function evaluateLaunchCapacity(input: EvaluateLaunchCapacityInput): LaunchCapacityDecision {
  const profile = normalizeProfile(input.profile)
  const rule = findRoleCapacityRule(input.role, profile)
  const activeCount = countActiveWorkForRole(input.role, profile)
  const allowed = activeCount < rule.maxActive
  return {
    role: input.role,
    profile,
    activeCount,
    maxActive: rule.maxActive,
    allowed,
    advisoryOnly: true,
    message: allowed
      ? undefined
      : `${input.role} capacity is at ${activeCount}/${rule.maxActive} active work items; launch may proceed with operator awareness.`,
  }
}
