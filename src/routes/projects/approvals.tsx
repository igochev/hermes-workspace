import { createFileRoute } from '@tanstack/react-router'
import { usePageTitle } from '@/hooks/use-page-title'
import { ApprovalsInboxScreen } from '@/screens/projects/approvals-inbox-screen'

export const Route = createFileRoute('/projects/approvals')({
  ssr: false,
  component: ProjectsApprovalsRoute,
})

function ProjectsApprovalsRoute() {
  usePageTitle('Approvals Inbox')
  return <ApprovalsInboxScreen />
}
