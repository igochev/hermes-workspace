import { getProject } from './projects-store'
import { listWorkItemApprovals } from './work-item-approvals'
import { listWorkItems } from './work-items-store'

export function buildProjectDetailPayload(projectId: string) {
  const project = getProject(projectId)
  if (!project) return null

  const workItems = listWorkItems({ projectId }).map((workItem) => ({
    ...workItem,
    approvals: listWorkItemApprovals(workItem.id).slice().reverse(),
  }))

  return {
    project: {
      ...project,
      workItemCount: workItems.length,
      activeWorkItemCount: workItems.filter((item) => item.status === 'active').length,
      doneWorkItemCount: workItems.filter((item) => item.status === 'done').length,
    },
    workItems,
  }
}
