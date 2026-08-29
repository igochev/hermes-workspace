import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ProjectAutopilotScreen } from '@/screens/projects/project-autopilot-screen'

export const Route = createFileRoute('/projects/$projectId/autopilot')({
  ssr: false,
  component: ProjectAutopilotRoute,
})

function ProjectAutopilotRoute() {
  const { projectId } = Route.useParams()
  usePageTitle('Project Autopilot')
  return <ProjectAutopilotScreen projectId={projectId} />
}
