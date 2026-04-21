import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ProjectDetailScreen } from '@/screens/projects/project-detail-screen'

export const Route = createFileRoute('/projects/$projectId')({
  ssr: false,
  component: ProjectDetailRoute,
})

function ProjectDetailRoute() {
  const { projectId } = Route.useParams()
  usePageTitle('Project Detail')
  return <ProjectDetailScreen projectId={projectId} />
}
