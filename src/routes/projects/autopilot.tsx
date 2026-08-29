import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { AutopilotSuggestionsScreen } from '@/screens/projects/autopilot-suggestions-screen'

export const Route = createFileRoute('/projects/autopilot')({
  ssr: false,
  component: ProjectsAutopilotRoute,
})

function ProjectsAutopilotRoute() {
  usePageTitle('Autopilot Suggestions')
  return <AutopilotSuggestionsScreen />
}
