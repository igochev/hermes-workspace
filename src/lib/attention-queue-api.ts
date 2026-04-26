import type { AttentionQueueItem } from '../server/attention-queue-store'

export type AttentionQueueResponse = {
  items: Array<AttentionQueueItem>
}

export async function fetchAttentionQueue(options: { refresh?: boolean } = {}): Promise<AttentionQueueResponse> {
  const params = new URLSearchParams()
  if (options.refresh) params.set('refresh', 'true')
  const query = params.toString()
  const response = await fetch(`/api/attention-queue${query ? `?${query}` : ''}`)
  const payload = (await response.json().catch(() => ({}))) as Partial<AttentionQueueResponse> & {
    error?: string
  }

  if (!response.ok) {
    throw new Error(payload.error ?? `Failed to fetch attention queue (${response.status})`)
  }

  return {
    items: Array.isArray(payload.items) ? payload.items : [],
  }
}
