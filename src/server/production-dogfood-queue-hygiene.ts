import type { WorkItemRecord } from './work-items-store'

export const PRODUCTION_DOGFOOD_PROJECT_ID = 'production-dogfood-family-command-center-abacus'

export type DogfoodQueueDisposition =
  | 'preserve_historical_evidence'
  | 'preserve_blocked_fixture'
  | 'cancel_stale_test_queue'
  | 'already_terminal'
  | 'unknown_manual_review'

export type DogfoodQueueClassification = {
  workItemId: string
  title: string
  status: string
  phase?: string
  laneState?: string
  disposition: DogfoodQueueDisposition
  reason: string
}

export const PRODUCTION_DOGFOOD_HISTORICAL_EVIDENCE_IDS = [
  '55e4cd15-f179-433c-80bf-24b67f7672a2',
  'b31ad72d-4ef0-4388-b867-e0bf11c14c82',
  'c6c218a8-b299-4f7f-9f64-33812b06df3d',
  '1a44d0b2-86d8-4202-8dfa-50d71a454da8',
  '38c30749-118e-4ade-9e85-df62a31b611e',
] as const

export const PRODUCTION_DOGFOOD_BLOCKED_FIXTURE_IDS = [
  '84bfe2c2-e899-437a-8a6c-a6fa9884886d',
  'ac6918e0-a46d-4de4-a618-ddda1b233f98',
] as const

export const PRODUCTION_DOGFOOD_STALE_TEST_QUEUE_IDS = [
  '110c9124-b898-43d3-a05a-a0ff304bc3fc',
  '8c501827-d537-4715-8de5-98fee3d1db24',
  '5961870a-3e41-4bb2-b36b-747f2989def8',
  'c04a7be8-7b78-4a3c-8eeb-656c0923c27d',
  '9457c095-238d-468e-84fe-25165c94499c',
  '2a00c64d-40a2-477f-8e0f-da7e85fe6187',
  'c6a7f30a-691f-496e-9455-db26ecc7e472',
  '9e52911f-93c4-4ec1-baef-6c2024dd3cbc',
  'fdccecf9-8590-49ca-b2d2-fe924465468b',
] as const

const historicalEvidenceIds = new Set<string>(PRODUCTION_DOGFOOD_HISTORICAL_EVIDENCE_IDS)
const blockedFixtureIds = new Set<string>(PRODUCTION_DOGFOOD_BLOCKED_FIXTURE_IDS)
const staleTestQueueIds = new Set<string>(PRODUCTION_DOGFOOD_STALE_TEST_QUEUE_IDS)
const terminalStatuses = new Set(['done', 'cancelled'])

function isParkedBlockedFixture(workItem: WorkItemRecord): boolean {
  return (
    blockedFixtureIds.has(workItem.id) &&
    workItem.status === 'blocked' &&
    workItem.phase === 'build' &&
    workItem.laneState === 'blocked' &&
    Boolean(workItem.laneParkedAt?.trim()) &&
    Boolean(workItem.laneBlockedReason?.trim())
  )
}

function isStaleTestQueueTitle(title: string): boolean {
  return title.startsWith('Dogfood rough idea ') || title.startsWith('Autonomous E2E Code Delivery ')
}

function buildClassification(
  workItem: WorkItemRecord,
  disposition: DogfoodQueueDisposition,
  reason: string,
): DogfoodQueueClassification {
  return {
    workItemId: workItem.id,
    title: workItem.title,
    status: workItem.status,
    phase: workItem.phase,
    laneState: workItem.laneState,
    disposition,
    reason,
  }
}

export function classifyProductionDogfoodWorkItem(workItem: WorkItemRecord): DogfoodQueueClassification {
  if (historicalEvidenceIds.has(workItem.id) && workItem.status === 'done') {
    return buildClassification(
      workItem,
      'preserve_historical_evidence',
      'Known completed ABACUS dogfood evidence; preserve unchanged.',
    )
  }

  if (isParkedBlockedFixture(workItem)) {
    return buildClassification(
      workItem,
      'preserve_blocked_fixture',
      'Known parked blocked regression fixture with explicit blocker metadata.',
    )
  }

  if (workItem.status === 'cancelled') {
    return buildClassification(workItem, 'already_terminal', 'Already cancelled and not runnable.')
  }

  if (
    !terminalStatuses.has(workItem.status) &&
    (staleTestQueueIds.has(workItem.id) || isStaleTestQueueTitle(workItem.title))
  ) {
    return buildClassification(
      workItem,
      'cancel_stale_test_queue',
      'Known stale dogfood/test queue item that should be archived before real idea intake.',
    )
  }

  return buildClassification(
    workItem,
    'unknown_manual_review',
    'Non-terminal ABACUS item is not in the approved stale-test or preserve allow-lists.',
  )
}

export function classifyProductionDogfoodQueue(workItems: Array<WorkItemRecord>): Array<DogfoodQueueClassification> {
  return workItems.map((workItem) => classifyProductionDogfoodWorkItem(workItem))
}
