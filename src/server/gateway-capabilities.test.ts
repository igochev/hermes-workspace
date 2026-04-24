import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockResponseInit = {
  status?: number
  body?: unknown
  headers?: Record<string, string>
}

function jsonResponse(init: MockResponseInit = {}): Response {
  const status = init.status ?? 200
  const body =
    init.body === undefined
      ? ''
      : typeof init.body === 'string'
        ? init.body
        : JSON.stringify(init.body)

  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

describe('gateway-capabilities dashboard probing', () => {
  const originalFetch = global.fetch
  const originalApiUrl = process.env.HERMES_API_URL
  const originalDashboardUrl = process.env.HERMES_DASHBOARD_URL

  beforeEach(() => {
    vi.resetModules()
    process.env.HERMES_API_URL = 'http://gateway.test'
    process.env.HERMES_DASHBOARD_URL = 'http://dashboard.test'
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalApiUrl === undefined) delete process.env.HERMES_API_URL
    else process.env.HERMES_API_URL = originalApiUrl
    if (originalDashboardUrl === undefined) delete process.env.HERMES_DASHBOARD_URL
    else process.env.HERMES_DASHBOARD_URL = originalDashboardUrl
  })

  it('treats dashboard as unavailable when status works but root token bootstrap fails', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === 'http://gateway.test/health') return jsonResponse({ body: { status: 'ok' } })
      if (url === 'http://gateway.test/v1/chat/completions') return jsonResponse({ status: 405 })
      if (url === 'http://gateway.test/v1/models') return jsonResponse({ body: { data: [] } })
      if (url === 'http://gateway.test/api/jobs') return jsonResponse({ body: { jobs: [] } })
      if (url.startsWith('http://gateway.test/api/')) return jsonResponse({ status: 404, body: {} })

      if (url === 'http://dashboard.test/api/status') {
        return jsonResponse({ body: { version: '0.11.0' } })
      }
      if (url === 'http://dashboard.test/') {
        return new Response('Internal Server Error', { status: 500 })
      }

      return jsonResponse({ status: 404, body: {} })
    }) as typeof fetch

    const gateway = await import('./gateway-capabilities')
    const capabilities = await gateway.probeGateway({ force: true })

    expect(capabilities.dashboard.available).toBe(false)
    expect(capabilities.jobs).toBe(true)
    expect(capabilities.sessions).toBe(false)
    expect(gateway.getGatewayMode()).toBe('portable')
  })

  it('keeps dashboard available when status and token bootstrap both succeed', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)

      if (url === 'http://gateway.test/health') return jsonResponse({ body: { status: 'ok' } })
      if (url === 'http://gateway.test/v1/chat/completions') return jsonResponse({ status: 405 })
      if (url === 'http://gateway.test/v1/models') return jsonResponse({ body: { data: [] } })
      if (url === 'http://gateway.test/api/jobs') return jsonResponse({ body: { jobs: [] } })
      if (url.startsWith('http://gateway.test/api/')) return jsonResponse({ status: 404, body: {} })

      if (url === 'http://dashboard.test/api/status') {
        return jsonResponse({ body: { version: '0.11.0' } })
      }
      if (url === 'http://dashboard.test/') {
        return new Response(
          '<html><script>window.__HERMES_SESSION_TOKEN__ = "token-123";</script></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }

      return jsonResponse({ status: 404, body: {} })
    }) as typeof fetch

    const gateway = await import('./gateway-capabilities')
    const capabilities = await gateway.probeGateway({ force: true })

    expect(capabilities.dashboard.available).toBe(true)
    expect(gateway.getGatewayMode()).toBe('zero-fork')
  })
})
