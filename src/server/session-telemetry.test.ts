import { describe, expect, it } from 'vitest'

import { buildSessionTelemetrySummary } from './session-telemetry'

describe('buildSessionTelemetrySummary', () => {
  it('returns an empty dashboard-ready summary when no sessions are provided', () => {
    expect(buildSessionTelemetrySummary([])).toEqual({
      totalSessions: 0,
      totalMessages: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      totalTokens: 0,
      contextPercent: null,
      accuracy: 'unavailable',
      topSessions: [],
    })
  })

  it('uses exact Hermes token metadata without reading message content', () => {
    const summary = buildSessionTelemetrySummary([
      {
        key: 'older-heavy',
        title: 'Older Heavy',
        input_tokens: 500,
        output_tokens: 250,
        cache_read_tokens: 100,
        model: 'claude-opus-4-5',
        provider: 'anthropic',
        updatedAt: 1_700_000_000_000,
        message_count: 3,
        lastMessage: { content: [{ type: 'text', text: 'do not inspect me' }] },
      },
      {
        id: 'newer-light',
        label: 'Newer Light',
        input_tokens: 100,
        output_tokens: 50,
        model: 'gpt-5.1',
        provider: 'openai',
        updatedAt: 1_700_000_010_000,
        message_count: 2,
      },
    ])

    expect(summary.totalSessions).toBe(2)
    expect(summary.totalMessages).toBe(5)
    expect(summary.totalInputTokens).toBe(600)
    expect(summary.totalOutputTokens).toBe(300)
    expect(summary.totalCacheReadTokens).toBe(100)
    expect(summary.totalTokens).toBe(900)
    expect(summary.accuracy).toBe('exact')
    expect(summary.topSessions).toEqual([
      {
        key: 'newer-light',
        label: 'Newer Light',
        model: 'gpt-5.1',
        provider: 'openai',
        updatedAt: 1_700_000_010_000,
        messageCount: 2,
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 0,
        totalTokens: 150,
        accuracy: 'exact',
        contextPercent: null,
      },
      {
        key: 'older-heavy',
        label: 'Older Heavy',
        model: 'claude-opus-4-5',
        provider: 'anthropic',
        updatedAt: 1_700_000_000_000,
        messageCount: 3,
        inputTokens: 500,
        outputTokens: 250,
        cacheReadTokens: 100,
        totalTokens: 750,
        accuracy: 'exact',
        contextPercent: null,
      },
    ])
  })

  it('marks tokenCount and totalTokens fallbacks as estimated and keeps missing tokens unavailable', () => {
    const summary = buildSessionTelemetrySummary([
      {
        key: 'estimated-token-count',
        tokenCount: 42,
        message_count: 1,
        updatedAt: 10,
      },
      {
        key: 'estimated-total',
        totalTokens: 58,
        messageCount: 2,
        updatedAt: 30,
      },
      {
        key: 'missing-token-metadata',
        message_count: 3,
        updatedAt: 20,
      },
    ])

    expect(summary.totalSessions).toBe(3)
    expect(summary.totalMessages).toBe(6)
    expect(summary.totalInputTokens).toBe(0)
    expect(summary.totalOutputTokens).toBe(0)
    expect(summary.totalTokens).toBe(100)
    expect(summary.accuracy).toBe('estimated')
    expect(
      summary.topSessions.map((session) => [
        session.key,
        session.totalTokens,
        session.accuracy,
      ]),
    ).toEqual([
      ['estimated-total', 58, 'estimated'],
      ['missing-token-metadata', 0, 'unavailable'],
      ['estimated-token-count', 42, 'estimated'],
    ])
  })

  it('normalizes context percent from raw percent, ratio, and context token window fields', () => {
    const summary = buildSessionTelemetrySummary([
      {
        key: 'explicit-percent',
        input_tokens: 30,
        output_tokens: 10,
        context_percent: 65,
        updatedAt: 1,
      },
      {
        key: 'ratio-percent',
        input_tokens: 20,
        output_tokens: 10,
        usage: { contextPercent: 0.5 },
        updatedAt: 2,
      },
      {
        key: 'derived-percent',
        input_tokens: 50,
        output_tokens: 25,
        contextWindow: 300,
        updatedAt: 3,
      },
    ])

    expect(summary.contextPercent).toBe(65)
    expect(
      summary.topSessions.map((session) => [
        session.key,
        session.contextPercent,
      ]),
    ).toEqual([
      ['derived-percent', 25],
      ['ratio-percent', 50],
      ['explicit-percent', 65],
    ])
  })

  it('normalizes raw Hermes timestamps and snake-case total token fallbacks', () => {
    const summary = buildSessionTelemetrySummary([
      {
        key: 'unix-seconds',
        total_tokens: 120,
        last_active: 1_700_000_000,
      },
      {
        key: 'milliseconds',
        tokenCount: 20,
        updatedAt: 1_600_000_000_000,
      },
    ])

    expect(summary.totalTokens).toBe(140)
    expect(summary.topSessions.map((session) => session.key)).toEqual([
      'unix-seconds',
      'milliseconds',
    ])
    expect(summary.topSessions[0]?.updatedAt).toBe(1_700_000_000_000)
  })

  it('treats cache-only token metadata as estimated usage instead of exact zero total', () => {
    const summary = buildSessionTelemetrySummary([
      {
        key: 'cache-only',
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 80,
        contextWindow: 400,
      },
    ])

    expect(summary.totalCacheReadTokens).toBe(80)
    expect(summary.totalTokens).toBe(80)
    expect(summary.accuracy).toBe('estimated')
    expect(summary.contextPercent).toBe(20)
    expect(summary.topSessions[0]).toMatchObject({
      key: 'cache-only',
      cacheReadTokens: 80,
      totalTokens: 80,
      accuracy: 'estimated',
      contextPercent: 20,
    })
  })
})
