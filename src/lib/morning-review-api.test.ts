import { afterEach, describe, expect, it, vi } from 'vitest'

import { MORNING_REVIEW_QUERY_KEY, fetchMorningReview } from './morning-review-api'

const sampleDigest = {
  generatedAt: '2026-04-29T12:00:00.000Z',
  window: {
    since: '2026-04-28T18:00:00.000Z',
    until: '2026-04-29T12:00:00.000Z',
    lookbackHours: 18,
  },
  summary: {
    changed: 1,
    needs_approval: 0,
    failed: 0,
    merged: 0,
    parked: 0,
    total: 1,
  },
  buckets: {
    changed: [],
    needs_approval: [],
    failed: [],
    merged: [],
    parked: [],
  },
  nextAttentionItem: null,
  allClear: false,
}

describe('morning review client API', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exports a stable Dashboard query key', () => {
    expect(MORNING_REVIEW_QUERY_KEY).toEqual(['dashboard', 'morning-review'])
  })

  it('fetches the default 18 hour morning review digest', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ digest: sampleDigest }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await fetchMorningReview()

    expect(fetchMock).toHaveBeenCalledWith('/api/morning-review?lookbackHours=18')
    expect(response.digest).toEqual(sampleDigest)
  })

  it('fetches an overridden lookback window for Dashboard callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ digest: { ...sampleDigest, window: { ...sampleDigest.window, lookbackHours: 6 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await fetchMorningReview({ lookbackHours: 6 })

    expect(fetchMock).toHaveBeenCalledWith('/api/morning-review?lookbackHours=6')
  })

  it('throws a useful error when the response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(fetchMorningReview()).rejects.toThrow('Unauthorized')
  })
})
