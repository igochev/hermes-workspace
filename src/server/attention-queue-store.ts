import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type AttentionKind =
  | 'approval_pending'
  | 'mission_failed'
  | 'review_failed'
  | 'execution_stale'
  | 'blocked_work'
  | 'capacity_exceeded'
export type AttentionSeverity = 'info' | 'warning' | 'critical'
export type AttentionQueueSource = 'derived' | 'supervisor' | 'capacity'
export type AttentionQueueStatus = 'open' | 'resolved'

export type AttentionQueueItem = {
  id: string
  dedupeKey: string
  kind: AttentionKind
  severity: AttentionSeverity
  projectId: string
  workItemId?: string
  title: string
  detail: string
  href: string
  source: AttentionQueueSource
  status: AttentionQueueStatus
  firstSeenAt: string
  lastSeenAt: string
}

type AttentionQueueFile = {
  items: Array<AttentionQueueItem>
}

type UpsertAttentionQueueItemInput = {
  dedupeKey: string
  kind: AttentionKind
  severity: AttentionSeverity
  projectId: string
  workItemId?: string
  title: string
  detail: string
  href: string
  source: AttentionQueueSource
}

const VALID_KINDS: Array<AttentionKind> = [
  'approval_pending',
  'mission_failed',
  'review_failed',
  'execution_stale',
  'blocked_work',
  'capacity_exceeded',
]
const VALID_SEVERITIES: Array<AttentionSeverity> = ['info', 'warning', 'critical']
const VALID_SOURCES: Array<AttentionQueueSource> = ['derived', 'supervisor', 'capacity']

function getHermesHome(): string {
  return process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes')
}

function getAttentionQueueFilePath(): string {
  return path.join(getHermesHome(), 'attention-queue.json')
}

function ensureAttentionQueueFile(): void {
  const hermesHome = getHermesHome()
  const filePath = getAttentionQueueFilePath()
  fs.mkdirSync(hermesHome, { recursive: true })
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ items: [] }, null, 2) + '\n', 'utf-8')
  }
}

function readAttentionQueueFile(): AttentionQueueFile {
  ensureAttentionQueueFile()
  try {
    const raw = fs.readFileSync(getAttentionQueueFilePath(), 'utf-8').trim()
    if (!raw) return { items: [] }
    const parsed = JSON.parse(raw) as Partial<AttentionQueueFile>
    return { items: Array.isArray(parsed.items) ? parsed.items : [] }
  } catch {
    return { items: [] }
  }
}

function writeAttentionQueueFile(data: AttentionQueueFile): void {
  ensureAttentionQueueFile()
  fs.writeFileSync(getAttentionQueueFilePath(), JSON.stringify(data, null, 2) + '\n', 'utf-8')
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function normalizeKind(value: unknown): AttentionKind {
  return VALID_KINDS.includes(value as AttentionKind) ? (value as AttentionKind) : 'blocked_work'
}

function normalizeSeverity(value: unknown): AttentionSeverity {
  return VALID_SEVERITIES.includes(value as AttentionSeverity) ? (value as AttentionSeverity) : 'warning'
}

function normalizeSource(value: unknown): AttentionQueueSource {
  return VALID_SOURCES.includes(value as AttentionQueueSource) ? (value as AttentionQueueSource) : 'derived'
}

function normalizeStatus(value: unknown): AttentionQueueStatus {
  return value === 'resolved' ? 'resolved' : 'open'
}

function normalizeAttentionQueueItem(
  item: Partial<AttentionQueueItem> &
    Pick<AttentionQueueItem, 'id' | 'dedupeKey' | 'projectId' | 'title' | 'detail' | 'href' | 'firstSeenAt' | 'lastSeenAt'>,
): AttentionQueueItem {
  return {
    id: item.id,
    dedupeKey: item.dedupeKey.trim(),
    kind: normalizeKind(item.kind),
    severity: normalizeSeverity(item.severity),
    projectId: item.projectId.trim(),
    workItemId: asOptionalString(item.workItemId),
    title: item.title.trim(),
    detail: item.detail.trim(),
    href: item.href.trim(),
    source: normalizeSource(item.source),
    status: normalizeStatus(item.status),
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
  }
}

function severityRank(severity: AttentionSeverity): number {
  if (severity === 'critical') return 3
  if (severity === 'warning') return 2
  return 1
}

function sortAttentionQueueItems(items: Array<AttentionQueueItem>): Array<AttentionQueueItem> {
  return [...items].sort((a, b) => {
    const aOpen = a.status === 'open' ? 1 : 0
    const bOpen = b.status === 'open' ? 1 : 0
    if (aOpen !== bOpen) return bOpen - aOpen
    const severityDelta = severityRank(b.severity) - severityRank(a.severity)
    if (severityDelta !== 0) return severityDelta
    const seenDelta = b.lastSeenAt.localeCompare(a.lastSeenAt)
    if (seenDelta !== 0) return seenDelta
    return a.dedupeKey.localeCompare(b.dedupeKey)
  })
}

export function listAttentionQueueItems(filters: { status?: AttentionQueueStatus } = {}): Array<AttentionQueueItem> {
  let items = readAttentionQueueFile().items.map((item) => normalizeAttentionQueueItem(item))
  if (filters.status) items = items.filter((item) => item.status === filters.status)
  return sortAttentionQueueItems(items)
}

export function getAttentionQueueItem(id: string): AttentionQueueItem | null {
  return listAttentionQueueItems().find((item) => item.id === id) ?? null
}

export function upsertAttentionQueueItem(input: UpsertAttentionQueueItemInput): AttentionQueueItem {
  const file = readAttentionQueueFile()
  const items = file.items.map((item) => normalizeAttentionQueueItem(item))
  const now = new Date().toISOString()
  const dedupeKey = input.dedupeKey.trim()
  const existingIndex = items.findIndex((item) => item.dedupeKey === dedupeKey)
  const existing = existingIndex === -1 ? null : items[existingIndex]
  const next = normalizeAttentionQueueItem({
    id: existing?.id ?? randomUUID(),
    dedupeKey,
    kind: input.kind,
    severity: input.severity,
    projectId: input.projectId,
    workItemId: input.workItemId,
    title: input.title,
    detail: input.detail,
    href: input.href,
    source: input.source,
    status: 'open',
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
  })

  if (existingIndex === -1) items.push(next)
  else items[existingIndex] = next

  writeAttentionQueueFile({ items })
  return next
}

export function markAttentionQueueItemResolved(id: string): AttentionQueueItem | null {
  const file = readAttentionQueueFile()
  const items = file.items.map((item) => normalizeAttentionQueueItem(item))
  const index = items.findIndex((item) => item.id === id)
  if (index === -1) return null
  const now = new Date().toISOString()
  const next = normalizeAttentionQueueItem({ ...items[index], status: 'resolved', lastSeenAt: now })
  items[index] = next
  writeAttentionQueueFile({ items })
  return next
}

export function replaceAttentionQueueItems(nextItems: Array<AttentionQueueItem>): Array<AttentionQueueItem> {
  const normalized = nextItems.map((item) => normalizeAttentionQueueItem(item))
  writeAttentionQueueFile({ items: normalized })
  return sortAttentionQueueItems(normalized)
}
