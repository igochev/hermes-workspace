import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const script = readFileSync(join(process.cwd(), 'scripts/mission-control-production-dogfood.mjs'), 'utf8')

describe('production dogfood clickability script coverage', () => {
  it('clicks dashboard summary/attention surfaces during PR-3 audit', () => {
    expect(script).toContain("Dashboard → Projects summary card")
    expect(script).toContain("Dashboard → Attention work item card")
  })

  it('clicks work item detail launch/preflight/recovery controls beyond opening detail', () => {
    expect(script).toContain("Work item detail → Refresh")
    expect(script).toContain("Work item detail → Sync Execution")
    expect(script).toContain("Work item detail → Profile Preflight observed")
    expect(script).toContain("Work item detail → Open Conductor link verified")
  })

  it('clicks or verifies chat/session sidebar stale indicators are non-interactive status surfaces', () => {
    expect(script).toContain("Chat sidebar → session refresh status observed")
    expect(script).toContain("Chat sidebar → New chat button visible")
  })

  it('filters navigation-aborted requests and existing dashboard chart resize warnings', () => {
    expect(script).toContain("request.failure()?.errorText === 'net::ERR_ABORTED'")
    expect(script).toContain("The width(-1) and height(-1) of chart should be greater than 0")
  })

  it('writes production acceptance metadata and deterministic latest report copy', () => {
    expect(script).toContain("Workspace branch: ${workspaceBranch}")
    expect(script).toContain("Workspace commit: ${workspaceCommit}")
    expect(script).toContain("Auth mode: ${evidence.authMode}")
    expect(script).toContain("production-acceptance-latest.md")
    expect(script).toContain("Missing required UI click evidence")
  })
})
