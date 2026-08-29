import type { RoleCapacityRule } from '../server/role-capacity-policy'

export type RoleCapacityPolicyResponse = {
  rules: Array<RoleCapacityRule>
}

export async function fetchRoleCapacityPolicy(): Promise<RoleCapacityPolicyResponse> {
  const response = await fetch('/api/role-capacity-policy')
  const payload = (await response.json().catch(() => ({}))) as Partial<RoleCapacityPolicyResponse> & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Failed to fetch role capacity policy (${response.status})`)
  }

  return {
    rules: Array.isArray(payload.rules) ? payload.rules : [],
  }
}
