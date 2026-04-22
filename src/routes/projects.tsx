import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/projects')({
  ssr: false,
  component: ProjectsLayoutRoute,
})

export function ProjectsLayoutFrame({ children }: { children?: React.ReactNode }) {
  return <div data-projects-layout className="min-h-full">{children ?? <Outlet />}</div>
}

function ProjectsLayoutRoute() {
  return <ProjectsLayoutFrame />
}
