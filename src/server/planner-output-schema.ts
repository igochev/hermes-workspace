import { z } from 'zod'

import type { PlannerStructuredOutput } from './planning-drafts-store'

const normalizeStringArray = (value: unknown): Array<string> => {
  if (!Array.isArray(value)) return []
  const output: Array<string> = []
  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== 'string') continue
    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(normalized)
  }

  return output
}

const PlannerStructuredOutputSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  riskLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  labels: z.preprocess(normalizeStringArray, z.array(z.string()).default([])),
  acceptanceCriteria: z.preprocess(normalizeStringArray, z.array(z.string()).min(1)),
  notes: z.preprocess(normalizeStringArray, z.array(z.string()).default([])),
  planFilePath: z.string().trim().min(1),
  openQuestions: z.preprocess(normalizeStringArray, z.array(z.string()).default([])),
  suggestedPhase: z.enum(['research', 'build']).default('build'),
})

function extractFencedJsonBlock(raw: string): string | null {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return match?.[1]?.trim() || null
}

function extractFirstJsonObject(raw: string): string | null {
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]

    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === '\\') {
        escaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }

    if (char === '}') {
      if (depth === 0) continue
      depth -= 1
      if (depth === 0 && start >= 0) {
        return raw.slice(start, i + 1)
      }
    }
  }

  return null
}

function parseJsonCandidate(raw: string):
  | { ok: true; parsed: unknown; warnings: Array<string> }
  | { ok: false; error: string; warnings: Array<string> } {
  const warnings: Array<string> = []
  const trimmed = raw.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: 'Invalid JSON: planner output is empty.',
      warnings,
    }
  }

  const fenced = extractFencedJsonBlock(trimmed)
  if (fenced) {
    try {
      return { ok: true, parsed: JSON.parse(fenced), warnings }
    } catch {
      return { ok: false, error: 'Invalid JSON in fenced block.', warnings }
    }
  }

  try {
    return { ok: true, parsed: JSON.parse(trimmed), warnings }
  } catch {
    const objectCandidate = extractFirstJsonObject(trimmed)
    if (!objectCandidate) {
      return { ok: false, error: 'Invalid JSON: expected a JSON object payload.', warnings }
    }

    try {
      const parsed = JSON.parse(objectCandidate)
      warnings.push('Planner output included surrounding prose; extracted first JSON object.')
      return { ok: true, parsed, warnings }
    } catch {
      return { ok: false, error: 'Invalid JSON: unable to parse extracted JSON object.', warnings }
    }
  }
}

function formatSchemaError(error: z.ZodError): string {
  const first = error.issues[0]
  if (!first) return 'Invalid planner structured output.'
  const path = first.path.join('.') || 'root'
  return `Invalid planner structured output at ${path}: ${first.message}`
}

export function parsePlannerStructuredOutput(raw: string):
  | { ok: true; output: PlannerStructuredOutput; warnings: Array<string> }
  | { ok: false; error: string; warnings: Array<string> } {
  const parsedCandidate = parseJsonCandidate(raw)
  if (!parsedCandidate.ok) {
    return {
      ok: false,
      error: parsedCandidate.error,
      warnings: parsedCandidate.warnings,
    }
  }

  const schemaResult = PlannerStructuredOutputSchema.safeParse(parsedCandidate.parsed)
  if (!schemaResult.success) {
    return {
      ok: false,
      error: formatSchemaError(schemaResult.error),
      warnings: parsedCandidate.warnings,
    }
  }

  return {
    ok: true,
    output: schemaResult.data,
    warnings: parsedCandidate.warnings,
  }
}
