import type {
  SessionTelemetryItem,
  SessionTelemetrySummary,
} from '../server/session-telemetry'

export type SessionTelemetryResponse = {
  ok: true
  source?: string
  message?: string
  summary: SessionTelemetrySummary
  items: SessionTelemetryItem[]
  generatedAt: string
}

export async function fetchSessionTelemetry(): Promise<SessionTelemetryResponse> {
  const response = await fetch('/api/session-telemetry')
  const payload = (await response
    .json()
    .catch(() => ({}))) as Partial<SessionTelemetryResponse> & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(
      payload.error ?? `Failed to fetch session telemetry (${response.status})`,
    )
  }

  return {
    ok: true,
    source: payload.source,
    message: payload.message,
    summary: payload.summary ?? {
      totalSessions: 0,
      totalMessages: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalTokens: 0,
      contextPercent: null,
      accuracy: 'unavailable',
      topSessions: [],
    },
    items: Array.isArray(payload.items) ? payload.items : [],
    generatedAt: payload.generatedAt ?? new Date().toISOString(),
  }
}
