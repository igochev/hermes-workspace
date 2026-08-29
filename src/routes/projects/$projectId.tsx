import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/projects/$projectId')({
  ssr: false,
  component: ProjectDetailLayoutRoute,
})

export function ProjectDetailLayoutFrame({ children }: { children?: React.ReactNode }) {
  return <div data-project-detail-layout className="min-h-full">{children ?? <Outlet />}</div>
}

function ProjectDetailLayoutRoute() {
  return <ProjectDetailLayoutFrame />
}
