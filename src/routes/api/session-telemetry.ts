import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { buildSessionTelemetrySummary } from '../../server/session-telemetry'
import {
  ensureGatewayProbed,
  listSessions,
  toSessionSummary,
} from '../../server/hermes-api'

const TELEMETRY_UNAVAILABLE_MESSAGE =
  'Hermes session telemetry is unavailable from the current gateway.'

function unavailableTelemetryPayload(message = TELEMETRY_UNAVAILABLE_MESSAGE) {
  const summary = buildSessionTelemetrySummary([])
  return {
    ok: true,
    source: 'unavailable',
    message,
    summary,
    items: summary.topSessions,
    generatedAt: new Date().toISOString(),
  }
}

export const Route = createFileRoute('/api/session-telemetry')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        try {
          const capabilities = await ensureGatewayProbed()
          if (!capabilities.sessions) {
            return json(unavailableTelemetryPayload())
          }

          const sessions = await listSessions(50, 0)
          const sessionSummaries = sessions.map(toSessionSummary)
          const summary = buildSessionTelemetrySummary(sessionSummaries)

          return json({
            ok: true,
            summary,
            items: summary.topSessions,
            generatedAt: new Date().toISOString(),
          })
        } catch (err) {
          return json(
            unavailableTelemetryPayload(
              err instanceof Error ? err.message : String(err),
            ),
          )
        }
      },
    },
  },
})
