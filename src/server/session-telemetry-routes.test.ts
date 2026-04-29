import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Route as SessionTelemetryRoute } from '../routes/api/session-telemetry'

const { ensureGatewayProbed, listSessions, toSessionSummary } = vi.hoisted(
  () => ({
    ensureGatewayProbed: vi.fn(),
    listSessions: vi.fn(),
    toSessionSummary: vi.fn(),
  }),
)

vi.mock('./hermes-api', () => ({
  ensureGatewayProbed,
  listSessions,
  toSessionSummary,
}))

type RouteHandler<
  TParams extends Record<string, string> = Record<string, string>,
> = (input: { request: Request; params?: TParams }) => Promise<Response>

function getRouteHandler<
  TMethod extends 'GET' | 'POST',
  TParams extends Record<string, string> = Record<string, string>,
>(route: unknown, method: TMethod): RouteHandler<TParams> {
  return (
    route as {
      options: { server: { handlers: Record<TMethod, RouteHandler<TParams>> } }
    }
  ).options.server.handlers[method]
}

const getSessionTelemetry = getRouteHandler(SessionTelemetryRoute, 'GET')

describe('session telemetry route', () => {
  const previousHermesPassword = process.env.HERMES_PASSWORD

  beforeEach(() => {
    delete process.env.HERMES_PASSWORD
    ensureGatewayProbed.mockReset()
    listSessions.mockReset()
    toSessionSummary.mockReset()
  })

  afterEach(() => {
    if (previousHermesPassword === undefined) delete process.env.HERMES_PASSWORD
    else process.env.HERMES_PASSWORD = previousHermesPassword
  })

  it('returns 401 when telemetry is requested without authentication', async () => {
    process.env.HERMES_PASSWORD = 'secret'

    const response = await getSessionTelemetry({
      request: new Request('http://127.0.0.1:3456/api/session-telemetry'),
    })

    expect(response.status).toBe(401)
    expect(ensureGatewayProbed).not.toHaveBeenCalled()
  })

  it('returns normalized telemetry for authorized session API results', async () => {
    ensureGatewayProbed.mockResolvedValue({ sessions: true })
    listSessions.mockResolvedValue([
      {
        id: 'raw-a',
        title: 'Raw A',
        input_tokens: 100,
        output_tokens: 50,
        message_count: 3,
        model: 'gpt-5.1',
        started_at: 1_700_000_000,
      },
      {
        id: 'raw-b',
        title: 'Raw B',
        total_tokens: 25,
        message_count: 1,
        model: 'claude-sonnet-4-5',
        started_at: 1_700_000_010,
      },
    ])
    toSessionSummary.mockImplementation((session) => ({
      key: session.id,
      title: session.title,
      input_tokens: session.input_tokens,
      output_tokens: session.output_tokens,
      total_tokens: session.total_tokens,
      message_count: session.message_count,
      model: session.model,
      updatedAt: session.started_at * 1000,
    }))

    const response = await getSessionTelemetry({
      request: new Request('http://127.0.0.1:3456/api/session-telemetry'),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, any>
    expect(body.ok).toBe(true)
    expect(body.generatedAt).toEqual(expect.any(String))
    expect(body.summary).toMatchObject({
      totalSessions: 2,
      totalMessages: 4,
      totalTokens: 175,
      accuracy: 'estimated',
    })
    expect(body.items.map((item: any) => item.key)).toEqual(['raw-b', 'raw-a'])
    expect(listSessions).toHaveBeenCalledWith(50, 0)
    expect(toSessionSummary).toHaveBeenCalledTimes(2)
  })

  it('returns unavailable telemetry instead of failing when session API is unavailable', async () => {
    ensureGatewayProbed.mockResolvedValue({ sessions: false })

    const response = await getSessionTelemetry({
      request: new Request('http://127.0.0.1:3456/api/session-telemetry'),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, any>
    expect(body).toMatchObject({
      ok: true,
      source: 'unavailable',
      items: [],
      summary: {
        totalSessions: 0,
        totalMessages: 0,
        totalTokens: 0,
        accuracy: 'unavailable',
      },
    })
    expect(listSessions).not.toHaveBeenCalled()
  })

  it('returns unavailable telemetry instead of failing when session listing throws', async () => {
    ensureGatewayProbed.mockResolvedValue({ sessions: true })
    listSessions.mockRejectedValue(new Error('gateway offline'))

    const response = await getSessionTelemetry({
      request: new Request('http://127.0.0.1:3456/api/session-telemetry'),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, any>
    expect(body).toMatchObject({
      ok: true,
      source: 'unavailable',
      message: 'gateway offline',
      items: [],
      summary: {
        totalSessions: 0,
        totalTokens: 0,
        accuracy: 'unavailable',
      },
    })
  })
})
