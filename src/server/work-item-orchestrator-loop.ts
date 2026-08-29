import { reconcileAllWorkItemAutonomy } from './work-item-orchestrator'

const DEFAULT_INTERVAL_MS = 30_000
let orchestratorLoopTimer: ReturnType<typeof setInterval> | null = null
let reconcileInFlight = false

export type WorkItemOrchestratorLoopOptions = {
  intervalMs?: number
}

function isAutonomyEnabled(): boolean {
  return process.env.HERMES_WORKSPACE_WORK_ITEM_AUTONOMY === '1'
}

async function runReconcilePass(): Promise<void> {
  if (reconcileInFlight) return
  reconcileInFlight = true
  try {
    await reconcileAllWorkItemAutonomy()
  } catch (error) {
    console.error('[work-item-orchestrator-loop] reconcile failed', error)
  } finally {
    reconcileInFlight = false
  }
}

export function startWorkItemOrchestratorLoop(options: WorkItemOrchestratorLoopOptions = {}): void {
  if (!isAutonomyEnabled()) return
  if (orchestratorLoopTimer) return

  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS
  orchestratorLoopTimer = setInterval(() => {
    void runReconcilePass()
  }, intervalMs)
}

export function stopWorkItemOrchestratorLoop(): void {
  if (!orchestratorLoopTimer) return
  clearInterval(orchestratorLoopTimer)
  orchestratorLoopTimer = null
}

export function isWorkItemOrchestratorLoopRunning(): boolean {
  return Boolean(orchestratorLoopTimer)
}
