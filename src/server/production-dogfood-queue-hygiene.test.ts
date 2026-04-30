import { describe, expect, it } from 'vitest'

import {
  PRODUCTION_DOGFOOD_PROJECT_ID,
  classifyProductionDogfoodQueue,
  classifyProductionDogfoodWorkItem,
} from './production-dogfood-queue-hygiene'
import type { WorkItemRecord } from './work-items-store'

function workItem(input: Partial<WorkItemRecord> & { id: string; title: string }): WorkItemRecord {
  return {
    id: input.id,
    projectId: input.projectId ?? PRODUCTION_DOGFOOD_PROJECT_ID,
    title: input.title,
    description: input.description ?? '',
    status: input.status ?? 'inbox',
    phase: input.phase ?? 'research',
    priority: input.priority ?? 'medium',
    riskLevel: input.riskLevel ?? 'medium',
    labels: input.labels ?? [],
    repoPathSnapshot: input.repoPathSnapshot ?? '/home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS',
    sourceSuggestionEvidence: input.sourceSuggestionEvidence ?? [],
    reviewQualityGateReasons: input.reviewQualityGateReasons ?? [],
    reviewMissingEvidence: input.reviewMissingEvidence ?? [],
    sessionKeys: input.sessionKeys ?? [],
    laneState: input.laneState,
    laneParkedAt: input.laneParkedAt,
    laneBlockedReason: input.laneBlockedReason,
    artifactPaths: input.artifactPaths ?? ['dogfood-output/example.md'],
    acceptanceCriteria: input.acceptanceCriteria ?? ['Keep evidence'],
    criteriaStatus: input.criteriaStatus ?? [],
    notes: input.notes ?? [],
    history: input.history ?? [],
    createdAt: input.createdAt ?? '2026-04-29T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-04-29T00:00:00.000Z',
  }
}

describe('production dogfood queue hygiene classification', () => {
  it('classifies the seven old Dogfood rough idea items as stale test queue', () => {
    const roughIdeaIds = [
      '110c9124-b898-43d3-a05a-a0ff304bc3fc',
      '8c501827-d537-4715-8de5-98fee3d1db24',
      '5961870a-3e41-4bb2-b36b-747f2989def8',
      'c04a7be8-7b78-4a3c-8eeb-656c0923c27d',
      '9457c095-238d-468e-84fe-25165c94499c',
      '2a00c64d-40a2-477f-8e0f-da7e85fe6187',
      'c6a7f30a-691f-496e-9455-db26ecc7e472',
    ]

    const classifications = classifyProductionDogfoodQueue(
      roughIdeaIds.map((id) => workItem({ id, title: `Dogfood rough idea ${id.slice(0, 8)}` })),
    )

    expect(classifications.map((classification) => classification.disposition)).toEqual(
      roughIdeaIds.map(() => 'cancel_stale_test_queue'),
    )
  })

  it('classifies old Autonomous E2E Code Delivery inbox leftovers as stale test queue', () => {
    const classifications = classifyProductionDogfoodQueue([
      workItem({ id: '9e52911f-93c4-4ec1-baef-6c2024dd3cbc', title: 'Autonomous E2E Code Delivery failed leftover' }),
      workItem({ id: 'fdccecf9-8590-49ca-b2d2-fe924465468b', title: 'Autonomous E2E Code Delivery partial leftover' }),
    ])

    expect(classifications).toHaveLength(2)
    expect(classifications.every((classification) => classification.disposition === 'cancel_stale_test_queue')).toBe(true)
  })

  it('preserves shipped historical evidence items', () => {
    const evidenceIds = [
      'b31ad72d-4ef0-4388-b867-e0bf11c14c82',
      'c6c218a8-b299-4f7f-9f64-33812b06df3d',
      '1a44d0b2-86d8-4202-8dfa-50d71a454da8',
      '38c30749-118e-4ade-9e85-df62a31b611e',
    ]

    const classifications = classifyProductionDogfoodQueue(
      evidenceIds.map((id) => workItem({ id, title: `Evidence ${id}`, status: 'done', phase: 'deploy', laneState: 'done' })),
    )

    expect(classifications.map((classification) => classification.disposition)).toEqual(
      evidenceIds.map(() => 'preserve_historical_evidence'),
    )
  })

  it('preserves parked blocked regression fixtures when blocker metadata is present', () => {
    const classifications = classifyProductionDogfoodQueue([
      workItem({
        id: '84bfe2c2-e899-437a-8a6c-a6fa9884886d',
        title: 'Blocked fixture one',
        status: 'blocked',
        phase: 'build',
        laneState: 'blocked',
        laneParkedAt: '2026-04-29T01:00:00.000Z',
        laneBlockedReason: 'Builder evidence phase must be build.',
      }),
      workItem({
        id: 'ac6918e0-a46d-4de4-a618-ddda1b233f98',
        title: 'Blocked fixture two',
        status: 'blocked',
        phase: 'build',
        laneState: 'blocked',
        laneParkedAt: '2026-04-29T01:00:00.000Z',
        laneBlockedReason: 'Builder success evidence must include testPassed=true.',
      }),
    ])

    expect(classifications.map((classification) => classification.disposition)).toEqual([
      'preserve_blocked_fixture',
      'preserve_blocked_fixture',
    ])
  })

  it('marks cancelled items as already terminal and unknown active items for manual review', () => {
    expect(
      classifyProductionDogfoodWorkItem(
        workItem({ id: 'd5a7c982-efdf-4823-a235-f42556a3103e', title: 'Already cancelled', status: 'cancelled' }),
      ).disposition,
    ).toBe('already_terminal')

    expect(
      classifyProductionDogfoodWorkItem(workItem({ id: 'real-active-idea', title: 'Real owner idea', status: 'ready' }))
        .disposition,
    ).toBe('unknown_manual_review')
  })
})
