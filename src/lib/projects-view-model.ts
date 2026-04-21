import type { ProjectSummary, WorkItemRecord, WorkItemStatus } from './projects-api'

export const PROJECT_STATUS_ORDER: Array<WorkItemStatus> = [
  'active',
  'ready',
  'inbox',
  'blocked',
  'done',
  'cancelled',
]

export function buildProjectStatsLine(project: ProjectSummary): string {
  return `${project.workItemCount} work items · ${project.activeWorkItemCount} active · ${project.doneWorkItemCount} done`
}

export function groupWorkItemsByStatus(workItems: Array<WorkItemRecord>): Record<WorkItemStatus, Array<WorkItemRecord>> {
  const grouped: Record<WorkItemStatus, Array<WorkItemRecord>> = {
    inbox: [],
    ready: [],
    active: [],
    blocked: [],
    done: [],
    cancelled: [],
  }

  for (const workItem of workItems) {
    grouped[workItem.status].push(workItem)
  }

  return grouped
}
