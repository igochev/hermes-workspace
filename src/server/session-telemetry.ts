export type TelemetryAccuracy = 'exact' | 'estimated' | 'unavailable'

export type SessionTelemetryItem = {
  key: string
  label: string
  model: string | null
  provider: string | null
  updatedAt: number | null
  messageCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
  accuracy: TelemetryAccuracy
  contextPercent: number | null
}

export type SessionTelemetrySummary = {
  totalSessions: number
  totalMessages: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalTokens: number
  contextPercent: number | null
  accuracy: TelemetryAccuracy
  topSessions: Array<SessionTelemetryItem>
}

type SessionTelemetrySource = Record<string, unknown>

type TokenSnapshot = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
  accuracy: TelemetryAccuracy
}

const TOP_SESSION_LIMIT = 6

export function buildSessionTelemetrySummary(
  sessions: Array<SessionTelemetrySource> = [],
): SessionTelemetrySummary {
  const allItems = sessions.map(normalizeSessionTelemetryItem)
  const topSessions = allItems
    .slice()
    .sort(compareSessionTelemetryItems)
    .slice(0, TOP_SESSION_LIMIT)

  const summary = allItems.reduce(
    (acc, item) => {
      acc.totalMessages += item.messageCount
      acc.totalInputTokens += item.inputTokens
      acc.totalOutputTokens += item.outputTokens
      acc.totalCacheReadTokens += item.cacheReadTokens
      acc.totalTokens += item.totalTokens
      if (item.contextPercent !== null) {
        acc.contextPercent = Math.max(
          acc.contextPercent ?? 0,
          item.contextPercent,
        )
      }
      acc.accuracy = combineAccuracy(acc.accuracy, item.accuracy)
      return acc
    },
    {
      totalSessions: sessions.length,
      totalMessages: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalTokens: 0,
      contextPercent: null,
      accuracy: sessions.length > 0 ? 'exact' : 'unavailable',
      topSessions,
    } as SessionTelemetrySummary,
  )

  if (sessions.length === 0) summary.accuracy = 'unavailable'
  else if (
    summary.totalTokens === 0 &&
    allItems.every((item) => item.accuracy === 'unavailable')
  ) {
    summary.accuracy = 'unavailable'
  }

  return summary
}

function normalizeSessionTelemetryItem(
  session: SessionTelemetrySource,
): SessionTelemetryItem {
  const usage = readObject(session.usage)
  const tokens = readTokenSnapshot(session, usage)
  const key =
    readString(session.key) ??
    readString(session.id) ??
    readString(session.friendlyId) ??
    'unknown-session'

  return {
    key,
    label:
      readString(session.title) ??
      readString(session.derivedTitle) ??
      readString(session.label) ??
      key,
    model: readString(session.model) ?? readString(usage?.model) ?? null,
    provider:
      readString(session.provider) ??
      readString(session.modelProvider) ??
      readString(session.model_provider) ??
      readString(usage?.provider) ??
      null,
    updatedAt:
      readTimestamp(session.updatedAt) ??
      readTimestamp(session.last_active) ??
      readTimestamp(session.startedAt) ??
      readTimestamp(session.started_at),
    messageCount:
      readNumber(session.message_count) ??
      readNumber(session.messageCount) ??
      0,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cacheReadTokens: tokens.cacheReadTokens,
    totalTokens: tokens.totalTokens,
    accuracy: tokens.accuracy,
    contextPercent: readContextPercent(session, usage, tokens.totalTokens),
  }
}

function readTokenSnapshot(
  session: SessionTelemetrySource,
  usage: SessionTelemetrySource | null,
): TokenSnapshot {
  const inputTokens = readNumber(
    session.input_tokens ??
      session.inputTokens ??
      usage?.input_tokens ??
      usage?.inputTokens ??
      usage?.promptTokens ??
      usage?.prompt_tokens,
  )
  const outputTokens = readNumber(
    session.output_tokens ??
      session.outputTokens ??
      usage?.output_tokens ??
      usage?.outputTokens ??
      usage?.completionTokens ??
      usage?.completion_tokens,
  )
  const cacheReadTokens =
    readNumber(
      session.cache_read_tokens ??
        session.cacheReadTokens ??
        session.cache_read_input_tokens ??
        session.cacheReadInputTokens ??
        usage?.cache_read_tokens ??
        usage?.cacheReadTokens ??
        usage?.cache_read_input_tokens ??
        usage?.cacheReadInputTokens,
    ) ?? 0

  if (inputTokens !== null || outputTokens !== null) {
    const exactInput = inputTokens ?? 0
    const exactOutput = outputTokens ?? 0
    const exactTotal = exactInput + exactOutput
    if (exactTotal === 0 && cacheReadTokens > 0) {
      return {
        inputTokens: exactInput,
        outputTokens: exactOutput,
        cacheReadTokens,
        totalTokens: cacheReadTokens,
        accuracy: 'estimated',
      }
    }
    return {
      inputTokens: exactInput,
      outputTokens: exactOutput,
      cacheReadTokens,
      totalTokens: exactTotal,
      accuracy: 'exact',
    }
  }

  const estimatedTotal = readNumber(
    session.totalTokens ??
      session.total_tokens ??
      session.tokenCount ??
      usage?.totalTokens ??
      usage?.tokens ??
      usage?.total_tokens,
  )
  if (estimatedTotal !== null) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens,
      totalTokens: estimatedTotal,
      accuracy: 'estimated',
    }
  }

  if (cacheReadTokens > 0) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens,
      totalTokens: cacheReadTokens,
      accuracy: 'estimated',
    }
  }

  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens,
    totalTokens: 0,
    accuracy: 'unavailable',
  }
}

function readContextPercent(
  session: SessionTelemetrySource,
  usage: SessionTelemetrySource | null,
  totalTokens: number,
): number | null {
  const explicit = readPercent(
    session.contextPercent ??
      session.context_percent ??
      usage?.contextPercent ??
      usage?.context_percent ??
      usage?.context,
  )
  if (explicit !== null) return explicit

  const contextWindow = readNumber(
    session.contextWindow ??
      session.context_window ??
      session.contextTokens ??
      session.maxTokens ??
      usage?.contextWindow ??
      usage?.context_window,
  )
  if (contextWindow && contextWindow > 0 && totalTokens > 0) {
    return clampPercent((totalTokens / contextWindow) * 100)
  }

  return null
}

function compareSessionTelemetryItems(
  a: SessionTelemetryItem,
  b: SessionTelemetryItem,
): number {
  const activityDelta = (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
  if (activityDelta !== 0) return activityDelta
  const tokenDelta = b.totalTokens - a.totalTokens
  if (tokenDelta !== 0) return tokenDelta
  return a.key.localeCompare(b.key)
}

function combineAccuracy(
  current: TelemetryAccuracy,
  next: TelemetryAccuracy,
): TelemetryAccuracy {
  if (current === 'estimated' || next === 'estimated') return 'estimated'
  if (current === 'unavailable' || next === 'unavailable') return 'estimated'
  return 'exact'
}

function readObject(value: unknown): SessionTelemetrySource | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as SessionTelemetrySource)
    : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value))
    return Math.max(0, value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0, parsed)
  }
  return null
}

function readTimestamp(value: unknown): number | null {
  const numeric = readNumber(value)
  if (numeric !== null)
    return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readPercent(value: unknown): number | null {
  const percent = readNumber(value)
  if (percent === null) return null
  return clampPercent(percent > 0 && percent <= 1 ? percent * 100 : percent)
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}
