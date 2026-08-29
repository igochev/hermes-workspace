import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { WorkItemDetailScreen } from '@/screens/projects/work-item-detail-screen'

export const Route = createFileRoute('/projects/$projectId/work-items/$workItemId')({
  ssr: false,
  component: WorkItemDetailRoute,
})

function WorkItemDetailRoute() {
  const { projectId, workItemId } = Route.useParams()
  usePageTitle('Work Item Detail')
  return <WorkItemDetailScreen projectId={projectId} workItemId={workItemId} />
}
