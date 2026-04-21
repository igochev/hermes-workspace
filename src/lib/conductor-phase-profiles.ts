export const CONDUCTOR_PHASE_KEYS = ['research', 'build', 'review', 'deploy'] as const

export type ConductorPhaseKey = (typeof CONDUCTOR_PHASE_KEYS)[number]

export type ConductorPhaseProfiles = Record<ConductorPhaseKey, string>

export const EMPTY_PHASE_PROFILES: ConductorPhaseProfiles = {
  research: '',
  build: '',
  review: '',
  deploy: '',
}

function readProfileName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizePhaseProfiles(value: unknown): ConductorPhaseProfiles {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}

  return {
    research: readProfileName(record.research),
    build: readProfileName(record.build),
    review: readProfileName(record.review),
    deploy: readProfileName(record.deploy),
  }
}

export function getMappedPhaseProfile(
  phaseProfiles: ConductorPhaseProfiles,
  phase: ConductorPhaseKey,
): string | null {
  const value = phaseProfiles[phase]?.trim()
  return value ? value : null
}

export function hasMappedPhaseProfiles(
  phaseProfiles: ConductorPhaseProfiles,
): boolean {
  return CONDUCTOR_PHASE_KEYS.some((phase) => Boolean(getMappedPhaseProfile(phaseProfiles, phase)))
}

export function buildPhaseProfileRoutingInstructions(
  phaseProfiles: ConductorPhaseProfiles,
): string[] {
  const mappedEntries = CONDUCTOR_PHASE_KEYS.flatMap((phase) => {
    const profile = getMappedPhaseProfile(phaseProfiles, phase)
    return profile ? [[phase, profile] as const] : []
  })

  if (mappedEntries.length === 0) return []

  return [
    '## Phase → Hermes Profile Routing',
    'Route worker tasks to these Hermes profiles when the task clearly matches the phase:',
    ...mappedEntries.map(([phase, profile]) => `- ${phase} tasks → Hermes profile \"${profile}\"`),
    '',
    'When a phase has a mapped profile, spawn that worker with delegate_task using ACP subprocess transport so it actually runs under that Hermes profile:',
    '- acp_command: "hermes"',
    '- acp_args: ["-p", "<profile>", "--acp", "--stdio"]',
    '- Keep the worker prompt self-contained and mention which phase/profile was selected.',
    '- If a phase has no mapped profile, use your normal worker spawning path.',
  ]
}
