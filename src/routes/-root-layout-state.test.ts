import { describe, expect, it } from 'vitest'

import {
  getMobilePageTitle,
  getWorkspaceShellTabIndex,
} from '../components/workspace-shell'
import { MOBILE_NAV_ITEMS } from '../components/mobile-hamburger-menu'
import { MOBILE_TABS } from '../components/mobile-tab-bar'
import { getExecutionsRouteMode } from './executions'

describe('root layout Executions navigation', () => {
  it('tracks /executions as a distinct navigation destination from Scheduled Jobs', () => {
    expect(getWorkspaceShellTabIndex('/jobs')).not.toBe(
      getWorkspaceShellTabIndex('/executions'),
    )
    expect(getWorkspaceShellTabIndex('/executions')).toBeGreaterThan(-1)
    expect(getMobilePageTitle('/executions')).toBe('Executions')
  })

  it('exposes Executions in mobile tab and hamburger navigation', () => {
    expect(MOBILE_TABS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'executions',
          label: 'Executions',
          to: '/executions',
        }),
        expect.objectContaining({
          id: 'jobs',
          label: 'Scheduled Jobs',
          to: '/jobs',
        }),
      ]),
    )
    expect(MOBILE_NAV_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'executions',
          label: 'Executions',
          to: '/executions',
        }),
        expect.objectContaining({
          id: 'jobs',
          label: 'Scheduled Jobs',
          to: '/jobs',
        }),
      ]),
    )
  })

  it('treats /executions/:executionId as execution detail instead of the list screen', () => {
    expect(getExecutionsRouteMode('/executions')).toBe('list')
    expect(getExecutionsRouteMode('/executions/7b217f97-691c-4976-a6f8-35041a26591b')).toBe(
      'detail',
    )
  })
})
