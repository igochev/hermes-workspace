# Production Dogfood Queue Hygiene Report

- Mode: apply
- Project: production-dogfood-family-command-center-abacus
- Backup directory: /home/d3ni3/.hermes/backups/production-dogfood-queue-hygiene/2026-04-29T19-14-55-361Z
- Changed work item ids: 110c9124-b898-43d3-a05a-a0ff304bc3fc, 8c501827-d537-4715-8de5-98fee3d1db24, 5961870a-3e41-4bb2-b36b-747f2989def8, c04a7be8-7b78-4a3c-8eeb-656c0923c27d, 9457c095-238d-468e-84fe-25165c94499c, 2a00c64d-40a2-477f-8e0f-da7e85fe6187, c6a7f30a-691f-496e-9455-db26ecc7e472, 9e52911f-93c4-4ec1-baef-6c2024dd3cbc, fdccecf9-8590-49ca-b2d2-fe924465468b
- Linked draft ids changed: 378145e0-544e-44cc-9c52-5bd60406ef87, 91d91603-8b9d-4eab-995f-3793c8c86ca6
- Preserved evidence item ids: 55e4cd15-f179-433c-80bf-24b67f7672a2, b31ad72d-4ef0-4388-b867-e0bf11c14c82, c6c218a8-b299-4f7f-9f64-33812b06df3d, 1a44d0b2-86d8-4202-8dfa-50d71a454da8, 38c30749-118e-4ade-9e85-df62a31b611e
- Preserved blocked fixture item ids: 84bfe2c2-e899-437a-8a6c-a6fa9884886d, ac6918e0-a46d-4de4-a618-ddda1b233f98
- Final runnable stale candidate count: 0

## Disposition counts

- preserve_historical_evidence: 5
- preserve_blocked_fixture: 2
- cancel_stale_test_queue: 0
- already_terminal: 10
- unknown_manual_review: 0

## Candidate repo inspection

- Repo: /home/d3ni3/.Hermes/workspace/projects/family_command_center-ABACUS
- Branch: test-hermes-workspace
- Commit: 16b6fc4
- Status: clean
- Ahead/behind: ## test-hermes-workspace...origin/test-hermes-workspace [ahead 15]

## Work items by disposition

### preserve_historical_evidence

- 55e4cd15-f179-433c-80bf-24b67f7672a2 — done — REAL E2E Workflow work-item-e2e-2026-04-27T14-42-58-763Z
  - Reason: Known completed ABACUS dogfood evidence; preserve unchanged.
- b31ad72d-4ef0-4388-b867-e0bf11c14c82 — done/deploy laneState=done — Single Lane E2E Code Delivery
  - Reason: Known completed ABACUS dogfood evidence; preserve unchanged.
- c6c218a8-b299-4f7f-9f64-33812b06df3d — done/deploy laneState=done — Sequential Lane Gauntlet 1
  - Reason: Known completed ABACUS dogfood evidence; preserve unchanged.
- 1a44d0b2-86d8-4202-8dfa-50d71a454da8 — done/deploy laneState=done — Sequential Lane Gauntlet 2
  - Reason: Known completed ABACUS dogfood evidence; preserve unchanged.
- 38c30749-118e-4ade-9e85-df62a31b611e — done/deploy laneState=done — Sequential Lane Gauntlet 3
  - Reason: Known completed ABACUS dogfood evidence; preserve unchanged.

### preserve_blocked_fixture

- 84bfe2c2-e899-437a-8a6c-a6fa9884886d — blocked/build laneState=blocked — Autonomous E2E Code Delivery autonomous-work-item-e2e-2026-04-27T18-17-23-757Z
  - Reason: Known parked blocked regression fixture with explicit blocker metadata.
- ac6918e0-a46d-4de4-a618-ddda1b233f98 — blocked/build laneState=blocked — Single Lane E2E Code Delivery
  - Reason: Known parked blocked regression fixture with explicit blocker metadata.

### cancel_stale_test_queue

- none

### already_terminal

- 110c9124-b898-43d3-a05a-a0ff304bc3fc — cancelled — Dogfood rough idea 2026-04-26T09:38:32.560Z
  - Reason: Already cancelled and not runnable.
- 8c501827-d537-4715-8de5-98fee3d1db24 — cancelled — Dogfood rough idea 2026-04-26T09:39:01.871Z
  - Reason: Already cancelled and not runnable.
- 5961870a-3e41-4bb2-b36b-747f2989def8 — cancelled — Dogfood rough idea 2026-04-26T09:39:40.990Z
  - Reason: Already cancelled and not runnable.
- c04a7be8-7b78-4a3c-8eeb-656c0923c27d — cancelled — Dogfood rough idea 2026-04-26T09:51:46.582Z
  - Reason: Already cancelled and not runnable.
- 9457c095-238d-468e-84fe-25165c94499c — cancelled — Dogfood rough idea 2026-04-26T10:04:11.108Z
  - Reason: Already cancelled and not runnable.
- 2a00c64d-40a2-477f-8e0f-da7e85fe6187 — cancelled — Dogfood rough idea 2026-04-26T10:06:00.025Z
  - Reason: Already cancelled and not runnable.
- c6a7f30a-691f-496e-9455-db26ecc7e472 — cancelled — Dogfood rough idea 2026-04-27T13:44:57.503Z
  - Reason: Already cancelled and not runnable.
- d5a7c982-efdf-4823-a235-f42556a3103e — cancelled — Dogfood rough idea 2026-04-27T13:48:29.607Z
  - Reason: Already cancelled and not runnable.
- 9e52911f-93c4-4ec1-baef-6c2024dd3cbc — cancelled — Autonomous E2E Code Delivery autonomous-work-item-e2e-2026-04-27T17-58-54-526Z
  - Reason: Already cancelled and not runnable.
- fdccecf9-8590-49ca-b2d2-fe924465468b — cancelled — Autonomous E2E Code Delivery autonomous-work-item-e2e-2026-04-27T18-10-09-423Z
  - Reason: Already cancelled and not runnable.

### unknown_manual_review

- none

## Next recommended action

Ask Main/CEO to create the real “Family Command Center ABACUS” idea work item. Do not use old dummy work items.

