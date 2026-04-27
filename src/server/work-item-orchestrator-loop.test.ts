import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { reconcileAllWorkItemAutonomy } = vi.hoisted(() => ({
  reconcileAllWorkItemAutonomy: vi.fn(),
}))

vi.mock('./work-item-orchestrator', () => ({
  reconcileAllWorkItemAutonomy,
}))

import {
  isWorkItemOrchestratorLoopRunning,
  startWorkItemOrchestratorLoop,
  stopWorkItemOrchestratorLoop,
} from './work-item-orchestrator-loop'

describe('work-item-orchestrator-loop', () => {
  let previousAutonomy: string | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    previousAutonomy = process.env.HERMES_WORKSPACE_WORK_ITEM_AUTONOMY
    process.env.HERMES_WORKSPACE_WORK_ITEM_AUTONOMY = '1'
    reconcileAllWorkItemAutonomy.mockReset()
    reconcileAllWorkItemAutonomy.mockResolvedValue({ checked: 0, changed: 0, events: [], findings: [] })
    stopWorkItemOrchestratorLoop()
  })

  afterEach(() => {
    stopWorkItemOrchestratorLoop()
    vi.useRealTimers()
    if (previousAutonomy === undefined) delete process.env.HERMES_WORKSPACE_WORK_ITEM_AUTONOMY
    else process.env.HERMES_WORKSPACE_WORK_ITEM_AUTONOMY = previousAutonomy
  })

  it('does not start when autonomous mode is not enabled', async () => {
    delete process.env.HERMES_WORKSPACE_WORK_ITEM_AUTONOMY

    startWorkItemOrchestratorLoop({ intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)

    expect(isWorkItemOrchestratorLoopRunning()).toBe(false)
    expect(reconcileAllWorkItemAutonomy).not.toHaveBeenCalled()
  })

  it('starts one reconcile interval when autonomous mode is enabled', async () => {
    startWorkItemOrchestratorLoop({ intervalMs: 1000 })

    expect(isWorkItemOrchestratorLoopRunning()).toBe(true)

    await vi.advanceTimersByTimeAsync(1000)

    expect(reconcileAllWorkItemAutonomy).toHaveBeenCalledTimes(1)
  })

  it('calling start twice does not create duplicate intervals', async () => {
    startWorkItemOrchestratorLoop({ intervalMs: 1000 })
    startWorkItemOrchestratorLoop({ intervalMs: 1000 })

    await vi.advanceTimersByTimeAsync(1000)

    expect(reconcileAllWorkItemAutonomy).toHaveBeenCalledTimes(1)
  })

  it('stop clears the active interval', async () => {
    startWorkItemOrchestratorLoop({ intervalMs: 1000 })
    stopWorkItemOrchestratorLoop()

    expect(isWorkItemOrchestratorLoopRunning()).toBe(false)

    await vi.advanceTimersByTimeAsync(1000)

    expect(reconcileAllWorkItemAutonomy).not.toHaveBeenCalled()
  })

  it('catches reconcile errors without stopping the loop', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    reconcileAllWorkItemAutonomy.mockRejectedValueOnce(new Error('boom'))

    startWorkItemOrchestratorLoop({ intervalMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)

    expect(reconcileAllWorkItemAutonomy).toHaveBeenCalledTimes(2)
    expect(isWorkItemOrchestratorLoopRunning()).toBe(true)
    expect(consoleError).toHaveBeenCalledWith(
      '[work-item-orchestrator-loop] reconcile failed',
      expect.any(Error),
    )

    consoleError.mockRestore()
  })
})
