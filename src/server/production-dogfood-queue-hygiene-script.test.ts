import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = join(process.cwd(), 'scripts/production-dogfood-queue-hygiene.mjs')

describe('production dogfood queue hygiene script contract', () => {
  it('exposes dry-run/apply modes, scoped ABACUS safeguards, backups, and stale queue audit note', () => {
    const source = readFileSync(scriptPath, 'utf8')

    expect(source).toContain('--dry-run')
    expect(source).toContain('--apply')
    expect(source).toContain('production-dogfood-family-command-center-abacus')
    expect(source).toContain('backups/production-dogfood-queue-hygiene')
    expect(source).toContain('Archived stale dogfood/test queue item before real ABACUS idea intake')
    expect(source).toContain('unknown_manual_review')
  })
})
