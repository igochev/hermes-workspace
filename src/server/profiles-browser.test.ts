import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listProfiles, readProfile } from './profiles-browser'

describe('profiles-browser', () => {
  let tempHome: string

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-workspace-profiles-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tempHome)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tempHome, { recursive: true, force: true })
  })

  it('always includes the default profile even when a named profile is active', () => {
    const hermesRoot = path.join(tempHome, '.hermes')
    const profilesRoot = path.join(hermesRoot, 'profiles')
    const namedProfileRoot = path.join(profilesRoot, 'jarvis')

    fs.mkdirSync(namedProfileRoot, { recursive: true })
    fs.writeFileSync(path.join(hermesRoot, 'active_profile'), 'jarvis\n', 'utf-8')
    fs.writeFileSync(path.join(hermesRoot, 'config.yaml'), 'model: default-model\n', 'utf-8')
    fs.writeFileSync(path.join(namedProfileRoot, 'config.yaml'), 'model: named-model\n', 'utf-8')

    const profiles = listProfiles()
    const names = profiles.map((profile) => profile.name)

    expect(names).toContain('default')
    expect(names).toContain('jarvis')
    expect(profiles.find((profile) => profile.name === 'default')?.active).toBe(false)
    expect(profiles.find((profile) => profile.name === 'jarvis')?.active).toBe(true)
  })

  it('reads provider, model, and SOUL prompt from profile files', () => {
    const hermesRoot = path.join(tempHome, '.hermes')
    const profileRoot = path.join(hermesRoot, 'profiles', 'builder')

    fs.mkdirSync(profileRoot, { recursive: true })
    fs.writeFileSync(
      path.join(profileRoot, 'config.yaml'),
      'provider: copilot\nmodel: gpt-5.4\n',
      'utf-8',
    )
    fs.writeFileSync(
      path.join(profileRoot, 'SOUL.md'),
      'You are Builder.\n\nShip working code.',
      'utf-8',
    )

    const profile = readProfile('builder')

    expect(profile.provider).toBe('copilot')
    expect(profile.model).toBe('gpt-5.4')
    expect(profile.soulPath).toBe(path.join(profileRoot, 'SOUL.md'))
    expect(profile.systemPrompt).toBe('You are Builder.\n\nShip working code.')
    expect(profile.config).toEqual({ provider: 'copilot', model: 'gpt-5.4' })
  })
})
