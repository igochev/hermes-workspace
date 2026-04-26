import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type ExecutionRole = 'research' | 'build' | 'review' | 'deploy' | 'supervisor'

export type RoleCapacityRule = {
  role: ExecutionRole
  profile?: string
  maxActive: number
  enabled: boolean
}

type RoleCapacityPolicyFile = {
  rules: Array<RoleCapacityRule>
}

const VALID_ROLES: Array<ExecutionRole> = ['research', 'build', 'review', 'deploy', 'supervisor']

export const DEFAULT_ROLE_CAPACITY_RULES: Array<RoleCapacityRule> = [
  { role: 'research', maxActive: 1, enabled: true },
  { role: 'build', maxActive: 2, enabled: true },
  { role: 'review', maxActive: 1, enabled: true },
  { role: 'deploy', maxActive: 1, enabled: true },
  { role: 'supervisor', maxActive: 1, enabled: true },
]

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getRoleCapacityPolicyFilePath(): string {
  return path.join(getHermesHome(), 'role-capacity-policy.json')
}

function ensureRoleCapacityPolicyFile(): void {
  const hermesHome = getHermesHome()
  const filePath = getRoleCapacityPolicyFilePath()
  fs.mkdirSync(hermesHome, { recursive: true })
  if (!fs.existsSync(filePath)) {
    writeRoleCapacityPolicyFile({ rules: DEFAULT_ROLE_CAPACITY_RULES })
  }
}

function defaultMaxActiveForRole(role: ExecutionRole): number {
  return DEFAULT_ROLE_CAPACITY_RULES.find((rule) => rule.role === role)?.maxActive ?? 1
}

function normalizeProfile(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeRole(value: unknown): ExecutionRole {
  return VALID_ROLES.includes(value as ExecutionRole) ? (value as ExecutionRole) : 'build'
}

function normalizeMaxActive(value: unknown, role: ExecutionRole): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : defaultMaxActiveForRole(role)
}

function normalizeRule(rule: Partial<RoleCapacityRule>): RoleCapacityRule {
  const role = normalizeRole(rule.role)
  return {
    role,
    profile: normalizeProfile(rule.profile),
    maxActive: normalizeMaxActive(rule.maxActive, role),
    enabled: rule.enabled !== false,
  }
}

function ruleKey(rule: Pick<RoleCapacityRule, 'role' | 'profile'>): string {
  return `${rule.role}:${rule.profile ?? '*'}`
}

function mergeWithDefaults(rules: Array<RoleCapacityRule>): Array<RoleCapacityRule> {
  const byKey = new Map<string, RoleCapacityRule>()
  for (const rule of DEFAULT_ROLE_CAPACITY_RULES) byKey.set(ruleKey(rule), rule)
  for (const rule of rules.map((item) => normalizeRule(item))) byKey.set(ruleKey(rule), rule)
  return [...byKey.values()].sort((a, b) => {
    const roleDelta = VALID_ROLES.indexOf(a.role) - VALID_ROLES.indexOf(b.role)
    if (roleDelta !== 0) return roleDelta
    return (a.profile ?? '').localeCompare(b.profile ?? '')
  })
}

function readRoleCapacityPolicyFile(): RoleCapacityPolicyFile {
  ensureRoleCapacityPolicyFile()
  try {
    const raw = fs.readFileSync(getRoleCapacityPolicyFilePath(), 'utf-8').trim()
    if (!raw) return { rules: DEFAULT_ROLE_CAPACITY_RULES }
    const parsed = JSON.parse(raw) as Partial<RoleCapacityPolicyFile>
    return { rules: Array.isArray(parsed.rules) ? mergeWithDefaults(parsed.rules) : DEFAULT_ROLE_CAPACITY_RULES }
  } catch {
    return { rules: DEFAULT_ROLE_CAPACITY_RULES }
  }
}

function writeRoleCapacityPolicyFile(data: RoleCapacityPolicyFile): void {
  fs.mkdirSync(getHermesHome(), { recursive: true })
  fs.writeFileSync(getRoleCapacityPolicyFilePath(), JSON.stringify({ rules: data.rules }, null, 2) + '\n', 'utf-8')
}

export function listRoleCapacityRules(): Array<RoleCapacityRule> {
  return readRoleCapacityPolicyFile().rules
}

export function upsertRoleCapacityRule(input: RoleCapacityRule): RoleCapacityRule {
  const nextRule = normalizeRule(input)
  const rules = listRoleCapacityRules()
  const existingIndex = rules.findIndex((rule) => ruleKey(rule) === ruleKey(nextRule))
  if (existingIndex === -1) rules.push(nextRule)
  else rules[existingIndex] = nextRule
  const normalized = mergeWithDefaults(rules)
  writeRoleCapacityPolicyFile({ rules: normalized })
  return nextRule
}

export function findRoleCapacityRule(role: ExecutionRole, profile?: string): RoleCapacityRule {
  const normalizedProfile = normalizeProfile(profile)
  const rules = listRoleCapacityRules().filter((rule) => rule.role === role && rule.enabled)
  return (
    rules.find((rule) => rule.profile === normalizedProfile) ??
    rules.find((rule) => !rule.profile) ??
    normalizeRule({ role, maxActive: defaultMaxActiveForRole(role), enabled: true })
  )
}
