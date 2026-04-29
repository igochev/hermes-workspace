import type { MorningReviewDigest } from '../server/morning-review'

export const MORNING_REVIEW_QUERY_KEY = ['dashboard', 'morning-review'] as const

export type MorningReviewApiResponse = {
  digest: MorningReviewDigest
  message?: string
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return new Error(typeof body.error === 'string' ? body.error : fallback)
}

export async function fetchMorningReview(options: { lookbackHours?: number } = {}): Promise<MorningReviewApiResponse> {
  const lookbackHours = options.lookbackHours ?? 18
  const response = await fetch(`/api/morning-review?lookbackHours=${encodeURIComponent(String(lookbackHours))}`)

  if (!response.ok) {
    throw await readError(response, `Failed to fetch morning review: ${response.status}`)
  }

  return (await response.json()) as MorningReviewApiResponse
}
