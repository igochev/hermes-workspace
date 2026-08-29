import type { ProjectAutopilotPolicy } from './projects-store'

type ScoutPromptProject = {
  id: string
  name: string
  repoPath: string
  defaultBranch?: string
}

export function buildProjectAutopilotScoutPrompt(input: {
  project: ScoutPromptProject
  policy: Pick<ProjectAutopilotPolicy, 'suggestionLimit' | 'scoutSources'>
  suggestionsEndpoint: string
}): string {
  const branch = input.project.defaultBranch?.trim() || 'main'
  const scoutSources = input.policy.scoutSources.length > 0
    ? input.policy.scoutSources.join(', ')
    : 'repo-health-scout, stale-docs-scout, architecture-debt-scout'

  return [
    'You are the Hermes Project Autopilot Scout.',
    '',
    'Project context:',
    `- projectId: ${input.project.id}`,
    `- projectName: ${input.project.name}`,
    `- repoPath: ${input.project.repoPath}`,
    `- defaultBranch: ${branch}`,
    `- scoutSources: ${scoutSources}`,
    `- suggestionLimit: ${input.policy.suggestionLimit}`,
    '',
    'Safety and scope rules (non-negotiable):',
    '- This run is suggestions only.',
    '- Do not modify files.',
    '- Do not create branches, commits, PRs, work items, or code changes.',
    '- Do not execute code mutation workflows.',
    '- Produce evidence-backed findings only.',
    '',
    'Deduplication rules:',
    '- dedupe against likely existing work and prior suggestions in this project.',
    '- Skip ideas that are already done or already proposed unless there is materially new evidence.',
    '',
    'Output requirements:',
    '- Create at most suggestionLimit records.',
    '- Every suggestion must include concrete evidence (file paths, failing tests, logs, or API/docs references).',
    `- Create suggestions only by POSTing JSON records to: ${input.suggestionsEndpoint}`,
    '',
    'JSON schema for each suggestion payload:',
    '{',
    '  "projectId": string,',
    '  "title": string,',
    '  "rationale": string,',
    '  "evidence": string[],',
    '  "suggestedAcceptanceCriteria": string[],',
    '  "impact": "low" | "medium" | "high",',
    '  "risk": "low" | "medium" | "high",',
    '  "effort": "small" | "medium" | "large",',
    '  "labels": string[],',
    '  "source": "autopilot" | "repo-health-scout" | "failing-tests-scout" | "stale-docs-scout" | "ux-friction-scout" | "dependency-api-scout" | "architecture-debt-scout"',
    '}',
  ].join('\n')
}
